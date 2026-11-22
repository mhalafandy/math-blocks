//! The math fonts for large operators (Latin Modern Math, STIX Two Math, XITS Math), shipped in the installer's
//! `fonts` folder. The installer installs them for the user and the uninstaller removes them; when one is missing
//! at start (removed by an uninstall, or by hand), it is installed again the same way: copied to the per-user fonts
//! folder, registered under HKCU and recorded as MathBlocks' (HKCU\Software\MathBlocks\Fonts), no administrator.
//! A font the user installed themselves is never touched.

use tauri::AppHandle;
#[cfg(windows)]
use tauri::Manager;

/// (file, the name Windows lists it under)
pub const FONTS: &[(&str, &str)] = &[
    ("latinmodern-math.otf", "Latin Modern Math (OpenType)"),
    ("STIXTwoMath-Regular.ttf", "STIX Two Math (TrueType)"),
    ("xits-math.otf", "XITS Math (OpenType)"),
];

#[cfg(windows)]
mod win {
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ, RRF_RT_REG_SZ};

    pub fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// A string value under HKCU, or None.
    pub fn get(key: &str, name: &str) -> Option<String> {
        let mut buf = vec![0u16; 1024];
        let mut size = (buf.len() * 2) as u32;
        let r = unsafe { RegGetValueW(HKEY_CURRENT_USER, wide(key).as_ptr(), wide(name).as_ptr(), RRF_RT_REG_SZ, std::ptr::null_mut(), buf.as_mut_ptr() as *mut _, &mut size) };
        if r != ERROR_SUCCESS {
            return None;
        }
        let n = (size as usize / 2).saturating_sub(1);
        Some(String::from_utf16_lossy(&buf[..n.min(buf.len())]))
    }

    pub fn set(key: &str, name: &str, value: &str) -> bool {
        let v = wide(value);
        unsafe { RegSetKeyValueW(HKEY_CURRENT_USER, wide(key).as_ptr(), wide(name).as_ptr(), REG_SZ, v.as_ptr() as *const _, (v.len() * 2) as u32) == ERROR_SUCCESS }
    }
}

const FONTS_KEY: &str = "Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts";
const OWN_KEY: &str = "Software\\MathBlocks\\Fonts";

/// At start (in the background): every math font that is missing is installed again for the user.
#[cfg(windows)]
pub fn ensure_math_fonts(app: &AppHandle) {
    let Ok(res) = app.path().resource_dir() else { return };
    let Some(base) = std::env::var_os("LOCALAPPDATA") else { return };
    let dir = std::path::Path::new(&base).join("Microsoft").join("Windows").join("Fonts");
    let mut added = 0;
    for (file, name) in FONTS {
        let target = dir.join(file);
        let target_s = target.to_string_lossy().to_string();
        let registered = win::get(FONTS_KEY, name);
        let ours = win::get(OWN_KEY, file).is_some();
        if target.exists() && registered.is_some() {
            continue; // installed (by MathBlocks or by the user)
        }
        // The user's own font under another path: left alone.
        if !ours && registered.as_deref().is_some_and(|p| !p.eq_ignore_ascii_case(&target_s)) {
            continue;
        }
        let source = res.join("fonts").join(file);
        if !source.exists() {
            continue;
        }
        let _ = std::fs::create_dir_all(&dir);
        if !target.exists() && std::fs::copy(&source, &target).is_err() {
            continue;
        }
        if win::set(FONTS_KEY, name, &target_s) && win::set(OWN_KEY, file, name) {
            unsafe {
                windows_sys::Win32::Graphics::Gdi::AddFontResourceW(win::wide(&target_s).as_ptr());
            }
            added += 1;
            eprintln!("[fonts] {name} installed again for the user");
        }
    }
    if added > 0 {
        unsafe {
            use windows_sys::Win32::UI::WindowsAndMessaging::{SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_FONTCHANGE};
            let mut out = 0usize;
            SendMessageTimeoutW(HWND_BROADCAST, WM_FONTCHANGE, 0, 0, SMTO_ABORTIFHUNG, 3000, &mut out);
        }
    }
}

#[cfg(not(windows))]
pub fn ensure_math_fonts(_app: &AppHandle) {
    let _ = (FONTS, FONTS_KEY, OWN_KEY);
}
