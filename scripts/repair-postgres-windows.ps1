# Repairs the PostgreSQL initialization interrupted by CRLF shell scripts.
# Run from any directory: powershell -NoProfile -File .\scripts\repair-postgres-windows.ps1
# Preserves the existing database volume.
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$composePath = Join-Path $projectRoot "compose.yaml"
$initPath = Join-Path $projectRoot "postgres-init\01-create-app-role.sh"

function Invoke-Compose {
    param([string[]]$DockerArgs)
    & docker compose -f $composePath @DockerArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose failed (exit $LASTEXITCODE): $($DockerArgs -join ' ')"
    }
}

Push-Location $projectRoot
try {
    if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Docker is not installed or is not available in PATH."
    }
    if (!(Test-Path $composePath) -or !(Test-Path $initPath)) {
        throw "compose.yaml or the PostgreSQL initialization script was not found."
    }
    if (!(Test-Path (Join-Path $projectRoot ".env"))) {
        throw "The .env file is missing. Copy .env.example to .env and configure it before running this script."
    }

    Write-Host "[1/5] Checking Docker Desktop..."
    & docker info --format '{{.ServerVersion}}' 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker is not running. Open Docker Desktop, wait until it is ready, then run this script again."
    }
    Invoke-Compose -DockerArgs @("config", "--quiet")

    Write-Host "[2/5] Converting the initialization script to LF (UTF-8 without BOM)..."
    $source = [IO.File]::ReadAllText($initPath)
    $normalized = $source.Replace("`r`n", "`n").Replace("`r", "`n").TrimStart([char]0xFEFF)
    [IO.File]::WriteAllText($initPath, $normalized, [Text.UTF8Encoding]::new($false))

    Write-Host "[3/5] Starting PostgreSQL and waiting for it to accept connections..."
    Invoke-Compose -DockerArgs @("up", "-d", "postgres")
    $ready = $false
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        & docker compose -f $composePath exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            break
        }
        Start-Sleep -Seconds 2
    }
    if (!$ready) {
        throw "PostgreSQL did not become ready within 60 seconds."
    }

    Write-Host "[4/5] Completing creation of the API database role..."
    Invoke-Compose -DockerArgs @("exec", "-T", "postgres", "sh", "/docker-entrypoint-initdb.d/01-create-app-role.sh")

    Write-Host "[5/5] Starting the API and the website..."
    Invoke-Compose -DockerArgs @("up", "-d", "api", "web")
    Invoke-Compose -DockerArgs @("ps")

    Write-Host ""
    Write-Host "Startup commands completed. The database volume was preserved." -ForegroundColor Green
    Write-Host "Website: http://localhost:3000"
    Write-Host "Check application logs if login or other operations fail:"
    Write-Host "docker compose -f compose.yaml logs --tail=100 api web"
}
catch {
    Write-Host ""
    Write-Host "Repair stopped: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "The database volume was preserved."
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        & docker compose -f $composePath logs --tail=60 postgres
    }
    exit 1
}
finally {
    Pop-Location
}
