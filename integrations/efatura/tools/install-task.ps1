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
Write-Host "Kuruldu: $taskName" -ForegroundColor Green
Write-Host 'Bu pencereyi kapatabilirsiniz.'
