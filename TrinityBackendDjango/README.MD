# TrinityBackendDjango

**Backend for the Trinity Data-Science Platform**  
Django-admin layer orchestrates FastAPI compute engines, with PostgreSQL, MongoDB, and Redis for polyglot persistence.

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Copy `.env.example` to `.env` and fill in:
  ```dotenv
  DEBUG=True
  SECRET_KEY=your_secret_key
  DATABASE_URL=postgres://trinity_user:trinity_pass@postgres:5432/trinity_db
  MONGO_URI=mongodb://mongo:27017/trinity
  REDIS_URL=redis://redis:6379/0
