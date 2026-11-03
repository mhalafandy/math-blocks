//! Reading and writing Word documents chosen by the user in a file dialog (MathType conversion).
//! Restricted to .docx files; the original document is never overwritten by the app.

use std::path::Path;

fn check_docx(path: &str) -> Result<(), String> {
    let ext = Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "docx" | "docm" => Ok(()),
        "doc" => Err("Old .doc files are not supported. Open the file in Word, save it as .docx (File → Save As), then convert that.".into()),
        _ => Err("Please choose a Word document (.docx)".into()),
    }
}

#[tauri::command]
pub fn document_read(path: String) -> Result<tauri::ipc::Response, String> {
    check_docx(&path)?;
    let bytes = std::fs::read(&path).map_err(|e| format!("Could not read {path}: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// The body is the file content; the target path comes in the `x-path` header (URI-encoded).
#[tauri::command]
pub fn document_write(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let path = request
        .headers()
        .get("x-path")
        .and_then(|v| v.to_str().ok())
        .map(|v| urlencoding_decode(v))
        .ok_or("Missing target path")?;
    check_docx(&path)?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected file content".into());
    };
    // Write next to the target first, then rename: a failure never leaves a half-written file.
    let tmp = format!("{path}.mathblocks-tmp");
    std::fs::write(&tmp, bytes).map_err(|e| format!("Could not write {path}: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            format!("Could not save {path}: the file is open in Word or read-only. Close it and try again.")
        } else {
            format!("Could not save {path}: {e}")
        }
    })
}

/// Opens a document with its default application (Word).
#[tauri::command]
pub fn document_open(path: String) -> Result<(), String> {
    check_docx(&path)?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("xdg-open").arg(&path).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn urlencoding_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            let hex = |c: u8| (c as char).to_digit(16);
            if let (Some(h), Some(l)) = (hex(b[i + 1]), hex(b[i + 2])) {
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_docx() {
        assert!(check_docx("C:\\a\\Thesis.DOCX").is_ok());
        assert!(check_docx("C:\\a\\old.doc").unwrap_err().contains("Save As"));
        assert!(check_docx("C:\\Windows\\system.ini").is_err());
    }

    #[test]
    fn decodes_paths() {
        assert_eq!(urlencoding_decode("C%3A%5CUsers%5CM.H.%20Al-Afandy%5Cd%C3%A9j%C3%A0.docx"), "C:\\Users\\M.H. Al-Afandy\\déjà.docx");
    }
}
