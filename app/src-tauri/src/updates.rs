//! Update channels (Settings → Updates): "stable" (default) installs only builds promoted after a clean self-test
//! on the owner's PC; "test" installs every build of `main`; "rollback" goes back to the previous stable. Each
//! channel is a signed manifest on the project's releases; every download is verified against the public key in
//! tauri.conf.json, whatever the channel.

use std::sync::Mutex;
use tauri::{AppHandle, State, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

const RELEASES: &str = "https://github.com/mhalafandy/math-blocks/releases/download";

#[derive(Default)]
pub struct UpdateState {
    found: Mutex<Option<Update>>,
    bytes: Mutex<Option<(Update, Vec<u8>)>>,
}

fn endpoint(channel: &str) -> String {
    match channel {
        "test" => format!("{RELEASES}/dev-build/latest.json"),
        "rollback" => format!("{RELEASES}/stable/previous.json"),
        _ => format!("{RELEASES}/stable/latest.json"),
    }
}

#[derive(serde::Serialize)]
pub struct Found {
    version: String,
    current: String,
    notes: Option<String>,
}

/// Checks a channel: the newer build there (test, stable), or the previous stable (rollback, which may be older).
#[tauri::command]
pub async fn update_check(app: AppHandle, state: State<'_, UpdateState>, channel: String) -> Result<Option<Found>, String> {
    let url: Url = endpoint(&channel).parse().map_err(|e| format!("{e}"))?;
    let mut builder = app.updater_builder().endpoints(vec![url]).map_err(|e| e.to_string())?;
    if channel == "rollback" {
        // Going back installs an older version.
        builder = builder.version_comparator(|current, release| release.version != current);
    }
    let update = builder.build().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    let found = update.as_ref().map(|u| Found { version: u.version.clone(), current: u.current_version.clone(), notes: u.body.clone() });
    *state.found.lock().unwrap() = update;
    Ok(found)
}

/// Downloads (and verifies) the build found by the last check, ready to install.
#[tauri::command]
pub async fn update_download(state: State<'_, UpdateState>) -> Result<(), String> {
    let update = state.found.lock().unwrap().clone().ok_or("No update to download")?;
    let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    *state.bytes.lock().unwrap() = Some((update, bytes));
    Ok(())
}

/// Installs the downloaded build (on Windows the installer closes the app and starts the new one).
#[tauri::command]
pub fn update_install(state: State<'_, UpdateState>) -> Result<(), String> {
    let (update, bytes) = state.bytes.lock().unwrap().take().ok_or("Nothing downloaded")?;
    update.install(bytes).map_err(|e| e.to_string())
}
