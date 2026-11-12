$ErrorActionPreference = 'Stop'
$taskName = 'Vega WhatsApp e-Fatura Export'
$broker = Join-Path $PSScriptRoot 'export-broker.ps1'
if (-not (Test-Path -LiteralPath $broker)) { throw "Broker bulunamadi: $broker" }

# Vega'nin resmi konsolu requireAdministrator manifesti tasir. Gorev kullanici
# oturumunda calisirsa Windows yeniden UAC sorabilir; arka planda otomatik
# calisma icin gorevi SYSTEM hesabinda ve en yuksek yetkiyle kaydederiz.
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}"' -f $broker)
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings -Force | Out-Null

# Yonetici/SYSTEM ile kaydedilen gorevi normal kullanici ne gorebilir ne
# baslatabilir ("Erisim engellendi"). Uygulama normal kullanici oturumunda
# calistigi icin oturum acmis kullanicilara okuma+calistirma izni veriyoruz.
# Gorev yalniz ProgramData'daki dogrulanmis istek dosyasini isler.
$svc = New-Object -ComObject Schedule.Service
$svc.Connect()
$task = $svc.GetFolder('\').GetTask($taskName)
$task.SetSecurityDescriptor('D:(A;;FA;;;SY)(A;;FA;;;BA)(A;;GRGX;;;AU)', 0)

Write-Host "Kuruldu: $taskName" -ForegroundColor Green
Write-Host 'Bu pencereyi kapatabilirsiniz.'
