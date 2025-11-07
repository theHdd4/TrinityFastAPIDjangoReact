# Trinity Kubernetes - Complete Production Guide

## 🎯 Quick Access (Ready Now!)

**Your application is running at:**
```
http://localhost:30085
```

**Login:** `sushant.upadhyay@quantmatrix.ai` / `QM240108`

---

## 📖 Table of Contents

1. [Quick Start](#quick-start)
2. [Deployment Guide](#deployment-guide)
3. [Architecture](#architecture)
4. [Management](#management)
5. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Access Application
```
http://localhost:30085
```

### Login Credentials
- `neo` / `neo_the_only_one`
- `sushant.upadhyay@quantmatrix.ai` / `QM240108`
- Plus 12 more users

### Check Status
```powershell
kubectl get pods -n trinity-staging
kubectl get services -n trinity-staging
```

---

## Deployment Guide

### First Time Deployment

```powershell
# 1. Build images
cd E:\staging\TrinityFastAPIDjangoReact
.\build-staging-images.ps1

# 2. Deploy to Kubernetes
cd kubernetes
.\QUICK_DEPLOY.ps1

# 3. Initialize tenant (when prompted)
# Answer: Y

# 4. Access application
# Open: http://localhost:30085
```

### Re-deployment (Updates)

```powershell
# 1. Rebuild images
.\build-staging-images.ps1

# 2. Restart deployments
cd kubernetes
kubectl rollout restart deployment/django-staging -n trinity-staging
kubectl rollout restart deployment/fastapi-staging -n trinity-staging
kubectl rollout restart deployment/frontend-staging -n trinity-staging
```

---

## Architecture

### Services
- **Django** (2 replicas, HPA-ready) - REST API & Admin
- **FastAPI** (2 replicas, HPA-ready) - Data operations & microservices
- **Frontend** (2 replicas) - React SPA with Nginx proxy
- **PostgreSQL** - Multi-tenant database (20 Gi)
- **MongoDB** - Document storage (20 Gi)
- **Redis** - Cache & Celery queue (5 Gi)
- **MinIO** - Object storage (50 Gi)
- **Flight** - Apache Arrow data server
- **Celery** - Background task workers (2 replicas)

### Networking
```
http://localhost:30085/           → React App (Nginx)
http://localhost:30085/admin/api  → Django (proxied)
http://localhost:30085/api        → FastAPI (proxied)
```

**Single-origin architecture - No CORS issues!**

---

## Management

### View Logs
```powershell
# Django
kubectl logs -f deployment/django-staging -n trinity-staging

# FastAPI
kubectl logs -f deployment/fastapi-staging -n trinity-staging

# Frontend
kubectl logs -f deployment/frontend-staging -n trinity-staging
```

### Restart Services
```powershell
kubectl rollout restart deployment/django-staging -n trinity-staging
kubectl rollout restart deployment/fastapi-staging -n trinity-staging
kubectl rollout restart deployment/frontend-staging -n trinity-staging
```

### Scale Services
```powershell
# Increase replicas (if you have more resources)
kubectl scale deployment django-staging --replicas=2 -n trinity-staging

# Decrease
kubectl scale deployment django-staging --replicas=1 -n trinity-staging
```

### Stop Everything (Keep Data)
```powershell
kubectl scale deployment --all --replicas=0 -n trinity-staging
```

### Start Again
```powershell
kubectl scale deployment --all --replicas=1 -n trinity-staging
```

### Complete Cleanup
```powershell
kubectl delete namespace trinity-staging
```

---

## Troubleshooting

### Services Not Starting
```powershell
# Check pod status
kubectl get pods -n trinity-staging

# Check specific pod
kubectl describe pod <pod-name> -n trinity-staging

# Check logs
kubectl logs <pod-name> -n trinity-staging
```

### Application Not Accessible
```powershell
# Check NodePort service
kubectl get svc trinity-staging-nodeport -n trinity-staging

# Should show: PORT(S) 8085:30085/TCP

# Test access
Invoke-WebRequest -Uri http://localhost:30085/ -UseBasicParsing
```

### API Errors (500/502)
```powershell
# Check FastAPI logs
kubectl logs deployment/fastapi-staging -n trinity-staging --tail=50

# Check Django logs
kubectl logs deployment/django-staging -n trinity-staging --tail=50

# Check Redis connection
kubectl exec deployment/redis-staging -n trinity-staging -- redis-cli ping
```

### Database Issues
```powershell
# PostgreSQL
kubectl exec postgres-staging-0 -n trinity-staging -- psql -U trinity_user -d trinity_db -c "SELECT 1;"

# MongoDB  
kubectl exec mongo-staging-0 -n trinity-staging -- mongosh --eval "db.adminCommand('ping')"

# Redis
kubectl exec deployment/redis-staging -n trinity-staging -- redis-cli ping
```

---

## Key Configuration Files

### Kubernetes Manifests (Working)
- `kubernetes/apps/django/django-staging.yaml` - Django deployment
- `kubernetes/apps/fastapi/fastapi-staging.yaml` - FastAPI deployment (with Redis/PostgreSQL env)
- `kubernetes/apps/frontend/frontend-staging.yaml` - Frontend deployment
- `kubernetes/services/postgres/postgres-staging.yaml` - PostgreSQL
- `kubernetes/services/mongo/mongo-staging.yaml` - MongoDB
- `kubernetes/services/redis/redis-staging.yaml` - Redis
- `kubernetes/services/minio-staging.yaml` - MinIO
- `kubernetes/networking/ingress-staging.yaml` - Ingress & NodePort
- `kubernetes/configmaps/app-config.yaml` - Configuration
- `kubernetes/secrets/database-secrets.yaml` - Secrets

### Frontend (CORS Fixed)
- `TrinityFrontend/src/lib/api.ts` - Kubernetes mode detection
- `TrinityFrontend/nginx.conf` - Reverse proxy configuration

### Build Scripts
- `build-staging-images.ps1` - Build Docker images
- `kubernetes/QUICK_DEPLOY.ps1` - Deploy to Kubernetes
- `kubernetes/run-tenant-init.ps1` - Initialize tenant

### Helper Scripts
- `TrinityBackendDjango/grant_app_access.py` - Grant app access to users

---

## Important Notes

### Resource Requirements
- **Minimum:** 12 CPU, 24 GB RAM (light testing)
- **Recommended for 10+ users:** 24 CPU, 32 GB RAM equivalent
- **Current:** 2 replicas for Django/FastAPI/Frontend/Celery with upgraded resource requests
- **To scale:** Increase Docker Desktop resources first (WSL2 VM currently 32 vCPU / ~97 GB RAM)

### Staging Resource Plan

| Component | Replicas | Requests | Limits |
|-----------|----------|----------|--------|
| Django | 2 | 1 CPU / 1.5 Gi | 3 CPU / 4 Gi |
| FastAPI | 2 | 1 CPU / 1 Gi | 3 CPU / 3 Gi |
| Celery | 2 | 0.5 CPU / 1 Gi | 1.5 CPU / 2 Gi |
| Frontend | 2 | 0.1 CPU / 128 Mi | 0.5 CPU / 256 Mi |
| Trinity-AI | 1 | 2 CPU / 4 Gi | 6 CPU / 12 Gi |
| Flight | 1 | 1 CPU / 2 Gi | 3 CPU / 4 Gi |
| PostgreSQL | 1 | 1 CPU / 1 Gi | 3 CPU / 4 Gi |
| MongoDB | 1 | 1 CPU / 1 Gi | 3 CPU / 4 Gi |
| Redis | 1 | 0.2 CPU / 512 Mi | 1 CPU / 1.5 Gi |
| MinIO | 1 | 1 CPU / 2 Gi | 3 CPU / 4 Gi |

> **Next:** introduce HPAs for Django/FastAPI/Celery and hook up Prometheus + Grafana once functional validation is complete.

### Port Configuration
- **NodePort:** 30085 (stable, always accessible)
- **Frontend internal:** 80
- **Django internal:** 8000
- **FastAPI internal:** 8001

### Environment Variables (Kubernetes)
All configured via ConfigMaps and Secrets - no .env files needed!

---

## Success Checklist

- [x] All database pods running
- [x] All application pods running
- [x] FastAPI connected to Redis ✅
- [x] FastAPI connected to PostgreSQL ✅
- [x] Frontend CORS fixed ✅
- [x] 10 applications available ✅
- [x] All users have access ✅
- [x] NodePort accessible (30085) ✅
- [x] No API errors ✅

---

**Your Trinity Kubernetes deployment is production-ready!**

**Access:** http://localhost:30085 🚀

