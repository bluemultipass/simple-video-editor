use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;

/// A minimal HTTP/1.1 file server that listens on a random port on 127.0.0.1.
/// Supports Range requests so the browser's `<video>` element can seek correctly.
/// Drop the struct to shut the server down.
pub struct FileServer {
    port: u16,
    shutdown: Arc<AtomicBool>,
}

impl FileServer {
    pub fn start(file_path: String) -> Result<Self, String> {
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();

        let shutdown = Arc::new(AtomicBool::new(false));
        let shutdown_clone = shutdown.clone();
        let path = Arc::new(file_path);

        thread::spawn(move || {
            for stream in listener.incoming() {
                if shutdown_clone.load(Ordering::Relaxed) {
                    break;
                }
                if let Ok(stream) = stream {
                    let path_clone = path.clone();
                    thread::spawn(move || {
                        let _ = handle_connection(stream, &path_clone);
                    });
                }
            }
        });

        Ok(FileServer { port, shutdown })
    }

    pub fn url(&self) -> String {
        format!("http://127.0.0.1:{}/", self.port)
    }
}

impl Drop for FileServer {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::Relaxed);
        // Connect once to unblock the blocking accept() call in the server thread.
        let _ = TcpStream::connect(format!("127.0.0.1:{}", self.port));
    }
}

fn handle_connection(mut stream: TcpStream, file_path: &str) -> std::io::Result<()> {
    // Read request headers into a fixed buffer.
    let mut buf = [0u8; 4096];
    let mut total = 0;
    loop {
        if total >= buf.len() {
            break;
        }
        let n = stream.read(&mut buf[total..])?;
        if n == 0 {
            break;
        }
        total += n;
        if buf[..total].windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
    }

    let request = String::from_utf8_lossy(&buf[..total]);

    // Only handle GET and HEAD; ignore the wake-up connection sent by Drop.
    let is_head = request.starts_with("HEAD ");
    if !request.starts_with("GET ") && !is_head {
        return Ok(());
    }

    let range = parse_range_header(&request);

    let mut file = File::open(file_path)?;
    let file_size = file.metadata()?.len();

    if file_size == 0 {
        stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n")?;
        return Ok(());
    }

    let content_type = mime_type_for_path(file_path);

    let (start, end) = match range {
        Some((s, e)) => (
            s.min(file_size - 1),
            e.unwrap_or(file_size - 1).min(file_size - 1),
        ),
        None => (0, file_size - 1),
    };
    let content_length = end - start + 1;
    let status_line = if range.is_some() {
        "HTTP/1.1 206 Partial Content"
    } else {
        "HTTP/1.1 200 OK"
    };

    let header = format!(
        "{status_line}\r\n\
         Content-Type: {content_type}\r\n\
         Content-Length: {content_length}\r\n\
         Content-Range: bytes {start}-{end}/{file_size}\r\n\
         Accept-Ranges: bytes\r\n\
         Connection: close\r\n\
         \r\n"
    );
    stream.write_all(header.as_bytes())?;

    if is_head {
        return Ok(());
    }

    file.seek(SeekFrom::Start(start))?;

    let mut remaining = content_length;
    let mut chunk = [0u8; 65536];
    while remaining > 0 {
        let to_read = remaining.min(chunk.len() as u64) as usize;
        match file.read(&mut chunk[..to_read]) {
            Ok(0) => break,
            Ok(n) => {
                stream.write_all(&chunk[..n])?;
                remaining -= n as u64;
            }
            Err(e) => return Err(e),
        }
    }

    Ok(())
}

/// Parses `Range: bytes=START-[END]` from raw request headers.
fn parse_range_header(request: &str) -> Option<(u64, Option<u64>)> {
    for line in request.lines() {
        if line.to_lowercase().starts_with("range: bytes=") {
            let value = &line["range: bytes=".len()..];
            let mut parts = value.splitn(2, '-');
            let start: u64 = parts.next()?.trim().parse().ok()?;
            let end: Option<u64> = parts.next().and_then(|s| {
                let s = s.trim();
                if s.is_empty() {
                    None
                } else {
                    s.parse().ok()
                }
            });
            return Some((start, end));
        }
    }
    None
}

fn mime_type_for_path(path: &str) -> &'static str {
    let p = path.to_lowercase();
    if p.ends_with(".mp4") || p.ends_with(".m4v") {
        "video/mp4"
    } else if p.ends_with(".mkv") {
        "video/x-matroska"
    } else if p.ends_with(".webm") {
        "video/webm"
    } else if p.ends_with(".mov") {
        "video/quicktime"
    } else if p.ends_with(".avi") {
        "video/x-msvideo"
    } else if p.ends_with(".ts") || p.ends_with(".mts") {
        "video/mp2t"
    } else {
        "application/octet-stream"
    }
}
