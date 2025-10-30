# Trinity - Resume All Services
# This script starts all Trinity pods

Write-Host "`n🚀 RESUMING TRINITY APPLICATION...`n" -ForegroundColor Cyan

Write-Host "Starting database services first..." -ForegroundColor Yellow
kubectl scale statefulset postgres-staging --replicas=1 -n trinity-staging
kubectl scale statefulset mongo-staging --replicas=1 -n trinity-staging
kubectl scale deployment redis-staging --replicas=1 -n trinity-staging
kubectl scale deployment minio-staging --replicas=1 -n trinity-staging

Write-Host "⏳ Waiting for databases to be ready (30 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

Write-Host "`nStarting application services..." -ForegroundColor Yellow
kubectl scale deployment django-staging --replicas=1 -n trinity-staging
kubectl scale deployment fastapi-staging --replicas=1 -n trinity-staging
kubectl scale deployment frontend-staging --replicas=1 -n trinity-staging
kubectl scale deployment celery-staging --replicas=1 -n trinity-staging
kubectl scale deployment flight-staging --replicas=1 -n trinity-staging
kubectl scale deployment trinity-ai-staging --replicas=1 -n trinity-staging

Write-Host "`n⏳ Waiting for applications to start (30 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

Write-Host "`n✅ SERVICES RESUMED!`n" -ForegroundColor Green

Write-Host "📊 Current Status:" -ForegroundColor Cyan
kubectl get pods -n trinity-staging

Write-Host "`n🌐 Access Application:" -ForegroundColor Cyan
Write-Host "   http://localhost:30085" -ForegroundColor Yellow

Write-Host "`n📝 Notes:" -ForegroundColor Yellow
Write-Host "   • Wait 2-3 minutes for all pods to be fully ready" -ForegroundColor White
Write-Host "   • Check status: kubectl get pods -n trinity-staging" -ForegroundColor White
Write-Host "   • View logs: kubectl logs -f deployment/<service>-staging -n trinity-staging`n" -ForegroundColor White

