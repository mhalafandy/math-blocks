//! MathBlocks desktop shell.
//!
//! Deliberately thin: the application logic lives in the TypeScript core. The Rust side owns
//! things a web view cannot do itself: the named pipe to the Word connector, and (from M4)
//! the SQLite database and file-system access.

mod pipe;

#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(pipe::PipeState::default())
        .invoke_handler(tauri::generate_handler![
            app_version,
            pipe::connector_send,
            pipe::connector_status
        ])
        .setup(|app| {
            pipe::start(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MathBlocks");
}
