!macro customInstall
  ; Program Files kurulumu yukseltilmis calisiyorsa export gorevini de otomatik
  ; kaydet. Kullanici-bazli/yetkisiz kurulumda hata kurulumu bozmaz; ayni islem
  ; integrations\efatura\tools\setup-task.cmd ile bir kez elle yapilabilir.
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\integrations\efatura\tools\install-task.ps1"' $0
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'schtasks.exe /Delete /TN "Vega WhatsApp e-Fatura Export" /F'
!macroend
