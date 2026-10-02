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
        "m4a" => "audio/mp4",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
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

pub fn get_stream_url(file_path: &str) -> String {
    let port = SERVER_PORT.load(Ordering::SeqCst);
    let encoded = percent_encoding::utf8_percent_encode(file_path, percent_encoding::NON_ALPHANUMERIC);
    format!("http://127.0.0.1:{}/audio?file={}", port, encoded)
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
}
