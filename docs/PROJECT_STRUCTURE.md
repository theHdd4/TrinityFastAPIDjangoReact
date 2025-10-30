# Trinity - Clean Project Structure

## 📁 Directory Overview

```
TrinityFastAPIDjangoReact/
│
├── 📖 Documentation (3 files)
│   ├── README.md                      # Quick start guide
│   ├── STATUS.md                      # Current deployment status
│   ├── KUBERNETES_COMPLETE_GUIDE.md   # Full K8s deployment guide
│   └── CLEANUP_COMPLETE.md            # Cleanup summary
│
├── 🔧 Build Scripts (2 files)
│   ├── build-staging-images.ps1       # Build Docker images
│   └── docker-compose-staging.yml     # Reference configuration
│
├── ☸️ kubernetes/                     # Kubernetes deployment
│   ├── 📄 namespace.yaml              # Trinity namespace
│   │
│   ├── 🚀 Scripts (4 files)
│   │   ├── QUICK_DEPLOY.ps1           # Main deployment
│   │   ├── run-tenant-init.ps1        # Tenant initialization
│   │   ├── generate-secrets.ps1       # Generate secrets
│   │   └── check-prerequisites.ps1    # Check requirements
│   │
│   ├── 📦 apps/                       # Application deployments
│   │   ├── celery/
│   │   │   └── celery-staging.yaml
│   │   ├── django/
│   │   │   └── django-staging.yaml
│   │   ├── fastapi/
│   │   │   └── fastapi-staging.yaml
│   │   ├── flight/
│   │   │   └── flight-staging.yaml
│   │   ├── frontend/
│   │   │   └── frontend-staging.yaml
│   │   └── trinity-ai/
│   │       └── trinity-ai-staging.yaml
│   │
│   ├── 🗄️ services/                  # Database services
│   │   ├── postgres/
│   │   │   └── postgres-staging.yaml
│   │   ├── mongo/
│   │   │   └── mongo-staging.yaml
│   │   ├── redis/
│   │   │   └── redis-staging.yaml
│   │   └── minio-staging.yaml
│   │
│   ├── 🌐 networking/                 # Network configuration
│   │   ├── ingress-staging.yaml       # Ingress + NodePort
│   │   └── ingress-production.yaml    # Production ingress
│   │
│   ├── ⚙️ configmaps/                 # Configuration
│   │   └── app-config.yaml            # Environment variables
│   │
│   ├── 🔐 secrets/                    # Secrets
│   │   └── database-secrets.yaml      # Database credentials
│   │
│   ├── 💾 storage/                    # Storage
│   │   ├── storage-class.yaml         # Storage classes
│   │   ├── postgres-pvc.yaml          # PostgreSQL volume
│   │   ├── mongo-pvc.yaml             # MongoDB volume
│   │   ├── redis-pvc.yaml             # Redis volume
│   │   └── minio-pvc.yaml             # MinIO volume
│   │
│   └── 📋 DEPLOYMENT_CHECKLIST.md     # Deployment checklist
│
├── 🐍 TrinityBackendDjango/           # Django backend
│   ├── apps/                          # Django apps
│   │   ├── accounts/
│   │   ├── atoms/
│   │   ├── molecules/
│   │   ├── registry/
│   │   ├── roles/
│   │   ├── tenants/
│   │   ├── usecase/
│   │   └── workflows/
│   ├── config/                        # Django settings
│   ├── common/                        # Shared utilities
│   ├── redis_store/                   # Redis integration
│   ├── create_tenant.py               # Tenant creation script
│   ├── grant_app_access.py            # Grant app access
│   ├── manage.py                      # Django management
│   ├── Dockerfile                     # Docker image
│   └── requirements.txt               # Python dependencies
│
├── ⚡ TrinityBackendFastAPI/          # FastAPI microservices
│   ├── app/
│   │   ├── features/                  # Feature modules
│   │   │   ├── data_upload_validate/
│   │   │   ├── feature_overview/
│   │   │   ├── explore/
│   │   │   ├── chart_maker/
│   │   │   ├── clustering/
│   │   │   ├── correlation/
│   │   │   ├── build_autoregressive/
│   │   │   ├── build_feature_based/
│   │   │   └── [30+ more features]
│   │   ├── core/                      # Core utilities
│   │   │   ├── database.py
│   │   │   ├── mongo.py
│   │   │   └── utils.py
│   │   ├── DataStorageRetrieval/      # Arrow Flight
│   │   ├── flight_server.py           # Flight server
│   │   └── main.py                    # FastAPI app
│   ├── tests/                         # Unit tests
│   ├── Dockerfile                     # Docker image
│   └── requirements.txt               # Python dependencies
│
├── ⚛️ TrinityFrontend/                # React frontend
│   ├── src/
│   │   ├── components/                # React components
│   │   ├── lib/
│   │   │   └── api.ts                 # API configuration (CORS fix)
│   │   ├── pages/                     # Page components
│   │   └── App.tsx                    # Main app
│   ├── nginx.conf                     # Nginx proxy config
│   ├── Dockerfile                     # Docker image
│   └── package.json                   # Node dependencies
│
└── 🤖 TrinityAI/                      # AI service
    ├── Agent_concat/
    ├── agents/
    ├── Dockerfile
    └── requirements.txt
```

