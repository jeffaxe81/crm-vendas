# Contributing Guide - CRM Vendas

## 📋 Antes de Começar

1. Verifique se sua issue está no [GitHub Project Board](https://github.com/jeffaxe81/crm-vendas/projects/1)
2. Atribua a issue a você mesmo
3. Mude o status para "In Progress"
4. Crie uma branch do seu computador

---

## 🌿 Git Workflow

### 1. Setup Inicial

```bash
# Clone o repositório
git clone https://github.com/jeffaxe81/crm-vendas.git
cd crm-vendas

# Configure git
git config user.name "Seu Nome"
git config user.email "seu.email@digitro.com"

# Adicione upstream remote
git remote add upstream https://github.com/jeffaxe81/crm-vendas.git
```

### 2. Crie uma Feature Branch

```bash
# Atualize develop local
git checkout develop
git pull upstream develop

# Crie branch de feature
git checkout -b feature/S1-01-docker-setup
```

### 3. Desenvolva

```bash
# Edite arquivos, crie código
# Teste localmente
docker-compose up -d
npm test (frontend)
pytest (backend)

# Stage files
git add .

# Commit com mensagem clara
git commit -m "feat: implementar Docker Compose com 4 serviços

- Adicionar docker-compose.yml com PostgreSQL, Redis, FastAPI, React
- Criar Dockerfiles para backend e frontend
- Configurar networking entre containers
- Implementar health checks

Resolves #1"
```

### 4. Push e Pull Request

```bash
# Push para sua fork ou diretamente
git push origin feature/S1-01-docker-setup

# Crie Pull Request no GitHub
# - Título: "feat: Docker Compose setup"
# - Descrição: Referendar issue #1
# - Labels: Cycle-3, Sprint-1
# - Assign reviewer da equipe
```

### 5. Code Review & Merge

- Aguarde feedback do reviewer
- Faça ajustes se necessário
- Após aprovação, merge é feito pelo maintainer
- Delete branch local: `git branch -D feature/S1-01-docker-setup`

---

## 📝 Commit Message Format

```
<type>: <subject>

<body>

<footer>
```

### Types

- **feat:** Nova funcionalidade
- **fix:** Correção de bug
- **docs:** Mudanças na documentação
- **style:** Formatação (não afeta funcionalidade)
- **refactor:** Reorganização de código (não muda comportamento)
- **perf:** Melhoria de performance
- **test:** Adicionar ou atualizar testes
- **chore:** Tarefas de manutenção

### Exemplo

```
feat: implementar autenticação JWT

- Adicionar endpoints de login/register
- Criar middleware de validação
- Configurar token rotation com refresh tokens
- Adicionar tests para auth flow

Resolves #2, References #15
```

---

## 🧪 Antes de Fazer Commit

### Backend

```bash
# Lint
docker-compose exec backend black app/ tests/
docker-compose exec backend flake8 app/ tests/
docker-compose exec backend mypy app/

# Tests
docker-compose exec backend pytest --cov=app

# Deve passar com >90% coverage
```

### Frontend

```bash
# Lint
docker-compose exec frontend npm run lint

# Format
docker-compose exec frontend npm run format

# Tests
docker-compose exec frontend npm test
```

---

## 🔍 Pull Request Checklist

Antes de submeter seu PR:

- [ ] Issue foi referenciada (#1)
- [ ] Branch foi criado de `develop`
- [ ] Código foi lintado e formatado
- [ ] Tests passam com cobertura >90%
- [ ] Documentação foi atualizada
- [ ] Commit messages são claros
- [ ] Nenhuma secret foi commitada

---

## 🚀 Branch Strategy

```
main (production)
  │
  └─→ release/v0.3.0 ──→ merge after testing
       │
       └─→ develop (staging/testing)
            │
            ├─→ feature/S1-01-docker-setup (your work)
            ├─→ feature/S2-03-search
            ├─→ bugfix/auth-token-expiry
            └─→ chore/upgrade-dependencies
```

### Naming Convention

- `feature/{ISSUE}-{short-desc}` - Nova feature
- `bugfix/{ISSUE}-{short-desc}` - Bug fix
- `chore/{desc}` - Manutenção
- `hotfix/{ISSUE}-{short-desc}` - Crítico em produção

---

## 📊 Sprint Tracking

### Atualizar Issue Status

1. **TODO** → Quando issue é criada
2. **In Progress** → Quando começar a trabalhar
3. **In Review** → Quando abrir PR
4. **Done** → Quando PR for mergeado

---

## 🆘 Troubleshooting

### Containers não iniciam

```bash
# Remova containers e volumes
docker-compose down -v

# Rebuild
docker-compose build --no-cache

# Start
docker-compose up -d
```

### Conflito de merge

```bash
# Atualize sua branch com develop
git fetch origin
git rebase origin/develop

# Resolva conflitos no editor
# Depois:
git add .
git rebase --continue
git push --force-with-lease origin feature/branch-name
```

### Precisa voltar um commit

```bash
# Sem apagar o código
git reset --soft HEAD~1

# Com apagar o código
git reset --hard HEAD~1
```

---

## 📚 Resources

- [GitHub Project Board](https://github.com/jeffaxe81/crm-vendas/projects/1)
- [Architecture Docs](./docs/CYCLE_3_ARCHITECTURE.md)
- [API Docs](http://localhost:8000/docs)
- [Database Schema](./docs/CYCLE_3_DATABASE_SCHEMA.md)

---

**Questions?** Abra uma issue ou converse no Slack!
