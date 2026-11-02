//! Named-pipe server for the Word connector (see packages/connector-protocol).
//!
//! The app hosts `\\.\pipe\mathblocks-v1-<user>`; the Word connector connects as a client.
//! Framing is one JSON message per line. This module does not interpret messages: lines are
//! forwarded to the web view as `connector://line` events, and the web view writes lines back
//! with the `connector_send` command. Connection changes are emitted as `connector://status`.

use std::sync::Arc;
use tokio::sync::Mutex;

/// Write half of the current connection, if a connector is connected.
#[derive(Default)]
pub struct PipeState {
    #[cfg(windows)]
    writer: Arc<Mutex<Option<tokio::io::WriteHalf<tokio::net::windows::named_pipe::NamedPipeServer>>>>,
    #[cfg(not(windows))]
    writer: Arc<Mutex<Option<()>>>,
}

/// Pipe name shared with the connector: per user, so two users on one PC never cross-talk.
pub fn pipe_path() -> String {
    let user: String = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "user".into())
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '_' })
        .collect();
    format!(r"\\.\pipe\mathblocks-v1-{user}")
}

#[cfg(windows)]
pub fn start(app: tauri::AppHandle) {
    use tauri::{Emitter, Manager};
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::net::windows::named_pipe::ServerOptions;

    let writer = app.state::<PipeState>().writer.clone();
    tauri::async_runtime::spawn(async move {
        let path = pipe_path();
        let mut first = true;
        loop {
            // first_pipe_instance: refuse to start if another process already owns the name.
            let server = match ServerOptions::new().first_pipe_instance(first).create(&path) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("[pipe] cannot create {path}: {e}");
                    tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                    continue;
                }
            };
            first = false;
            if let Err(e) = server.connect().await {
                eprintln!("[pipe] connect failed: {e}");
                continue;
            }
            let (read, write) = tokio::io::split(server);
            *writer.lock().await = Some(write);
            let _ = app.emit("connector://status", true);

            let mut lines = BufReader::new(read).lines();
            loop {
                match lines.next_line().await {
                    Ok(Some(line)) if !line.trim().is_empty() => {
                        let _ = app.emit("connector://line", line);
                    }
                    Ok(Some(_)) => {}
                    Ok(None) | Err(_) => break,
                }
            }
            *writer.lock().await = None;
            let _ = app.emit("connector://status", false);
        }
    });
}

#[cfg(not(windows))]
pub fn start(_app: tauri::AppHandle) {
    // The Word connector exists on Windows only; the app still runs (UI development on other OSes).
    let _ = pipe_path();
}

#[tauri::command]
pub async fn connector_send(state: tauri::State<'_, PipeState>, line: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use tokio::io::AsyncWriteExt;
        let mut guard = state.writer.lock().await;
        let w = guard.as_mut().ok_or("Word is not connected")?;
        let mut data = line.into_bytes();
        data.push(b'\n');
        w.write_all(&data).await.map_err(|e| e.to_string())?;
        w.flush().await.map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (state, line);
        Err("The Word connector is only available on Windows".into())
    }
}

#[tauri::command]
pub async fn connector_status(state: tauri::State<'_, PipeState>) -> Result<bool, String> {
    Ok(state.writer.lock().await.is_some())
}
