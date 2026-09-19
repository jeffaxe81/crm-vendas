# 🚀 Local Development Setup - CRM Vendas

Guia passo a passo para configurar o ambiente de desenvolvimento local.

---

## 📋 Pré-requisitos

Verifique se você tem instalado:

```bash
# macOS
brew install docker docker-compose git

# Ubuntu/Debian
sudo apt-get install docker.io docker-compose git

# Windows
# Baixe Docker Desktop: https://www.docker.com/products/docker-desktop
```

### Verificar Instalação

```bash
docker --version      # Docker 20.10+
docker-compose --version  # Docker Compose 2.0+
git --version         # Git 2.30+
```

---

## ✅ Setup Steps

### Step 1: Clone o Repositório

```bash
# SSH (recomendado se tiver chave SSH)
git clone git@github.com:jeffaxe81/crm-vendas.git
cd crm-vendas

# HTTPS (se não tiver SSH configurado)
git clone https://github.com/jeffaxe81/crm-vendas.git
cd crm-vendas
```

### Step 2: Checkout da Branch Develop

```bash
git checkout develop
git pull origin develop
```

### Step 3: Configure Environment File

```bash
# Copie o arquivo de exemplo
cp .env.example .env

# Edite .env se necessário (opcional para dev local)
# nano .env  (ou seu editor favorito)
```

### Step 4: Inicie os Containers

```bash
# Build e inicie os containers
docker-compose up -d

# Aguarde ~30s para todos os serviços estarem prontos
sleep 30

# Verifique se todos estão saudáveis
docker-compose ps
```

Saída esperada:
```
NAME                    STATUS
crm-vendas-postgres     Up (healthy)
crm-vendas-redis        Up (healthy)
crm-vendas-backend      Up (healthy)
crm-vendas-frontend     Up
```

### Step 5: Verify Services

```bash
# Backend Health Check
curl http://localhost:8000/health

# Frontend
open http://localhost:3000  # macOS
xdg-open http://localhost:3000  # Linux
start http://localhost:3000  # Windows
```

---

## 🌐 URLs de Acesso

| Serviço | URL | Descrição |
|---------|-----|-----------|
| **Frontend** | http://localhost:3000 | React App |
| **Backend API** | http://localhost:8000 | FastAPI Server |
| **Swagger Docs** | http://localhost:8000/docs | API Documentation |
| **ReDoc** | http://localhost:8000/redoc | Alternative API Docs |
| **Database** | localhost:5432 | PostgreSQL |
| **Redis** | localhost:6379 | Cache Server |

---

## 💾 Database Setup

### Conectar ao PostgreSQL

```bash
# Via Docker
docker-compose exec postgres psql -U vendas_user -d crm_vendas_dev

# Via pgAdmin (opcional)
# Ou use seu cliente SQL favorito (DBeaver, DataGrip, etc)
```

### Criar primeira migração (depois de Sprint 1)

```bash
# Gerar migração
docker-compose exec backend alembic revision --autogenerate -m "Initial schema"

# Aplicar migrações
docker-compose exec backend alembic upgrade head
```

---

## 🧪 Running Tests

### Backend Tests

```bash
# Todos os testes
docker-compose exec backend pytest -v

# Com coverage
docker-compose exec backend pytest --cov=app --cov-report=html

# Teste específico
docker-compose exec backend pytest tests/test_auth.py::test_login -v
```

### Frontend Tests

```bash
# Todos os testes
docker-compose exec frontend npm test

# Watch mode
docker-compose exec frontend npm test -- --watch

# Coverage
docker-compose exec frontend npm test -- --coverage
```

---

## 📝 Linting & Formatting

### Backend

```bash
# Lint
docker-compose exec backend flake8 app tests

# Format
docker-compose exec backend black app tests

# Type check
docker-compose exec backend mypy app
```

### Frontend

```bash
# Lint
docker-compose exec frontend npm run lint

# Format
docker-compose exec frontend npm run format
```

---

## 🔍 Debugging

### Backend Logs

```bash
# Tail logs
docker-compose logs -f backend

# Últimas N linhas
docker-compose logs --tail=50 backend

# Sem timestamp
docker-compose logs --no-log-prefix backend
```

### Frontend Logs

```bash
docker-compose logs -f frontend
```

### Redis CLI

```bash
docker-compose exec redis redis-cli
> PING
> KEYS *
> FLUSHDB
```

### Database Query

```bash
docker-compose exec postgres psql -U vendas_user -d crm_vendas_dev
> \dt  # List tables
> SELECT * FROM organizations;
```

---

## 🛑 Stopping Services

### Parar containers (mantém volumes)

```bash
docker-compose stop
```

### Parar e remover containers (remove volumes também)

```bash
docker-compose down -v
```

### Remover tudo (containers, images, volumes)

```bash
docker-compose down -v --rmi all
```

---

## 🔧 Common Issues

### "Address already in use"

```bash
# Verifique qual processo está usando a porta
lsof -i :3000    # Frontend
lsof -i :8000    # Backend
lsof -i :5432    # Database
lsof -i :6379    # Redis

# Ou use porta diferente
docker-compose down
# Edite docker-compose.yml ou .env
docker-compose up -d
```

### Containers não iniciam

```bash
# Remova volumes e recrie
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### Hot reload não funcionando

```bash
# Verifique permissões de arquivo
chmod -R 755 backend
chmod -R 755 frontend

# Ou recrie os containers
docker-compose restart backend frontend
```

### Database migration error

```bash
# Reset database (atenção: deleta dados!)
docker-compose exec postgres psql -U vendas_user -d crm_vendas_dev -c "DROP SCHEMA public CASCADE;"
docker-compose exec postgres psql -U vendas_user -d crm_vendas_dev -c "CREATE SCHEMA public;"

# Reapply migrations
docker-compose exec backend alembic upgrade head
```

---

## 🔗 Git Setup

### Configure seu usuário Git

```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu.email@digitro.com"
```

### Criar branch para trabalhar

```bash
# Update develop
git checkout develop
git pull origin develop

# Crie sua feature branch
git checkout -b feature/S1-01-docker-setup

# Verifique branches
git branch -a
```

---

## 📚 Next Steps

1. **Leia o CONTRIBUTING.md** - Workflow de contribuição
2. **Explore o projeto** - Entenda a estrutura
3. **Crie uma feature branch** - Comece a desenvolver
4. **Escreva testes** - Garanta qualidade
5. **Abra Pull Request** - Envie suas mudanças

---

## 💬 Need Help?

- Verifique logs: `docker-compose logs`
- Leia a documentação: `/docs`
- Abra uma issue: GitHub Issues
- Converse no Slack: #crm-vendas

---

**Happy Coding!** 🚀

Last Updated: 2026-09-18
