//! Keeps the Word connector (COM add-in) installed and up to date, so users never run
//! install.ps1 by hand. The connector DLL ships inside the app as a resource; on start-up
//! (and every 30 s while an update is pending) it is copied to
//! %LOCALAPPDATA%\MathBlocksWordAddin and registered for the current user, exactly as
//! connector-word/install/install.ps1 does (both registry views, no admin rights).
//!
//! Word keeps the DLL locked while it runs, so an update can only be applied when Word is
//! closed; until then the state is `pendingWordClosed` and the UI tells the user.

use serde::Serialize;
use std::sync::Mutex;

#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", tag = "state")]
pub enum ConnectorInstall {
    /// Not on Windows, or the app has no bundled connector (dev build).
    Unavailable,
    UpToDate,
    /// Installed or updated during this run: restart Word to load it.
    Installed,
    /// A newer connector is bundled but Word has the old one locked.
    PendingWordClosed,
    Failed { message: String },
}

#[derive(Default)]
pub struct InstallState(pub Mutex<Option<ConnectorInstall>>);

#[tauri::command]
pub fn connector_install_status(state: tauri::State<'_, InstallState>) -> Option<ConnectorInstall> {
    state.0.lock().ok().and_then(|g| g.clone())
}

#[cfg(windows)]
mod imp {
    use super::ConnectorInstall;
    use std::path::{Path, PathBuf};
    use winreg::enums::{HKEY_CURRENT_USER, KEY_ALL_ACCESS, KEY_WOW64_32KEY, KEY_WOW64_64KEY};
    use winreg::RegKey;

    const CLSID: &str = "{B18397FB-F3F1-4634-AC20-9DEA0673976A}";
    const PROG_ID: &str = "MathBlocks.WordConnector";
    const CLASS: &str = "MathBlocks.WordConnector.Connect";
    /// Must match the DLL's AssemblyVersion (fixed in the .csproj).
    const ASSEMBLY: &str = "MathBlocks.WordConnector, Version=0.1.0.0, Culture=neutral, PublicKeyToken=null";
    const DLL: &str = "MathBlocks.WordConnector.dll";

    fn target_dir() -> Option<PathBuf> {
        // Deliberately NOT under the app's own install folder (%LOCALAPPDATA%\MathBlocks): Word keeps
        // the loaded DLL locked, and the app installer must never have to overwrite a locked file.
        std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("MathBlocksWordAddin"))
    }

    fn register(dll: &Path, enable: bool) -> std::io::Result<()> {
        // Plain path, NOT URL-escaped: the .NET COM loader does not decode %20 (see FEATURES.md).
        let code_base = format!("file:///{}", dll.to_string_lossy().replace('\\', "/"));
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
            let flags = KEY_ALL_ACCESS | view;
            let (k, _) = hkcu.create_subkey_with_flags(format!(r"Software\Classes\CLSID\{CLSID}"), flags)?;
            k.set_value("", &CLASS)?;
            k.create_subkey_with_flags("ProgId", flags)?.0.set_value("", &PROG_ID)?;
            k.create_subkey_with_flags(r"Implemented Categories\{62C8FE65-4EBB-45e7-B440-6E39B2CDBF29}", flags)?;
            let (ip, _) = k.create_subkey_with_flags("InprocServer32", flags)?;
            ip.set_value("", &"mscoree.dll")?;
            ip.set_value("ThreadingModel", &"Both")?;
            ip.set_value("Class", &CLASS)?;
            ip.set_value("Assembly", &ASSEMBLY)?;
            ip.set_value("RuntimeVersion", &"v4.0.30319")?;
            ip.set_value("CodeBase", &code_base)?;

            let (p, _) = hkcu.create_subkey_with_flags(format!(r"Software\Classes\{PROG_ID}"), flags)?;
            p.set_value("", &CLASS)?;
            p.create_subkey_with_flags("CLSID", flags)?.0.set_value("", &CLSID)?;

            let (a, created) = hkcu.create_subkey_with_flags(format!(r"Software\Microsoft\Office\Word\Addins\{PROG_ID}"), flags)?;
            a.set_value("FriendlyName", &"MathBlocks")?;
            a.set_value("Description", &"MathBlocks equation editor connector")?;
            // Only (re-)enable on a fresh install or an update, so a user's own "disable" sticks.
            if enable || created == winreg::enums::RegDisposition::REG_CREATED_NEW_KEY {
                a.set_value("LoadBehavior", &3u32)?;
            }
        }
        Ok(())
    }

    pub fn sync(bundled: &Path) -> ConnectorInstall {
        let Some(dir) = target_dir() else {
            return ConnectorInstall::Failed { message: "LOCALAPPDATA is not set".into() };
        };
        let dst = dir.join(DLL);
        let new_bytes = match std::fs::read(bundled) {
            Ok(b) => b,
            Err(_) => return ConnectorInstall::Unavailable,
        };
        let same = std::fs::read(&dst).map(|old| old == new_bytes).unwrap_or(false);
        if same {
            return match register(&dst, false) {
                Ok(()) => ConnectorInstall::UpToDate,
                Err(e) => ConnectorInstall::Failed { message: format!("registration: {e}") },
            };
        }
        if let Err(e) = std::fs::create_dir_all(&dir) {
            return ConnectorInstall::Failed { message: format!("create folder: {e}") };
        }
        // Write to a temporary file, then swap it in; a locked DLL (Word running) fails the swap.
        let tmp = dir.join(format!("{DLL}.new"));
        if let Err(e) = std::fs::write(&tmp, &new_bytes) {
            return ConnectorInstall::Failed { message: format!("write: {e}") };
        }
        if let Err(e) = std::fs::rename(&tmp, &dst) {
            let _ = std::fs::remove_file(&tmp);
            // 5 = access denied, 32 = sharing violation: Word has the DLL loaded.
            return match e.raw_os_error() {
                Some(5) | Some(32) => ConnectorInstall::PendingWordClosed,
                _ => ConnectorInstall::Failed { message: format!("replace: {e}") },
            };
        }
        match register(&dst, true) {
            Ok(()) => ConnectorInstall::Installed,
            Err(e) => ConnectorInstall::Failed { message: format!("registration: {e}") },
        }
    }
}

#[cfg(windows)]
pub fn start(app: tauri::AppHandle) {
    use tauri::{path::BaseDirectory, Emitter, Manager};
    std::thread::spawn(move || {
        let Ok(bundled) = app.path().resolve("connector/MathBlocks.WordConnector.dll", BaseDirectory::Resource) else {
            return;
        };
        loop {
            let result = imp::sync(&bundled);
            if let Ok(mut g) = app.state::<InstallState>().0.lock() {
                *g = Some(result.clone());
            }
            let _ = app.emit("connector://install", result.clone());
            if result != ConnectorInstall::PendingWordClosed {
                break;
            }
            std::thread::sleep(std::time::Duration::from_secs(30));
        }
    });
}

#[cfg(not(windows))]
pub fn start(app: tauri::AppHandle) {
    use tauri::Manager;
    if let Ok(mut g) = app.state::<InstallState>().0.lock() {
        *g = Some(ConnectorInstall::Unavailable);
    }
}
