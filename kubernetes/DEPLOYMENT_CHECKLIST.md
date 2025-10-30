# Trinity Kubernetes Deployment Checklist

## ✅ Pre-Deployment Checklist

### 1. Environment Setup
- [ ] Kubernetes cluster is running (k3s/Minikube)
- [ ] `kubectl` is installed and configured
- [ ] Docker is installed for building images
- [ ] Sufficient cluster resources (8+ CPU, 16+ GB RAM, 125+ GB storage)
- [ ] Storage class `hostpath` is available

### 2. Configuration Review
- [ ] All secret references point to correct secret names (`app-secrets` or `trinity-staging-secrets`)
- [ ] Storage classes are consistent across all PVCs (`hostpath`)
- [ ] Health probes are configured for all services
- [ ] Environment variables are complete
- [ ] Domain names are correct in ConfigMap
- [ ] CORS/CSRF origins are properly configured

### 3. Secrets Management
- [ ] Run `.\kubernetes\generate-secrets.ps1` to create secure secrets
- [ ] Review generated secrets in `secrets/database-secrets.yaml`
- [ ] Back up `.secrets-reference.txt` to secure location
- [ ] Verify base64 encoding is correct
- [ ] Ensure no placeholder values remain

### 4. Image Building
- [ ] Set environment variables for frontend build (optional):
  ```powershell
  $env:VITE_BACKEND_ORIGIN = "https://trinity-staging.quantmatrixai.com"
  $env:VITE_HOST_IP = "10.2.4.48"  # Your actual IP
  ```
- [ ] Run `.\build-staging-images.ps1`
- [ ] Verify all 4 images built successfully:
  - `trinity-staging-web:latest`
  - `trinity-staging-flight:latest`
  - `trinity-staging-trinity-ai:latest`
  - `trinity-staging-frontend:latest`
- [ ] For Minikube: Load images into cluster
  ```powershell
  minikube image load trinity-staging-web:latest
  minikube image load trinity-staging-flight:latest
  minikube image load trinity-staging-trinity-ai:latest
  minikube image load trinity-staging-frontend:latest
  ```

### 5. Validation
- [ ] Run `.\kubernetes\apply-fixes.ps1 -ValidateOnly`
- [ ] All critical fixes are applied (0 errors)
- [ ] Review and address any warnings
- [ ] Check git diff for unexpected changes

---

## 🚀 Deployment Steps

### Step 1: Apply Configuration
```powershell
cd kubernetes
kubectl apply -f namespace.yaml
kubectl apply -f secrets/database-secrets.yaml
kubectl apply -f configmaps/app-config.yaml
```

**Verify:**
```powershell
kubectl get namespace trinity-staging
kubectl get secrets -n trinity-staging
kubectl get configmap -n trinity-staging
```

### Step 2: Deploy Databases
```powershell
kubectl apply -f services/postgres/postgres-staging.yaml
kubectl apply -f services/mongo/mongo-staging.yaml
kubectl apply -f services/redis/redis-staging.yaml
kubectl apply -f services/minio-staging.yaml
```

**Wait for databases to be ready:**
```powershell
kubectl wait --for=condition=ready pod -l app=postgres-staging -n trinity-staging --timeout=300s
kubectl wait --for=condition=ready pod -l app=mongo-staging -n trinity-staging --timeout=300s
kubectl wait --for=condition=ready pod -l app=redis-staging -n trinity-staging --timeout=120s
```

**Verify:**
```powershell
kubectl get pods -n trinity-staging
kubectl get pvc -n trinity-staging
```

Expected output: All database pods in `Running` state, PVCs `Bound`

### Step 3: Deploy Application Services
```powershell
kubectl apply -f apps/django/django-staging.yaml
kubectl apply -f apps/fastapi/fastapi-staging.yaml
kubectl apply -f apps/trinity-ai/trinity-ai-staging.yaml
kubectl apply -f apps/flight/flight-staging.yaml
kubectl apply -f apps/celery/celery-staging.yaml
kubectl apply -f apps/frontend/frontend-staging.yaml
```

**Monitor deployment:**
```powershell
kubectl get pods -n trinity-staging -w
# Press Ctrl+C when all pods are Running
```

**Verify:**
```powershell
kubectl get deployments -n trinity-staging
kubectl get services -n trinity-staging
```

Expected: All deployments available, all services created

### Step 4: Deploy Networking
```powershell
kubectl apply -f networking/ingress-staging.yaml
```

**Verify:**
```powershell
kubectl get ingress -n trinity-staging
```

### Step 5: Initialize Application
```powershell
# Wait for Django pods to be fully ready
kubectl wait --for=condition=available deployment/django-staging -n trinity-staging --timeout=300s

# Run tenant creation
kubectl exec -it deployment/django-staging -n trinity-staging -- python create_tenant.py
```

**Expected output:**
- Migrations applied
- Tenant created
- Super admin user created (neo / neo_the_only_one)
- Multiple user accounts created
- Apps granted access

---

## 🧪 Post-Deployment Testing

### Test 1: Pod Health
```powershell
kubectl get pods -n trinity-staging
```

**Expected:** All pods in `Running` state, `READY` count matches

### Test 2: Database Connectivity
```powershell
# PostgreSQL
kubectl exec -it postgres-staging-0 -n trinity-staging -- psql -U trinity_user -d trinity_db -c "\dt"

# MongoDB
kubectl exec -it mongo-staging-0 -n trinity-staging -- mongosh --eval "db.adminCommand('ping')"

# Redis
kubectl exec -it deployment/redis-staging -n trinity-staging -- redis-cli ping
```

**Expected:** All commands succeed

