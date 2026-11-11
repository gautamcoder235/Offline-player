use base64::Engine;
use lofty::file::TaggedFileExt;
use lofty::probe::Probe;
use percent_encoding::percent_decode_str;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU16, Ordering};
use std::thread;
use tiny_http::{Header, Response, Server, StatusCode};

pub static SERVER_PORT: AtomicU16 = AtomicU16::new(0);

pub fn start_stream_server() -> u16 {
    let server = Server::http("127.0.0.1:0").expect("Failed to create tiny_http server on 127.0.0.1:0");
    let port = match server.server_addr() {
        tiny_http::ListenAddr::IP(addr) => addr.port(),
    };
    SERVER_PORT.store(port, Ordering::SeqCst);

    thread::spawn(move || {
        for request in server.incoming_requests() {
            thread::spawn(move || {
                handle_request(request);
            });
        }
    });

    port
}

fn handle_request(request: tiny_http::Request) {
    let method = request.method().as_str().to_string();
    let url_str = request.url().to_string();

    // Handle preflight OPTIONS
    if method == "OPTIONS" {
        let mut response = Response::empty(StatusCode(200));
        response.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
        response.add_header(Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, HEAD, OPTIONS"[..]).unwrap());
        response.add_header(Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Range, Content-Type, Accept"[..]).unwrap());
        response.add_header(Header::from_bytes(&b"Access-Control-Expose-Headers"[..], &b"Content-Range, Content-Length, Accept-Ranges"[..]).unwrap());
        let _ = request.respond(response);
        return;
    }

    if url_str.starts_with("/proxy") {
        handle_proxy_request(request, &method, &url_str);
        return;
    }

    if url_str.starts_with("/cover") {
        handle_cover_request(request, &method, &url_str);
        return;
    }

    if !url_str.starts_with("/audio") {
        let mut response = Response::from_string("Not Found");
        response = response.with_status_code(StatusCode(404));
        let _ = request.respond(response);
        return;
    }

    // Extract ?file= parameter
    let query = url_str.splitn(2, '?').nth(1).unwrap_or("");
    let mut file_param = None;
    for param in query.split('&') {
        let mut pair = param.splitn(2, '=');
        if let (Some(k), Some(v)) = (pair.next(), pair.next()) {
            if k == "file" {
                file_param = Some(v);
                break;
            }
        }
    }

    let encoded_file = match file_param {
        Some(f) => f,
        None => {
            let mut resp = Response::from_string("Missing file parameter");
            resp = resp.with_status_code(StatusCode(400));
            let _ = request.respond(resp);
            return;
        }
    };

    let decoded_path_str = percent_decode_str(encoded_file)
        .decode_utf8_lossy()
        .to_string();
    let path = PathBuf::from(&decoded_path_str);

    if !path.exists() || !path.is_file() {
        let mut resp = Response::from_string("File Not Found");
        resp = resp.with_status_code(StatusCode(404));
        let _ = request.respond(resp);
        return;
    }

    let mut file = match File::open(&path) {
        Ok(f) => f,
        Err(_) => {
            let mut resp = Response::from_string("Cannot Open File");
            resp = resp.with_status_code(StatusCode(500));
            let _ = request.respond(resp);
            return;
        }
    };

    let file_size = match file.metadata() {
        Ok(m) => m.len(),
        Err(_) => {
            let mut resp = Response::from_string("Cannot Read File Metadata");
            resp = resp.with_status_code(StatusCode(500));
            let _ = request.respond(resp);
            return;
        }
    };

    let mime_type = match path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase().as_str() {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "m4a" | "alac" => "audio/mp4",
        "wav" => "audio/wav",
        "ogg" | "opus" => "audio/ogg",
        "aac" => "audio/aac",
        "webm" => "audio/webm",
        "aiff" | "aif" => "audio/aiff",
        _ => "application/octet-stream",
    };

    // If HEAD request, respond with metadata without body
    if method == "HEAD" {
        let resp = Response::empty(StatusCode(200))
            .with_header(Header::from_bytes(&b"Content-Type"[..], mime_type.as_bytes()).unwrap())
            .with_header(Header::from_bytes(&b"Content-Length"[..], file_size.to_string().as_bytes()).unwrap())
            .with_header(Header::from_bytes(&b"Accept-Ranges"[..], &b"bytes"[..]).unwrap())
            .with_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap())
            .with_header(Header::from_bytes(&b"Access-Control-Expose-Headers"[..], &b"Content-Range, Content-Length, Accept-Ranges"[..]).unwrap());
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
                let resp = Response::empty(StatusCode(416))
                    .with_header(Header::from_bytes(&b"Content-Range"[..], format!("bytes */{}", file_size).as_bytes()).unwrap())
                    .with_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
                let _ = request.respond(resp);
                return;
            }

            if start <= end {
                let length = end - start + 1;
                if file.seek(SeekFrom::Start(start)).is_ok() {
                    let take_reader = file.take(length);
                    let resp = Response::new(
                        StatusCode(206),
                        vec![
                            Header::from_bytes(&b"Content-Type"[..], mime_type.as_bytes()).unwrap(),
                            Header::from_bytes(&b"Content-Range"[..], format!("bytes {}-{}/{}", start, end, file_size).as_bytes()).unwrap(),
                            Header::from_bytes(&b"Accept-Ranges"[..], &b"bytes"[..]).unwrap(),
                            Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
                            Header::from_bytes(&b"Access-Control-Expose-Headers"[..], &b"Content-Range, Content-Length, Accept-Ranges"[..]).unwrap(),
                        ],
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
    let resp = Response::new(
        StatusCode(200),
        vec![
            Header::from_bytes(&b"Content-Type"[..], mime_type.as_bytes()).unwrap(),
            Header::from_bytes(&b"Accept-Ranges"[..], &b"bytes"[..]).unwrap(),
            Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
            Header::from_bytes(&b"Access-Control-Expose-Headers"[..], &b"Content-Range, Content-Length, Accept-Ranges"[..]).unwrap(),
        ],
        file,
        Some(file_size as usize),
        None,
    );
    let _ = request.respond(resp);
}

static PROXY_CLIENT: std::sync::LazyLock<reqwest::blocking::Client> = std::sync::LazyLock::new(|| {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .expect("Failed to build proxy HTTP client")
});

fn handle_proxy_request(request: tiny_http::Request, method: &str, url_str: &str) {
    let query = url_str.splitn(2, '?').nth(1).unwrap_or("");
    let mut target_url_param = None;
    for param in query.split('&') {
        let mut pair = param.splitn(2, '=');
        if let (Some(k), Some(v)) = (pair.next(), pair.next()) {
            if k == "url" {
                target_url_param = Some(v);
                break;
            }
        }
    }

    let decoded_target = match target_url_param {
        Some(u) => percent_decode_str(u).decode_utf8_lossy().to_string(),
        None => {
            let mut resp = Response::from_string("Missing url query parameter");
            resp = resp.with_status_code(StatusCode(400));
            let _ = request.respond(resp);
            return;
        }
    };

    if !decoded_target.starts_with("http://") && !decoded_target.starts_with("https://") {
        let mut resp = Response::from_string("Invalid target URL");
        resp = resp.with_status_code(StatusCode(400));
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
            let mut resp = Response::from_string(format!("Upstream error: {}", e));
            resp = resp.with_status_code(StatusCode(502));
            resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
            let _ = request.respond(resp);
            return;
        }
    };

    let status_code = upstream_resp.status().as_u16();
    let content_length = upstream_resp.content_length();

    let mut headers = vec![
        Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
        Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, HEAD, OPTIONS"[..]).unwrap(),
        Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Range, Content-Type, Accept"[..]).unwrap(),
        Header::from_bytes(&b"Access-Control-Expose-Headers"[..], &b"Content-Range, Content-Length, Accept-Ranges"[..]).unwrap(),
        Header::from_bytes(&b"Accept-Ranges"[..], &b"bytes"[..]).unwrap(),
    ];

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

fn atomic_write_cover(target_path: &std::path::Path, bytes: &[u8]) {
    if target_path.is_file() {
        return;
    }
    let temp_name = format!("{}.tmp.{}", target_path.display(), std::process::id());
    let temp_path = PathBuf::from(&temp_name);
    if std::fs::write(&temp_path, bytes).is_ok() {
        let _ = std::fs::rename(&temp_path, target_path);
    }
}

fn handle_cover_request(request: tiny_http::Request, method: &str, url_str: &str) {
    let query = url_str.splitn(2, '?').nth(1).unwrap_or("");
    let mut id_param = None;
    let mut file_param = None;
    for param in query.split('&') {
        let mut pair = param.splitn(2, '=');
        if let (Some(k), Some(v)) = (pair.next(), pair.next()) {
            if k == "id" {
                id_param = Some(percent_decode_str(v).decode_utf8_lossy().to_string());
            } else if k == "file" {
                file_param = Some(percent_decode_str(v).decode_utf8_lossy().to_string());
            }
        }
    }

    let file_path = file_param.unwrap_or_default();
    let id = id_param.unwrap_or_else(|| {
        if !file_path.is_empty() {
            crate::metadata::deterministic_id(&file_path)
        } else {
            String::new()
        }
    });

    if id.is_empty() && file_path.is_empty() {
        let mut resp = Response::from_string("Missing id or file parameter");
        resp = resp.with_status_code(StatusCode(400));
        resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
        let _ = request.respond(resp);
        return;
    }

    // Sanitize id to prevent path traversal
    let safe_id: String = id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').collect();

    let covers_dir = crate::get_covers_dir();

    // 1. Check if safe_id.jpg exists
    if !safe_id.is_empty() {
        let jpg_path = covers_dir.join(format!("{}.jpg", safe_id));
        if jpg_path.is_file() {
            serve_image_file(request, method, &jpg_path, "image/jpeg");
            return;
        }

        // 2. Check if safe_id.png exists
        let png_path = covers_dir.join(format!("{}.png", safe_id));
        if png_path.is_file() {
            serve_image_file(request, method, &png_path, "image/png");
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
                    serve_image_data(request, method, bytes, mime);
                    return;
                }
            }
        }
    }

    // 4. If not in cache and file_path is provided, extract via lofty or local files
    if !file_path.is_empty() {
        let path = PathBuf::from(&file_path);
        if path.is_file() {
            // Check lofty tags
            if let Ok(probe) = Probe::open(&path) {
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
                        serve_image_data(request, method, pic_data, mime);
                        return;
                    }
                }
            }

            // Check track-specific image
            let track_specific = [
                path.with_extension("jpg"),
                path.with_extension("png"),
                path.with_extension("jpeg"),
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
                        serve_image_data(request, method, bytes, mime);
                        return;
                    }
                }
            }

            // Check folder-level image
            if let Some(parent) = path.parent() {
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
                            serve_image_data(request, method, bytes, mime);
                            return;
                        }
                    }
                }
            }
        }
    }

    // 404 Not Found
    let mut resp = Response::from_string("Artwork Not Found");
    resp = resp.with_status_code(StatusCode(404));
    resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
    let _ = request.respond(resp);
}

