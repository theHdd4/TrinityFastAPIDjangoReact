# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Trinity is a multi-service AI-powered data analysis platform combining FastAPI, Django, and React frontend with AI agents for natural language data processing. The architecture supports multiple backends, AI agents, and microservices for data manipulation operations.

## Development Commands

### Frontend (React/TypeScript)
```bash
# Navigate to frontend directory
cd TrinityFrontend

# Install dependencies (using bun)
bun install

# Development server
npm run dev
# Alias: bun run dev

# Build for production  
npm run build

# Build for development
npm run build:dev

# Linting
npm run lint

# Preview production build
npm run preview
```

### Backend Services

#### TrinityAI (AI Agents - FastAPI)
```bash
# Navigate to AI directory
cd TrinityAI

# Install Python dependencies
pip install -r requirements.txt

# Run main AI service (port 8002)
python main_api.py

# Run individual agent tests
python -m pytest test_endpoints.py -v
python -m pytest Agent_Merge/test_merge_agent.py -v
python -m pytest Agent_concat/test_concat.py -v

# Test specific chart maker integration
python test_chart_maker_integration.py
```

#### TrinityBackendDjango (Main Backend)
```bash
# Navigate to Django backend
cd TrinityBackendDjango

# Install dependencies
pip install -r requirements.txt

# Database migrations
python manage.py makemigrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Run development server (port 8000)
python manage.py runserver

# Run tests
python manage.py test
python -m pytest tests/ -v

# Create tenant
python create_tenant.py
```

#### TrinityBackendFastAPI (Data Processing)
```bash
# Navigate to FastAPI backend
cd TrinityBackendFastAPI

# Install dependencies  
pip install -r requirements.txt

# Run working backend (port 8004)
python working_backend.py

# Run minimal backend
python minimal_backend.py

# Run tests
python -m pytest tests/ -v

# Run specific tests
python -m pytest tests/test_arrow_flight.py -v
python -m pytest tests/test_chart_maker.py -v
```

### Docker Development

```bash
# Build and run development environment
docker-compose -f docker-compose-dev.example.yml up --build

# Build and run production environment  
docker-compose -f docker-compose.example.yml up --build

# Run specific service
docker-compose up web
docker-compose up fastapi
docker-compose up trinity-ai

# View logs for specific service
docker-compose logs -f trinity-ai
docker-compose logs -f web

# Rebuild specific service
docker-compose build trinity-ai
docker-compose up -d trinity-ai
```

### Kubernetes Development (Recommended)

```powershell
# Build Trinity images for Kubernetes
.\deploy-trinity.ps1 -Action build-images

# Deploy Trinity to Kubernetes
.\deploy-trinity.ps1 -Action install

# Check deployment status
.\deploy-trinity.ps1 -Action status

# Upgrade deployment after changes
.\deploy-trinity.ps1 -Action upgrade

# Access services (NodePort)
# Frontend: http://localhost:30080
# Django: http://localhost:30000
# FastAPI: http://localhost:30001
# Trinity AI: http://localhost:30002

# Uninstall Trinity
.\deploy-trinity.ps1 -Action uninstall

# Manual Helm commands
helm install trinity ./helm-chart --namespace trinity --create-namespace
helm upgrade trinity ./helm-chart --namespace trinity
helm uninstall trinity --namespace trinity

# Kubernetes troubleshooting
kubectl get pods -n trinity
kubectl logs -f deployment/web -n trinity
kubectl describe pod <pod-name> -n trinity
```

## Architecture Overview

### Service Architecture
- **Frontend (TrinityFrontend)**: React/TypeScript with Vite, shadcn-ui, and Tailwind CSS
- **Django Backend (TrinityBackendDjango)**: Main orchestration, user management, multi-tenancy
- **FastAPI Backend (TrinityBackendFastAPI)**: Data processing, Arrow Flight server
- **AI Services (TrinityAI)**: Language model-driven agents for query processing

