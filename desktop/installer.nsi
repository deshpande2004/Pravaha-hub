; Pravahaxhub Windows installer (per-user, no admin needed). Build: makensis installer.nsi (after packaging into dist/win-unpacked)
Unicode true
SetCompressor /SOLID lzma
!include "MUI2.nsh"
!define APPNAME "Pravahaxhub"
!define VERSION "1.1.1"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Pravahaxhub"
Name "${APPNAME}"
OutFile "dist\Pravahaxhub-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\Pravahaxhub"
InstallDirRegKey HKCU "Software\Pravahaxhub" "InstallDir"
RequestExecutionLevel user
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "FileDescription" "${APPNAME} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "MIT"
!define MUI_ICON "build\icon.ico"
!define MUI_UNICON "build\icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\Pravahaxhub.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open Pravahaxhub"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  nsExec::Exec 'taskkill /IM Pravahaxhub.exe /F'
  SetOutPath "$INSTDIR"
  File /r "dist\win-unpacked\*.*"
  WriteUninstaller "$INSTDIR\Uninstall Pravahaxhub.exe"
  CreateShortcut "$DESKTOP\Pravahaxhub.lnk" "$INSTDIR\Pravahaxhub.exe"
  CreateDirectory "$SMPROGRAMS\Pravahaxhub"
  CreateShortcut "$SMPROGRAMS\Pravahaxhub\Pravahaxhub.lnk" "$INSTDIR\Pravahaxhub.exe"
  CreateShortcut "$SMPROGRAMS\Pravahaxhub\Uninstall Pravahaxhub.lnk" "$INSTDIR\Uninstall Pravahaxhub.exe"
  WriteRegStr HKCU "Software\Pravahaxhub" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "Pravahaxhub"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\Pravahaxhub.exe"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall Pravahaxhub.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM Pravahaxhub.exe /F'
  Delete "$DESKTOP\Pravahaxhub.lnk"
  RMDir /r "$SMPROGRAMS\Pravahaxhub"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\Pravahaxhub"
SectionEnd
