; Işıl kaldırıcısı: yapay zekâ motoru ve indirilen modeller kullanıcı klasöründe (10 GB'ı aşabilir) kalıyordu.
; Kaldırırken sorulur; güncelleme sırasında ve sessiz kaldırmada dokunulmaz. Projeler ve ayarlar her durumda kalır.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    IfSilent isil_skip_models
    MessageBox MB_YESNO|MB_ICONQUESTION "Yapay zekâ motoru ve indirilen modeller de silinsin mi?$\r$\nProjelerin ve ayarların korunur.$\r$\n$\r$\nAlso delete the AI engine and downloaded models? Your projects and settings are kept." /SD IDNO IDNO isil_skip_models
      ClearErrors
      FileOpen $0 "$APPDATA\Işıl\engine-location.txt" r
      IfErrors +4
      FileRead $0 $1
      FileClose $0
      RMDir /r "$1"
      RMDir /r "$APPDATA\Işıl\engine"
      RMDir /r "$APPDATA\Işıl\models"
      Delete "$APPDATA\Işıl\engine-location.txt"
    isil_skip_models:
  ${endIf}
!macroend
