; MathBlocks installer hooks (Tauri NSIS).
; The math fonts for large operators (Latin Modern Math, STIX Two Math, XITS Math; licences next to them in
; $INSTDIR\fonts) are installed for the current user, no administrator rights: copied to the per-user fonts
; folder and registered under HKCU (Windows 10 1809 and later). Left installed on uninstall: documents may use them.

!macro MB_INSTALL_FONT FILE NAME
  CopyFiles /SILENT "$INSTDIR\fonts\${FILE}" "$LOCALAPPDATA\Microsoft\Windows\Fonts\${FILE}"
  WriteRegStr HKCU "Software\Microsoft\Windows NT\CurrentVersion\Fonts" "${NAME}" "$LOCALAPPDATA\Microsoft\Windows\Fonts\${FILE}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  CreateDirectory "$LOCALAPPDATA\Microsoft\Windows\Fonts"
  !insertmacro MB_INSTALL_FONT "latinmodern-math.otf" "Latin Modern Math (OpenType)"
  !insertmacro MB_INSTALL_FONT "STIXTwoMath-Regular.ttf" "STIX Two Math (TrueType)"
  !insertmacro MB_INSTALL_FONT "xits-math.otf" "XITS Math (OpenType)"
  ; WM_FONTCHANGE to every window, so Word and other programs see the new fonts without a restart.
  System::Call 'user32::SendMessageTimeoutW(p 0xffff, i 0x001D, p 0, p 0, i 2, i 3000, *p .r0)'
!macroend
