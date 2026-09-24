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

> ⚠️ **Sempre use `-f docker-compose.yml`.** A raiz também tem um `compose.yaml`
> (stack TypeScript/AXE Relationship). O Docker Compose v2 dá preferência ao
> `compose.yaml` quando nenhum arquivo é indicado, e subiria a stack errada.
>
> O frontend React ainda não foi criado (`frontend/` só tem o Dockerfile), por
> isso o serviço `frontend` fica no profile `frontend` e não sobe por padrão.
> As migrations do Alembic rodam automaticamente quando o backend inicia.

```bash
# Build e inicie os containers
docker compose -f docker-compose.yml up -d

# Aguarde ~30s para todos os serviços estarem prontos
sleep 30

# Verifique se todos estão saudáveis
docker compose -f docker-compose.yml ps
```

Saída esperada:
```
NAME                    STATUS
crm-vendas-postgres     Up (healthy)
crm-vendas-redis        Up (healthy)
crm-vendas-backend      Up (healthy)
```

### Step 5: Verify Services

```bash
# Backend Health Check
curl http://localhost:8000/api/v1/health

# Login com o usuário de desenvolvimento (criado pela migration 002)
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"demo1234"}'

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
| **Swagger Docs** | http://localhost:8000/api/v1/docs | API Documentation |
| **ReDoc** | http://localhost:8000/api/v1/redoc | Alternative API Docs |
| **Database** | localhost:5432 | PostgreSQL |
| **Redis** | localhost:6379 | Cache Server |

---

## 💾 Database Setup

### Conectar ao PostgreSQL

```bash
# Via Docker
docker compose -f docker-compose.yml exec postgres psql -U vendas_user -d crm_vendas_dev

# Via pgAdmin (opcional)
# Ou use seu cliente SQL favorito (DBeaver, DataGrip, etc)
```

### Migrações (Alembic)

As migrations `001` (schema `crm_core`) e `002` (dados de desenvolvimento)
são aplicadas automaticamente quando o backend sobe.

```bash
# Gerar nova migração a partir dos models
docker compose -f docker-compose.yml exec backend alembic revision --autogenerate -m "descricao"

# Aplicar migrações
docker compose -f docker-compose.yml exec backend alembic upgrade head
```

---

## 🧪 Running Tests

### Backend Tests

Os testes usam o banco descartável `crm_vendas_dev_test` (criado pelo
`init-db.sql` e apontado por `TEST_DATABASE_URL`). A suíte recusa rodar em
qualquer banco cujo nome não termine em `_test`. O CI exige cobertura ≥ 90%.

> Se o volume do Postgres foi criado antes desta versão, recrie-o com
> `docker compose -f docker-compose.yml down -v` para que o banco de testes exista.

```bash
# Todos os testes
docker compose -f docker-compose.yml exec backend pytest -v

# Com coverage
docker compose -f docker-compose.yml exec backend pytest --cov=app --cov-report=html

# Teste específico
docker compose -f docker-compose.yml exec backend pytest tests/test_auth.py::test_login_with_seeded_demo_user -v
```

### Frontend Tests

```bash
# Todos os testes
docker compose -f docker-compose.yml exec frontend npm test

# Watch mode
docker compose -f docker-compose.yml exec frontend npm test -- --watch

# Coverage
docker compose -f docker-compose.yml exec frontend npm test -- --coverage
```

---

## 📝 Linting & Formatting

### Backend

```bash
# Lint (ruff)
docker compose -f docker-compose.yml exec backend ruff check .

# Format
docker compose -f docker-compose.yml exec backend ruff format app tests
```

### Frontend

```bash
# Lint
docker compose -f docker-compose.yml exec frontend npm run lint

# Format
docker compose -f docker-compose.yml exec frontend npm run format
```

---

## 🔍 Debugging

### Backend Logs

```bash
# Tail logs
docker compose -f docker-compose.yml logs -f backend

# Últimas N linhas
docker compose -f docker-compose.yml logs --tail=50 backend

# Sem timestamp
docker compose -f docker-compose.yml logs --no-log-prefix backend
```

### Frontend Logs

```bash
docker compose -f docker-compose.yml logs -f frontend
```

### Redis CLI

```bash
docker compose -f docker-compose.yml exec redis redis-cli
> PING
> KEYS *
> FLUSHDB
```

### Database Query

```bash
docker compose -f docker-compose.yml exec postgres psql -U vendas_user -d crm_vendas_dev
> \dt  # List tables
> SELECT * FROM organizations;
```

---

## 🛑 Stopping Services

### Parar containers (mantém volumes)

```bash
docker compose -f docker-compose.yml stop
```

### Parar e remover containers (remove volumes também)

```bash
docker compose -f docker-compose.yml down -v
```

### Remover tudo (containers, images, volumes)

```bash
docker compose -f docker-compose.yml down -v --rmi all
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
docker compose -f docker-compose.yml down
# Edite docker-compose.yml ou .env
docker compose -f docker-compose.yml up -d
```

### Containers não iniciam

```bash
# Remova volumes e recrie
docker compose -f docker-compose.yml down -v
docker compose -f docker-compose.yml build --no-cache
docker compose -f docker-compose.yml up -d
```

### Hot reload não funcionando

```bash
# Verifique permissões de arquivo
chmod -R 755 backend
chmod -R 755 frontend

# Ou recrie os containers
docker compose -f docker-compose.yml restart backend frontend
```

### Database migration error

```bash
# Reset database (atenção: deleta dados!)
docker compose -f docker-compose.yml exec postgres psql -U vendas_user -d crm_vendas_dev -c "DROP SCHEMA public CASCADE;"
docker compose -f docker-compose.yml exec postgres psql -U vendas_user -d crm_vendas_dev -c "CREATE SCHEMA public;"

# Reapply migrations
docker compose -f docker-compose.yml exec backend alembic upgrade head
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

- Verifique logs: `docker compose -f docker-compose.yml logs`
- Leia a documentação: `/docs`
- Abra uma issue: GitHub Issues
- Converse no Slack: #crm-vendas

---

**Happy Coding!** 🚀

Last Updated: 2026-09-18
