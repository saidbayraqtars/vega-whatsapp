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

# Konsol dump'i normalde <konsol>\temp altina duser. Farkli kurulumlarda kendi
# calisma klasorune ya da SYSTEM'in TEMP'ine yazabildigi icin hepsine bakariz.
function Get-SearchDirs([string]$consoleDir) {
    $dirs = @((Join-Path $consoleDir 'temp'), $consoleDir, $env:TEMP, 'C:\Windows\Temp')
    $seen = @{}
    $out = @()
    foreach ($d in $dirs) {
        if (-not $d) { continue }
        $full = [IO.Path]::GetFullPath($d)
        if ($seen.ContainsKey($full.ToLowerInvariant())) { continue }
        $seen[$full.ToLowerInvariant()] = $true
        if (Test-Path -LiteralPath $full) { $out += $full }
    }
    return $out
}

function Get-DumpFiles($dirs) {
    $files = @()
    foreach ($d in $dirs) {
        $files += Get-ChildItem -LiteralPath $d -Filter '*_dump.xml' -File -ErrorAction SilentlyContinue
    }
    return $files
}

function Read-InvoiceId([string]$path) {
    try {
        [xml]$doc = Get-Content -LiteralPath $path -Raw
        $node = $doc.SelectSingleNode('/*[local-name()="Invoice"]/*[local-name()="ID"][1]')
        if ($node) { return $node.InnerText.Trim() }
    } catch { }
    return ''
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

$found = @()      # tur boyunca gorulen yeni dump dosyalari: tani icin hataya eklenir
$consoleOut = ''

try {
    # Vega konsolu requireAdministrator manifesti tasir. Gorev yukseltilmemis
    # calisiyorsa konsol hic baslatilamaz; once anla, anlasilir hatayi yaz.
    $me = [Security.Principal.WindowsIdentity]::GetCurrent()
    $isAdmin = (New-Object Security.Principal.WindowsPrincipal $me).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        throw ("Vega export gorevi yonetici yetkisiyle calismiyor (hesap: {0}). tools\setup-task.cmd dosyasini yonetici olarak bir kez calistirin." -f $me.Name)
    }
    $consoleDir = Find-ConsoleDir
    New-Item -ItemType Directory -Path (Join-Path $consoleDir 'temp') -Force | Out-Null
    $searchDirs = Get-SearchDirs $consoleDir
    $started = Get-Date
    $before = @{}
    foreach ($f in Get-DumpFiles $searchDirs) {
        $before[$f.FullName] = "{0}:{1}" -f $f.Length,$f.LastWriteTimeUtc.Ticks
    }

    # ONEMLI: Start-Process (UseShellExecute) requireAdministrator manifestli exe
    # icin UAC brokerine (AppInfo) gider. Gorev SYSTEM/oturum 0 da calistigi icin
    # onay penceresi gosterilemez: cagri ~2 dakika asili kalir, sonra "islem
    # kullanici tarafindan iptal edildi" (1223) doner ve fatura hic gitmez.
    # SYSTEM zaten tam yetkili; dogrudan CreateProcess yukseltme brokerine ugramaz.
    $psi = New-Object Diagnostics.ProcessStartInfo
    $psi.FileName = Join-Path $consoleDir 'vega.earsiv.console.exe'
    $psi.WorkingDirectory = $consoleDir
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.Arguments = '{0} einvoice' -f $indText
    try {
        $proc = [Diagnostics.Process]::Start($psi)
    } catch {
        throw ("Vega konsolu baslatilamadi ({0}). Gorev yonetici yetkisiyle calismiyor olabilir: tools\setup-task.cmd dosyasini yonetici olarak calistirin." -f $_.Exception.Message)
    }
    # Konsolun kendi mesaji hatanin sebebini soyleyebilir; bloklamamak icin async.
    $outTask = $proc.StandardOutput.ReadToEndAsync()
    $errTask = $proc.StandardError.ReadToEndAsync()

    $xml = $null
    $exitedAt = $null
    $deadline = (Get-Date).AddSeconds(115)
    while ((Get-Date) -lt $deadline -and -not $xml) {
        Start-Sleep -Milliseconds 300
        $proc.Refresh()
        if ($proc.HasExited -and -not $exitedAt) { $exitedAt = Get-Date }
        foreach ($f in Get-DumpFiles $searchDirs) {
            $sig = "{0}:{1}" -f $f.Length,$f.LastWriteTimeUtc.Ticks
            if ($f.Length -gt 0 -and $f.LastWriteTime -ge $started.AddSeconds(-2) -and $before[$f.FullName] -ne $sig) {
                $before[$f.FullName] = $sig
                $id = Read-InvoiceId $f.FullName
                $found += ("{0}(ID={1})" -f $f.Name, $(if ($id) { $id } else { 'okunamadi' }))
                if ($id -eq $expectedBelgeNo) { $xml = $f.FullName; break }
            }
        }
        # Konsol kapandiktan sonra dosyayi yazan baska bir surec olabilir; kisa
        # bir sure daha bekle, sonra ne bulundugunu yazarak pes et.
        if ($exitedAt -and (Get-Date) -gt $exitedAt.AddSeconds(20) -and -not $xml) {
            break
        }
    }
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    try { $consoleOut = (($outTask.Result + "`n" + $errTask.Result).Trim() -replace '\s+', ' ') } catch { }
    if (-not $xml) {
        $detay = @()
        if ($found.Count) { $detay += ("uretilen dosyalar: " + ($found -join ', ')) }
        else { $detay += ("yeni dump dosyasi olusmadi (bakilan: " + ($searchDirs -join ', ') + ")") }
        if ($consoleOut) {
            if ($consoleOut.Length -gt 300) { $consoleOut = $consoleOut.Substring(0, 300) + '...' }
            $detay += ("konsol ciktisi: " + $consoleOut)
        }
        $kod = if ($proc.HasExited) { [string]$proc.ExitCode } else { 'calisiyor' }
        throw ("Vega UBL uretilmedi (IND {0}, beklenen {1}, konsol cikis kodu {2}). {3}" -f $indText, $expectedBelgeNo, $kod, ($detay -join ' | '))
    }
    $json = @{ ok=$true; xmlPath=$xml } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($donePath, $json, [Text.UTF8Encoding]::new($false))
}
catch {
    try { if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } } catch {}
    $json = @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($donePath, $json, [Text.UTF8Encoding]::new($false))
}