fn serve_image_file(request: tiny_http::Request, method: &str, file_path: &PathBuf, mime: &str) {
    let file = match File::open(file_path) {
        Ok(f) => f,
        Err(_) => {
            let mut resp = Response::from_string("Cannot Open Image File");
            resp = resp.with_status_code(StatusCode(500));
            resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
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
        resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
        resp.add_header(Header::from_bytes(&b"Cache-Control"[..], &b"public, max-age=31536000, immutable"[..]).unwrap());
        let _ = request.respond(resp);
        return;
    }

    let mut resp = Response::from_file(file);
    resp.add_header(Header::from_bytes(&b"Content-Type"[..], mime.as_bytes()).unwrap());
    resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
    resp.add_header(Header::from_bytes(&b"Cache-Control"[..], &b"public, max-age=31536000, immutable"[..]).unwrap());
    let _ = request.respond(resp);
}

fn serve_image_data(request: tiny_http::Request, method: &str, data: Vec<u8>, mime: &str) {
    let len = data.len();
    if method == "HEAD" {
        let mut resp = Response::empty(StatusCode(200));
        resp.add_header(Header::from_bytes(&b"Content-Type"[..], mime.as_bytes()).unwrap());
        resp.add_header(Header::from_bytes(&b"Content-Length"[..], len.to_string().as_bytes()).unwrap());
        resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
        resp.add_header(Header::from_bytes(&b"Cache-Control"[..], &b"public, max-age=31536000, immutable"[..]).unwrap());
        let _ = request.respond(resp);
        return;
    }

    let mut resp = Response::from_data(data);
    resp.add_header(Header::from_bytes(&b"Content-Type"[..], mime.as_bytes()).unwrap());
    resp.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
    resp.add_header(Header::from_bytes(&b"Cache-Control"[..], &b"public, max-age=31536000, immutable"[..]).unwrap());
    let _ = request.respond(resp);
}

pub fn get_stream_url(file_path: &str) -> String {
    let port = SERVER_PORT.load(Ordering::SeqCst);
    let encoded = percent_encoding::utf8_percent_encode(file_path, percent_encoding::NON_ALPHANUMERIC);
    format!("http://127.0.0.1:{}/audio?file={}", port, encoded)
}

pub fn get_proxy_stream_url(remote_url: &str) -> String {
    let port = SERVER_PORT.load(Ordering::SeqCst);
    let encoded = percent_encoding::utf8_percent_encode(remote_url, percent_encoding::NON_ALPHANUMERIC);
    format!("http://127.0.0.1:{}/proxy?url={}", port, encoded)
}

pub fn get_cover_url(id: &str, file_path: &str) -> String {
    let port = SERVER_PORT.load(Ordering::SeqCst);
    if file_path.is_empty() {
        format!("http://127.0.0.1:{}/cover?id={}", port, id)
    } else {
        let encoded = percent_encoding::utf8_percent_encode(file_path, percent_encoding::NON_ALPHANUMERIC);
        format!("http://127.0.0.1:{}/cover?id={}&file={}", port, id, encoded)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_streamer_url() {
        SERVER_PORT.store(3500, Ordering::SeqCst);
        let url = get_stream_url(r"C:\Music\song.mp3");
        assert!(url.starts_with("http://127.0.0.1:3500/audio?file="));
    }

    #[test]
    fn test_proxy_url() {
        SERVER_PORT.store(3500, Ordering::SeqCst);
        let url = get_proxy_stream_url("https://example.com/audio.mp4?foo=1&bar=2");
        println!("Generated proxy URL: {}", url);
        assert!(url.starts_with("http://127.0.0.1:3500/proxy?url="));
        assert!(url.contains("https"));
    }

    #[test]
    fn test_cover_url() {
        SERVER_PORT.store(3500, Ordering::SeqCst);
        let url = get_cover_url("abc1234", r"C:\Music\song.mp3");
        assert!(url.starts_with("http://127.0.0.1:3500/cover?id=abc1234&file="));
        let url_no_file = get_cover_url("abc1234", "");
        assert_eq!(url_no_file, "http://127.0.0.1:3500/cover?id=abc1234");
    }
}
