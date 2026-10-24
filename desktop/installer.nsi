; Pravahahub Windows installer (per-user, no admin needed). Build: makensis installer.nsi (after packaging into dist/win-unpacked)
Unicode true
SetCompressor /SOLID lzma
!include "MUI2.nsh"
!define APPNAME "Pravahahub"
!define VERSION "1.0.0"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Pravahahub"
Name "${APPNAME}"
OutFile "dist\Pravahahub-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\Pravahahub"
InstallDirRegKey HKCU "Software\Pravahahub" "InstallDir"
RequestExecutionLevel user
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "FileDescription" "${APPNAME} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "MIT"
!define MUI_ICON "build\icon.ico"
!define MUI_UNICON "build\icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\Pravahahub.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open Pravahahub"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  nsExec::Exec 'taskkill /IM Pravahahub.exe /F'
  SetOutPath "$INSTDIR"
  File /r "dist\win-unpacked\*.*"
  WriteUninstaller "$INSTDIR\Uninstall Pravahahub.exe"
  CreateShortcut "$DESKTOP\Pravahahub.lnk" "$INSTDIR\Pravahahub.exe"
  CreateDirectory "$SMPROGRAMS\Pravahahub"
  CreateShortcut "$SMPROGRAMS\Pravahahub\Pravahahub.lnk" "$INSTDIR\Pravahahub.exe"
  CreateShortcut "$SMPROGRAMS\Pravahahub\Uninstall Pravahahub.lnk" "$INSTDIR\Uninstall Pravahahub.exe"
  WriteRegStr HKCU "Software\Pravahahub" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "Pravahahub"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\Pravahahub.exe"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall Pravahahub.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM Pravahahub.exe /F'
  Delete "$DESKTOP\Pravahahub.lnk"
  RMDir /r "$SMPROGRAMS\Pravahahub"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\Pravahahub"
SectionEnd
