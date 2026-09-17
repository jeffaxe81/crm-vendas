# CYCLE 3 ARCHITECTURE: Multi-Tenant SaaS Foundation
**Technical Design Document for v0.3.0**

---

## 📐 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER (Browser)                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  React + TypeScript + Zustand + TailwindCSS + Recharts         │ │
│  │  ├─ Auth Pages (Login, Register, Forgot Password)              │ │
│  │  ├─ Dashboard (Stats, Charts, Activities)                      │ │
│  │  ├─ Contact Management (CRUD, Search, Import)                  │ │
│  │  ├─ Deal Management (Kanban, Pipeline, Forecasting)            │ │
│  │  └─ Settings (Organization, Users, Integrations)               │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP/HTTPS (JSON)
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      API GATEWAY / LOAD BALANCER                     │
│  ├─ Rate limiting (100 req/min per user)                             │
│  ├─ CORS validation                                                  │
│  └─ Request logging & monitoring                                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   FASTAPI APP    │  │  FASTAPI APP     │  │   FASTAPI APP    │
│  (Instance 1)    │  │  (Instance 2)    │  │  (Instance N)    │
└──────────────────┘  └──────────────────┘  └──────────────────┘

        │         ┌─────────────────────────────────────┐
        ├────────▶│     REDIS CACHE CLUSTER             │
        │         └─────────────────────────────────────┘
        │
        └────────▶┌─────────────────────────────────────┐
                  │  POSTGRESQL DATABASE                │
                  │  - Multi-tenant data isolation      │
                  │  - 15+ core tables                  │
                  └─────────────────────────────────────┘
```

---

## 🔐 Authentication & Authorization Architecture

### **JWT-Based Authentication Flow**

```
User Login
    ↓
Validate Credentials
    ↓
Generate JWT Token (1hr expiry)
    ↓
Return Token + Refresh Token
    ↓
Client Stores Token (Memory/Secure Storage)
    ↓
Subsequent Requests Include: Authorization: Bearer <token>
    ↓
Backend Validates JWT Signature + Expiration
    ↓
Extract user_id, org_id, role from payload
    ↓
Inject into request context
    ↓
Route handler processes authenticated request
```

### **Token Payload Structure**
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "org_id": "org-uuid",
  "role": "manager",
  "iat": 1720000000,
  "exp": 1720003600,
  "type": "access"
}
```

### **Role-Based Access Control (RBAC)**

```
┌────────────────────────────────────────────────────────────────────┐
│                    RBAC Permission Matrix                          │
├─────────────┼────────┼──────┼────────┼────────┼───────┼────────┤
│ Admin       │   ✓    │  ✓   │   ✓    │   ✓    │   ✓   │   ✓   │
│ Manager     │   ✓    │  ✓   │   ✓    │   ✗    │   ✗   │   ✓   │
│ Sales Rep   │   ✓    │  ✓   │  Own   │   ✗    │   ✗   │   ✗   │
│ Viewer      │   ✗    │  ✓   │   ✗    │   ✗    │   ✗   │   ✗   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🗄️ Multi-Tenant Data Isolation

Every table includes `organization_id` column for tenant isolation:

```sql
-- GOOD ✓ (filtered by tenant)
SELECT * FROM contacts 
WHERE id = ? AND organization_id = ?;

-- BAD ❌ (exposes all organizations' data)
SELECT * FROM contacts WHERE id = ?;
```

**Middleware ensures every query includes organization_id from JWT token.**

---

## 📡 Core API Endpoints

```
Base URL: /api/v1

Authentication:
  POST   /auth/login              → Generate JWT token
  POST   /auth/register           → Create account
  POST   /auth/refresh            → Refresh token
  
Organizations:
  GET    /organizations           → List organizations
  POST   /organizations           → Create organization
  GET    /organizations/{id}      → Get details
  
Users:
  GET    /users/me                → Current user
  GET    /users                   → List (Admin)
  POST   /users                   → Create (Admin)
  
Contacts:
  GET    /contacts                → List (paginated)
  POST   /contacts                → Create
  GET    /contacts/{id}           → Get details
  PUT    /contacts/{id}           → Update
  DELETE /contacts/{id}           → Delete
  GET    /contacts/search         → Search
  
Deals:
  GET    /deals                   → List
  POST   /deals                   → Create
  GET    /deals/{id}              → Get details
  PUT    /deals/{id}              → Update
  PUT    /deals/{id}/stage        → Move to stage
  
Activities:
  GET    /activities              → List
  POST   /activities              → Create
  
Health:
  GET    /health                  → Health check
```

---

## 🛠️ Technology Stack

### **Backend**
```
FastAPI 0.100.0
├─ SQLAlchemy 2.0 (ORM)
├─ Pydantic 2.0 (validation)
├─ python-jose (JWT)
├─ bcrypt (password)
├─ Redis-py (caching)
└─ PostgreSQL 14+ (database)
```

### **Frontend**
```
React 18
├─ TypeScript
├─ Zustand (state)
├─ TailwindCSS (styling)
├─ React Query (data fetching)
├─ Recharts (charts)
└─ React Router (navigation)
```

### **Infrastructure**
```
Docker Compose (dev)
Kubernetes (production)
GitHub Actions (CI/CD)
PostgreSQL (data)
Redis (cache)
```

---

## 🔒 Security Layers

1. **Transport:** TLS/SSL, HTTPS only
2. **Authentication:** JWT (HS256, 1hr expiry)
3. **Authorization:** RBAC + Tenant isolation
4. **Input Validation:** Pydantic schemas, SQL injection prevention
5. **Data Protection:** Password hashing (bcrypt), Audit logging
6. **API Security:** CORS validation, Rate limiting, Request signing (Phase 2)

---

## ✅ Architecture Checklist (Cycle 3)

- [ ] JWT authentication fully implemented
- [ ] Multi-tenant isolation verified
- [ ] Database schema normalized (3NF)
- [ ] API endpoints documented (OpenAPI)
- [ ] Redis caching layer tested
- [ ] RBAC permissions enforced
- [ ] Error handling standardized
- [ ] Docker Compose working locally
- [ ] GitHub Actions CI/CD pipeline green
- [ ] API response time <200ms
- [ ] Security scan passed (0 critical issues)

---

**Document Version:** 1.0  
**Last Updated:** 2026-09-17
