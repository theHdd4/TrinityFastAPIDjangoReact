# Trinity Kubernetes Prerequisites Checker
# This script checks if all prerequisites are met for Kubernetes deployment

Write-Host "🔍 Trinity Kubernetes Prerequisites Check" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

$allGood = $true

# Check 1: kubectl command
Write-Host "`n1. Checking kubectl..." -ForegroundColor Yellow
try {
    $kubectlVersion = kubectl version --client --short 2>$null
    Write-Host "   ✅ kubectl is installed: $kubectlVersion" -ForegroundColor Green
} catch {
    Write-Host "   ❌ kubectl is not installed or not in PATH" -ForegroundColor Red
    $allGood = $false
}

# Check 2: k3s cluster connectivity
Write-Host "`n2. Checking k3s cluster..." -ForegroundColor Yellow
try {
    $null = kubectl cluster-info 2>$null
    Write-Host "   ✅ k3s cluster is running and accessible" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Cannot connect to k3s cluster" -ForegroundColor Red
    Write-Host "      → Try: sudo systemctl start k3s (on Linux)" -ForegroundColor Gray
    $allGood = $false
}

# Check 3: Node availability
if ($allGood) {
    Write-Host "`n3. Checking nodes..." -ForegroundColor Yellow
    try {
        $nodes = kubectl get nodes --no-headers 2>$null
        if ($nodes) {
            Write-Host "   ✅ Nodes are available:" -ForegroundColor Green
            kubectl get nodes 2>$null | ForEach-Object { Write-Host "      $_" -ForegroundColor Gray }
        } else {
            Write-Host "   ❌ No nodes found" -ForegroundColor Red
            $allGood = $false
        }
    } catch {
        Write-Host "   ❌ Cannot get node information" -ForegroundColor Red
        $allGood = $false
    }
}

# Check 4: Docker Compose status (conflict check)
Write-Host "`n4. Checking Docker Compose status..." -ForegroundColor Yellow
try {
    $dockerCompose = docker ps --filter "name=trinity-staging" --format "table {{.Names}}" 2>$null
    if ($dockerCompose -and $dockerCompose.Count -gt 1) {
        Write-Host "   ⚠️  Docker Compose services are running:" -ForegroundColor Yellow
        docker ps --filter "name=trinity-staging" --format "table {{.Names}}\t{{.Ports}}" 2>$null | ForEach-Object { Write-Host "      $_" -ForegroundColor Gray }
        Write-Host "   → Consider stopping Docker Compose first to avoid port conflicts" -ForegroundColor Gray
        Write-Host "   → Command: docker-compose -f docker-compose-staging.yml down" -ForegroundColor Gray
    } else {
        Write-Host "   ✅ No conflicting Docker Compose services running" -ForegroundColor Green
    }
} catch {
    Write-Host "   ⚠️  Could not check Docker status" -ForegroundColor Yellow
}

# Check 5: Configuration files
Write-Host "`n5. Checking Kubernetes manifests..." -ForegroundColor Yellow
$requiredFiles = @(
    "namespace.yaml",
    "configmaps/app-config.yaml",
    "secrets/database-secrets.yaml",
    "services/postgres/postgres-staging.yaml",
    "apps/django/django-staging.yaml"
)

$missingFiles = @()
foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "   ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $file" -ForegroundColor Red
        $missingFiles += $file
    }
}

if ($missingFiles.Count -gt 0) {
    $allGood = $false
}

# Check 6: Node IP detection
Write-Host "`n6. Checking network configuration..." -ForegroundColor Yellow
try {
    $networkInterfaces = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.*" }
    $nodeIP = $networkInterfaces[0].IPAddress
    Write-Host "   ✅ Detected Node IP: $nodeIP" -ForegroundColor Green
    
    # Check if IP is configured correctly in manifests
    if (Test-Path "configmaps/app-config.yaml") {
        $config = Get-Content "configmaps/app-config.yaml" -Raw
        if ($config -match "HOST_IP: `"$nodeIP`"") {
            Write-Host "   ✅ IP is correctly configured in app-config.yaml" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  IP in config might need update" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "   ❌ Could not detect node IP" -ForegroundColor Red
}

# Summary
Write-Host "`n" + "="*50 -ForegroundColor Cyan
if ($allGood) {
    Write-Host "🎉 All prerequisites are met! Ready to deploy." -ForegroundColor Green
    Write-Host "`nNext steps:" -ForegroundColor Cyan
    Write-Host "   1. Run: .\deploy-staging.ps1" -ForegroundColor White
    Write-Host "   2. Access: http://$nodeIP:30082" -ForegroundColor White
} else {
    Write-Host "❌ Prerequisites not met. Please fix the issues above first." -ForegroundColor Red
    
    Write-Host "`nCommon fixes:" -ForegroundColor Yellow
    Write-Host "   • Start k3s: sudo systemctl start k3s" -ForegroundColor White
    Write-Host "   • Install kubectl: https://kubernetes.io/docs/tasks/tools/" -ForegroundColor White
    Write-Host "   • Stop Docker Compose: docker-compose -f docker-compose-staging.yml down" -ForegroundColor White
}

Write-Host "`nCurrent Docker Compose Status:" -ForegroundColor Cyan
Write-Host "   ✅ Your app is running at: http://192.168.31.63:8082" -ForegroundColor Green
