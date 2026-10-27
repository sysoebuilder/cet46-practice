param(
    [Parameter(Mandatory=$true)][string]$SdkDirectory,
    [ValidateSet('Probe','Full','Both')][string]$Content = 'Full',
    [string]$Proxy,
    [string]$JavaHome = 'D:\HBuilderX\plugins\amazon-corretto',
    [string]$AndroidHome,
    [switch]$AllowMissingAppKey
)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$nativeProject = Join-Path $project 'native\foxlet'
$sdkRoot = (Resolve-Path -LiteralPath $SdkDirectory).Path
if (!(Test-Path (Join-Path $sdkRoot 'SDK\libs\lib.5plus.base-release.aar'))) { throw 'Pass the extracted SDK root containing SDK/libs' }
$localConfig = Join-Path $nativeProject 'local.properties'
$keyLine = if (Test-Path $localConfig) { Get-Content $localConfig | Where-Object { $_ -match '^cet\.dcloudAppKey=\S+' } | Select-Object -First 1 }
if (!$keyLine -and !$AllowMissingAppKey) { throw 'Set cet.dcloudAppKey in native/foxlet/local.properties. -AllowMissingAppKey is for compilation checks only; it does not bypass SDK licensing.' }
if (!$AndroidHome) { $AndroidHome = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$oldJava = $env:JAVA_HOME
$oldAndroid = $env:ANDROID_HOME
try {
    $env:JAVA_HOME = $JavaHome
    $env:ANDROID_HOME = $AndroidHome
    & python (Join-Path $PSScriptRoot 'prepare-foxlet.py') --check
    if ($LASTEXITCODE -ne 0) { throw 'Prepare and verify Foxlet resources first' }
    $gradleArgs = @("-PdcloudSdkDir=$sdkRoot")
    if ($Proxy) {
        $uri = [Uri]$Proxy
        $gradleArgs += "-Dhttps.proxyHost=$($uri.Host)", "-Dhttps.proxyPort=$($uri.Port)", "-Dhttp.proxyHost=$($uri.Host)", "-Dhttp.proxyPort=$($uri.Port)"
    }
    $tasks = @(switch ($Content) {
        'Probe' { ':host-app:assembleProbeDebug' }
        'Full' { ':host-app:assembleFullDebug' }
        'Both' { ':host-app:assembleProbeDebug'; ':host-app:assembleFullDebug' }
    })
    Push-Location $nativeProject
    try {
        & .\gradlew.bat @gradleArgs @tasks --no-daemon --console plain
        if ($LASTEXITCODE -ne 0) { throw '5+ host build failed' }
    } finally { Pop-Location }
    foreach ($kind in @('Probe', 'Full')) {
        if ($Content -ne 'Both' -and $Content -ne $kind) { continue }
        $lowerKind = $kind.ToLowerInvariant()
        $apk = Join-Path $nativeProject "host-app\build\outputs\apk\$lowerKind\debug\host-app-$lowerKind-debug.apk"
        $verifyArgs = @($apk)
        if ($kind -eq 'Probe') { $verifyArgs += '--probe' }
        & python (Join-Path $PSScriptRoot 'check-foxlet-apk.py') @verifyArgs
        if ($LASTEXITCODE -ne 0) { throw 'Host APK payload verification failed' }
    }
    if (!$keyLine) { Write-Warning 'Compiled without an AppKey. Runtime license validation is pending.' }
} finally {
    $env:JAVA_HOME = $oldJava
    $env:ANDROID_HOME = $oldAndroid
}
