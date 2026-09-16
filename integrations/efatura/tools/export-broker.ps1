$ErrorActionPreference = 'Stop'

$integrationDir = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $integrationDir 'integration.json') -Raw | ConvertFrom-Json
$dataDir = Join-Path $env:ProgramData 'Vega WhatsApp\efatura'
$requestDir = Join-Path $dataDir 'requests'
$requestPath = Join-Path $requestDir 'request.json'

function Find-ConsoleDir {
    $configured = [string]$manifest.settings.consoleDir
    if ($configured -and $configured -ne 'auto') {
        $candidate = [IO.Path]::GetFullPath($configured)
        if (Test-Path -LiteralPath (Join-Path $candidate 'vega.earsiv.console.exe')) { return $candidate }
        throw "Vega konsolu bulunamadi: $candidate"
    }
    foreach ($candidate in @('C:\eArsiv', 'C:\EArsiv')) {
        if (Test-Path -LiteralPath (Join-Path $candidate 'vega.earsiv.console.exe')) { return $candidate }
    }
    throw 'vega.earsiv.console.exe bulunamadi.'
}

if (-not (Test-Path -LiteralPath $requestPath)) { exit 0 }
$request = Get-Content -LiteralPath $requestPath -Raw | ConvertFrom-Json
$jobId = [string]$request.jobId
$indText = [string]$request.ind
$expectedBelgeNo = [string]$request.expectedBelgeNo
if ($jobId -notmatch '^[0-9a-fA-F-]{36}$') { throw 'Gecersiz jobId.' }
if ($indText -notmatch '^[1-9][0-9]{0,9}$') { throw 'Gecersiz fatura IND.' }
if ($expectedBelgeNo -notmatch '^[A-Za-z0-9._-]{1,64}$') { throw 'Gecersiz BELGENO.' }
$donePath = Join-Path $requestDir ("done-{0}.json" -f $jobId)
Remove-Item -LiteralPath $requestPath -Force

try {
    # Vega konsolu requireAdministrator manifesti tasir. Gorev yukseltilmemis
    # calisiyorsa Start-Process UAC istemek zorunda kalir, oturum acilamadigi icin
    # Windows "islem kullanici tarafindan iptal edildi" (1223) der ve tur 2 dakika
    # bosa bekler. Onceden anla, hemen anlasilir hatayi yaz.
    $me = [Security.Principal.WindowsIdentity]::GetCurrent()
    $isAdmin = (New-Object Security.Principal.WindowsPrincipal $me).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        throw ("Vega export gorevi yonetici yetkisiyle calismiyor (hesap: {0}). tools\setup-task.cmd dosyasini yonetici olarak bir kez calistirin." -f $me.Name)
    }
    $consoleDir = Find-ConsoleDir
    $tempDir = Join-Path $consoleDir 'temp'
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    $started = Get-Date
    $before = @{}
    Get-ChildItem -LiteralPath $tempDir -Filter '*_dump.xml' -File -ErrorAction SilentlyContinue | ForEach-Object {
        $before[$_.FullName] = "{0}:{1}" -f $_.Length,$_.LastWriteTimeUtc.Ticks
    }
    # ONEMLI: Start-Process (UseShellExecute) requireAdministrator manifestli exe icin
    # UAC brokerine (AppInfo) gider. Gorev SYSTEM/oturum 0 da calistigi icin onay
    # penceresi gosterilemez: cagri once ~2 dakika asili kalir, sonra "islem kullanici
    # tarafindan iptal edildi" (1223) doner ve fatura hic gitmez. SYSTEM zaten tam
    # yetkili; dogrudan CreateProcess ile yukseltme brokerine hic ugranmaz.
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = Join-Path $consoleDir 'vega.earsiv.console.exe'
    $psi.WorkingDirectory = $consoleDir
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.Arguments = '{0} einvoice' -f $indText
    try {
        $proc = [Diagnostics.Process]::Start($psi)
    } catch {
        throw ("Vega konsolu baslatilamadi ({0}). Gorev yonetici yetkisiyle calismiyor olabilir: tools\setup-task.cmd dosyasini yonetici olarak calistirin." -f $_.Exception.Message)
    }
    $xml = $null
    $exitedAt = $null
    $deadline = (Get-Date).AddSeconds(115)
    while ((Get-Date) -lt $deadline -and -not $xml) {
        Start-Sleep -Milliseconds 300
        $proc.Refresh()
        if ($proc.HasExited -and -not $exitedAt) { $exitedAt = Get-Date }
        foreach ($f in Get-ChildItem -LiteralPath $tempDir -Filter '*_dump.xml' -File -ErrorAction SilentlyContinue) {
            $sig = "{0}:{1}" -f $f.Length,$f.LastWriteTimeUtc.Ticks
            if ($f.Length -gt 0 -and $f.LastWriteTime -ge $started.AddSeconds(-2) -and $before[$f.FullName] -ne $sig) {
                try {
                    [xml]$doc = Get-Content -LiteralPath $f.FullName -Raw
                    $rootId = $doc.SelectSingleNode('/*[local-name()="Invoice"]/*[local-name()="ID"][1]')
                    if ($rootId -and $rootId.InnerText.Trim() -eq $expectedBelgeNo) {
                        $xml = $f.FullName
                        break
                    }
                } catch { }
            }
        }
        if ($exitedAt -and (Get-Date) -gt $exitedAt.AddSeconds(3) -and -not $xml) {
            throw "Vega UBL araci cikti uretmeden kapandi (kod $($proc.ExitCode))."
        }
    }
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    if (-not $xml) { throw 'Vega UBL dosyasi zamaninda uretilmedi.' }
    $json = @{ ok=$true; xmlPath=$xml } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($donePath, $json, [Text.UTF8Encoding]::new($false))
}
catch {
    try { if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } } catch {}
    $json = @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($donePath, $json, [Text.UTF8Encoding]::new($false))
}
