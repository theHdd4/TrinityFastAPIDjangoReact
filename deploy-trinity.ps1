# Trinity Kubernetes Deployment Script for Windows
param(
    [Parameter()]
    [ValidateSet('install', 'upgrade', 'uninstall', 'status', 'port-forward', 'build-images')]
    [string]$Action = 'install',
    
    [Parameter()]
    [string]$Namespace = 'trinity',
    
    [Parameter()]
    [string]$ReleaseName = 'trinity',
    
    [Parameter()]
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Write-Info {
    param($Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param($Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param($Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param($Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Test-Prerequisites {
    Write-Info "Checking prerequisites..."
    
    # Check if kubectl is available
    try {
        $null = kubectl version --client --output=json 2>$null
        Write-Success "kubectl is available"
    }
    catch {
        Write-Error "kubectl is not available. Please install kubectl."
        exit 1
    }
    
    # Check if helm is available
    try {
        $null = helm version --short 2>$null
        Write-Success "Helm is available"
    }
    catch {
        Write-Error "Helm is not available. Please install Helm."
        exit 1
    }
    
    # Check if we can connect to Kubernetes cluster
    try {
        $null = kubectl cluster-info 2>$null
        Write-Success "Kubernetes cluster is accessible"
    }
    catch {
        Write-Error "Cannot connect to Kubernetes cluster. Please check your kubeconfig."
        exit 1
    }
    
    # Check if Docker is available (for building images)
    try {
        $null = docker version 2>$null
        Write-Success "Docker is available"
    }
    catch {
        Write-Warning "Docker is not available. Image building will not work."
    }
}

function Build-Images {
    Write-Info "Building Trinity Docker images..."
    
    $currentPath = Get-Location
    
    try {
        # Build Django backend image
        Write-Info "Building Django backend image..."
        Set-Location "$currentPath\TrinityBackendDjango"
        docker build -t trinity-web:latest .
        
        # Build FastAPI backend image  
        Write-Info "Building FastAPI backend image..."
        Set-Location "$currentPath\TrinityBackendFastAPI"
        docker build -t trinity-fastapi:latest .
        
        # Build Trinity AI image (needs parent context for DataStorageRetrieval)
        Write-Info "Building Trinity AI image..."
        Set-Location $currentPath
        docker build -f TrinityAI/Dockerfile -t trinity-ai:latest .
        
        # Build Frontend image
        Write-Info "Building Frontend image..."
        Set-Location "$currentPath\TrinityFrontend"
        docker build -t trinity-frontend:latest .
        
        Write-Success "All images built successfully"
    }
    catch {
        Write-Error "Failed to build images: $_"
        exit 1
    }
    finally {
        Set-Location $currentPath
    }
}

function Install-Trinity {
    Write-Info "Installing Trinity to Kubernetes..."
    
    $helmArgs = @(
        'install', $ReleaseName, './helm-chart',
        '--namespace', $Namespace,
        '--create-namespace',
        '--values', './helm-chart/values.yaml'
    )
    
    if ($DryRun) {
        $helmArgs += '--dry-run'
        Write-Info "Dry run mode - no actual installation"
    }
    
    try {
        & helm @helmArgs
        
        if (-not $DryRun) {
            Write-Success "Trinity installed successfully!"
            Write-Info "Getting deployment status..."
            Get-TrinityStatus
            Show-AccessInfo
        }
    }
    catch {
        Write-Error "Failed to install Trinity: $_"
        exit 1
    }
}

function Upgrade-Trinity {
    Write-Info "Upgrading Trinity..."
    
    $helmArgs = @(
        'upgrade', $ReleaseName, './helm-chart',
        '--namespace', $Namespace,
        '--values', './helm-chart/values.yaml'
    )
    
    if ($DryRun) {
        $helmArgs += '--dry-run'
        Write-Info "Dry run mode - no actual upgrade"
    }
    
    try {
        & helm @helmArgs
        
        if (-not $DryRun) {
            Write-Success "Trinity upgraded successfully!"
            Get-TrinityStatus
        }
    }
    catch {
        Write-Error "Failed to upgrade Trinity: $_"
        exit 1
    }
}

function Uninstall-Trinity {
    Write-Info "Uninstalling Trinity..."
    
    try {
        helm uninstall $ReleaseName --namespace $Namespace
        Write-Success "Trinity uninstalled successfully!"
        
        # Optionally remove namespace
        $response = Read-Host "Do you want to delete the namespace '$Namespace'? (y/N)"
        if ($response -eq 'y' -or $response -eq 'Y') {
            kubectl delete namespace $Namespace
            Write-Success "Namespace '$Namespace' deleted!"
        }
    }
    catch {
        Write-Error "Failed to uninstall Trinity: $_"
        exit 1
    }
}

function Get-TrinityStatus {
    Write-Info "Trinity Status:"
    
    try {
        Write-Info "Helm Release Status:"
        helm status $ReleaseName --namespace $Namespace
        
        Write-Info "Pod Status:"
        kubectl get pods --namespace $Namespace -o wide
        
        Write-Info "Service Status:"
        kubectl get services --namespace $Namespace -o wide
        
        Write-Info "Persistent Volume Claims:"
        kubectl get pvc --namespace $Namespace
    }
    catch {
        Write-Error "Failed to get status: $_"
    }
}

function Start-PortForwarding {
    Write-Info "Port forwarding information for Trinity services..."
    
    Write-Info "Trinity services are available at:"
    Write-Host "  Frontend: http://localhost:30080" -ForegroundColor Green
    Write-Host "  Django Backend: http://localhost:30000" -ForegroundColor Green  
    Write-Host "  FastAPI Backend: http://localhost:30001" -ForegroundColor Green
    Write-Host "  Trinity AI: http://localhost:30002" -ForegroundColor Green
    Write-Host "  PostgreSQL: localhost:30432" -ForegroundColor Green
    Write-Host "  MongoDB: localhost:30017" -ForegroundColor Green
    Write-Host "  Redis: localhost:30379" -ForegroundColor Green
    Write-Host "  MinIO API: http://localhost:30900" -ForegroundColor Green
    Write-Host "  MinIO Console: http://localhost:30901" -ForegroundColor Green
    Write-Host "  PgAdmin: http://localhost:30050" -ForegroundColor Green
    Write-Host "  Mongo Express: http://localhost:30082" -ForegroundColor Green
    
    Write-Info "Main application: http://localhost:30080"
    Write-Warning "Note: Since we're using NodePort services, you can access services directly!"
}

function Show-AccessInfo {
    Write-Success "Trinity Access Information:"
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Main Application:" -ForegroundColor Blue
    Write-Host "   Frontend: http://localhost:30080" -ForegroundColor Green
    Write-Host ""
    Write-Host "Backend Services:" -ForegroundColor Blue
    Write-Host "   Django Backend: http://localhost:30000" -ForegroundColor Green
    Write-Host "   FastAPI Backend: http://localhost:30001" -ForegroundColor Green
    Write-Host "   Trinity AI: http://localhost:30002" -ForegroundColor Green
    Write-Host ""
    Write-Host "Databases:" -ForegroundColor Blue
    Write-Host "   PostgreSQL: localhost:30432" -ForegroundColor Green
    Write-Host "   MongoDB: localhost:30017" -ForegroundColor Green
    Write-Host "   Redis: localhost:30379" -ForegroundColor Green
    Write-Host ""
    Write-Host "Storage:" -ForegroundColor Blue
    Write-Host "   MinIO API: http://localhost:30900" -ForegroundColor Green
    Write-Host "   MinIO Console: http://localhost:30901" -ForegroundColor Green
    Write-Host ""
    Write-Host "Management Tools:" -ForegroundColor Blue
    Write-Host "   PgAdmin: http://localhost:30050" -ForegroundColor Green
    Write-Host "   Mongo Express: http://localhost:30082" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
}

# Main execution
Write-Host "Trinity Kubernetes Deployment Tool" -ForegroundColor Blue
Write-Host "=======================================" -ForegroundColor Blue

Test-Prerequisites

switch ($Action) {
    'install' {
        Install-Trinity
    }
    'upgrade' {
        Upgrade-Trinity
    }
    'uninstall' {
        Uninstall-Trinity
    }
    'status' {
        Get-TrinityStatus
    }
    'port-forward' {
        Start-PortForwarding
    }
    'build-images' {
        Build-Images
    }
    default {
        Write-Error "Unknown action: $Action"
        Write-Host "Available actions: install, upgrade, uninstall, status, port-forward, build-images" -ForegroundColor Yellow
        exit 1
    }
}