# Trinity Staging Quick Deploy Script
# This script cleans up old deployments and deploys fresh

param(
    [switch]$SkipCleanup
)

Write-Host "🚀 Trinity Staging Deployment Script" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# Step 1: Cleanup old deployments (if not skipped)
if (-not $SkipCleanup) {
    Write-Host "`n🗑️  Cleaning up old deployments..." -ForegroundColor Yellow
    
    # Delete all deployments
    kubectl delete deployment --all -n trinity-staging --ignore-not-found=true 2>$null
    kubectl delete statefulset --all -n trinity-staging --ignore-not-found=true 2>$null
    kubectl delete service --all -n trinity-staging --ignore-not-found=true 2>$null
    kubectl delete ingress --all -n trinity-staging --ignore-not-found=true 2>$null
    kubectl delete pvc --all -n trinity-staging --ignore-not-found=true 2>$null
    
    Write-Host "✅ Cleanup complete" -ForegroundColor Green
    Write-Host "⏳ Waiting 10 seconds for resources to be removed..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
}

# Step 2: Apply Configuration
Write-Host "`n🔧 Applying configuration..." -ForegroundColor Cyan
kubectl apply -f configmaps/app-config.yaml
kubectl apply -f secrets/database-secrets.yaml
Write-Host "✅ Configuration applied" -ForegroundColor Green

# Step 3: Deploy Databases
Write-Host "`n🗄️  Deploying databases..." -ForegroundColor Cyan

Write-Host "  📦 PostgreSQL..." -ForegroundColor Blue
kubectl apply -f services/postgres/postgres-staging.yaml
Start-Sleep -Seconds 5

Write-Host "  📦 MongoDB..." -ForegroundColor Blue
kubectl apply -f services/mongo/mongo-staging.yaml
Start-Sleep -Seconds 5

Write-Host "  📦 Redis..." -ForegroundColor Blue
kubectl apply -f services/redis/redis-staging.yaml
Start-Sleep -Seconds 5

Write-Host "  📦 MinIO..." -ForegroundColor Blue
kubectl apply -f services/minio-staging.yaml
Start-Sleep -Seconds 5

Write-Host "`n⏳ Waiting for databases to be ready..." -ForegroundColor Yellow
Write-Host "  This may take 2-3 minutes..." -ForegroundColor Gray

# Wait for PostgreSQL
Write-Host "  Waiting for PostgreSQL..." -ForegroundColor Blue
kubectl wait --for=condition=ready pod -l app=postgres-staging -n trinity-staging --timeout=300s 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ PostgreSQL is ready" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  PostgreSQL timeout - checking status..." -ForegroundColor Yellow
    kubectl get pods -n trinity-staging -l app=postgres-staging
}

# Wait for MongoDB
Write-Host "  Waiting for MongoDB..." -ForegroundColor Blue
kubectl wait --for=condition=ready pod -l app=mongo-staging -n trinity-staging --timeout=300s 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ MongoDB is ready" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  MongoDB timeout - checking status..." -ForegroundColor Yellow
    kubectl get pods -n trinity-staging -l app=mongo-staging
}

# Wait for Redis
Write-Host "  Waiting for Redis..." -ForegroundColor Blue
kubectl wait --for=condition=ready pod -l app=redis-staging -n trinity-staging --timeout=300s 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ Redis is ready" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Redis timeout - checking status..." -ForegroundColor Yellow
    kubectl get pods -n trinity-staging -l app=redis-staging
}

# Step 4: Deploy Application Services
Write-Host "`n🚀 Deploying application services..." -ForegroundColor Cyan

Write-Host "  📦 Django..." -ForegroundColor Blue
kubectl apply -f apps/django/django-staging.yaml
Start-Sleep -Seconds 3

Write-Host "  📦 FastAPI..." -ForegroundColor Blue
kubectl apply -f apps/fastapi/fastapi-staging.yaml
Start-Sleep -Seconds 3

Write-Host "  📦 TrinityAI..." -ForegroundColor Blue
kubectl apply -f apps/trinity-ai/trinity-ai-staging.yaml
Start-Sleep -Seconds 3

Write-Host "  📦 Flight Server..." -ForegroundColor Blue
kubectl apply -f apps/flight/flight-staging.yaml
Start-Sleep -Seconds 3

Write-Host "  📦 Celery Worker..." -ForegroundColor Blue
kubectl apply -f apps/celery/celery-staging.yaml
Start-Sleep -Seconds 3

Write-Host "  📦 Frontend..." -ForegroundColor Blue
kubectl apply -f apps/frontend/frontend-staging.yaml
Start-Sleep -Seconds 3

# Step 5: Deploy Networking
Write-Host "`n🌐 Deploying networking..." -ForegroundColor Cyan
kubectl apply -f networking/ingress-staging.yaml 2>$null
Write-Host "✅ Networking applied" -ForegroundColor Green

# Step 6: Show Status
Write-Host "`n📊 Current Status:" -ForegroundColor Cyan
Write-Host "`nPods:" -ForegroundColor Yellow
kubectl get pods -n trinity-staging

Write-Host "`nServices:" -ForegroundColor Yellow
kubectl get services -n trinity-staging

Write-Host "`nPersistent Volume Claims:" -ForegroundColor Yellow
kubectl get pvc -n trinity-staging

# Step 7: Instructions
Write-Host "`n🎉 Deployment Initiated!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

Write-Host "`n📋 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Wait for all pods to be Running (may take 5-10 minutes):" -ForegroundColor White
Write-Host "   kubectl get pods -n trinity-staging -w" -ForegroundColor Gray
Write-Host "   (Press Ctrl+C to stop watching)" -ForegroundColor Gray

Write-Host "`n2. If any pods show errors, check their logs:" -ForegroundColor White
Write-Host "   kubectl logs <pod-name> -n trinity-staging" -ForegroundColor Gray

Write-Host "`n3. Once Django pod is Running, initialize the application:" -ForegroundColor White
Write-Host "   kubectl exec -it deployment/django-staging -n trinity-staging -- python create_tenant.py" -ForegroundColor Gray

Write-Host "`n4. Access the application:" -ForegroundColor White
Write-Host "   kubectl port-forward svc/frontend-service 8082:80 -n trinity-staging" -ForegroundColor Gray
Write-Host "   Then open: http://localhost:8082" -ForegroundColor Gray

Write-Host "`n💡 Useful Commands:" -ForegroundColor Cyan
Write-Host "   # Watch pod status" -ForegroundColor Gray
Write-Host "   kubectl get pods -n trinity-staging -w" -ForegroundColor Gray
Write-Host "`n   # Check specific pod logs" -ForegroundColor Gray
Write-Host "   kubectl logs -f <pod-name> -n trinity-staging" -ForegroundColor Gray
Write-Host "`n   # Get all resources" -ForegroundColor Gray
Write-Host "   kubectl get all -n trinity-staging" -ForegroundColor Gray

Write-Host "`n✨ Deployment script completed! ✨" -ForegroundColor Magenta

# Ask if user wants to run tenant initialization
Write-Host "`n🔧 Tenant Initialization" -ForegroundColor Cyan
Write-Host "-" * 70
$response = Read-Host "`nDo you want to run tenant initialization now? (Y/N)"

if ($response -eq "Y" -or $response -eq "y") {
    Write-Host "`nRunning tenant initialization..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10  # Give pods a bit more time
    .\run-tenant-init.ps1
} else {
    Write-Host "`n⚠️  Skipping tenant initialization" -ForegroundColor Yellow
    Write-Host "   Run later with: .\run-tenant-init.ps1" -ForegroundColor White
}