$ErrorActionPreference = 'Stop'

# LEGACY: Windows 7 / Server 2008 R2'de varsayilan PowerShell 2.0'dir. PS 3+ ile
# gelen $PSScriptRoot (betikte), Get-Content -Raw/-Tail, Get-ChildItem -File,
# ConvertFrom-Json/ConvertTo-Json ve [tip]::new() burada YOK; esdegerleri kullanilir.
# .NET 4.5'in ReadToEndAsync'i de CLR 2'de yok (asagida, varsa kullanilir).
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$utf8NoBom = New-Object Text.UTF8Encoding($false)

function Read-JsonFile([string]$path) {
    $text = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
    if (Get-Command ConvertFrom-Json -ErrorAction SilentlyContinue) { return ($text | ConvertFrom-Json) }
    Add-Type -AssemblyName System.Web.Extensions
    $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
    return $ser.DeserializeObject($text)   # Dictionary: $obj.alan erisimi PS'de calisir
}

# Yalniz duz alanlar (metin / bool) icin JSON; PS 2.0'da ConvertTo-Json yok.
function ConvertTo-JsonText([hashtable]$obj) {
    $parts = @()
    foreach ($k in $obj.Keys) {
        $v = $obj[$k]
        if ($v -is [bool]) { $val = $(if ($v) { 'true' } else { 'false' }) }
        elseif ($null -eq $v) { $val = 'null' }
        else {
            $sb = New-Object Text.StringBuilder
            foreach ($ch in ([string]$v).ToCharArray()) {
                $c = [int]$ch
                if ($c -eq 34) { [void]$sb.Append('\"') }
                elseif ($c -eq 92) { [void]$sb.Append('\\') }
                elseif ($c -lt 32) { [void]$sb.Append(('\u{0:x4}' -f $c)) }
                else { [void]$sb.Append($ch) }
            }
            $val = '"' + $sb.ToString() + '"'
        }
        $parts += ('"{0}":{1}' -f $k, $val)
    }
    return '{' + ($parts -join ',') + '}'
}

$integrationDir = Split-Path -Parent $scriptDir
$manifest = Read-JsonFile (Join-Path $integrationDir 'integration.json')
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
        $files += @(Get-ChildItem -LiteralPath $d -Filter '*_dump.xml' -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer })
    }
    return $files
}

