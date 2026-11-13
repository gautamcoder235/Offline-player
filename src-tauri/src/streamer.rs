use base64::Engine;
use lofty::file::TaggedFileExt;
use lofty::probe::Probe;
use percent_encoding::percent_decode_str;
use std::collections::HashSet;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::{mpsc, Arc, LazyLock, Mutex, RwLock};
use std::thread;
use tiny_http::{Header, Response, Server, StatusCode};

pub static SERVER_PORT: AtomicU16 = AtomicU16::new(0);

const WORKER_POOL_SIZE: usize = 16;

static AUTH_TOKEN: LazyLock<String> = LazyLock::new(|| {
    let mut bytes = [0u8; 16];
    if getrandom::getrandom(&mut bytes).is_err() {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0x9e37_79b9_7f4a_7c15);
        let pid = std::process::id() as u128;
        let mixed = nanos ^ pid.wrapping_mul(0xbf58_476d_1ce4_e5b9);
        bytes.copy_from_slice(&mixed.to_le_bytes());
    }
    let mut hex = String::with_capacity(32);
    for b in bytes {
        use std::fmt::Write;
        let _ = write!(hex, "{:02x}", b);
    }
    hex
});

static AUTHORIZED_ROOTS: LazyLock<RwLock<Vec<PathBuf>>> = LazyLock::new(|| RwLock::new(Vec::new()));
static AUTHORIZED_FILES: LazyLock<RwLock<HashSet<PathBuf>>> =
    LazyLock::new(|| RwLock::new(HashSet::new()));

pub fn get_auth_token() -> &'static str {
    &AUTH_TOKEN
}

pub fn authorize_root(path: &Path) {
    let canonical = match std::fs::canonicalize(path) {
        Ok(c) if c.is_dir() => c,
        _ => return,
    };
    if let Ok(mut roots) = AUTHORIZED_ROOTS.write() {
        if !roots.iter().any(|r| r == &canonical) {
            roots.push(canonical);
        }
    }
}

pub fn set_authorized_roots(paths: Vec<PathBuf>) {
    let mut canonical_roots = Vec::new();
    for p in paths {
        if let Ok(c) = std::fs::canonicalize(&p) {
            if c.is_dir() && !canonical_roots.iter().any(|existing| existing == &c) {
                canonical_roots.push(c);
            }
        }
    }
    if let Ok(mut roots) = AUTHORIZED_ROOTS.write() {
        *roots = canonical_roots;
    }
}

pub fn authorize_file(path: &Path) {
    let canonical = match std::fs::canonicalize(path) {
        Ok(c) if c.is_file() => c,
        _ => return,
    };
    if let Ok(mut files) = AUTHORIZED_FILES.write() {
        files.insert(canonical);
    }
}

pub fn is_audio_extension(path: &Path) -> bool {
    match path.extension().and_then(|s| s.to_str()) {
        Some(ext) => matches!(
            ext.to_lowercase().as_str(),
            "mp3"
                | "flac"
                | "m4a"
                | "alac"
                | "wav"
                | "ogg"
                | "opus"
                | "aac"
                | "webm"
                | "aiff"
                | "aif"
                | "wma"
        ),
        None => false,
    }
}

pub fn is_path_authorized(canonical_path: &Path) -> bool {
    if let Ok(roots) = AUTHORIZED_ROOTS.read() {
        if roots.iter().any(|root| canonical_path.starts_with(root)) {
            return true;
        }
    }
    if let Ok(files) = AUTHORIZED_FILES.read() {
        if files.contains(canonical_path) {
            return true;
        }
    }
    false
}

fn is_valid_token(provided: &str) -> bool {
    let expected = AUTH_TOKEN.as_bytes();
    let got = provided.as_bytes();
    if expected.len() != got.len() {
        return false;
    }
    let mut diff = 0u8;
    for (&a, &b) in expected.iter().zip(got.iter()) {
        diff |= a ^ b;
    }
    diff == 0
}

fn is_trusted_origin(origin: &str) -> bool {
    matches!(
        origin,
        "http://tauri.localhost"
            | "https://tauri.localhost"
            | "tauri://localhost"
            | "http://localhost:1420"
            | "http://127.0.0.1:1420"
    )
}

fn get_request_origin(request: &tiny_http::Request) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case("origin"))
        .map(|h| h.value.as_str().trim().to_string())
}

fn add_trusted_cors_headers(origin: Option<&str>, headers: &mut Vec<Header>) {
    if let Some(orig) = origin {
        if is_trusted_origin(orig) {
            if let Ok(h) = Header::from_bytes(&b"Access-Control-Allow-Origin"[..], orig.as_bytes()) {
                headers.push(h);
            }
            if let Ok(h) = Header::from_bytes(&b"Vary"[..], &b"Origin"[..]) {
                headers.push(h);
            }
        }
    }
}

