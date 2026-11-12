$ErrorActionPreference = 'Stop'
# LEGACY: Windows 7 / Server 2008 R2'de varsayilan PowerShell 2.0'dir ve
# ScheduledTasks modulu (New-ScheduledTask*, Register-ScheduledTask) yalniz
# Windows 8 / Server 2012 ve sonrasinda vardir. Gorev, Vista'dan beri her
# Windows'ta bulunan Schedule.Service COM arayuzuyle kaydedilir. $PSScriptRoot
# da PS 2.0'da betiklerde tanimsizdir.
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$taskName = 'Vega WhatsApp e-Fatura Export'
$broker = Join-Path $scriptDir 'export-broker.ps1'
if (-not (Test-Path -LiteralPath $broker)) { throw "Broker bulunamadi: $broker" }

# Vega'nin resmi konsolu requireAdministrator manifesti tasir. Gorev kullanici
# oturumunda calisirsa Windows yeniden UAC sorabilir; arka planda otomatik
# calisma icin gorevi SYSTEM hesabinda ve en yuksek yetkiyle kaydederiz.
$TASK_ACTION_EXEC = 0
$TASK_CREATE_OR_UPDATE = 6
$TASK_LOGON_SERVICE_ACCOUNT = 5
$TASK_RUNLEVEL_HIGHEST = 1
$TASK_INSTANCES_IGNORE_NEW = 2

$svc = New-Object -ComObject Schedule.Service
$svc.Connect()
$root = $svc.GetFolder('\')

$def = $svc.NewTask(0)
$def.RegistrationInfo.Description = 'Vega WhatsApp e-Fatura PDF: Vega konsolundan UBL disa aktarimi (istek uzerine calisir).'
$def.Principal.UserId = 'SYSTEM'
$def.Principal.LogonType = $TASK_LOGON_SERVICE_ACCOUNT
$def.Principal.RunLevel = $TASK_RUNLEVEL_HIGHEST
$def.Settings.ExecutionTimeLimit = 'PT3M'
$def.Settings.MultipleInstances = $TASK_INSTANCES_IGNORE_NEW
$def.Settings.AllowDemandStart = $true
$def.Settings.DisallowStartIfOnBatteries = $false
$def.Settings.StopIfGoingOnBatteries = $false
$def.Settings.Enabled = $true
$action = $def.Actions.Create($TASK_ACTION_EXEC)
$action.Path = 'powershell.exe'
$action.Arguments = ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}"' -f $broker)
$root.RegisterTaskDefinition($taskName, $def, $TASK_CREATE_OR_UPDATE, 'SYSTEM', $null, $TASK_LOGON_SERVICE_ACCOUNT) | Out-Null

# Yonetici/SYSTEM ile kaydedilen gorevi normal kullanici ne gorebilir ne
# baslatabilir ("Erisim engellendi"). Uygulama normal kullanici oturumunda
# calistigi icin oturum acmis kullanicilara okuma+calistirma izni veriyoruz.
# Gorev yalniz ProgramData'daki dogrulanmis istek dosyasini isler.
$task = $root.GetTask($taskName)
$task.SetSecurityDescriptor('D:(A;;FA;;;SY)(A;;FA;;;BA)(A;;GRGX;;;AU)', 0)

Write-Host "Kuruldu: $taskName" -ForegroundColor Green
Write-Host 'Bu pencereyi kapatabilirsiniz.'