# Konsol hatayi ekrana degil kendi NLog dosyasina yazar (C:\eArsiv\logs\gg.log)
# ve yine 0 ile cikar. Gercek sebep orada: "PayableAmount 0 olamaz", "dizayn yok"
# gibi. Basarisizlikta o satiri bulup hataya ekliyoruz.
function Get-VegaLogError([string]$consoleDir, [datetime]$since) {
    try {
        $file = Join-Path $consoleDir ('logs\{0}.log' -f (Get-Date -Format 'yyyy-MM-dd'))
        if (-not (Test-Path -LiteralPath $file)) { return '' }
        $lines = @(Get-Content -LiteralPath $file -ErrorAction Stop | Select-Object -Last 200)
        $hit = ''
        foreach ($line in $lines) {
            $m = [regex]::Match($line, '^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})')
            if (-not $m.Success) { continue }
            $stamp = [datetime]::MinValue
            if (-not [datetime]::TryParseExact($m.Groups[1].Value, 'yyyy-MM-dd HH:mm:ss',
                [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$stamp)) { continue }
            if ($stamp -lt $since.AddSeconds(-5)) { continue }
            # Vega adim kayitlarini da ERROR seviyesinde yazar ("step 1-3"); yalniz istisna gercek sebep.
            if ($line -match 'Exception') { $hit = $line }
        }
        return ($hit -replace '\s+', ' ').Trim()
    } catch { return '' }
}

# Kok Invoice'in ID ve UUID'si. Bazi firmalarda Vega numarayi GIB'e gonderirken
# verir; dump'ta <cbc:ID /> bos gelir. O zaman fatura ETTN (UUID) ile taninir.
function Read-InvoiceKeys([string]$path) {
    $keys = @{ ok=$false; id=''; uuid='' }
    try {
        $doc = New-Object Xml.XmlDocument
        $doc.Load($path)
        $keys.ok = $true
        $node = $doc.SelectSingleNode('/*[local-name()="Invoice"]/*[local-name()="ID"][1]')
        if ($node) { $keys.id = $node.InnerText.Trim() }
        $node = $doc.SelectSingleNode('/*[local-name()="Invoice"]/*[local-name()="UUID"][1]')
        if ($node) { $keys.uuid = $node.InnerText.Trim() }
    } catch { }
    return $keys
}

function Test-InvoiceMatch($keys, [string]$belgeNo, [string]$uuid) {
    if (-not $keys.ok) { return $false }
    if ($keys.id) { return $keys.id -eq $belgeNo }
    if (-not $uuid) { return $true }
    return $keys.uuid -ieq $uuid
}

if (-not (Test-Path -LiteralPath $requestPath)) { exit 0 }
$request = Read-JsonFile $requestPath
$jobId = [string]$request.jobId
$indText = [string]$request.ind
$expectedBelgeNo = [string]$request.expectedBelgeNo
$expectedUuid = ([string]$request.expectedUuid).Trim()
if ($jobId -notmatch '^[0-9a-fA-F-]{36}$') { throw 'Gecersiz jobId.' }
if ($indText -notmatch '^[1-9][0-9]{0,9}$') { throw 'Gecersiz fatura IND.' }
if ($expectedBelgeNo -notmatch '^[A-Za-z0-9._-]{1,64}$') { throw 'Gecersiz BELGENO.' }
if ($expectedUuid -and $expectedUuid -notmatch '^[0-9a-fA-F-]{32,36}$') { $expectedUuid = '' }
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
    # Cikti yalniz tani icin okunur. ReadToEndAsync (.NET 4.5) yoksa yonlendirme
    # yapilmaz: okunmayan yonlendirilmis cikti tamponu dolup konsolu kilitleyebilir.
    $canReadAsync = [bool]([IO.StreamReader].GetMethod('ReadToEndAsync', [Type[]]@()))
    $psi.RedirectStandardOutput = $canReadAsync
    $psi.RedirectStandardError = $canReadAsync
    $psi.Arguments = '{0} einvoice' -f $indText
    try {
        $proc = [Diagnostics.Process]::Start($psi)
    } catch {
        throw ("Vega konsolu baslatilamadi ({0}). Gorev yonetici yetkisiyle calismiyor olabilir: tools\setup-task.cmd dosyasini yonetici olarak calistirin." -f $_.Exception.Message)
    }
    # Konsolun kendi mesaji hatanin sebebini soyleyebilir; bloklamamak icin async.
    $outTask = $null; $errTask = $null
    if ($canReadAsync) {
        $outTask = $proc.StandardOutput.ReadToEndAsync()
        $errTask = $proc.StandardError.ReadToEndAsync()
    }

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
                $keys = Read-InvoiceKeys $f.FullName
                $idText = if (-not $keys.ok) { 'okunamadi' } elseif ($keys.id) { $keys.id } else { 'bos' }
                $found += ("{0}(ID={1}, ETTN={2})" -f $f.Name, $idText, $keys.uuid)
                if (Test-InvoiceMatch $keys $expectedBelgeNo $expectedUuid) { $xml = $f.FullName; break }
            }
        }
        # Konsol kapandiktan sonra dosyayi yazan baska bir surec olabilir; kisa
        # bir sure daha bekle, sonra ne bulundugunu yazarak pes et.
        if ($exitedAt -and (Get-Date) -gt $exitedAt.AddSeconds(20) -and -not $xml) {
            break
        }
    }
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    try { if ($outTask) { $consoleOut = (($outTask.Result + "`n" + $errTask.Result).Trim() -replace '\s+', ' ') } } catch { }
    if (-not $xml) {
        $detay = @()
        if ($found.Count) { $detay += ("uretilen dosyalar: " + ($found -join ', ')) }
        else { $detay += ("yeni dump dosyasi olusmadi (bakilan: " + ($searchDirs -join ', ') + ")") }
        if ($consoleOut) {
            if ($consoleOut.Length -gt 300) { $consoleOut = $consoleOut.Substring(0, 300) + '...' }
            $detay += ("konsol ciktisi: " + $consoleOut)
        }
        $vegaLog = Get-VegaLogError $consoleDir $started
        if ($vegaLog) {
            if ($vegaLog.Length -gt 400) { $vegaLog = $vegaLog.Substring(0, 400) + '...' }
            $detay += ("Vega kaydi: " + $vegaLog)
        }
        $kod = if ($proc.HasExited) { [string]$proc.ExitCode } else { 'calisiyor' }
        throw ("Vega UBL uretilmedi (IND {0}, beklenen {1}, ETTN {2}, konsol cikis kodu {3}). {4}" -f $indText, $expectedBelgeNo, $(if ($expectedUuid) { $expectedUuid } else { '?' }), $kod, ($detay -join ' | '))
    }
    $json = ConvertTo-JsonText @{ ok=$true; xmlPath=$xml }
    [IO.File]::WriteAllText($donePath, $json, $utf8NoBom)
}
catch {
    try { if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } } catch {}
    $json = ConvertTo-JsonText @{ ok=$false; error=$_.Exception.Message }
    [IO.File]::WriteAllText($donePath, $json, $utf8NoBom)
}
