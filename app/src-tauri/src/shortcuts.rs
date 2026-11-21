//! Keyboard shortcuts that work inside Word (Ctrl+Alt+…). Registered system-wide, they act only
//! while Word is the active window; the main window receives `shortcut://<name>`.

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// (key, with Shift, name): all with Ctrl+Alt.
const SHORTCUTS: &[(Code, bool, &str)] = &[
    (Code::KeyM, false, "edit"),      // edit the equation at the cursor (or a new one) in the floating editor
    // Toggle LaTeX: Ctrl+Alt+Shift+L (Word's Ctrl+Alt+L inserts a LISTNUM field; MathType's toggle is Alt+\).
    (Code::KeyL, true, "latex"),
    (Code::KeyR, false, "reference"), // insert a reference to a numbered equation
    (Code::KeyN, false, "number"),    // number / un-number the equation at the cursor
];

#[cfg(windows)]
fn word_is_active() -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow};
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return false;
        }
        let mut buf = [0u16; 64];
        let n = GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        // Word's main window class.
        n > 0 && String::from_utf16_lossy(&buf[..n as usize]) == "OpusApp"
    }
}

#[cfg(not(windows))]
fn word_is_active() -> bool {
    false
}

pub fn register(app: &AppHandle) {
    let gs = app.global_shortcut();
    for (code, shift, name) in SHORTCUTS {
        let mods = if *shift { Modifiers::CONTROL | Modifiers::ALT | Modifiers::SHIFT } else { Modifiers::CONTROL | Modifiers::ALT };
        let shortcut = Shortcut::new(Some(mods), *code);
        let name = name.to_string();
        let result = gs.on_shortcut(shortcut, move |app, _s, event| {
            if event.state() != ShortcutState::Pressed || !word_is_active() {
                return;
            }
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.emit(&format!("shortcut://{name}"), ());
            }
        });
        if let Err(e) = result {
            eprintln!("[shortcuts] could not register Ctrl+Alt+{code:?}: {e}");
        }
    }
}
