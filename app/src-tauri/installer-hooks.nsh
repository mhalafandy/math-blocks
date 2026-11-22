; MathBlocks installer hooks (Tauri NSIS).
; The math fonts for large operators (Latin Modern Math, STIX Two Math, XITS Math; licences next to them in
; $INSTDIR\fonts) are installed for the current user, no administrator rights: copied to the per-user fonts
; folder and registered under HKCU (Windows 10 1809 and later). Each one MathBlocks installs is recorded under
; HKCU\Software\MathBlocks\Fonts; the uninstaller removes exactly those (a font the user had before stays).
; Documents keep their equations (pictures); the app installs a missing font again when it starts.

!define MB_FONTS_DIR "$LOCALAPPDATA\Microsoft\Windows\Fonts"
!define MB_FONTS_KEY "Software\Microsoft\Windows NT\CurrentVersion\Fonts"
!define MB_OWN_KEY "Software\MathBlocks\Fonts"

!macro MB_INSTALL_FONT ID FILE NAME
  ; Already there and not MathBlocks' (not recorded, and its entry is not the one 0.1.173 wrote): left alone.
  ReadRegStr $1 HKCU "${MB_OWN_KEY}" "${FILE}"
  StrCmp $1 "" 0 mb_copy_${ID}
  IfFileExists "${MB_FONTS_DIR}\${FILE}" 0 mb_copy_${ID}
  ReadRegStr $2 HKCU "${MB_FONTS_KEY}" "${NAME}"
  StrCmp $2 "${MB_FONTS_DIR}\${FILE}" mb_copy_${ID} mb_skip_${ID}
  mb_copy_${ID}:
  CopyFiles /SILENT "$INSTDIR\fonts\${FILE}" "${MB_FONTS_DIR}\${FILE}"
  WriteRegStr HKCU "${MB_FONTS_KEY}" "${NAME}" "${MB_FONTS_DIR}\${FILE}"
  WriteRegStr HKCU "${MB_OWN_KEY}" "${FILE}" "${NAME}"
  System::Call 'gdi32::AddFontResourceW(w "${MB_FONTS_DIR}\${FILE}") i .r0'
  mb_skip_${ID}:
!macroend

!macro MB_REMOVE_FONT ID FILE NAME
  ReadRegStr $1 HKCU "${MB_OWN_KEY}" "${FILE}"
  StrCmp $1 "" mb_keep_${ID}
  DetailPrint "Removing the font ${NAME} that MathBlocks installed"
  System::Call 'gdi32::RemoveFontResourceW(w "${MB_FONTS_DIR}\${FILE}") i .r0'
  DeleteRegValue HKCU "${MB_FONTS_KEY}" "${NAME}"
  DeleteRegValue HKCU "${MB_OWN_KEY}" "${FILE}"
  Delete /REBOOTOK "${MB_FONTS_DIR}\${FILE}"
  mb_keep_${ID}:
!macroend

!macro NSIS_HOOK_POSTINSTALL
  CreateDirectory "${MB_FONTS_DIR}"
  !insertmacro MB_INSTALL_FONT lm "latinmodern-math.otf" "Latin Modern Math (OpenType)"
  !insertmacro MB_INSTALL_FONT stix "STIXTwoMath-Regular.ttf" "STIX Two Math (TrueType)"
  !insertmacro MB_INSTALL_FONT xits "xits-math.otf" "XITS Math (OpenType)"
  ; WM_FONTCHANGE to every window, so Word and other programs see the new fonts without a restart.
  System::Call 'user32::SendMessageTimeoutW(p 0xffff, i 0x001D, p 0, p 0, i 2, i 3000, *p .r0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "MathBlocks installed three math fonts (Latin Modern Math, STIX Two Math, XITS Math): they are removed."
  DetailPrint "Equations already in documents stay as they are (they are pictures); MathBlocks installs the fonts again when it starts."
  !insertmacro MB_REMOVE_FONT lm "latinmodern-math.otf" "Latin Modern Math (OpenType)"
  !insertmacro MB_REMOVE_FONT stix "STIXTwoMath-Regular.ttf" "STIX Two Math (TrueType)"
  !insertmacro MB_REMOVE_FONT xits "xits-math.otf" "XITS Math (OpenType)"
  DeleteRegKey /ifempty HKCU "${MB_OWN_KEY}"
  System::Call 'user32::SendMessageTimeoutW(p 0xffff, i 0x001D, p 0, p 0, i 2, i 3000, *p .r0)'
!macroend