### AI Agent System
Located in `TrinityAI/`, the AI system uses a modular agent architecture:

- **Agent_fetch_atom**: Main chat endpoint that detects which tool/atom fits a user query
- **Agent_concat**: Assists with data concatenation configuration  
- **Agent_Merge**: Handles dataset merging operations
- **Agent_chartmaker**: Internal helpers for chart creation
- **Agent_explore**: Data exploration capabilities
- **Agent_groupby**: GroupBy operations on datasets
- **Agent_create_transform**: Column creation and transformation

Each agent follows the pattern:
- `ai_logic.py`: Contains LLM prompts and JSON parsing logic
- `main_app.py`: FastAPI application with endpoints
- Individual agents are mounted on the main API at `/trinityai/{agent}`

### Data Storage & Processing
- **PostgreSQL**: Primary database for user data, multi-tenant support
- **MongoDB**: Configuration storage, classifier configs  
- **MinIO**: Object storage for datasets and files
- **Redis**: Caching and environment variable storage
- **Apache Arrow Flight**: High-performance data transfer

### Port Configuration
- Frontend: 8080 (production), Vite dev server varies
- Django Backend: 8000
- FastAPI Backend: 8001  
- AI Services: 8002
- Working Backend: 8004
- PostgreSQL: 5432
- MongoDB: 27017
- MinIO: 9000 (API), 9001 (Console)
- Arrow Flight: 8815

### Environment Variables
Key environment variables loaded from Redis or .env files:
- `HOST_IP`: Host machine IP address
- `CLIENT_NAME`, `APP_NAME`, `PROJECT_NAME`: Multi-tenant identifiers
- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`: Object storage
- `MONGO_URI`, `POSTGRES_*`: Database connections
- `OLLAMA_IP`, `LLM_MODEL_NAME`: AI model configuration

### Testing Strategy
- **Python**: pytest for backend services and AI agents
- **Frontend**: ESLint for linting (testing framework not currently configured)
- **Integration Tests**: Cross-service API testing in TrinityAI
- **Docker**: Service-level testing via docker-compose

## Key Development Notes

### AI Agent Development
- Copy existing agent folder as template for new agents
- Edit `ai_logic.py` for LLM prompt customization
- Wire up endpoints in `main_app.py`
- Add router import to `TrinityAI/main_api.py`

### Multi-Tenant Architecture
- Django backend handles tenant isolation via django-tenants
- Environment variables (CLIENT_NAME/APP_NAME/PROJECT_NAME) determine data prefixes
- MinIO uses prefixed paths: `{client}/{app}/{project}/`

### Data Flow
1. Frontend sends queries to Django backend or directly to AI services
2. AI agents process natural language queries and detect required operations
3. Backend services (Django/FastAPI) execute data operations
4. Results flow back through the same path to frontend

### Service Communication
- AI services call backend APIs for data operations
- Frontend built with Lovable.dev integration
- CORS configured for cross-origin requests during development
- Traefik reverse proxy in production for routing

### Development Workflow
- **Frontend development**: Use `npm run dev` in TrinityFrontend
- **Backend testing**: Use pytest for individual service testing
- **Full stack (Docker)**: Use docker-compose for integration testing
- **Full stack (Kubernetes)**: Use `./deploy-trinity.ps1` for K8s deployment
- **AI development**: Run `python main_api.py` for AI service development

### Kubernetes vs Docker Compose
**Kubernetes (Recommended for production-like development):**
- Better resource management and scaling capabilities
- Built-in health monitoring and restart policies
- More robust networking and service discovery
- Easier rollbacks and updates via Helm
- Production-ready configuration management
- Access via NodePort: Frontend at localhost:30080

**Docker Compose (Simpler for basic development):**
- Faster startup for simple changes
- Direct volume mounting for hot reloading
- Simpler configuration files
- Access via port mapping: Frontend at localhost:8080
