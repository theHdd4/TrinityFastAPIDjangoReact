# Trinity Kubernetes - Tenant Initialization Script
# This script runs create_tenant.py in the Django pod

Write-Host "🚀 Trinity Tenant Initialization" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan

# Check if Django deployment exists
Write-Host "`n📋 Checking Django deployment..." -ForegroundColor Yellow
$deployment = kubectl get deployment django-staging -n trinity-staging --no-headers 2>$null

if (-not $deployment) {
    Write-Host "❌ Django deployment not found!" -ForegroundColor Red
    Write-Host "   Run .\QUICK_DEPLOY.ps1 first" -ForegroundColor White
    exit 1
}

Write-Host "✅ Django deployment found" -ForegroundColor Green

# Wait for Django to be ready
Write-Host "`n⏳ Waiting for Django to be ready..." -ForegroundColor Yellow
Write-Host "   This may take 2-3 minutes..." -ForegroundColor Gray

kubectl wait --for=condition=available deployment/django-staging -n trinity-staging --timeout=300s 2>$null

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Django deployment not ready after 5 minutes" -ForegroundColor Red
    Write-Host "`nTroubleshooting:" -ForegroundColor Yellow
    Write-Host "   1. Check pod status: kubectl get pods -n trinity-staging" -ForegroundColor White
    Write-Host "   2. Check logs: kubectl logs deployment/django-staging -n trinity-staging" -ForegroundColor White
    Write-Host "   3. Check events: kubectl get events -n trinity-staging" -ForegroundColor White
    exit 1
}

Write-Host "✅ Django is ready!" -ForegroundColor Green

# Check if databases are accessible
Write-Host "`n🔍 Verifying database connectivity..." -ForegroundColor Yellow

$dbCheck = kubectl exec deployment/django-staging -n trinity-staging -- sh -c "nc -z postgres-service 5432 && nc -z mongo-service 27017 && nc -z redis-service 6379" 2>$null

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Warning: Some databases may not be accessible" -ForegroundColor Yellow
    Write-Host "   Proceeding anyway..." -ForegroundColor Gray
} else {
    Write-Host "✅ All databases accessible" -ForegroundColor Green
}

# Run tenant creation
Write-Host "`n🔧 Running create_tenant.py..." -ForegroundColor Cyan
Write-Host "-" * 70
Write-Host ""

kubectl exec deployment/django-staging -n trinity-staging -- python create_tenant.py

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "-" * 70
    Write-Host "✅ Tenant initialization completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🎉 Created Resources:" -ForegroundColor Cyan
    Write-Host "   • Tenant: Quant Matrix AI" -ForegroundColor White
    Write-Host "   • Domain: quantmatrix.ai" -ForegroundColor White
    Write-Host "   • Super Admin: neo / neo_the_only_one" -ForegroundColor White
    Write-Host "   • Multiple user accounts created" -ForegroundColor White
    Write-Host ""
    Write-Host "📋 Next Steps:" -ForegroundColor Cyan
    Write-Host "   1. Access frontend:" -ForegroundColor White
    Write-Host "      kubectl port-forward svc/frontend-service 8082:80 -n trinity-staging" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   2. Open browser:" -ForegroundColor White
    Write-Host "      http://localhost:8082" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   3. Login with:" -ForegroundColor White
    Write-Host "      Username: neo" -ForegroundColor Gray
    Write-Host "      Password: neo_the_only_one" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "-" * 70
    Write-Host "❌ Tenant initialization failed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "🔍 Troubleshooting:" -ForegroundColor Yellow
    Write-Host "   1. Check Django logs:" -ForegroundColor White
    Write-Host "      kubectl logs deployment/django-staging -n trinity-staging --tail=100" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   2. Check database connectivity:" -ForegroundColor White
    Write-Host "      kubectl exec deployment/django-staging -n trinity-staging -- python manage.py dbshell" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   3. Try running manually:" -ForegroundColor White
    Write-Host "      kubectl exec -it deployment/django-staging -n trinity-staging -- python create_tenant.py" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host ""

