//! Keyboard shortcuts that work inside Word. Registered system-wide, they act only while Word is the active
//! window; the main window receives `shortcut://<name>`.
//!
//! Convention (0.1.170): at most two held modifiers, Ctrl+Alt, and a key under the right hand (Y U I O P H J K L
//! N M ; ' , . / [ ] \), only for the most frequent commands. No Alt+Shift or Ctrl+Shift base (they switch the
//! Windows input language) and no function keys. The app sends the set from Settings (`set_word_shortcuts`);
//! the defaults below apply until it does.

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// (name, keys): the default set. Checked against Word's own assignments by the self-test.
pub const DEFAULTS: &[(&str, &str)] = &[
    ("inline", "Ctrl+Alt+J"),     // new inline equation at the cursor
    ("display", "Ctrl+Alt+;"),    // new display equation at the cursor
    ("latex", "Ctrl+Alt+'"),      // Toggle LaTeX
    ("edit", "Ctrl+Alt+K"),       // edit the equation at the cursor (or a new one) in the floating editor
    ("reference", "Ctrl+Alt+,"),  // insert a reference to a numbered equation
    ("number", "Ctrl+Alt+/"),     // number / un-number the equation at the cursor
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

/// The key of a shortcut's last part: a letter, a digit or one of ; ' , . / [ ] \ - =.
fn key_code(k: &str) -> Option<Code> {
    let up = k.to_ascii_uppercase();
    Some(match up.as_str() {
        "A" => Code::KeyA, "B" => Code::KeyB, "C" => Code::KeyC, "D" => Code::KeyD, "E" => Code::KeyE,
        "F" => Code::KeyF, "G" => Code::KeyG, "H" => Code::KeyH, "I" => Code::KeyI, "J" => Code::KeyJ,
        "K" => Code::KeyK, "L" => Code::KeyL, "M" => Code::KeyM, "N" => Code::KeyN, "O" => Code::KeyO,
        "P" => Code::KeyP, "Q" => Code::KeyQ, "R" => Code::KeyR, "S" => Code::KeyS, "T" => Code::KeyT,
        "U" => Code::KeyU, "V" => Code::KeyV, "W" => Code::KeyW, "X" => Code::KeyX, "Y" => Code::KeyY,
        "Z" => Code::KeyZ,
        "0" => Code::Digit0, "1" => Code::Digit1, "2" => Code::Digit2, "3" => Code::Digit3, "4" => Code::Digit4,
        "5" => Code::Digit5, "6" => Code::Digit6, "7" => Code::Digit7, "8" => Code::Digit8, "9" => Code::Digit9,
        ";" => Code::Semicolon, "'" => Code::Quote, "," => Code::Comma, "." => Code::Period, "/" => Code::Slash,
        "[" => Code::BracketLeft, "]" => Code::BracketRight, "\\" => Code::Backslash, "-" => Code::Minus,
        "=" => Code::Equal,
        _ => return None,
    })
}

/// "Ctrl+Alt+J" → the shortcut; None when it does not follow the convention (two modifiers at most, no Shift
/// base, a key from the table).
pub fn parse(keys: &str) -> Option<Shortcut> {
    let parts: Vec<&str> = keys.split('+').map(|p| p.trim()).collect();
    // "Ctrl+Alt++" is not allowed; the last part is the key ("Ctrl+Alt+," keeps its comma).
    let (key, mods) = parts.split_last()?;
    let mut m = Modifiers::empty();
    for p in mods {
        match p.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => m |= Modifiers::CONTROL,
            "alt" => m |= Modifiers::ALT,
            "shift" => m |= Modifiers::SHIFT,
            _ => return None,
        }
    }
    let count = [Modifiers::CONTROL, Modifiers::ALT, Modifiers::SHIFT].iter().filter(|x| m.contains(**x)).count();
    if count == 0 || count > 2 || m.contains(Modifiers::SHIFT) {
        return None;
    }
    Some(Shortcut::new(Some(m), key_code(key)?))
}

fn register_one(app: &AppHandle, name: &str, keys: &str) -> Result<(), String> {
    let shortcut = parse(keys).ok_or_else(|| format!("{name}: \"{keys}\" is not a Ctrl+Alt (or Ctrl / Alt) + key shortcut"))?;
    let name = name.to_string();
    let label = name.clone();
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _s, event| {
            if event.state() != ShortcutState::Pressed || !word_is_active() {
                return;
            }
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.emit(&format!("shortcut://{name}"), ());
            }
        })
        .map_err(|e| format!("{label}: {keys} could not be registered ({e})"))
}

/// At start: the default set (the app sends the one from Settings once it runs).
pub fn register(app: &AppHandle) {
    for (name, keys) in DEFAULTS {
        if let Err(e) = register_one(app, name, keys) {
            eprintln!("[shortcuts] {e}");
        }
    }
}

/// The set from Settings: every earlier shortcut released, these registered. Returns the ones that failed.
#[tauri::command]
pub fn set_word_shortcuts(app: AppHandle, shortcuts: Vec<(String, String)>) -> Vec<String> {
    let _ = app.global_shortcut().unregister_all();
    let mut failed = Vec::new();
    for (name, keys) in shortcuts {
        if keys.trim().is_empty() {
            continue; // switched off
        }
        if let Err(e) = register_one(&app, &name, &keys) {
            failed.push(e);
        }
    }
    failed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn follows_the_convention() {
        assert!(parse("Ctrl+Alt+J").is_some());
        assert!(parse("Ctrl+Alt+,").is_some());
        assert!(parse("Ctrl+Alt+;").is_some());
        assert!(parse("Ctrl+Shift+J").is_none());
        assert!(parse("Alt+Shift+J").is_none());
        assert!(parse("Ctrl+Alt+Shift+L").is_none());
        assert!(parse("Ctrl+Alt+F5").is_none());
        for (_, k) in DEFAULTS {
            assert!(parse(k).is_some(), "{k}");
        }
    }
}
