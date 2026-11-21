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
    ("edit", "Ctrl+Alt+["),       // edit (Ctrl+Alt+K is Word's AutoFormat) the equation at the cursor (or a new one) in the floating editor
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

/// While the self-test probes the shortcuts: the names that fired (nothing is run).
static PROBE: std::sync::Mutex<Option<Vec<String>>> = std::sync::Mutex::new(None);

fn register_one(app: &AppHandle, name: &str, keys: &str) -> Result<(), String> {
    let shortcut = parse(keys).ok_or_else(|| format!("{name}: \"{keys}\" is not a Ctrl+Alt (or Ctrl / Alt) + key shortcut"))?;
    let name = name.to_string();
    let label = name.clone();
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _s, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            if let Ok(mut p) = PROBE.lock() {
                if let Some(hits) = p.as_mut() {
                    hits.push(name.clone());
                    return;
                }
            }
            if !word_is_active() {
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

/// One shortcut pressed during the probe.
#[derive(serde::Serialize)]
pub struct ProbeHit {
    name: String,
    keys: String,
    fired: bool,
}

#[derive(serde::Serialize)]
pub struct ProbeResult {
    /// The keyboard layout Word had while the keys were pressed (e.g. "0401" Arabic), as Windows reports it.
    layout: String,
    hits: Vec<ProbeHit>,
}

/// Physical key (scan code, set 1) of a shortcut's key, as a keyboard sends it: the layout then decides which
/// virtual key it is, as when the user presses it.
fn scan_code(k: &str) -> Option<u16> {
    let up = k.to_ascii_uppercase();
    let row = |s: &str, first: u16| s.find(up.as_str()).map(|i| first + i as u16);
    if up.len() != 1 {
        return None;
    }
    row("QWERTYUIOP", 0x10)
        .or_else(|| row("ASDFGHJKL", 0x1E))
        .or_else(|| row("ZXCVBNM", 0x2C))
        .or_else(|| row("123456789", 0x02))
        .or(match up.as_str() {
            "0" => Some(0x0B),
            "-" => Some(0x0C),
            "=" => Some(0x0D),
            "[" => Some(0x1A),
            "]" => Some(0x1B),
            ";" => Some(0x27),
            "'" => Some(0x28),
            "\\" => Some(0x2B),
            "," => Some(0x33),
            "." => Some(0x34),
            "/" => Some(0x35),
            _ => None,
        })
}

#[cfg(windows)]
fn probe_blocking(shortcuts: Vec<(String, String)>, layout: String) -> Result<ProbeResult, String> {
    use std::{thread::sleep, time::Duration};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    unsafe {
        let word = FindWindowW(wide("OpusApp").as_ptr(), std::ptr::null());
        if word.is_null() {
            return Err("Word's window was not found".into());
        }
        let before_fg = GetForegroundWindow();
        SetForegroundWindow(word);
        sleep(Duration::from_millis(400));
        if GetForegroundWindow() != word {
            return Err("Word could not be brought to the front".into());
        }
        let thread = GetWindowThreadProcessId(word, std::ptr::null_mut());
        let before_hkl = GetKeyboardLayout(thread);
        let mut loaded = std::ptr::null_mut();
        let mut unload = false;
        if !layout.is_empty() {
            let n = GetKeyboardLayoutList(0, std::ptr::null_mut());
            let mut list = vec![std::ptr::null_mut(); n.max(0) as usize];
            GetKeyboardLayoutList(n, list.as_mut_ptr());
            loaded = LoadKeyboardLayoutW(wide(&layout).as_ptr(), KLF_NOTELLSHELL);
            if loaded.is_null() {
                return Err(format!("keyboard layout {layout} could not be loaded"));
            }
            unload = !list.contains(&loaded);
            PostMessageW(word, WM_INPUTLANGCHANGEREQUEST, 0, loaded as isize);
            sleep(Duration::from_millis(500));
        }
        let now = GetKeyboardLayout(thread);
        let active = format!("{:04X}", (now as usize) & 0xFFFF);
        let key = |sc: u16, up: bool| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: 0, wScan: sc, dwFlags: KEYEVENTF_SCANCODE | if up { KEYEVENTF_KEYUP } else { 0 }, time: 0, dwExtraInfo: 0 } },
        };
        *PROBE.lock().map_err(|e| e.to_string())? = Some(Vec::new());
        let mut hits = Vec::new();
        for (name, keys) in shortcuts {
            let parts: Vec<&str> = keys.split('+').map(|p| p.trim()).collect();
            let Some((k, mods)) = parts.split_last() else { continue };
            let Some(sc) = scan_code(k) else {
                hits.push(ProbeHit { name, keys, fired: false });
                continue;
            };
            let mut seq = Vec::new();
            let mods: Vec<u16> = mods
                .iter()
                .filter_map(|m| match m.to_ascii_lowercase().as_str() {
                    "ctrl" | "control" => Some(0x1D),
                    "alt" => Some(0x38),
                    _ => None,
                })
                .collect();
            for m in &mods {
                seq.push(key(*m, false));
            }
            seq.push(key(sc, false));
            seq.push(key(sc, true));
            for m in mods.iter().rev() {
                seq.push(key(*m, true));
            }
            SendInput(seq.len() as u32, seq.as_ptr(), std::mem::size_of::<INPUT>() as i32);
            sleep(Duration::from_millis(300));
            let fired = PROBE.lock().map(|mut p| p.as_mut().map(|v| std::mem::take(v).contains(&name)).unwrap_or(false)).unwrap_or(false);
            hits.push(ProbeHit { name, keys, fired });
        }
        *PROBE.lock().map_err(|e| e.to_string())? = None;
        if !layout.is_empty() {
            PostMessageW(word, WM_INPUTLANGCHANGEREQUEST, 0, before_hkl as isize);
            sleep(Duration::from_millis(400));
            if unload {
                UnloadKeyboardLayout(loaded);
            }
        }
        if !before_fg.is_null() {
            SetForegroundWindow(before_fg);
        }
        Ok(ProbeResult { layout: active, hits })
    }
}

#[cfg(not(windows))]
fn probe_blocking(_shortcuts: Vec<(String, String)>, _layout: String) -> Result<ProbeResult, String> {
    Err("only on Windows".into())
}

/// Self-test: presses each shortcut in Word (by physical key, with `layout` active in Word, e.g. "00000401"
/// Arabic (101); empty: the current one) and reports which fired. Nothing is run; the layout is put back.
#[tauri::command]
pub async fn probe_word_shortcuts(shortcuts: Vec<(String, String)>, layout: String) -> Result<ProbeResult, String> {
    tauri::async_runtime::spawn_blocking(move || probe_blocking(shortcuts, layout)).await.map_err(|e| e.to_string())?
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
            assert!(scan_code(k.rsplit('+').next().unwrap()).is_some(), "{k}");
        }
        assert_eq!(scan_code(";"), Some(0x27));
        assert_eq!(scan_code("J"), Some(0x24));
        assert_eq!(scan_code("["), Some(0x1A));
        assert_eq!(scan_code("0"), Some(0x0B));
    }
}