fn add_trusted_cors_to_response<R: Read>(origin: Option<&str>, resp: &mut Response<R>) {
    if let Some(orig) = origin {
        if is_trusted_origin(orig) {
            if let Ok(h) = Header::from_bytes(&b"Access-Control-Allow-Origin"[..], orig.as_bytes()) {
                resp.add_header(h);
            }
            if let Ok(h) = Header::from_bytes(&b"Vary"[..], &b"Origin"[..]) {
                resp.add_header(h);
            }
        }
    }
}

fn extract_raw_query_param<'a>(query: &'a str, key: &str) -> Option<&'a str> {
    for param in query.split('&') {
        let mut pair = param.splitn(2, '=');
        if let (Some(k), Some(v)) = (pair.next(), pair.next()) {
            if k == key {
                return Some(v);
            }
        }
    }
    None
}

fn is_safe_remote_url(url_str: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url_str) else {
        return false;
    };
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return false;
    }
    let Some(host) = parsed.host_str() else {
        return false;
    };
    is_safe_remote_host(host)
}

fn is_safe_remote_host(host: &str) -> bool {
    let trimmed = host.trim().trim_start_matches('[').trim_end_matches(']');
    if trimmed.is_empty() {
        return false;
    }
    let lower = trimmed.to_lowercase();
    if lower == "localhost"
        || lower.ends_with(".localhost")
        || lower.ends_with(".local")
        || lower.ends_with(".internal")
    {
        return false;
    }

    if let Ok(ip) = trimmed.parse::<IpAddr>() {
        return is_public_ip(ip);
    }

    true
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            !(v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                || v4.is_multicast()
                || v4.is_documentation())
        }
        IpAddr::V6(v6) => {
            if let Some(mapped) = v6.to_ipv4_mapped() {
                return is_public_ip(IpAddr::V4(mapped));
            }
            let first = v6.segments()[0];
            let is_unique_local = (first & 0xfe00) == 0xfc00;
            let is_link_local = (first & 0xffc0) == 0xfe80;
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || is_unique_local
                || is_link_local)
        }
    }
}

pub fn start_stream_server() -> u16 {
    // Ensure AUTH_TOKEN is eagerly initialized at startup
    let _ = get_auth_token();

    let server = Server::http("127.0.0.1:0").expect("Failed to create tiny_http server on 127.0.0.1:0");
    let port = match server.server_addr() {
        tiny_http::ListenAddr::IP(addr) => addr.port(),
    };
    SERVER_PORT.store(port, Ordering::SeqCst);

    let (tx, rx) = mpsc::sync_channel::<tiny_http::Request>(128);
    let shared_rx = Arc::new(Mutex::new(rx));

    for _ in 0..WORKER_POOL_SIZE {
        let worker_rx = Arc::clone(&shared_rx);
        thread::spawn(move || loop {
            let req = {
                let Ok(guard) = worker_rx.lock() else {
                    break;
                };
                guard.recv()
            };
            match req {
                Ok(request) => handle_request(request),
                Err(_) => break,
            }
        });
    }

    thread::spawn(move || {
        for request in server.incoming_requests() {
            if let Err(mpsc::TrySendError::Full(rejected))
            | Err(mpsc::TrySendError::Disconnected(rejected)) = tx.try_send(request)
            {
                let mut resp = Response::from_string("Service Busy");
                resp = resp.with_status_code(StatusCode(503));
                let _ = rejected.respond(resp);
            }
        }
    });

    port
}

