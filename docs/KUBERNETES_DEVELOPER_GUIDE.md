# Kubernetes Setup & Onboarding Guide

> **Developer-focused documentation for deploying and maintaining Trinity on Kubernetes**

---

## Table of Contents

1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Cluster Setup](#cluster-setup)
4. [Namespaces & RBAC](#namespaces--rbac)
5. [Application Deployment](#application-deployment)
6. [Networking & Ingress](#networking--ingress)
7. [Observability](#observability)
8. [Security](#security)
9. [Common Commands & Troubleshooting](#common-commands--troubleshooting)
10. [Backup & Scaling](#backup--scaling)
11. [Developer Tools & Productivity](#developer-tools--productivity)
12. [Appendix](#appendix)

---

## Introduction

### Purpose
This document provides a comprehensive guide for developers to:
- Set up Kubernetes clusters for local development and production
- Deploy the Trinity application stack (FastAPI + Django + React)
- Maintain, monitor, and troubleshoot Kubernetes deployments
- Follow best practices for security, observability, and scalability

### Cluster Environments

| Environment | Purpose | Infrastructure |
|-------------|---------|----------------|
| **Development** | Local testing, rapid iteration | Docker Desktop, Minikube, or Kind |
| **Staging** | Pre-production testing, integration | Managed K8s (AKS/EKS/GKE) or kubeadm |
| **Production** | Live application | Managed K8s or kubeadm cluster |

---

## Prerequisites

### Operating System
- **Linux:** Ubuntu 20.04+ or RHEL 8+
- **macOS:** 11+ (Big Sur or newer)
- **Windows:** Windows 10/11 with WSL2

### Required Tools

| Tool | Version | Purpose | Installation |
|------|---------|---------|--------------|
| **kubectl** | 1.28+ | Kubernetes CLI | [Install Guide](https://kubernetes.io/docs/tasks/tools/) |
| **Docker** | 20.10+ | Container runtime | [Docker Desktop](https://www.docker.com/products/docker-desktop) |
| **Helm** | 3.12+ | Package manager | `curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 \| bash` |
| **kind** | 0.20+ | Local clusters | `go install sigs.k8s.io/kind@latest` |
| **minikube** | 1.31+ | Local clusters | [Install Guide](https://minikube.sigs.k8s.io/docs/start/) |

### Verify Installation

```bash
# Check versions
kubectl version --client
docker --version
helm version
kind version
minikube version

# Verify Docker is running
docker ps
```

### Access & Credentials

- **Cloud Provider Access:** AWS CLI, Azure CLI, or gcloud SDK configured
- **Container Registry:** Docker Hub, AWS ECR, or private registry credentials
- **Git Access:** SSH key or PAT for repository access

> **Note:** For production clusters, ensure you have cluster-admin or appropriate RBAC permissions.

---

## Cluster Setup

### Local Development Setup

#### Option 1: Docker Desktop Kubernetes

```bash
# Enable Kubernetes in Docker Desktop
# Settings → Kubernetes → Enable Kubernetes

# Verify cluster is running
kubectl cluster-info
kubectl get nodes
```

**Advantages:**
- Easy to set up
- Integrated with Docker Desktop
- Good for Windows/macOS

**Limitations:**
- Single-node cluster
- Limited resource control

#### Option 2: Minikube

```bash
# Start Minikube cluster
minikube start --cpus=4 --memory=8192 --disk-size=50g

# Verify cluster
kubectl get nodes
minikube status

# Enable addons
minikube addons enable ingress
minikube addons enable metrics-server
minikube addons enable dashboard

# Access dashboard
minikube dashboard
```

**Advantages:**
- Multi-driver support (Docker, VirtualBox, KVM)
- Addon ecosystem
- Closer to production setup

#### Option 3: Kind (Kubernetes in Docker)

```bash
# Create cluster with custom config
cat <<EOF | kind create cluster --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: trinity-dev
nodes:
- role: control-plane
  extraPortMappings:
  - containerPort: 30080
    hostPort: 8080
  - containerPort: 30443
    hostPort: 8443
- role: worker
- role: worker
EOF

# Verify cluster
kubectl cluster-info --context kind-trinity-dev
kubectl get nodes
```

**Advantages:**
- Fast startup
- Multi-node support
- CI/CD friendly

### Production Setup

#### Option 1: Managed Kubernetes (Recommended)

**AWS EKS:**
```bash
# Install eksctl
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin

# Create cluster
eksctl create cluster \
  --name trinity-prod \
  --region us-west-2 \
  --nodegroup-name workers \
  --node-type t3.xlarge \
  --nodes 3 \
  --nodes-min 2 \
  --nodes-max 5 \
  --managed

# Update kubeconfig
aws eks update-kubeconfig --region us-west-2 --name trinity-prod
```

**Azure AKS:**
```bash
# Create resource group
az group create --name trinity-rg --location eastus

# Create AKS cluster
az aks create \
  --resource-group trinity-rg \
  --name trinity-prod \
  --node-count 3 \
  --node-vm-size Standard_D4s_v3 \
  --enable-addons monitoring \
  --generate-ssh-keys

# Get credentials
az aks get-credentials --resource-group trinity-rg --name trinity-prod
```

**Google GKE:**
```bash
# Create cluster
gcloud container clusters create trinity-prod \
  --zone us-central1-a \
  --num-nodes 3 \
  --machine-type n1-standard-4 \
  --enable-autoscaling \
  --min-nodes 2 \
  --max-nodes 5

# Get credentials
gcloud container clusters get-credentials trinity-prod --zone us-central1-a
```

#### Option 2: Self-Managed (kubeadm)

**Master Node Setup:**

```bash
# Install kubeadm, kubelet, kubectl
sudo apt-get update
sudo apt-get install -y apt-transport-https ca-certificates curl
curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add -
echo "deb https://apt.kubernetes.io/ kubernetes-xenial main" | sudo tee /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update
sudo apt-get install -y kubelet=1.28.0-00 kubeadm=1.28.0-00 kubectl=1.28.0-00
sudo apt-mark hold kubelet kubeadm kubectl

# Initialize cluster
sudo kubeadm init \
  --pod-network-cidr=10.244.0.0/16 \
  --apiserver-advertise-address=<MASTER_IP>

# Configure kubectl
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

# Save join command (shown at end of init output)
# Example: kubeadm join 192.168.1.100:6443 --token <token> --discovery-token-ca-cert-hash sha256:<hash>
```

**Worker Node Setup:**

```bash
# Install kubeadm, kubelet (same as master)
# Then join cluster using command from master init

sudo kubeadm join <MASTER_IP>:6443 \
  --token <token> \
  --discovery-token-ca-cert-hash sha256:<hash>
```

### Install CNI Plugin

**Calico:**
```bash
kubectl apply -f https://docs.projectcalico.org/manifests/calico.yaml
```

**Flannel:**
```bash
kubectl apply -f https://github.com/flannel-io/flannel/releases/latest/download/kube-flannel.yml
```

### Install Metrics Server

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# Verify
kubectl top nodes
kubectl top pods -A
```

---

## Namespaces & RBAC

### Namespace Strategy

```bash
# Create namespaces
kubectl create namespace trinity-dev
kubectl create namespace trinity-staging
kubectl create namespace trinity-prod

# Set default namespace
kubectl config set-context --current --namespace=trinity-dev
```

**Namespace YAML:**

```yaml
# kubernetes/namespaces.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: trinity-dev
  labels:
    environment: development
    team: engineering
---
apiVersion: v1
kind: Namespace
metadata:
  name: trinity-staging
  labels:
    environment: staging
    team: engineering
---
apiVersion: v1
kind: Namespace
metadata:
  name: trinity-prod
  labels:
    environment: production
    team: engineering
```

### RBAC Configuration

**ServiceAccount for CI/CD:**

```yaml
# kubernetes/rbac/ci-serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ci-deployer
  namespace: trinity-staging
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: deployer
  namespace: trinity-staging
rules:
- apiGroups: ["apps", ""]
  resources: ["deployments", "services", "configmaps", "secrets"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
- apiGroups: [""]
  resources: ["pods", "pods/log"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ci-deployer-binding
  namespace: trinity-staging
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: deployer
subjects:
- kind: ServiceAccount
  name: ci-deployer
  namespace: trinity-staging
```

**Developer Read-Only Access:**

```yaml
# kubernetes/rbac/developer-readonly.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: developer-readonly
  namespace: trinity-dev
rules:
- apiGroups: ["", "apps", "batch"]
  resources: ["*"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["pods/log", "pods/exec"]
  verbs: ["get", "create"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: developers
  namespace: trinity-dev
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: developer-readonly
subjects:
- kind: Group
  name: developers
  apiGroup: rbac.authorization.k8s.io
```

### Apply RBAC

```bash
kubectl apply -f kubernetes/rbac/
```

---

## Application Deployment

### Folder Structure

```
kubernetes/
├── base/                           # Base configurations
│   ├── namespace.yaml
│   ├── configmaps/
│   │   └── app-config.yaml
│   ├── secrets/
│   │   └── database-secrets.yaml
│   └── storage/
│       ├── storage-class.yaml
│       └── pvcs.yaml
├── apps/                           # Application workloads
│   ├── django/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   ├── fastapi/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   ├── frontend/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   └── celery/
│       └── deployment.yaml
├── services/                       # Infrastructure services
│   ├── postgres/
│   │   ├── statefulset.yaml
│   │   └── service.yaml
│   ├── redis/
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   └── mongodb/
│       ├── statefulset.yaml
│       └── service.yaml
├── networking/
│   └── ingress.yaml
├── rbac/
│   ├── serviceaccounts.yaml
│   └── roles.yaml
└── overlays/                       # Environment-specific
    ├── dev/
    │   └── kustomization.yaml
    ├── staging/
    │   └── kustomization.yaml
    └── prod/
        └── kustomization.yaml
```

### ConfigMap Example

```yaml
# kubernetes/base/configmaps/app-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: trinity-config
  namespace: <your-namespace>
data:
  # Database
  POSTGRES_HOST: "postgres-service"
  POSTGRES_PORT: "5432"
  POSTGRES_DB: "trinity_db"
  
  # Redis
  REDIS_HOST: "redis-service"
  REDIS_PORT: "6379"
  REDIS_URL: "redis://redis-service:6379/0"
  
  # MongoDB
  MONGO_HOST: "mongo-service"
  MONGO_PORT: "27017"
  
  # Application
  ENVIRONMENT: "staging"
  LOG_LEVEL: "INFO"
  FRONTEND_PORT: "8085"
```

### Secret Management

```bash
# Create secret from literal values
kubectl create secret generic database-secrets \
  --from-literal=postgres-password='<password>' \
  --from-literal=django-secret-key='<secret-key>' \
  --namespace=<your-namespace>

# Create secret from file
kubectl create secret generic tls-cert \
  --from-file=tls.crt=./cert.pem \
  --from-file=tls.key=./key.pem \
  --namespace=<your-namespace>

# Create secret from YAML (base64 encoded)
echo -n 'mypassword' | base64  # Output: bXlwYXNzd29yZA==
```

**Secret YAML:**

```yaml
# kubernetes/base/secrets/database-secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: database-secrets
  namespace: <your-namespace>
type: Opaque
data:
  postgres-password: <base64-encoded-password>
  django-secret-key: <base64-encoded-key>
  minio-access-key: <base64-encoded-key>
  minio-secret-key: <base64-encoded-secret>
```

### Deployment Example

```yaml
# kubernetes/apps/django/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: django
  namespace: <your-namespace>
  labels:
    app: django
    tier: backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: django
  template:
    metadata:
      labels:
        app: django
        tier: backend
    spec:
      containers:
      - name: django
        image: <your-registry>/trinity-django:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 8000
          name: http
        env:
        # From ConfigMap
        - name: POSTGRES_HOST
          valueFrom:
            configMapKeyRef:
              name: trinity-config
              key: POSTGRES_HOST
        - name: POSTGRES_DB
          valueFrom:
            configMapKeyRef:
              name: trinity-config
              key: POSTGRES_DB
        # From Secret
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: database-secrets
              key: postgres-password
        - name: DJANGO_SECRET_KEY
          valueFrom:
            secretKeyRef:
              name: database-secrets
              key: django-secret-key
        resources:
          requests:
            memory: "768Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          tcpSocket:
            port: 8000
          initialDelaySeconds: 60
          periodSeconds: 20
        readinessProbe:
          tcpSocket:
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        volumeMounts:
        - name: static-files
          mountPath: /code/staticfiles
      volumes:
      - name: static-files
        emptyDir: {}
```

### Service Example

```yaml
# kubernetes/apps/django/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: django-service
  namespace: <your-namespace>
  labels:
    app: django
spec:
  type: ClusterIP
  selector:
    app: django
  ports:
  - port: 8000
    targetPort: 8000
    protocol: TCP
    name: http
```

### StatefulSet Example (PostgreSQL)

```yaml
# kubernetes/services/postgres/statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: <your-namespace>
spec:
  serviceName: postgres-service
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        ports:
        - containerPort: 5432
          name: postgres
        env:
        - name: POSTGRES_DB
          valueFrom:
            configMapKeyRef:
              name: trinity-config
              key: POSTGRES_DB
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: database-secrets
              key: postgres-password
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
  volumeClaimTemplates:
  - metadata:
      name: postgres-storage
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: standard
      resources:
        requests:
          storage: 20Gi
```

### Deployment Commands

```bash
# Apply all configurations
kubectl apply -f kubernetes/base/
kubectl apply -f kubernetes/services/
kubectl apply -f kubernetes/apps/
kubectl apply -f kubernetes/networking/

# Or use kustomize for environment-specific deployment
kubectl apply -k kubernetes/overlays/staging/

# Verify deployments
kubectl get deployments -n <your-namespace>
kubectl get pods -n <your-namespace>
kubectl get services -n <your-namespace>

# Watch deployment progress
kubectl rollout status deployment/django -n <your-namespace>

# Scale deployment
kubectl scale deployment django --replicas=3 -n <your-namespace>

# Update image
kubectl set image deployment/django django=<your-registry>/trinity-django:v2 -n <your-namespace>

# Rollback deployment
kubectl rollout undo deployment/django -n <your-namespace>
```

---

## Networking & Ingress

### CNI Plugin Details

**Calico Features:**
- Network policies
- BGP routing
- IP-in-IP or VXLAN encapsulation
- Enterprise-grade security

**Flannel Features:**
- Simple overlay network
- VXLAN backend
- Lightweight and easy to configure

### Install NGINX Ingress Controller

```bash
# Using Helm
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm install nginx-ingress ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.type=LoadBalancer \
  --set controller.metrics.enabled=true

# Verify installation
kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx
```

### Ingress Example

```yaml
# kubernetes/networking/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: trinity-ingress
  namespace: <your-namespace>
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - trinity.example.com
    - api.trinity.example.com
    secretName: trinity-tls
  rules:
  # Frontend
  - host: trinity.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend-service
            port:
              number: 80
  # Django API
  - host: api.trinity.example.com
    http:
      paths:
      - path: /admin
        pathType: Prefix
        backend:
          service:
            name: django-service
            port:
              number: 8000
      # FastAPI
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: fastapi-service
            port:
              number: 8001
```

### NodePort Example (For Development)

```yaml
# kubernetes/networking/nodeport.yaml
apiVersion: v1
kind: Service
metadata:
  name: trinity-nodeport
  namespace: <your-namespace>
spec:
  type: NodePort
  selector:
    app: frontend
  ports:
  - port: 8085
    targetPort: 80
    nodePort: 30085
    protocol: TCP
```

### Network Policy Example

```yaml
# kubernetes/networking/network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: django-network-policy
  namespace: <your-namespace>
spec:
  podSelector:
    matchLabels:
      app: django
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    - podSelector:
        matchLabels:
          app: nginx-ingress
    ports:
    - protocol: TCP
      port: 8000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - protocol: TCP
      port: 6379
```

---

## Observability

### Monitoring Stack (Prometheus + Grafana)

**Install using Helm:**

```bash
# Add Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install Prometheus + Grafana stack
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.retention=30d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=50Gi \
  --set grafana.adminPassword=admin123

# Port-forward Grafana
kubectl port-forward -n monitoring svc/monitoring-grafana 3000:80

# Access Grafana: http://localhost:3000
# Default: admin / admin123
```

**ServiceMonitor for Application Metrics:**

```yaml
# kubernetes/monitoring/servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: django-metrics
  namespace: <your-namespace>
  labels:
    release: monitoring
spec:
  selector:
    matchLabels:
      app: django
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
```

### Logging Stack (ELK or Loki)

**Install Loki with Helm:**

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm install loki grafana/loki-stack \
  --namespace logging \
  --create-namespace \
  --set promtail.enabled=true \
  --set grafana.enabled=true

# Port-forward Grafana
kubectl port-forward -n logging svc/loki-grafana 3000:80
```

**Fluentd DaemonSet:**

```yaml
# kubernetes/logging/fluentd.yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
  namespace: logging
spec:
  selector:
    matchLabels:
      app: fluentd
  template:
    metadata:
      labels:
        app: fluentd
    spec:
      serviceAccountName: fluentd
      containers:
      - name: fluentd
        image: fluent/fluentd-kubernetes-daemonset:v1-debian-elasticsearch
        env:
        - name: FLUENT_ELASTICSEARCH_HOST
          value: "elasticsearch.logging.svc.cluster.local"
        - name: FLUENT_ELASTICSEARCH_PORT
          value: "9200"
        volumeMounts:
        - name: varlog
          mountPath: /var/log
        - name: varlibdockercontainers
          mountPath: /var/lib/docker/containers
          readOnly: true
      volumes:
      - name: varlog
        hostPath:
          path: /var/log
      - name: varlibdockercontainers
        hostPath:
          path: /var/lib/docker/containers
```

### Health Checks

**Liveness Probe:**
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8000
  initialDelaySeconds: 60
  periodSeconds: 20
  timeoutSeconds: 5
  failureThreshold: 3
```

**Readiness Probe:**
```yaml
readinessProbe:
  httpGet:
    path: /ready
    port: 8000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 3
```

**TCP Socket Check:**
```yaml
livenessProbe:
  tcpSocket:
    port: 8000
  initialDelaySeconds: 60
  periodSeconds: 20
```

**Exec Command Check:**
```yaml
livenessProbe:
  exec:
    command:
    - /bin/sh
    - -c
    - pg_isready -U postgres
  initialDelaySeconds: 30
  periodSeconds: 10
```

---

## Security

### RBAC Best Practices

1. **Principle of Least Privilege:** Grant minimum required permissions
2. **Use ServiceAccounts:** Never use default service account for applications
3. **Namespace Isolation:** Separate environments using namespaces
4. **Audit Logging:** Enable API server audit logs

```bash
# Create service account
kubectl create serviceaccount app-sa -n <your-namespace>

# Create limited role
kubectl create role pod-reader \
  --verb=get,list,watch \
  --resource=pods \
  -n <your-namespace>

# Bind role to service account
kubectl create rolebinding app-sa-binding \
  --role=pod-reader \
  --serviceaccount=<your-namespace>:app-sa \
  -n <your-namespace>
```

### Network Policies

```yaml
# kubernetes/security/network-policy-default-deny.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: <your-namespace>
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
```

### Secret Management with Sealed Secrets

```bash
# Install Sealed Secrets controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/controller.yaml

# Install kubeseal CLI
wget https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.24.0/kubeseal-linux-amd64 -O kubeseal
sudo install -m 755 kubeseal /usr/local/bin/kubeseal

# Create sealed secret
echo -n 'mypassword' | kubectl create secret generic mysecret --dry-run=client --from-file=password=/dev/stdin -o yaml | \
  kubeseal -o yaml > mysealedsecret.yaml

# Apply sealed secret
kubectl apply -f mysealedsecret.yaml
```

### Pod Security Standards

```yaml
# kubernetes/security/psp.yaml
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: restricted
spec:
  privileged: false
  allowPrivilegeEscalation: false
  requiredDropCapabilities:
  - ALL
  volumes:
  - 'configMap'
  - 'emptyDir'
  - 'projected'
  - 'secret'
  - 'persistentVolumeClaim'
  hostNetwork: false
  hostIPC: false
  hostPID: false
  runAsUser:
    rule: 'MustRunAsNonRoot'
  seLinux:
    rule: 'RunAsAny'
  fsGroup:
    rule: 'RunAsAny'
  readOnlyRootFilesystem: false
```

### Image Registry Best Practices

1. **Use Private Registry:** Push images to private registry (ECR, ACR, GCR, Harbor)
2. **Image Scanning:** Scan for vulnerabilities (Trivy, Clair)
3. **Image Pull Secrets:** Use imagePullSecrets for authentication
4. **Image Tags:** Use semantic versioning, avoid `latest` in production

```bash
# Create docker-registry secret
kubectl create secret docker-registry regcred \
  --docker-server=<registry-url> \
  --docker-username=<username> \
  --docker-password=<password> \
  --docker-email=<email> \
  -n <your-namespace>
```

**Use in Deployment:**
```yaml
spec:
  template:
    spec:
      imagePullSecrets:
      - name: regcred
      containers:
      - name: app
        image: <private-registry>/app:v1.0.0
```

---

## Common Commands & Troubleshooting

### Frequently Used kubectl Commands

**Cluster & Context:**
```bash
# View cluster info
kubectl cluster-info

# List contexts
kubectl config get-contexts

# Switch context
kubectl config use-context <context-name>

# Set default namespace
kubectl config set-context --current --namespace=<namespace>
```

**Resources:**
```bash
# Get resources
kubectl get pods -n <namespace>
kubectl get deployments -n <namespace>
kubectl get services -n <namespace>
kubectl get all -n <namespace>

# Wide output
kubectl get pods -o wide -n <namespace>

# Watch resources
kubectl get pods -w -n <namespace>

# Get YAML
kubectl get pod <pod-name> -o yaml -n <namespace>

# Get JSON with jq
kubectl get pods -o json -n <namespace> | jq '.items[].metadata.name'
```

**Describe & Logs:**
```bash
# Describe resource
kubectl describe pod <pod-name> -n <namespace>
kubectl describe node <node-name>

# View logs
kubectl logs <pod-name> -n <namespace>
kubectl logs <pod-name> -c <container-name> -n <namespace>
kubectl logs -f <pod-name> -n <namespace>  # Follow logs
kubectl logs --tail=100 <pod-name> -n <namespace>

# Previous container logs (after crash)
kubectl logs <pod-name> --previous -n <namespace>
```

**Execute Commands:**
```bash
# Exec into pod
kubectl exec -it <pod-name> -n <namespace> -- /bin/bash

# Run command
kubectl exec <pod-name> -n <namespace> -- ls -la

# Copy files
kubectl cp <pod-name>:/path/to/file ./local-file -n <namespace>
kubectl cp ./local-file <pod-name>:/path/to/file -n <namespace>
```

**Port Forwarding:**
```bash
# Forward local port to pod
kubectl port-forward <pod-name> 8080:8000 -n <namespace>

# Forward to service
kubectl port-forward svc/<service-name> 8080:80 -n <namespace>
```

**Edit & Patch:**
```bash
# Edit resource
kubectl edit deployment <deployment-name> -n <namespace>

# Patch resource
kubectl patch deployment <deployment-name> \
  -p '{"spec":{"replicas":3}}' \
  -n <namespace>

# Scale
kubectl scale deployment <deployment-name> --replicas=5 -n <namespace>
```

**Delete:**
```bash
# Delete resource
kubectl delete pod <pod-name> -n <namespace>
kubectl delete deployment <deployment-name> -n <namespace>

# Force delete stuck pod
kubectl delete pod <pod-name> --grace-period=0 --force -n <namespace>

# Delete all in namespace
kubectl delete all --all -n <namespace>
```

### Troubleshooting Common Issues

#### CrashLoopBackOff

**Cause:** Container starts but crashes repeatedly

**Debugging:**
```bash
# Check logs
kubectl logs <pod-name> --previous -n <namespace>

# Describe pod
kubectl describe pod <pod-name> -n <namespace>

# Check events
kubectl get events --sort-by='.lastTimestamp' -n <namespace>

# Common fixes:
# - Fix application errors
# - Check environment variables
# - Verify config/secrets exist
# - Check resource limits
```

#### ImagePullBackOff

**Cause:** Cannot pull container image

**Debugging:**
```bash
# Describe pod
kubectl describe pod <pod-name> -n <namespace>

# Common fixes:
# - Verify image exists: docker pull <image>
# - Check imagePullSecrets configured
# - Verify registry credentials
# - Check image name/tag typo
# - Ensure network access to registry
```

#### Pending

**Cause:** Pod cannot be scheduled

**Debugging:**
```bash
# Describe pod
kubectl describe pod <pod-name> -n <namespace>

# Check node resources
kubectl top nodes
kubectl describe nodes

# Common causes:
# - Insufficient resources (CPU/memory)
# - No nodes match node selector
# - Taints and tolerations
# - PVC cannot be bound
```

#### OOMKilled

**Cause:** Container exceeded memory limit

**Debugging:**
```bash
# Check resource limits
kubectl describe pod <pod-name> -n <namespace>

# View metrics
kubectl top pod <pod-name> -n <namespace>

# Fix: Increase memory limits in deployment
```

#### Not Ready

**Cause:** Readiness probe failing

**Debugging:**
```bash
# Check readiness probe
kubectl describe pod <pod-name> -n <namespace>

# Test endpoint manually
kubectl exec <pod-name> -n <namespace> -- curl http://localhost:8000/ready

# Common fixes:
# - Fix application readiness endpoint
# - Adjust probe timing
# - Check dependencies (database connectivity)
```

---

## Backup & Scaling

### Backup Strategies

#### etcd Backup (Self-Managed Clusters)

```bash
# Backup etcd
ETCDCTL_API=3 etcdctl snapshot save /backup/etcd-snapshot-$(date +%Y%m%d-%H%M%S).db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key

# Verify snapshot
ETCDCTL_API=3 etcdctl snapshot status /backup/etcd-snapshot.db

# Restore etcd
ETCDCTL_API=3 etcdctl snapshot restore /backup/etcd-snapshot.db \
  --data-dir=/var/lib/etcd-restore
```

#### Velero (Cluster Backup Tool)

```bash
# Install Velero
wget https://github.com/vmware-tanzu/velero/releases/download/v1.12.0/velero-v1.12.0-linux-amd64.tar.gz
tar -xvf velero-v1.12.0-linux-amd64.tar.gz
sudo mv velero-v1.12.0-linux-amd64/velero /usr/local/bin/

# Install Velero in cluster (AWS example)
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.8.0 \
  --bucket velero-backups \
  --backup-location-config region=us-west-2 \
  --snapshot-location-config region=us-west-2 \
  --secret-file ./credentials-velero

# Create backup
velero backup create trinity-backup --include-namespaces trinity-prod

# Schedule daily backups
velero schedule create trinity-daily --schedule="0 1 * * *" --include-namespaces trinity-prod

# Restore from backup
velero restore create --from-backup trinity-backup
```

#### Database Backups

```bash
# PostgreSQL backup job
kubectl create job postgres-backup-$(date +%Y%m%d) \
  --from=cronjob/postgres-backup -n <namespace>

# Manual PostgreSQL backup
kubectl exec postgres-0 -n <namespace> -- \
  pg_dump -U postgres trinity_db > backup.sql
```

**PostgreSQL Backup CronJob:**

```yaml
# kubernetes/backup/postgres-backup-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
  namespace: <your-namespace>
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:15-alpine
            command:
            - /bin/sh
            - -c
            - |
              pg_dump -h postgres-service -U postgres trinity_db | \
              gzip > /backup/trinity-$(date +\%Y\%m\%d-\%H\%M\%S).sql.gz
            env:
            - name: PGPASSWORD
              valueFrom:
                secretKeyRef:
                  name: database-secrets
                  key: postgres-password
            volumeMounts:
            - name: backup
              mountPath: /backup
          volumes:
          - name: backup
            persistentVolumeClaim:
              claimName: backup-pvc
          restartPolicy: OnFailure
```

### Horizontal Pod Autoscaler (HPA)

```yaml
# kubernetes/autoscaling/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: django-hpa
  namespace: <your-namespace>
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: django
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
      - type: Pods
        value: 2
        periodSeconds: 15
      selectPolicy: Max
```

**Apply and Monitor HPA:**

```bash
# Apply HPA
kubectl apply -f kubernetes/autoscaling/hpa.yaml

# View HPA status
kubectl get hpa -n <namespace>

# Describe HPA
kubectl describe hpa django-hpa -n <namespace>

# Watch HPA
watch kubectl get hpa -n <namespace>
```

### Vertical Pod Autoscaler (VPA)

```bash
# Install VPA
git clone https://github.com/kubernetes/autoscaler.git
cd autoscaler/vertical-pod-autoscaler
./hack/vpa-up.sh
```

```yaml
# kubernetes/autoscaling/vpa.yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: django-vpa
  namespace: <your-namespace>
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: django
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
    - containerName: django
      minAllowed:
        cpu: 100m
        memory: 256Mi
      maxAllowed:
        cpu: 4
        memory: 8Gi
```

### Persistent Storage

**PersistentVolumeClaim Example:**

```yaml
# kubernetes/storage/postgres-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: <your-namespace>
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: standard  # or gp2, ssd, etc.
  resources:
    requests:
      storage: 20Gi
```

**StorageClass Example:**

```yaml
# kubernetes/storage/storage-class.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: kubernetes.io/aws-ebs  # or azure-disk, gce-pd
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer
```

---

## Developer Tools & Productivity

### k9s - Terminal UI

```bash
# Install k9s
brew install derailed/k9s/k9s  # macOS
# or
curl -sS https://webinstall.dev/k9s | bash  # Linux

# Launch k9s
k9s

# Keyboard shortcuts:
# :pod - view pods
# :svc - view services
# :deploy - view deployments
# / - filter
# d - describe
# l - logs
# e - edit
# s - shell
# Ctrl-d - delete
```

### kubectx & kubens

```bash
# Install kubectx and kubens
brew install kubectx  # macOS
# or
sudo git clone https://github.com/ahmetb/kubectx /opt/kubectx
sudo ln -s /opt/kubectx/kubectx /usr/local/bin/kubectx
sudo ln -s /opt/kubectx/kubens /usr/local/bin/kubens

# Switch context
kubectx <context-name>
kubectx -  # Switch to previous context

# Switch namespace
kubens <namespace>
kubens -  # Switch to previous namespace
```

### Kubectl Aliases

```bash
# Add to ~/.bashrc or ~/.zshrc
alias k='kubectl'
alias kg='kubectl get'
alias kd='kubectl describe'
alias kdel='kubectl delete'
alias kl='kubectl logs'
alias kex='kubectl exec -it'
alias kap='kubectl apply -f'
alias kgp='kubectl get pods'
alias kgs='kubectl get svc'
alias kgd='kubectl get deployments'
alias kgn='kubectl get nodes'
alias kpf='kubectl port-forward'
alias kctx='kubectx'
alias kns='kubens'

# Reload shell
source ~/.bashrc  # or source ~/.zshrc
```

### Stern - Multi-Pod Log Tailing

```bash
# Install stern
brew install stern  # macOS
# or
wget https://github.com/stern/stern/releases/download/v1.26.0/stern_1.26.0_linux_amd64.tar.gz
tar -xvf stern_1.26.0_linux_amd64.tar.gz
sudo mv stern /usr/local/bin/

# Tail logs from all django pods
stern django -n <namespace>

# Tail logs with label selector
stern -l app=django -n <namespace>

# Tail logs with exclude
stern django --exclude "healthcheck" -n <namespace>
```

### Tilt - Local Development

```python
# Tiltfile
# -*- mode: Python -*-

# Build Docker images
docker_build('trinity-django', './TrinityBackendDjango')
docker_build('trinity-fastapi', './TrinityBackendFastAPI')
docker_build('trinity-frontend', './TrinityFrontend')

# Deploy to Kubernetes
k8s_yaml('kubernetes/apps/django/deployment.yaml')
k8s_yaml('kubernetes/apps/fastapi/deployment.yaml')
k8s_yaml('kubernetes/apps/frontend/deployment.yaml')

# Port forwards
k8s_resource('django', port_forwards='8000:8000')
k8s_resource('fastapi', port_forwards='8001:8001')
k8s_resource('frontend', port_forwards='8080:80')

# Live reload
watch_file('./TrinityBackendDjango')
watch_file('./TrinityBackendFastAPI')
```

```bash
# Run Tilt
tilt up

# Access Tilt UI
# Open http://localhost:10350
```

### Skaffold - CI/CD Development

```yaml
# skaffold.yaml
apiVersion: skaffold/v4beta6
kind: Config
metadata:
  name: trinity
build:
  artifacts:
  - image: trinity-django
    context: ./TrinityBackendDjango
    docker:
      dockerfile: Dockerfile
  - image: trinity-fastapi
    context: ./TrinityBackendFastAPI
  - image: trinity-frontend
    context: ./TrinityFrontend
deploy:
  kubectl:
    manifests:
    - kubernetes/apps/*/deployment.yaml
    - kubernetes/apps/*/service.yaml
portForward:
- resourceType: service
  resourceName: frontend-service
  port: 80
  localPort: 8080
```

```bash
# Install Skaffold
curl -Lo skaffold https://storage.googleapis.com/skaffold/releases/latest/skaffold-linux-amd64
sudo install skaffold /usr/local/bin/

# Run Skaffold dev (with live reload)
skaffold dev

# Run Skaffold build & deploy
skaffold run
```

---

## Appendix

### Cluster Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Trinity Kubernetes                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐        ┌──────────────┐                       │
│  │   Ingress    │        │   NodePort   │                       │
│  │  Controller  │◄───────┤   (30085)    │                       │
│  └──────┬───────┘        └──────────────┘                       │
│         │                                                         │
│         ▼                                                         │
│  ┌─────────────────────────────────────────────┐                │
│  │           Frontend Service (80)              │                │
│  └──────────────────┬──────────────────────────┘                │
│                     ▼                                             │
│  ┌─────────────────────────────────────────────┐                │
│  │        Frontend Pods (React + Nginx)        │                │
│  │      Reverse Proxy: /admin/api → Django    │                │
│  │                     /api → FastAPI          │                │
│  └─────────────────────────────────────────────┘                │
│           │                          │                           │
│           ▼                          ▼                           │
│  ┌─────────────────┐       ┌─────────────────┐                 │
│  │ Django Service  │       │ FastAPI Service │                 │
│  │     (8000)      │       │     (8001)      │                 │
│  └────────┬────────┘       └────────┬────────┘                 │
│           ▼                         ▼                            │
│  ┌─────────────────┐       ┌─────────────────┐                 │
│  │   Django Pods   │       │  FastAPI Pods   │                 │
│  │   (2 replicas)  │       │   (2 replicas)  │                 │
│  └────────┬────────┘       └────────┬────────┘                 │
│           │                         │                            │
│           ▼                         ▼                            │
│  ┌──────────────────────────────────────────┐                  │
│  │           Infrastructure Services          │                  │
│  ├──────────────────────────────────────────┤                  │
│  │  PostgreSQL (StatefulSet, 20Gi)          │                  │
│  │  MongoDB (StatefulSet, 20Gi)             │                  │
│  │  Redis (Deployment, 5Gi)                 │                  │
│  │  MinIO (Deployment, 50Gi)                │                  │
│  │  Flight Server (Deployment)              │                  │
│  │  Celery Workers (Deployment)             │                  │
│  └──────────────────────────────────────────┘                  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Sample Folder Structure

```
TrinityFastAPIDjangoReact/
├── README.md
├── KUBERNETES_DEVELOPER_GUIDE.md
├── docker-compose-staging.yml
├── build-staging-images.ps1
│
├── TrinityBackendDjango/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── manage.py
│   ├── create_tenant.py
│   └── grant_app_access.py
│
├── TrinityBackendFastAPI/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│
├── TrinityFrontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── src/
│
└── kubernetes/
    ├── namespace.yaml
    ├── base/
    │   ├── configmaps/
    │   │   └── app-config.yaml
    │   ├── secrets/
    │   │   └── database-secrets.yaml
    │   └── storage/
    │       ├── storage-class.yaml
    │       └── pvcs.yaml
    ├── apps/
    │   ├── django/
    │   │   ├── deployment.yaml
    │   │   └── service.yaml
    │   ├── fastapi/
    │   │   ├── deployment.yaml
    │   │   └── service.yaml
    │   ├── frontend/
    │   │   ├── deployment.yaml
    │   │   └── service.yaml
    │   └── celery/
    │       └── deployment.yaml
    ├── services/
    │   ├── postgres/
    │   │   ├── statefulset.yaml
    │   │   └── service.yaml
    │   ├── redis/
    │   │   ├── deployment.yaml
    │   │   └── service.yaml
    │   └── mongodb/
    │       ├── statefulset.yaml
    │       └── service.yaml
    ├── networking/
    │   ├── ingress-staging.yaml
    │   └── ingress-production.yaml
    ├── rbac/
    │   ├── serviceaccounts.yaml
    │   └── roles.yaml
    ├── monitoring/
    │   └── servicemonitor.yaml
    ├── backup/
    │   └── postgres-backup-cronjob.yaml
    ├── autoscaling/
    │   ├── hpa.yaml
    │   └── vpa.yaml
    ├── scripts/
    │   ├── QUICK_DEPLOY.ps1
    │   ├── run-tenant-init.ps1
    │   ├── generate-secrets.ps1
    │   └── check-prerequisites.ps1
    └── overlays/
        ├── dev/
        │   └── kustomization.yaml
        ├── staging/
        │   └── kustomization.yaml
        └── prod/
            └── kustomization.yaml
```

### Version References

| Component | Version | Notes |
|-----------|---------|-------|
| Kubernetes | 1.28+ | Tested on 1.28.x |
| Docker | 20.10+ | Container runtime |
| kubectl | 1.28+ | Match cluster version |
| Helm | 3.12+ | Package manager |
| Python | 3.11+ | Django/FastAPI runtime |
| Node.js | 18+ | React frontend build |
| PostgreSQL | 15 | Multi-tenant database |
| Redis | 7-alpine | Cache & queue |
| MongoDB | 6 | Document store |
| MinIO | RELEASE.2024-01-01 | Object storage |
| Nginx | 1.25-alpine | Frontend proxy |

### Upgrade Notes

**Kubernetes Upgrade:**
```bash
# Check current version
kubectl version

# Upgrade kubeadm (Ubuntu)
sudo apt-get update
sudo apt-get install -y kubeadm=1.29.0-00

# Upgrade control plane
sudo kubeadm upgrade plan
sudo kubeadm upgrade apply v1.29.0

# Upgrade kubelet
sudo apt-get install -y kubelet=1.29.0-00
sudo systemctl daemon-reload
sudo systemctl restart kubelet

# Upgrade worker nodes (one at a time)
kubectl drain <node-name> --ignore-daemonsets
# SSH to node and upgrade
kubectl uncordon <node-name>
```

**Application Upgrade:**
```bash
# Build new images
./build-staging-images.ps1

# Tag with version
docker tag trinity-django:latest trinity-django:v2.0.0
docker push trinity-django:v2.0.0

# Update deployment
kubectl set image deployment/django \
  django=<registry>/trinity-django:v2.0.0 \
  -n <namespace>

# Monitor rollout
kubectl rollout status deployment/django -n <namespace>

# Rollback if needed
kubectl rollout undo deployment/django -n <namespace>
```

---

## Quick Reference Card

### Essential Commands

```bash
# Context & Namespace
kubectx <context>          # Switch context
kubens <namespace>         # Switch namespace

# Get Resources
k get pods                 # List pods
k get svc                  # List services
k get deploy               # List deployments

# Logs & Debug
k logs -f <pod>            # Follow logs
k logs <pod> --previous    # Previous container logs
stern <app-name>           # Multi-pod logs

# Exec & Port-Forward
k exec -it <pod> -- bash   # Shell into pod
k port-forward svc/<svc> 8080:80  # Port forward

# Apply & Delete
k apply -f <file>          # Apply manifest
k delete -f <file>         # Delete resources

# Scale & Restart
k scale deploy <name> --replicas=3  # Scale
k rollout restart deploy <name>     # Restart
```

### Troubleshooting Quick Checks

```bash
# 1. Check pod status
k get pods

# 2. Describe failing pod
k describe pod <pod-name>

# 3. Check logs
k logs <pod-name>

# 4. Check events
k get events --sort-by='.lastTimestamp'

# 5. Check node resources
k top nodes
k top pods

# 6. Test connectivity
k run test --rm -it --image=busybox -- wget -O- http://<service>
```

---

## Support & Resources

### Official Documentation
- [Kubernetes Docs](https://kubernetes.io/docs/)
- [Kubectl Reference](https://kubernetes.io/docs/reference/kubectl/)
- [Helm Documentation](https://helm.sh/docs/)

### Community
- [Kubernetes Slack](https://slack.k8s.io/)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/kubernetes)
- [GitHub Issues](https://github.com/kubernetes/kubernetes/issues)

### Learning Resources
- [Kubernetes the Hard Way](https://github.com/kelseyhightower/kubernetes-the-hard-way)
- [Play with Kubernetes](https://labs.play-with-k8s.com/)
- [KataCoda Kubernetes](https://www.katacoda.com/courses/kubernetes)

---

**Document Version:** 1.0  
**Last Updated:** October 30, 2025  
**Maintained by:** DevOps Team

---

> **Note:** This guide is a living document. Please submit updates via pull request or contact the DevOps team.

