!macro customInstall
  DetailPrint "Register shelter-client URI Handler"
  DeleteRegKey HKCR "shelter-client"
  WriteRegStr HKCR "shelter-client" "" "URL:shelter-client"
  WriteRegStr HKCR "shelter-client" "URL Protocol" ""
  WriteRegStr HKCR "shelter-client\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCR "shelter-client\shell" "" ""
  WriteRegStr HKCR "shelter-client\shell\Open" "" ""
  WriteRegStr HKCR "shelter-client\shell\Open\command" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME} %1"
!macroend
!macro customInit
  !insertmacro MUI_DEFAULT MUI_HEADERIMAGE_BITMAP_STRETCH AspectFitHeight
!macroend