fn handle_request(request: tiny_http::Request) {
    let method = request.method().as_str().to_string();
    let url_str = request.url().to_string();
    let origin = get_request_origin(&request);
    let origin_ref = origin.as_deref();

    // Reject requests explicitly originating from untrusted web origins
    if let Some(orig) = origin_ref {
        if !is_trusted_origin(orig) {
            let resp = Response::from_string("Forbidden Origin").with_status_code(StatusCode(403));
            let _ = request.respond(resp);
            return;
        }
    }

    // Handle preflight OPTIONS
    if method == "OPTIONS" {
        if origin_ref.is_none() {
            let resp = Response::empty(StatusCode(403));
            let _ = request.respond(resp);
            return;
        }
        let mut response = Response::empty(StatusCode(200));
        add_trusted_cors_to_response(origin_ref, &mut response);
        response.add_header(Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, HEAD, OPTIONS"[..]).unwrap());
        response.add_header(Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Range, Content-Type, Accept"[..]).unwrap());
        response.add_header(Header::from_bytes(&b"Access-Control-Expose-Headers"[..], &b"Content-Range, Content-Length, Accept-Ranges"[..]).unwrap());
        let _ = request.respond(response);
        return;
    }

    if method != "GET" && method != "HEAD" {
        let mut resp = Response::from_string("Method Not Allowed").with_status_code(StatusCode(405));
        add_trusted_cors_to_response(origin_ref, &mut resp);
        let _ = request.respond(resp);
        return;
    }

    // Require valid ephemeral per-session token on ALL endpoints
    let query = url_str.splitn(2, '?').nth(1).unwrap_or("");
    let provided_token = extract_raw_query_param(query, "token")
        .map(|t| percent_decode_str(t).decode_utf8_lossy().to_string());
    if !provided_token.as_deref().is_some_and(is_valid_token) {
        let mut resp = Response::from_string("Unauthorized").with_status_code(StatusCode(401));
        add_trusted_cors_to_response(origin_ref, &mut resp);
        let _ = request.respond(resp);
        return;
    }

    if url_str.starts_with("/proxy") {
        handle_proxy_request(request, &method, &url_str, origin_ref);
        return;
    }

    if url_str.starts_with("/cover") {
        handle_cover_request(request, &method, &url_str, origin_ref);
        return;
    }

    if !url_str.starts_with("/audio") {
        let mut response = Response::from_string("Not Found").with_status_code(StatusCode(404));
        add_trusted_cors_to_response(origin_ref, &mut response);
        let _ = request.respond(response);
        return;
    }

    // Extract ?file= parameter
    let encoded_file = match extract_raw_query_param(query, "file") {
        Some(f) => f,
        None => {
            let mut resp = Response::from_string("Missing file parameter").with_status_code(StatusCode(400));
            add_trusted_cors_to_response(origin_ref, &mut resp);
            let _ = request.respond(resp);
            return;
        }
    };

    let decoded_path_str = percent_decode_str(encoded_file)
        .decode_utf8_lossy()
        .to_string();
    let path = PathBuf::from(&decoded_path_str);

    // Enforce audio file extension allowlist before accessing disk
    if !is_audio_extension(&path) {
        let mut resp = Response::from_string("Forbidden: unsupported file type").with_status_code(StatusCode(403));
        add_trusted_cors_to_response(origin_ref, &mut resp);
        let _ = request.respond(resp);
        return;
    }

    // Canonicalize and enforce music-library / dropped-track path containment
    let canonical_path = match std::fs::canonicalize(&path) {
        Ok(c) if c.is_file() => c,
        _ => {
            let mut resp = Response::from_string("File Not Found").with_status_code(StatusCode(404));
            add_trusted_cors_to_response(origin_ref, &mut resp);
            let _ = request.respond(resp);
            return;
        }
    };

    if !is_path_authorized(&canonical_path) {
        let mut resp = Response::from_string("Forbidden: path outside authorized library").with_status_code(StatusCode(403));
        add_trusted_cors_to_response(origin_ref, &mut resp);
        let _ = request.respond(resp);
        return;
    }

    let mut file = match File::open(&canonical_path) {
        Ok(f) => f,
        Err(_) => {
            let mut resp = Response::from_string("Cannot Open File").with_status_code(StatusCode(500));
            add_trusted_cors_to_response(origin_ref, &mut resp);
            let _ = request.respond(resp);
            return;
        }
    };

    let file_size = match file.metadata() {
        Ok(m) => m.len(),
        Err(_) => {
            let mut resp = Response::from_string("Cannot Read File Metadata").with_status_code(StatusCode(500));
            add_trusted_cors_to_response(origin_ref, &mut resp);
            let _ = request.respond(resp);
            return;
        }
    };

    let mime_type = match canonical_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "m4a" | "alac" => "audio/mp4",
        "wav" => "audio/wav",
        "ogg" | "opus" => "audio/ogg",
        "aac" => "audio/aac",
        "webm" => "audio/webm",
        "aiff" | "aif" => "audio/aiff",
        "wma" => "audio/x-ms-wma",
        _ => "application/octet-stream",
    };

    // If HEAD request, respond with metadata without body
    if method == "HEAD" {
        let mut resp = Response::empty(StatusCode(200))
            .with_header(Header::from_bytes(&b"Content-Type"[..], mime_type.as_bytes()).unwrap())
            .with_header(Header::from_bytes(&b"Content-Length"[..], file_size.to_string().as_bytes()).unwrap())
            .with_header(Header::from_bytes(&b"Accept-Ranges"[..], &b"bytes"[..]).unwrap())
            .with_header(Header::from_bytes(&b"Access-Control-Expose-Headers"[..], &b"Content-Range, Content-Length, Accept-Ranges"[..]).unwrap());
        add_trusted_cors_to_response(origin_ref, &mut resp);
        let _ = request.respond(resp);
        return;
    }

    // Check Range header
    let range_header = request
        .headers()
        .iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case("range"))
        .map(|h| h.value.as_str().to_string());

    if let Some(range_val) = range_header {
        if let Some(range_spec) = range_val.strip_prefix("bytes=") {
            let parts: Vec<&str> = range_spec.split('-').collect();
            let start: u64 = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
            let end: u64 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(file_size.saturating_sub(1));
            let end = end.min(file_size.saturating_sub(1));

            if start >= file_size {
                let mut resp = Response::empty(StatusCode(416))
                    .with_header(Header::from_bytes(&b"Content-Range"[..], format!("bytes */{}", file_size).as_bytes()).unwrap());
                add_trusted_cors_to_response(origin_ref, &mut resp);
                let _ = request.respond(resp);
                return;
            }

            if start <= end {
                let length = end - start + 1;
                if file.seek(SeekFrom::Start(start)).is_ok() {
                    let take_reader = file.take(length);
                    let mut headers = vec![
                        Header::from_bytes(&b"Content-Type"[..], mime_type.as_bytes()).unwrap(),
                        Header::from_bytes(&b"Content-Range"[..], format!("bytes {}-{}/{}", start, end, file_size).as_bytes()).unwrap(),
                        Header::from_bytes(&b"Accept-Ranges"[..], &b"bytes"[..]).unwrap(),
                        Header::from_bytes(&b"Access-Control-Expose-Headers"[..], &b"Content-Range, Content-Length, Accept-Ranges"[..]).unwrap(),
                    ];
                    add_trusted_cors_headers(origin_ref, &mut headers);
                    let resp = Response::new(
                        StatusCode(206),
                        headers,
                        take_reader,
                        Some(length as usize),
                        None,
                    );
                    let _ = request.respond(resp);
                    return;
                }
            }
        }
    }

    // Fallback full response
    let mut headers = vec![
        Header::from_bytes(&b"Content-Type"[..], mime_type.as_bytes()).unwrap(),
        Header::from_bytes(&b"Accept-Ranges"[..], &b"bytes"[..]).unwrap(),
        Header::from_bytes(&b"Access-Control-Expose-Headers"[..], &b"Content-Range, Content-Length, Accept-Ranges"[..]).unwrap(),
    ];
    add_trusted_cors_headers(origin_ref, &mut headers);
    let resp = Response::new(
        StatusCode(200),
        headers,
        file,
        Some(file_size as usize),
        None,
    );
    let _ = request.respond(resp);
}

