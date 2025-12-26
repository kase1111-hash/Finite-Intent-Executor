# Finite Intent Executor - Windows Setup Script
# Run this script in PowerShell to set up the project

param(
    [switch]$SkipFrontend,
    [switch]$SkipPython,
    [switch]$StartDev,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

function Write-Success { Write-ColorOutput Green $args }
function Write-Warning { Write-ColorOutput Yellow $args }
function Write-Info { Write-ColorOutput Cyan $args }
function Write-Error { Write-ColorOutput Red $args }

function Show-Banner {
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host "   Finite Intent Executor - Windows Setup    " -ForegroundColor White
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host ""
}

function Show-Help {
    Show-Banner
    Write-Host "Usage: .\setup.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -SkipFrontend    Skip frontend installation"
    Write-Host "  -SkipPython      Skip Python/Ollama setup"
    Write-Host "  -StartDev        Start development servers after setup"
    Write-Host "  -Help            Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\setup.ps1                    # Full setup"
    Write-Host "  .\setup.ps1 -SkipPython        # Skip optional Python tools"
    Write-Host "  .\setup.ps1 -StartDev          # Setup and start dev servers"
    Write-Host ""
    exit 0
}

function Test-Command($Command) {
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Test-NodeVersion {
    if (-not (Test-Command "node")) {
        return $false
    }
    $version = node --version
    $major = [int]($version -replace 'v(\d+)\..*', '$1')
    return $major -ge 18
}

function Install-Dependencies {
    Write-Info "Checking prerequisites..."
    Write-Host ""

    # Check Node.js
    if (-not (Test-NodeVersion)) {
        Write-Error "Node.js 18+ is required but not found!"
        Write-Host ""
        Write-Host "Please install Node.js from: https://nodejs.org" -ForegroundColor Yellow
        Write-Host "Choose the LTS version (18.x or later)" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "After installing, restart PowerShell and run this script again."
        exit 1
    }
    $nodeVersion = node --version
    Write-Success "[OK] Node.js $nodeVersion detected"

    # Check npm
    if (-not (Test-Command "npm")) {
        Write-Error "npm is required but not found!"
        exit 1
    }
    $npmVersion = npm --version
    Write-Success "[OK] npm v$npmVersion detected"

    # Check Git (optional but recommended)
    if (Test-Command "git") {
        $gitVersion = git --version
        Write-Success "[OK] $gitVersion detected"
    }
    else {
        Write-Warning "[SKIP] Git not found (optional)"
    }

    # Check Python (optional)
    if (-not $SkipPython) {
        if (Test-Command "python") {
            $pythonVersion = python --version 2>&1
            Write-Success "[OK] $pythonVersion detected"
        }
        elseif (Test-Command "python3") {
            $pythonVersion = python3 --version 2>&1
            Write-Success "[OK] $pythonVersion detected"
        }
        else {
            Write-Warning "[SKIP] Python not found (optional - for license suggester)"
        }
    }

    Write-Host ""
}

function Install-RootDependencies {
    Write-Info "Installing root dependencies..."
    Write-Host ""

    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install root dependencies!"
        exit 1
    }
    Write-Success "[OK] Root dependencies installed"
    Write-Host ""
}

function Compile-Contracts {
    Write-Info "Compiling smart contracts..."
    Write-Host ""

    npm run compile
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to compile contracts!"
        exit 1
    }
    Write-Success "[OK] Smart contracts compiled"
    Write-Host ""
}

function Install-FrontendDependencies {
    if ($SkipFrontend) {
        Write-Warning "[SKIP] Frontend installation skipped"
        return
    }

    Write-Info "Installing frontend dependencies..."
    Write-Host ""

    Push-Location frontend
    try {
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to install frontend dependencies!"
            exit 1
        }

        # Create .env from example if it doesn't exist
        if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
            Copy-Item ".env.example" ".env"
            Write-Success "[OK] Created .env from .env.example"
        }

        Write-Success "[OK] Frontend dependencies installed"
    }
    finally {
        Pop-Location
    }
    Write-Host ""
}

function Install-PythonDependencies {
    if ($SkipPython) {
        Write-Warning "[SKIP] Python setup skipped"
        return
    }

    $pythonCmd = $null
    if (Test-Command "python") {
        $pythonCmd = "python"
    }
    elseif (Test-Command "python3") {
        $pythonCmd = "python3"
    }

    if ($null -eq $pythonCmd) {
        Write-Warning "[SKIP] Python not installed - skipping license suggester setup"
        return
    }

    if (Test-Path "requirements.txt") {
        Write-Info "Installing Python dependencies..."
        Write-Host ""

        & $pythonCmd -m pip install -r requirements.txt --quiet
        if ($LASTEXITCODE -eq 0) {
            Write-Success "[OK] Python dependencies installed"
        }
        else {
            Write-Warning "[WARN] Python dependencies installation had issues (non-critical)"
        }
        Write-Host ""
    }
}

function Run-Tests {
    Write-Info "Running smart contract tests..."
    Write-Host ""

    npm test
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "[WARN] Some tests failed - check output above"
    }
    else {
        Write-Success "[OK] All tests passed"
    }
    Write-Host ""
}

function Show-NextSteps {
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host "           Setup Complete!                   " -ForegroundColor White
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Quick Start Commands:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Start local blockchain node:" -ForegroundColor Yellow
    Write-Host "    npm run node" -ForegroundColor White
    Write-Host ""
    Write-Host "  Deploy contracts (in new terminal):" -ForegroundColor Yellow
    Write-Host "    npm run deploy" -ForegroundColor White
    Write-Host ""
    if (-not $SkipFrontend) {
        Write-Host "  Start frontend dev server:" -ForegroundColor Yellow
        Write-Host "    cd frontend && npm run dev" -ForegroundColor White
        Write-Host ""
    }
    Write-Host "  Run tests:" -ForegroundColor Yellow
    Write-Host "    npm test" -ForegroundColor White
    Write-Host ""
    Write-Host "Or use the helper scripts:" -ForegroundColor Cyan
    Write-Host "  .\start-node.bat      - Start Hardhat node"
    Write-Host "  .\start-frontend.bat  - Start frontend dev server"
    Write-Host "  .\deploy.bat          - Deploy smart contracts"
    Write-Host ""
    Write-Host "Documentation: See README.md for full details" -ForegroundColor Gray
    Write-Host ""
}

function Start-DevServers {
    if (-not $StartDev) {
        return
    }

    Write-Info "Starting development servers..."
    Write-Host ""
    Write-Host "Starting Hardhat node in background..." -ForegroundColor Yellow

    # Start Hardhat node in a new window
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run node"

    # Wait a moment for node to start
    Start-Sleep -Seconds 3

    # Deploy contracts
    Write-Host "Deploying contracts..." -ForegroundColor Yellow
    npm run deploy

    if (-not $SkipFrontend) {
        Write-Host "Starting frontend in new window..." -ForegroundColor Yellow
        Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; npm run dev"
    }

    Write-Host ""
    Write-Success "Development servers started!"
    Write-Host "  - Hardhat node: http://localhost:8545"
    if (-not $SkipFrontend) {
        Write-Host "  - Frontend: http://localhost:3000"
    }
    Write-Host ""
}

# Main execution
if ($Help) {
    Show-Help
}

Show-Banner
Install-Dependencies
Install-RootDependencies
Compile-Contracts
Install-FrontendDependencies
Install-PythonDependencies
Show-NextSteps
Start-DevServers
