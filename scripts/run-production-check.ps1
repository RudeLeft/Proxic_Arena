# Plays one real game on the live site as two players and records what it
# saw -- PHASE_06 P6-BK. See frontend/e2e/production.spec.ts for what is
# checked.
#
#   powershell -ExecutionPolicy Bypass -File scripts\run-production-check.ps1
#
# Asks for the two passwords (typed, not shown) and gives them only to this
# run, through environment variables that are removed again at the end.
# Traces are off, so no password is written to disk. Nothing on the server
# is deleted; the run refuses to start if either player is already in a
# room or a match.
#
# Results: frontend\test-results\production\ (screenshots, report.json).

param(
    [string]$Url = "https://proxic.barnflix.net",
    [string]$HostUser = "RudeLeft",
    [string]$GuestUser = "Pat"
)

$ErrorActionPreference = "Stop"
$frontend = Join-Path $PSScriptRoot "..\frontend"

function Read-Secret([string]$prompt) {
    $secure = Read-Host $prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

Write-Host "Live-site check against $Url, as $HostUser (host) and $GuestUser (guest)."
$env:PROXIC_E2E_PASSWORD = Read-Secret "Password for $HostUser"
$env:PROXIC_E2E_PASSWORD_2 = Read-Secret "Password for $GuestUser"
$env:PROXIC_E2E_URL = $Url
$env:PROXIC_E2E_USER = $HostUser
$env:PROXIC_E2E_USER_2 = $GuestUser
$env:PROXIC_E2E_PRODUCTION = "1"

Push-Location $frontend
try {
    npx playwright test e2e/production.spec.ts --trace off --reporter=list
    $code = $LASTEXITCODE
}
finally {
    Pop-Location
    foreach ($name in "PROXIC_E2E_PASSWORD", "PROXIC_E2E_PASSWORD_2", "PROXIC_E2E_URL",
                      "PROXIC_E2E_USER", "PROXIC_E2E_USER_2", "PROXIC_E2E_PRODUCTION") {
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "Results: $(Resolve-Path (Join-Path $frontend 'test-results\production'))"
exit $code