static PROXY_CLIENT: LazyLock<reqwest::blocking::Client> = LazyLock::new(|| {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 {
                return attempt.stop();
            }
            if is_safe_remote_url(attempt.url().as_str()) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .expect("Failed to build proxy HTTP client")
});

fn handle_proxy_request(
    request: tiny_http::Request,
    method: &str,
    url_str: &str,
    origin_ref: Option<&str>,
) {
    let query = url_str.splitn(2, '?').nth(1).unwrap_or("");
    let target_url_param = extract_raw_query_param(query, "url");

    let decoded_target = match target_url_param {
        Some(u) => percent_decode_str(u).decode_utf8_lossy().to_string(),
        None => {
            let mut resp = Response::from_string("Missing url query parameter").with_status_code(StatusCode(400));
            add_trusted_cors_to_response(origin_ref, &mut resp);
            let _ = request.respond(resp);
            return;
        }
    };

    if !is_safe_remote_url(&decoded_target) {
        let mut resp = Response::from_string("Forbidden target URL").with_status_code(StatusCode(403));
        add_trusted_cors_to_response(origin_ref, &mut resp);
        let _ = request.respond(resp);
        return;
    }

    let range_header = request
        .headers()
        .iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case("range"))
        .map(|h| h.value.as_str().to_string());

    let mut req_builder = if method == "HEAD" {
        PROXY_CLIENT.head(&decoded_target)
    } else {
        PROXY_CLIENT.get(&decoded_target)
    };

    req_builder = req_builder
        .header(reqwest::header::USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .header(reqwest::header::ACCEPT, "*/*");

    if let Some(ref r) = range_header {
        req_builder = req_builder.header(reqwest::header::RANGE, r);
    }

    let upstream_resp = match req_builder.send() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Upstream stream proxy request failed: {}", e);
            let mut resp = Response::from_string(format!("Upstream error: {}", e)).with_status_code(StatusCode(502));
            add_trusted_cors_to_response(origin_ref, &mut resp);
            let _ = request.respond(resp);
            return;
        }
    };

    let status_code = upstream_resp.status().as_u16();
    let content_length = upstream_resp.content_length();

    let mut headers = vec![
        Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, HEAD, OPTIONS"[..]).unwrap(),
        Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Range, Content-Type, Accept"[..]).unwrap(),
        Header::from_bytes(&b"Access-Control-Expose-Headers"[..], &b"Content-Range, Content-Length, Accept-Ranges"[..]).unwrap(),
        Header::from_bytes(&b"Accept-Ranges"[..], &b"bytes"[..]).unwrap(),
    ];
    add_trusted_cors_headers(origin_ref, &mut headers);

    if let Some(ct) = upstream_resp.headers().get(reqwest::header::CONTENT_TYPE) {
        if let Ok(ct_bytes) = Header::from_bytes(&b"Content-Type"[..], ct.as_bytes()) {
            headers.push(ct_bytes);
        }
    } else {
        headers.push(Header::from_bytes(&b"Content-Type"[..], &b"audio/mp4"[..]).unwrap());
    }

    if let Some(cr) = upstream_resp.headers().get(reqwest::header::CONTENT_RANGE) {
        if let Ok(cr_bytes) = Header::from_bytes(&b"Content-Range"[..], cr.as_bytes()) {
            headers.push(cr_bytes);
        }
    }

    if let Some(cl) = content_length {
        headers.push(Header::from_bytes(&b"Content-Length"[..], cl.to_string().as_bytes()).unwrap());
    }

    if method == "HEAD" {
        let mut resp = Response::empty(StatusCode(status_code));
        for h in headers {
            resp.add_header(h);
        }
        let _ = request.respond(resp);
        return;
    }

    let resp = Response::new(
        StatusCode(status_code),
        headers,
        upstream_resp,
        content_length.map(|l| l as usize),
        None,
    );
    let _ = request.respond(resp);
}

