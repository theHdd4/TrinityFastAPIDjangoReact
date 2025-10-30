# Build Docker Images for Kubernetes Staging Environment
# This script builds all necessary images with proper tags for staging

Write-Host "🔨 Building Trinity Staging Images for Kubernetes..." -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

# Change to project root
$projectRoot = "E:\staging\TrinityFastAPIDjangoReact"
Set-Location $projectRoot

# Build Django/Web/Celery/FastAPI Image (they all use the same base)
Write-Host "`n📦 Building Django/Web image (also used for Celery and FastAPI)..." -ForegroundColor Yellow
Write-Host "   Context: TrinityBackendDjango" -ForegroundColor Gray

# Copy TrinityBackendFastAPI into TrinityBackendDjango for the build
Write-Host "   Copying TrinityBackendFastAPI into build context..." -ForegroundColor Gray
if (Test-Path "TrinityBackendDjango\TrinityBackendFastAPI") {
    Remove-Item -Recurse -Force "TrinityBackendDjango\TrinityBackendFastAPI"
}
Copy-Item -Recurse "TrinityBackendFastAPI" "TrinityBackendDjango\TrinityBackendFastAPI"

docker build -t trinity-staging-web:latest ./TrinityBackendDjango
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Django/Web image built successfully" -ForegroundColor Green
} else {
    Write-Host "   ❌ Failed to build Django/Web image" -ForegroundColor Red
    exit 1
}

# Build Flight Server Image
Write-Host "`n📦 Building Flight Server image..." -ForegroundColor Yellow
Write-Host "   Context: TrinityBackendFastAPI" -ForegroundColor Gray
docker build -t trinity-staging-flight:latest ./TrinityBackendFastAPI
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Flight image built successfully" -ForegroundColor Green
} else {
    Write-Host "   ❌ Failed to build Flight image" -ForegroundColor Red
    exit 1
}

# Build Trinity AI Image
Write-Host "`n📦 Building Trinity AI image..." -ForegroundColor Yellow
Write-Host "   Context: TrinityAI" -ForegroundColor Gray
docker build -t trinity-staging-trinity-ai:latest ./TrinityAI
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Trinity AI image built successfully" -ForegroundColor Green
} else {
    Write-Host "   ❌ Failed to build Trinity AI image" -ForegroundColor Red
    exit 1
}

# Build Frontend Image
Write-Host "`n📦 Building Frontend image..." -ForegroundColor Yellow
Write-Host "   Context: TrinityFrontend" -ForegroundColor Gray

# For Kubernetes, DO NOT set VITE_BACKEND_ORIGIN
# Let the app use window.location.origin at runtime for proper same-origin behavior
$viteFrontendPort = if ($env:VITE_FRONTEND_PORT) { $env:VITE_FRONTEND_PORT } else { "8082" }
$viteDjangoPort = if ($env:VITE_DJANGO_PORT) { $env:VITE_DJANGO_PORT } else { "8000" }
$viteFastApiPort = if ($env:VITE_FASTAPI_PORT) { $env:VITE_FASTAPI_PORT } else { "8001" }

Write-Host "   Build args (Kubernetes single-origin mode):" -ForegroundColor Gray
Write-Host "      VITE_FRONTEND_PORT=$viteFrontendPort" -ForegroundColor Gray
Write-Host "      VITE_DJANGO_PORT=$viteDjangoPort (internal)" -ForegroundColor Gray
Write-Host "      VITE_FASTAPI_PORT=$viteFastApiPort (internal)" -ForegroundColor Gray
Write-Host "      Using window.location.origin for backend URL" -ForegroundColor Yellow

docker build -t trinity-staging-frontend:latest `
    --build-arg VITE_FRONTEND_PORT=$viteFrontendPort `
    --build-arg VITE_DJANGO_PORT=$viteDjangoPort `
    --build-arg VITE_FASTAPI_PORT=$viteFastApiPort `
    ./TrinityFrontend
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Frontend image built successfully" -ForegroundColor Green
} else {
    Write-Host "   ❌ Failed to build Frontend image" -ForegroundColor Red
    exit 1
}

# Cleanup
Write-Host "`n🧹 Cleaning up..." -ForegroundColor Yellow
if (Test-Path "TrinityBackendDjango\TrinityBackendFastAPI") {
    Remove-Item -Recurse -Force "TrinityBackendDjango\TrinityBackendFastAPI"
    Write-Host "   ✅ Cleaned up temporary files" -ForegroundColor Green
}

# Summary
Write-Host "`n" + "=" * 60 -ForegroundColor Cyan
Write-Host "🎉 All images built successfully!" -ForegroundColor Green
Write-Host "`n📋 Built Images:" -ForegroundColor Cyan
Write-Host "   • trinity-staging-web:latest (Django/Celery/FastAPI)" -ForegroundColor White
Write-Host "   • trinity-staging-flight:latest" -ForegroundColor White
Write-Host "   • trinity-staging-trinity-ai:latest" -ForegroundColor White
Write-Host "   • trinity-staging-frontend:latest" -ForegroundColor White

Write-Host "`n🚀 Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Restart your pods:" -ForegroundColor White
Write-Host "      kubectl rollout restart deployment/fastapi-staging -n trinity-staging" -ForegroundColor Gray
Write-Host "   2. Watch the pods start:" -ForegroundColor White
Write-Host "      kubectl get pods -n trinity-staging -w" -ForegroundColor Gray
Write-Host ""



