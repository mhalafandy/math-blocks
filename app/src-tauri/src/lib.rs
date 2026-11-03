//! MathBlocks desktop shell.
//!
//! Deliberately thin: the application logic lives in the TypeScript core. The Rust side owns
//! things a web view cannot do itself: the named pipe to the Word connector, and (from M4)
//! the SQLite database and file-system access.

mod connector_install;
mod documents;
mod library;
mod pipe;

#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pipe::PipeState::default())
        .manage(connector_install::InstallState::default())
        .manage(library::LibraryState::default())
        .invoke_handler(tauri::generate_handler![
            app_version,
            pipe::connector_send,
            pipe::connector_status,
            connector_install::connector_install_status,
            library::library_list,
            library::library_create_folder,
            library::library_rename_folder,
            library::library_move_folder,
            library::library_delete_folder,
            library::library_save,
            library::library_set_favorite,
            library::library_move_equation,
            library::library_mark_used,
            library::library_delete,
            library::library_duplicate,
            library::library_versions,
            library::library_restore_version,
            library::library_save_draft,
            library::library_load_draft,
            library::library_export,
            library::library_import,
            documents::document_read,
            documents::document_write,
            documents::document_open,
            documents::export_write,
            documents::system_font
        ])
        .setup(|app| {
            pipe::start(app.handle().clone());
            connector_install::start(app.handle().clone());
            {
                use tauri::Manager;
                let opened = app
                    .path()
                    .app_data_dir()
                    .map_err(|e| e.to_string())
                    .and_then(|dir| library::open_for_app(&dir));
                match opened {
                    Ok(lib) => *app.state::<library::LibraryState>().0.lock().unwrap() = Some(lib),
                    Err(err) => eprintln!("[library] could not open: {err}"),
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MathBlocks");
}
