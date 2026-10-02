use percent_encoding::percent_decode_str;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU16, Ordering};
use std::thread;
use tiny_http::{Header, Response, Server, StatusCode};

pub static SERVER_PORT: AtomicU16 = AtomicU16::new(0);

pub fn start_stream_server() -> u16 {
    // Try binding to 127.0.0.1:0 (OS allocates a free port)
    let listener = TcpListener::bind("127.0.0.1:0").expect("Failed to bind random local port");
    let local_addr = listener.local_addr().expect("Failed to get local addr");
    let port = local_addr.port();
    drop(listener); // Close dummy listener so tiny_http can bind

    let server = Server::http(format!("127.0.0.1:{}", port)).expect("Failed to create tiny_http server");
    SERVER_PORT.store(port, Ordering::SeqCst);

    thread::spawn(move || {
        for request in server.incoming_requests() {
            let url_str = request.url().to_string();

            // Handle preflight OPTIONS
            if request.method().as_str() == "OPTIONS" {
                let mut response = Response::empty(StatusCode(200));
                response.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
                response.add_header(Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, HEAD, OPTIONS"[..]).unwrap());
                response.add_header(Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Range"[..]).unwrap());
                let _ = request.respond(response);
                continue;
            }

            if !url_str.starts_with("/audio") {
                let mut response = Response::from_string("Not Found");
                response = response.with_status_code(StatusCode(404));
                let _ = request.respond(response);
                continue;
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
                    continue;
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
                continue;
            }

            let mut file = match File::open(&path) {
                Ok(f) => f,
                Err(_) => {
                    let mut resp = Response::from_string("Cannot Open File");
                    resp = resp.with_status_code(StatusCode(500));
                    let _ = request.respond(resp);
                    continue;
                }
            };

            let file_size = match file.metadata() {
                Ok(m) => m.len(),
                Err(_) => {
                    let mut resp = Response::from_string("Cannot Read File Metadata");
                    resp = resp.with_status_code(StatusCode(500));
                    let _ = request.respond(resp);
                    continue;
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

                    if start <= end && start < file_size {
                        let length = end - start + 1;
                        if file.seek(SeekFrom::Start(start)).is_ok() {
                            let take_reader = (&mut file).take(length);
                            let resp = Response::new(
                                StatusCode(206),
                                vec![
                                    Header::from_bytes(&b"Content-Type"[..], mime_type.as_bytes()).unwrap(),
                                    Header::from_bytes(&b"Content-Range"[..], format!("bytes {}-{}/{}", start, end, file_size).as_bytes()).unwrap(),
                                    Header::from_bytes(&b"Accept-Ranges"[..], &b"bytes"[..]).unwrap(),
                                    Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
                                ],
                                take_reader,
                                Some(length as usize),
                                None,
                            );
                            let _ = request.respond(resp);
                            continue;
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
                ],
                file,
                Some(file_size as usize),
                None,
            );
            let _ = request.respond(resp);
        }
    });

    port
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