fn atomic_write_cover(target_path: &Path, bytes: &[u8]) {
    if target_path.is_file() {
        return;
    }
    let temp_name = format!("{}.tmp.{}", target_path.display(), std::process::id());
    let temp_path = PathBuf::from(&temp_name);
    if std::fs::write(&temp_path, bytes).is_ok() {
        let _ = std::fs::rename(&temp_path, target_path);
    }
}

fn handle_cover_request(
    request: tiny_http::Request,
    method: &str,
    url_str: &str,
    origin_ref: Option<&str>,
) {
    let query = url_str.splitn(2, '?').nth(1).unwrap_or("");
    let id_param = extract_raw_query_param(query, "id")
        .map(|v| percent_decode_str(v).decode_utf8_lossy().to_string());
    let file_param = extract_raw_query_param(query, "file")
        .map(|v| percent_decode_str(v).decode_utf8_lossy().to_string());

    let file_path = file_param.unwrap_or_default();
    let id = id_param.unwrap_or_else(|| {
        if !file_path.is_empty() {
            crate::metadata::deterministic_id(&file_path)
        } else {
            String::new()
        }
    });

    if id.is_empty() && file_path.is_empty() {
        let mut resp = Response::from_string("Missing id or file parameter").with_status_code(StatusCode(400));
        add_trusted_cors_to_response(origin_ref, &mut resp);
        let _ = request.respond(resp);
        return;
    }

    // Sanitize id strictly to prevent path traversal inside covers directory
    let safe_id: String = id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .collect();

    let covers_dir = crate::get_covers_dir();

    // 1. Check if safe_id.jpg exists
    if !safe_id.is_empty() {
        let jpg_path = covers_dir.join(format!("{}.jpg", safe_id));
        if jpg_path.is_file() {
            serve_image_file(request, method, &jpg_path, "image/jpeg", origin_ref);
            return;
        }

        // 2. Check if safe_id.png exists
        let png_path = covers_dir.join(format!("{}.png", safe_id));
        if png_path.is_file() {
            serve_image_file(request, method, &png_path, "image/png", origin_ref);
            return;
        }

        // 3. Legacy compatibility: check if safe_id.txt exists
        let txt_path = covers_dir.join(format!("{}.txt", safe_id));
        if txt_path.is_file() {
            if let Ok(raw_content) = std::fs::read_to_string(&txt_path) {
                let trimmed = raw_content.trim();
                let b64_str = if let Some(idx) = trimmed.find(";base64,") {
                    &trimmed[idx + 8..]
                } else {
                    trimmed
                };
                if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64_str.trim()) {
                    let is_png = trimmed.contains("image/png") || bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]);
                    let (target_path, mime) = if is_png {
                        (covers_dir.join(format!("{}.png", safe_id)), "image/png")
                    } else {
                        (covers_dir.join(format!("{}.jpg", safe_id)), "image/jpeg")
                    };
                    atomic_write_cover(&target_path, &bytes);
                    let _ = std::fs::remove_file(&txt_path);
                    serve_image_data(request, method, bytes, mime, origin_ref);
                    return;
                }
            }
        }
    }

    // 4. Fallback extraction ONLY for canonicalized, authorized audio track paths
    if !file_path.is_empty() {
        let raw_path = PathBuf::from(&file_path);
        if is_audio_extension(&raw_path) {
            if let Ok(canonical_path) = std::fs::canonicalize(&raw_path) {
                if canonical_path.is_file() && is_path_authorized(&canonical_path) {
                    // Check lofty tags
                    if let Ok(probe) = Probe::open(&canonical_path) {
                        if let Ok(tagged_file) = probe.read() {
                            let maybe_pic = tagged_file
                                .primary_tag()
                                .and_then(|t| t.pictures().first())
                                .or_else(|| tagged_file.tags().iter().find_map(|t| t.pictures().first()));

                            if let Some(pic) = maybe_pic {
                                let pic_data = pic.data().to_vec();
                                let is_png = pic.mime_type() == Some(&lofty::picture::MimeType::Png)
                                    || pic_data.starts_with(&[0x89, 0x50, 0x4E, 0x47]);
                                let (target_name, mime) = if is_png {
                                    (format!("{}.png", safe_id), "image/png")
                                } else {
                                    (format!("{}.jpg", safe_id), "image/jpeg")
                                };
                                if !safe_id.is_empty() {
                                    atomic_write_cover(&covers_dir.join(&target_name), &pic_data);
                                }
                                serve_image_data(request, method, pic_data, mime, origin_ref);
                                return;
                            }
                        }
                    }

                    // Check track-specific image
                    let track_specific = [
                        canonical_path.with_extension("jpg"),
                        canonical_path.with_extension("png"),
                        canonical_path.with_extension("jpeg"),
                    ];
                    for cand in &track_specific {
                        if cand.is_file() {
                            if let Ok(bytes) = std::fs::read(cand) {
                                let is_png = cand.extension().and_then(|s| s.to_str()) == Some("png")
                                    || bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]);
                                let (target_name, mime) = if is_png {
                                    (format!("{}.png", safe_id), "image/png")
                                } else {
                                    (format!("{}.jpg", safe_id), "image/jpeg")
                                };
                                if !safe_id.is_empty() {
                                    atomic_write_cover(&covers_dir.join(&target_name), &bytes);
                                }
                                serve_image_data(request, method, bytes, mime, origin_ref);
                                return;
                            }
                        }
                    }

                    // Check folder-level image
                    if let Some(parent) = canonical_path.parent() {
                        let folder_cands = [
                            parent.join("cover.jpg"),
                            parent.join("cover.png"),
                            parent.join("album.jpg"),
                            parent.join("album.png"),
                            parent.join("folder.jpg"),
                            parent.join("folder.png"),
                        ];
                        for cand in &folder_cands {
                            if cand.is_file() {
                                if let Ok(bytes) = std::fs::read(cand) {
                                    let is_png = cand.extension().and_then(|s| s.to_str()) == Some("png")
                                        || bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]);
                                    let (target_name, mime) = if is_png {
                                        (format!("{}.png", safe_id), "image/png")
                                    } else {
                                        (format!("{}.jpg", safe_id), "image/jpeg")
                                    };
                                    if !safe_id.is_empty() {
                                        atomic_write_cover(&covers_dir.join(&target_name), &bytes);
                                    }
                                    serve_image_data(request, method, bytes, mime, origin_ref);
                                    return;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 404 Not Found
    let mut resp = Response::from_string("Artwork Not Found").with_status_code(StatusCode(404));
    add_trusted_cors_to_response(origin_ref, &mut resp);
    let _ = request.respond(resp);
}

fn serve_image_file(
    request: tiny_http::Request,
    method: &str,
    file_path: &PathBuf,
    mime: &str,
    origin_ref: Option<&str>,
) {
    let file = match File::open(file_path) {
        Ok(f) => f,
        Err(_) => {
            let mut resp = Response::from_string("Cannot Open Image File").with_status_code(StatusCode(500));
            add_trusted_cors_to_response(origin_ref, &mut resp);
            let _ = request.respond(resp);
            return;
        }
    };

    let file_size = match file.metadata() {
        Ok(m) => m.len(),
        Err(_) => 0,
    };

    if method == "HEAD" {
        let mut resp = Response::empty(StatusCode(200));
        resp.add_header(Header::from_bytes(&b"Content-Type"[..], mime.as_bytes()).unwrap());
        resp.add_header(Header::from_bytes(&b"Content-Length"[..], file_size.to_string().as_bytes()).unwrap());
        resp.add_header(Header::from_bytes(&b"Cache-Control"[..], &b"public, max-age=31536000, immutable"[..]).unwrap());
        add_trusted_cors_to_response(origin_ref, &mut resp);
        let _ = request.respond(resp);
        return;
    }

    let mut resp = Response::from_file(file);
    resp.add_header(Header::from_bytes(&b"Content-Type"[..], mime.as_bytes()).unwrap());
    resp.add_header(Header::from_bytes(&b"Cache-Control"[..], &b"public, max-age=31536000, immutable"[..]).unwrap());
    add_trusted_cors_to_response(origin_ref, &mut resp);
    let _ = request.respond(resp);
}

fn serve_image_data(
    request: tiny_http::Request,
    method: &str,
    data: Vec<u8>,
    mime: &str,
    origin_ref: Option<&str>,
) {
    let len = data.len();
    if method == "HEAD" {
        let mut resp = Response::empty(StatusCode(200));
        resp.add_header(Header::from_bytes(&b"Content-Type"[..], mime.as_bytes()).unwrap());
        resp.add_header(Header::from_bytes(&b"Content-Length"[..], len.to_string().as_bytes()).unwrap());
        resp.add_header(Header::from_bytes(&b"Cache-Control"[..], &b"public, max-age=31536000, immutable"[..]).unwrap());
        add_trusted_cors_to_response(origin_ref, &mut resp);
        let _ = request.respond(resp);
        return;
    }

    let mut resp = Response::from_data(data);
    resp.add_header(Header::from_bytes(&b"Content-Type"[..], mime.as_bytes()).unwrap());
    resp.add_header(Header::from_bytes(&b"Cache-Control"[..], &b"public, max-age=31536000, immutable"[..]).unwrap());
    add_trusted_cors_to_response(origin_ref, &mut resp);
    let _ = request.respond(resp);
}

pub fn get_stream_url(file_path: &str) -> String {
    let port = SERVER_PORT.load(Ordering::SeqCst);
    let token = get_auth_token();
    let encoded = percent_encoding::utf8_percent_encode(file_path, percent_encoding::NON_ALPHANUMERIC);
    format!("http://127.0.0.1:{}/audio?file={}&token={}", port, encoded, token)
}

pub fn get_proxy_stream_url(remote_url: &str) -> String {
    let port = SERVER_PORT.load(Ordering::SeqCst);
    let token = get_auth_token();
    let encoded = percent_encoding::utf8_percent_encode(remote_url, percent_encoding::NON_ALPHANUMERIC);
    format!("http://127.0.0.1:{}/proxy?url={}&token={}", port, encoded, token)
}

pub fn get_cover_url(id: &str, file_path: &str) -> String {
    let port = SERVER_PORT.load(Ordering::SeqCst);
    let token = get_auth_token();
    if file_path.is_empty() {
        format!("http://127.0.0.1:{}/cover?id={}&token={}", port, id, token)
    } else {
        let encoded = percent_encoding::utf8_percent_encode(file_path, percent_encoding::NON_ALPHANUMERIC);
        format!("http://127.0.0.1:{}/cover?id={}&file={}&token={}", port, id, encoded, token)
    }
}

pub fn refresh_cover_url(existing_cover_url: &str) -> String {
    let query = existing_cover_url.splitn(2, '?').nth(1).unwrap_or("");
    let id = extract_raw_query_param(query, "id")
        .map(|v| percent_decode_str(v).decode_utf8_lossy().to_string())
        .unwrap_or_default();
    let file = extract_raw_query_param(query, "file")
        .map(|v| percent_decode_str(v).decode_utf8_lossy().to_string())
        .unwrap_or_default();
    get_cover_url(&id, &file)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_streamer_url() {
        SERVER_PORT.store(3500, Ordering::SeqCst);
        let url = get_stream_url(r"C:\Music\song.mp3");
        assert!(url.starts_with("http://127.0.0.1:3500/audio?file="));
        assert!(url.contains(&format!("&token={}", get_auth_token())));
    }

    #[test]
    fn test_proxy_url() {
        SERVER_PORT.store(3500, Ordering::SeqCst);
        let url = get_proxy_stream_url("https://example.com/audio.mp4?foo=1&bar=2");
        assert!(url.starts_with("http://127.0.0.1:3500/proxy?url="));
        assert!(url.contains("https"));
        assert!(url.contains(&format!("&token={}", get_auth_token())));
    }

    #[test]
    fn test_cover_url() {
        SERVER_PORT.store(3500, Ordering::SeqCst);
        let tok = get_auth_token();
        let url = get_cover_url("abc1234", r"C:\Music\song.mp3");
        assert!(url.starts_with("http://127.0.0.1:3500/cover?id=abc1234&file="));
        assert!(url.ends_with(&format!("&token={}", tok)));
        let url_no_file = get_cover_url("abc1234", "");
        assert_eq!(url_no_file, format!("http://127.0.0.1:3500/cover?id=abc1234&token={}", tok));

        // Verify refresh_cover_url preserves id/file and replaces stale port & token
        let refreshed = refresh_cover_url("http://127.0.0.1:11111/cover?id=abc1234&file=C%3A%5CMusic%5Csong.mp3&token=stale_old_token");
        assert_eq!(refreshed, url);
    }

    #[test]
    fn test_token_verification() {
        let tok = get_auth_token();
        assert_eq!(tok.len(), 32);
        assert!(is_valid_token(tok));
        assert!(!is_valid_token(""));
        assert!(!is_valid_token("00000000000000000000000000000000"));
        assert!(!is_valid_token(&tok[..tok.len() - 1]));
    }

    #[test]
    fn test_trusted_origin_policy() {
        assert!(is_trusted_origin("http://tauri.localhost"));
        assert!(is_trusted_origin("https://tauri.localhost"));
        assert!(is_trusted_origin("tauri://localhost"));
        assert!(is_trusted_origin("http://localhost:1420"));
        assert!(!is_trusted_origin("*"));
        assert!(!is_trusted_origin("https://evil.example.com"));
        assert!(!is_trusted_origin("http://localhost:3000"));
    }

    #[test]
    fn test_audio_extension_and_ssrf_guards() {
        assert!(is_audio_extension(Path::new("song.mp3")));
        assert!(is_audio_extension(Path::new("lossless.FLAC")));
        assert!(!is_audio_extension(Path::new("id_rsa")));
        assert!(!is_audio_extension(Path::new("hosts")));
        assert!(!is_audio_extension(Path::new("library.db")));

        assert!(!is_safe_remote_url("http://127.0.0.1:8080/secret"));
        assert!(!is_safe_remote_url("http://localhost/admin"));
        assert!(!is_safe_remote_url("http://169.254.169.254/latest/meta-data/"));
        assert!(!is_safe_remote_url("http://10.0.0.5/internal"));
        assert!(!is_safe_remote_url("http://192.168.1.1/"));
        assert!(!is_safe_remote_url("http://[::1]:8000/"));
        assert!(!is_safe_remote_url("file:///C:/Windows/win.ini"));
        assert!(is_safe_remote_url("https://rr1---sn-abcd.googlevideo.com/videoplayback"));
    }

    #[test]
    fn test_path_containment() {
        let temp_dir = std::env::temp_dir().join("musicvault_test_containment");
        let allowed_sub = temp_dir.join("allowed_music");
        let outside_sub = temp_dir.join("secret_docs");
        let _ = std::fs::create_dir_all(&allowed_sub);
        let _ = std::fs::create_dir_all(&outside_sub);

        let allowed_song = allowed_sub.join("track.mp3");
        let secret_file = outside_sub.join("secret.mp3");
        let _ = std::fs::write(&allowed_song, b"audio");
        let _ = std::fs::write(&secret_file, b"secret");

        authorize_root(&allowed_sub);

        let canon_allowed = std::fs::canonicalize(&allowed_song).unwrap();
        let canon_secret = std::fs::canonicalize(&secret_file).unwrap();

        assert!(is_path_authorized(&canon_allowed));
        assert!(!is_path_authorized(&canon_secret));

        authorize_file(&secret_file);
        assert!(is_path_authorized(&canon_secret));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_http_security_enforcement() {
        let server = Server::http("127.0.0.1:0").expect("Failed to bind test HTTP server");
        let port = match server.server_addr() {
            tiny_http::ListenAddr::IP(addr) => addr.port(),
        };

        let temp_dir = std::env::temp_dir().join("musicvault_test_http_sec");
        let allowed_dir = temp_dir.join("library");
        let outside_dir = temp_dir.join("outside");
        let _ = std::fs::create_dir_all(&allowed_dir);
        let _ = std::fs::create_dir_all(&outside_dir);

        let valid_mp3 = allowed_dir.join("valid.mp3");
        let txt_inside = allowed_dir.join("notes.txt");
        let outside_mp3 = outside_dir.join("outside.mp3");
        let _ = std::fs::write(&valid_mp3, b"ID3testaudio");
        let _ = std::fs::write(&txt_inside, b"secret notes");
        let _ = std::fs::write(&outside_mp3, b"outside audio");
        authorize_root(&allowed_dir);

        let handle = thread::spawn(move || {
            for request in server.incoming_requests().take(6) {
                handle_request(request);
            }
        });

        let client = reqwest::blocking::Client::new();
        let tok = get_auth_token();
        let enc_valid = percent_encoding::utf8_percent_encode(
            valid_mp3.to_string_lossy().as_ref(),
            percent_encoding::NON_ALPHANUMERIC,
        )
        .to_string();
        let enc_txt = percent_encoding::utf8_percent_encode(
            txt_inside.to_string_lossy().as_ref(),
            percent_encoding::NON_ALPHANUMERIC,
        )
        .to_string();
        let enc_outside = percent_encoding::utf8_percent_encode(
            outside_mp3.to_string_lossy().as_ref(),
            percent_encoding::NON_ALPHANUMERIC,
        )
        .to_string();

        // 1. Missing token -> 401 Unauthorized (no wildcard CORS)
        let r1 = client
            .get(format!("http://127.0.0.1:{}/audio?file={}", port, enc_valid))
            .send()
            .unwrap();
        assert_eq!(r1.status().as_u16(), 401);
        assert!(r1.headers().get("access-control-allow-origin").is_none());

        // 2. Untrusted Origin even with valid token -> 403 Forbidden
        let r2 = client
            .get(format!("http://127.0.0.1:{}/audio?file={}&token={}", port, enc_valid, tok))
            .header("Origin", "https://evil.example.com")
            .send()
            .unwrap();
        assert_eq!(r2.status().as_u16(), 403);

        // 3. Disallowed file extension (.txt) even inside authorized root -> 403 Forbidden
        let r3 = client
            .get(format!("http://127.0.0.1:{}/audio?file={}&token={}", port, enc_txt, tok))
            .send()
            .unwrap();
        assert_eq!(r3.status().as_u16(), 403);

        // 4. Unauthorized path outside configured library even with .mp3 extension -> 403 Forbidden
        let r4 = client
            .get(format!("http://127.0.0.1:{}/audio?file={}&token={}", port, enc_outside, tok))
            .send()
            .unwrap();
        assert_eq!(r4.status().as_u16(), 403);

        // 5. SSRF attempt on /proxy targeting localhost -> 403 Forbidden
        let enc_ssrf = percent_encoding::utf8_percent_encode(
            "http://127.0.0.1:8080/internal",
            percent_encoding::NON_ALPHANUMERIC,
        )
        .to_string();
        let r5 = client
            .get(format!("http://127.0.0.1:{}/proxy?url={}&token={}", port, enc_ssrf, tok))
            .send()
            .unwrap();
        assert_eq!(r5.status().as_u16(), 403);

        // 6. Valid token + trusted Origin + authorized MP3 -> 200 OK & strict Origin echo
        let r6 = client
            .get(format!("http://127.0.0.1:{}/audio?file={}&token={}", port, enc_valid, tok))
            .header("Origin", "http://tauri.localhost")
            .send()
            .unwrap();
        assert_eq!(r6.status().as_u16(), 200);
        assert_eq!(
            r6.headers().get("access-control-allow-origin").and_then(|v| v.to_str().ok()),
            Some("http://tauri.localhost")
        );
        assert_eq!(r6.bytes().unwrap().as_ref(), b"ID3testaudio");

        let _ = handle.join();
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