### Test 3: Service Endpoints
```powershell
# Port forward frontend
kubectl port-forward svc/frontend-service 8082:80 -n trinity-staging
```

Open browser: http://localhost:8082

**Expected:** Frontend loads

```powershell
# Port forward Django (new terminal)
kubectl port-forward svc/django-service 8000:8000 -n trinity-staging
```

Open browser: http://localhost:8000/admin/

**Expected:** Django admin login page

```powershell
# Port forward FastAPI (new terminal)
kubectl port-forward svc/fastapi-service 8001:8001 -n trinity-staging
```

Open browser: http://localhost:8001/docs

**Expected:** FastAPI Swagger UI

### Test 4: Application Login
1. Navigate to http://localhost:8082
2. Login with:
   - Username: `neo`
   - Password: `neo_the_only_one`
3. Verify you can access the dashboard

### Test 5: Logs Review
```powershell
# Check Django logs
kubectl logs deployment/django-staging -n trinity-staging --tail=50

# Check FastAPI logs
kubectl logs deployment/fastapi-staging -n trinity-staging --tail=50

# Check for errors
kubectl get events -n trinity-staging --sort-by='.lastTimestamp' | Select-String -Pattern "Error|Failed"
```

**Expected:** No critical errors

---

## 🔍 Troubleshooting

### Pods Not Starting

**Check pod status:**
```powershell
kubectl describe pod <pod-name> -n trinity-staging
```

**Common issues:**
- Image pull errors: Images not loaded into Minikube
- Resource constraints: Not enough CPU/memory
- Config errors: Check ConfigMap/Secret references

### Database Connection Issues

**Test from Django pod:**
```powershell
kubectl exec -it deployment/django-staging -n trinity-staging -- sh
# Inside pod:
nc -zv postgres-service 5432
nc -zv mongo-service 27017
nc -zv redis-service 6379
exit
```

### Health Probe Failures

**Check probe configuration:**
```powershell
kubectl describe pod <pod-name> -n trinity-staging | Select-String -Pattern "Liveness|Readiness"
```

**View logs:**
```powershell
kubectl logs <pod-name> -n trinity-staging
kubectl logs <pod-name> -n trinity-staging --previous  # If restarting
```

### Secret Not Found Errors

**Verify secrets exist:**
```powershell
kubectl get secrets -n trinity-staging
kubectl describe secret app-secrets -n trinity-staging
kubectl describe secret trinity-staging-secrets -n trinity-staging
```

**Check secret keys:**
```powershell
kubectl get secret app-secrets -n trinity-staging -o yaml
```

---

## 📊 Monitoring Commands

### Quick Status Check
```powershell
# All resources
kubectl get all -n trinity-staging

# Pods with details
kubectl get pods -n trinity-staging -o wide

# Resource usage (requires metrics-server)
kubectl top pods -n trinity-staging
kubectl top nodes
```

### Log Monitoring
```powershell
# Follow logs
kubectl logs -f deployment/django-staging -n trinity-staging
kubectl logs -f deployment/fastapi-staging -n trinity-staging

# View all container logs
kubectl logs deployment/django-staging -n trinity-staging --all-containers=true
```

### Event Monitoring
```powershell
# Recent events
kubectl get events -n trinity-staging --sort-by='.lastTimestamp'

# Watch events
kubectl get events -n trinity-staging -w
```

---

## 🔄 Update/Restart Services

### Restart a Deployment
```powershell
kubectl rollout restart deployment/django-staging -n trinity-staging
kubectl rollout restart deployment/fastapi-staging -n trinity-staging
```

### Update Configuration
```powershell
# Edit ConfigMap
kubectl edit configmap trinity-staging-config -n trinity-staging

# Restart pods to pick up changes
kubectl rollout restart deployment/django-staging -n trinity-staging
```

### Update Images
```powershell
# Rebuild images
.\build-staging-images.ps1

# For Minikube, reload images
minikube image load trinity-staging-web:latest

# Restart deployments
kubectl rollout restart deployment/django-staging -n trinity-staging
kubectl rollout restart deployment/fastapi-staging -n trinity-staging
```

---

## 🗑️ Clean Up / Reset

### Delete Specific Deployment
```powershell
kubectl delete -f apps/django/django-staging.yaml
```

### Delete All Resources (Keep Data)
```powershell
kubectl delete deployment --all -n trinity-staging
kubectl delete service --all -n trinity-staging
# PVCs remain for data persistence
```

### Complete Clean Up (Including Data)
```powershell
kubectl delete namespace trinity-staging
# Wait 30 seconds
kubectl apply -f namespace.yaml
# Redeploy from Step 1
```

---

## 📈 Success Criteria

Deployment is successful when:

✅ All pods are in `Running` state  
✅ All PVCs are `Bound`  
✅ All services are created  
✅ Frontend is accessible via port-forward  
✅ Django admin is accessible  
✅ FastAPI docs are accessible  
✅ Can login with neo/neo_the_only_one  
✅ No critical errors in logs  
✅ Health probes are passing  
✅ Databases are accessible  

---

## 📝 Notes

- **First deployment:** Expect 5-10 minutes for all pods to be ready
- **Database initialization:** Django pod may restart 1-2 times during first startup
- **Health probes:** Allow 90 seconds for Django liveness probe
- **Storage:** PVCs persist even if pods are deleted
- **Secrets:** Keep `.secrets-reference.txt` backed up securely

---

**For detailed troubleshooting, see:**
- `START_HERE.md` - Quick reference
- `DEPLOY_STAGING.md` - Detailed deployment guide
- `KUBERNETES_ANALYSIS.md` - Architecture and issues

