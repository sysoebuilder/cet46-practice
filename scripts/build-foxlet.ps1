param([string]$JavaHome, [string]$AndroidHome, [string]$Proxy)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
if (!$JavaHome) {
    if (Test-Path 'D:\HBuilderX\plugins\amazon-corretto\bin\java.exe') { $JavaHome = 'D:\HBuilderX\plugins\amazon-corretto' }
    else { $JavaHome = $env:JAVA_HOME }
}
if (!$AndroidHome) {
    if ($env:ANDROID_HOME) { $AndroidHome = $env:ANDROID_HOME }
    else { $AndroidHome = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
}
if (!$JavaHome -or !(Test-Path (Join-Path $JavaHome 'bin\java.exe'))) { throw 'Pass -JavaHome with a JDK 17+ installation' }
if (!(Test-Path (Join-Path $AndroidHome 'platforms\android-36\android.jar'))) { throw 'Android SDK platform 36 is required' }
$oldJava = $env:JAVA_HOME
$oldAndroid = $env:ANDROID_HOME
$oldProxy = $env:HTTPS_PROXY
try {
    $env:JAVA_HOME = $JavaHome
    $env:ANDROID_HOME = $AndroidHome
    $gradleArgs = @()
    if ($Proxy) {
        $proxyUri = [Uri]$Proxy
        $env:HTTPS_PROXY = $Proxy
        $gradleArgs += "-Dhttps.proxyHost=$($proxyUri.Host)", "-Dhttps.proxyPort=$($proxyUri.Port)", "-Dhttp.proxyHost=$($proxyUri.Host)", "-Dhttp.proxyPort=$($proxyUri.Port)"
    }
    & python (Join-Path $PSScriptRoot 'prepare-foxlet.py')
    if ($LASTEXITCODE -ne 0) { throw 'Foxlet resource verification failed' }
    Push-Location (Join-Path $project 'native\foxlet')
    try {
        & .\gradlew.bat @gradleArgs :bridge:testDebugUnitTest :bridge:assembleRelease :smoke:assembleDebug --no-daemon --console plain
        if ($LASTEXITCODE -ne 0) { throw 'Native compilation failed; see Gradle diagnostics above' }
    } finally { Pop-Location }
    & python (Join-Path $PSScriptRoot 'check-foxlet-apk.py') (Join-Path $project 'native\foxlet\smoke\build\outputs\apk\debug\smoke-debug.apk') --smoke
    if ($LASTEXITCODE -ne 0) { throw 'APK payload verification failed' }
} finally {
    $env:JAVA_HOME = $oldJava
    $env:ANDROID_HOME = $oldAndroid
    $env:HTTPS_PROXY = $oldProxy
}
