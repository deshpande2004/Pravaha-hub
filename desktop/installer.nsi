; Pravahax Suite Windows installer (per-user, no admin needed). Build: makensis installer.nsi (after packaging into dist/win-unpacked)
Unicode true
SetCompressor /SOLID lzma
!include "MUI2.nsh"
!define APPNAME "Pravahax Suite"
!define VERSION "1.2.1"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Pravahax Suite"
Name "${APPNAME}"
OutFile "dist\PravahaxSuite-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\Pravahax Suite"
InstallDirRegKey HKCU "Software\Pravahax Suite" "InstallDir"
RequestExecutionLevel user
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "FileDescription" "${APPNAME} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "MIT"
!define MUI_ICON "build\icon.ico"
!define MUI_UNICON "build\icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\PravahaxSuite.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open Pravahax Suite"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  nsExec::Exec 'taskkill /IM PravahaxSuite.exe /F'
  ; Remove the older "Pravahaxhub" install this replaces (app files and shortcuts only).
  nsExec::Exec 'taskkill /IM Pravahaxhub.exe /F'
  RMDir /r "$LOCALAPPDATA\Programs\Pravahaxhub"
  Delete "$DESKTOP\Pravahaxhub.lnk"
  RMDir /r "$SMPROGRAMS\Pravahaxhub"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Pravahaxhub"
  DeleteRegKey HKCU "Software\Pravahaxhub"
  SetOutPath "$INSTDIR"
  File /r "dist\win-unpacked\*.*"
  WriteUninstaller "$INSTDIR\Uninstall PravahaxSuite.exe"
  CreateShortcut "$DESKTOP\Pravahax Suite.lnk" "$INSTDIR\PravahaxSuite.exe"
  CreateDirectory "$SMPROGRAMS\Pravahax Suite"
  CreateShortcut "$SMPROGRAMS\Pravahax Suite\Pravahax Suite.lnk" "$INSTDIR\PravahaxSuite.exe"
  CreateShortcut "$SMPROGRAMS\Pravahax Suite\Uninstall Pravahax Suite.lnk" "$INSTDIR\Uninstall PravahaxSuite.exe"
  WriteRegStr HKCU "Software\Pravahax Suite" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "Pravahax Suite"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\PravahaxSuite.exe"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall PravahaxSuite.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM PravahaxSuite.exe /F'
  Delete "$DESKTOP\Pravahax Suite.lnk"
  RMDir /r "$SMPROGRAMS\Pravahax Suite"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\Pravahax Suite"
SectionEnd
