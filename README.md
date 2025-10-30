# Trinity - Multi-Tenant Data Analytics Platform

A comprehensive data analytics platform with Django, FastAPI, React, and Apache Arrow Flight.

---

## 🚀 Quick Start

### Access Your Application
```
http://localhost:30085
```

**Login:** `sushant.upadhyay@quantmatrix.ai` / `QM240108`

---

## 📚 Documentation

All documentation is in the **[docs/](docs/)** folder:

| Document | Description |
|----------|-------------|
| **[docs/START_HERE.md](docs/START_HERE.md)** | 👈 **Start here** - Quick access guide |
| **[docs/KUBERNETES_COMPLETE_GUIDE.md](docs/KUBERNETES_COMPLETE_GUIDE.md)** | Complete Trinity deployment guide |
| **[docs/KUBERNETES_DEVELOPER_GUIDE.md](docs/KUBERNETES_DEVELOPER_GUIDE.md)** | General K8s development guide |
| **[docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md)** | Codebase structure overview |
| **[docs/STATUS.md](docs/STATUS.md)** | Current deployment status |
| **[docs/FINAL_STATUS.md](docs/FINAL_STATUS.md)** | Verification results |
| **[docs/CLEANUP_COMPLETE.md](docs/CLEANUP_COMPLETE.md)** | Cleanup summary |

---

## 🏗️ Architecture

### Services
- **Django** - REST API, admin interface, multi-tenancy
- **FastAPI** - Data processing microservices
- **React** - Frontend SPA with Nginx reverse proxy
- **Flight** - Apache Arrow data streaming
- **PostgreSQL** - Tenant database (20 Gi)
- **MongoDB** - Document storage (20 Gi)
- **Redis** - Cache & Celery queue (5 Gi)
- **MinIO** - Object storage (50 Gi)

### Networking
- **NodePort 30085** - Stable external access
- **Single-origin** - No CORS issues
- **Nginx proxy** - Routes `/admin/api` → Django, `/api` → FastAPI

---

## ⚡ Quick Commands

### Deploy Everything
```powershell
# Build Docker images
.\build-staging-images.ps1

# Deploy to Kubernetes
cd kubernetes
.\QUICK_DEPLOY.ps1
```

### Check Status
```powershell
kubectl get pods -n trinity-staging
kubectl get services -n trinity-staging
```

### View Logs
```powershell
kubectl logs -f deployment/django-staging -n trinity-staging
kubectl logs -f deployment/fastapi-staging -n trinity-staging
kubectl logs -f deployment/frontend-staging -n trinity-staging
```

### Restart Service
```powershell
kubectl rollout restart deployment/fastapi-staging -n trinity-staging
```

---

## ✅ Current Status

- ✅ All services running
- ✅ FastAPI connected to Redis & PostgreSQL
- ✅ Frontend CORS fixed
- ✅ 10 applications available
- ✅ 14 users with access
- ✅ NodePort accessible (30085)
- ✅ Production ready

---

## 🔧 Technology Stack

### Backend
- Django 4.x with django-tenants
- FastAPI with async/await
- Apache Arrow Flight
- Celery for background tasks

### Frontend
- React 18 with TypeScript
- Vite build system
- Nginx reverse proxy

### Databases
- PostgreSQL (multi-tenant)
- MongoDB
- Redis

### Infrastructure
- Kubernetes (Docker Desktop)
- Docker
- MinIO object storage

---

## 📋 Features

- Multi-tenant architecture
- 10+ data analysis applications
- Real-time data streaming (Arrow Flight)
- User authentication & authorization
- Project & workflow management
- Data upload & validation
- Feature engineering
- Model building & evaluation
- Interactive visualizations

---

## 🎯 For Developers

### Project Structure
```
TrinityFastAPIDjangoReact/
├── docs/                          # 📖 All documentation
├── kubernetes/                    # ☸️ K8s manifests & scripts
├── TrinityBackendDjango/          # 🐍 Django backend
├── TrinityBackendFastAPI/         # ⚡ FastAPI microservices
├── TrinityFrontend/               # ⚛️ React frontend
├── TrinityAI/                     # 🤖 AI service
├── build-staging-images.ps1       # Build script
└── docker-compose-staging.yml     # Reference config
```

### Important Files
- `build-staging-images.ps1` - Build Docker images
- `kubernetes/QUICK_DEPLOY.ps1` - Deploy to K8s
- `TrinityBackendDjango/grant_app_access.py` - Grant app access
- `TrinityBackendDjango/create_tenant.py` - Create tenant

---

## 📖 Getting Started

1. **New to the project?** Read **[docs/START_HERE.md](docs/START_HERE.md)**
2. **Deploying to Kubernetes?** Follow **[docs/KUBERNETES_COMPLETE_GUIDE.md](docs/KUBERNETES_COMPLETE_GUIDE.md)**
3. **General K8s development?** Check **[docs/KUBERNETES_DEVELOPER_GUIDE.md](docs/KUBERNETES_DEVELOPER_GUIDE.md)**
4. **Understanding the code?** See **[docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md)**

---

## 🆘 Support

- **Issues?** Check troubleshooting in [docs/KUBERNETES_COMPLETE_GUIDE.md](docs/KUBERNETES_COMPLETE_GUIDE.md)
- **Status check:** See [docs/STATUS.md](docs/STATUS.md)
- **Full verification:** Review [docs/FINAL_STATUS.md](docs/FINAL_STATUS.md)

---

**Status:** ✅ Production Ready  
**Platform:** Kubernetes (Docker Desktop)  
**Access:** http://localhost:30085  
**Documentation:** [docs/](docs/)