---

## 🎯 Key Files

### Essential Documentation
| File | Purpose |
|------|---------|
| `README.md` | Quick start and project overview |
| `STATUS.md` | Current deployment status |
| `KUBERNETES_COMPLETE_GUIDE.md` | Complete deployment guide |

### Deployment Scripts
| File | Purpose |
|------|---------|
| `build-staging-images.ps1` | Build all Docker images |
| `kubernetes/QUICK_DEPLOY.ps1` | Deploy to Kubernetes |
| `kubernetes/run-tenant-init.ps1` | Initialize tenant |
| `kubernetes/generate-secrets.ps1` | Generate secrets |

### Core Kubernetes Manifests
| File | Purpose |
|------|---------|
| `kubernetes/namespace.yaml` | Create namespace |
| `kubernetes/configmaps/app-config.yaml` | Environment variables |
| `kubernetes/secrets/database-secrets.yaml` | Sensitive data |
| `kubernetes/apps/*/` | Application deployments |
| `kubernetes/services/*/` | Database services |
| `kubernetes/networking/ingress-staging.yaml` | Ingress + NodePort |

### Helper Scripts
| File | Purpose |
|------|---------|
| `TrinityBackendDjango/create_tenant.py` | Create tenant |
| `TrinityBackendDjango/grant_app_access.py` | Grant app access |

---

## 🚀 Quick Commands

### Build & Deploy
```powershell
# Build images
.\build-staging-images.ps1

# Deploy to Kubernetes
cd kubernetes
.\QUICK_DEPLOY.ps1
```

### Access Application
```
http://localhost:30085
```

### Manage Deployment
```powershell
# Check status
kubectl get pods -n trinity-staging

# View logs
kubectl logs -f deployment/django-staging -n trinity-staging
kubectl logs -f deployment/fastapi-staging -n trinity-staging

# Restart
kubectl rollout restart deployment/django-staging -n trinity-staging
```

---

## 📊 Current Status

✅ All core services running  
✅ FastAPI connected to Redis  
✅ FastAPI connected to PostgreSQL  
✅ Frontend CORS fixed  
✅ 10 applications available  
✅ 14 users with access  
✅ NodePort accessible (30085)  
✅ Clean codebase  

---

## 📝 Notes

- **No .env files**: Using Kubernetes ConfigMaps and Secrets
- **No Docker Compose**: Kubernetes native deployment
- **Single-origin**: Frontend proxies all API calls through Nginx
- **Optimized**: Resource requests/limits configured for Docker Desktop
- **Clean**: Only essential files, no redundancy

---

**Access your application:** http://localhost:30085

**Full guide:** [KUBERNETES_COMPLETE_GUIDE.md](KUBERNETES_COMPLETE_GUIDE.md)

