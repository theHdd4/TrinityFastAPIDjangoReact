# Trinity - Pause All Services
# This script stops all Trinity pods without deleting data

Write-Host "`n⏸️  PAUSING TRINITY APPLICATION...`n" -ForegroundColor Cyan

Write-Host "Stopping application services..." -ForegroundColor Yellow
kubectl scale deployment django-staging --replicas=0 -n trinity-staging
kubectl scale deployment fastapi-staging --replicas=0 -n trinity-staging
kubectl scale deployment frontend-staging --replicas=0 -n trinity-staging
kubectl scale deployment celery-staging --replicas=0 -n trinity-staging
kubectl scale deployment flight-staging --replicas=0 -n trinity-staging
kubectl scale deployment trinity-ai-staging --replicas=0 -n trinity-staging

Write-Host "`nStopping database services..." -ForegroundColor Yellow
kubectl scale deployment redis-staging --replicas=0 -n trinity-staging
kubectl scale deployment minio-staging --replicas=0 -n trinity-staging
kubectl scale statefulset postgres-staging --replicas=0 -n trinity-staging
kubectl scale statefulset mongo-staging --replicas=0 -n trinity-staging

Write-Host "`n⏳ Waiting for pods to terminate..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

Write-Host "`n✅ ALL SERVICES PAUSED!`n" -ForegroundColor Green

Write-Host "📊 Current Status:" -ForegroundColor Cyan
kubectl get pods -n trinity-staging

Write-Host "`n📝 Notes:" -ForegroundColor Yellow
Write-Host "   • All data is preserved (PVCs intact)" -ForegroundColor White
Write-Host "   • Kubernetes is still running" -ForegroundColor White
Write-Host "   • To resume: Run .\resume-services.ps1" -ForegroundColor White
Write-Host "   • Or: kubectl scale deployment --all --replicas=1 -n trinity-staging`n" -ForegroundColor White

