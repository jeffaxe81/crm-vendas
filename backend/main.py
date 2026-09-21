"""
CRM-VENDAS FastAPI Application
Multi-tenant SaaS platform for sales teams
"""

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import os
import logging

from app.core.exceptions import ApplicationError
from app.middleware import AuthenticationMiddleware
from app.routers import auth_router, health_router
from app.database import engine
from app.models import Base

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ═════════════════════════════════════════════════════════════════════════════
# Lifespan Context
# ═════════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan management
    Handles startup and shutdown events
    """
    # Startup
    logger.info("🚀 CRM-VENDAS Backend starting...")

    # Create tables (for development, use Alembic in production)
    # Base.metadata.create_all(bind=engine)  # Commented: use Alembic migrations

    logger.info("✅ Application started successfully")

    yield

    # Shutdown
    logger.info("🛑 CRM-VENDAS Backend shutting down...")
    engine.dispose()
    logger.info("✅ Application shutdown complete")


# ═════════════════════════════════════════════════════════════════════════════
# FastAPI Application
# ═════════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="CRM-VENDAS API",
    description="Multi-tenant SaaS platform for sales teams",
    version="0.3.0",
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
    openapi_url="/api/v1/openapi.json",
    lifespan=lifespan
)


# ═════════════════════════════════════════════════════════════════════════════
# Middleware Configuration
# ═════════════════════════════════════════════════════════════════════════════

# Trust proxy headers for correct client IP
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=[
        "localhost",
        "127.0.0.1",
        "*.example.com",
        os.getenv("ALLOWED_HOSTS", "localhost").split(",")
    ]
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Authentication middleware
app.add_middleware(AuthenticationMiddleware)


# ═════════════════════════════════════════════════════════════════════════════
# Exception Handlers
# ═════════════════════════════════════════════════════════════════════════════

@app.exception_handler(ApplicationError)
async def application_error_handler(request: Request, exc: ApplicationError):
    """Handle custom application errors"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error_code,
            "message": exc.message,
            "details": exc.details
        }
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": "http_error",
            "message": exc.detail if isinstance(exc.detail, str) else str(exc.detail),
            "status_code": exc.status_code
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": "An unexpected error occurred",
            "error_code": "internal_error"
        }
    )


# ═════════════════════════════════════════════════════════════════════════════
# Routes Registration
# ═════════════════════════════════════════════════════════════════════════════

# Health check routes
app.include_router(health_router)

# Authentication routes
app.include_router(auth_router)


# ═════════════════════════════════════════════════════════════════════════════
# Root Endpoints
# ═════════════════════════════════════════════════════════════════════════════

@app.get("/")
async def root() -> dict:
    """Root endpoint with API information"""
    return {
        "service": "CRM-VENDAS API",
        "version": "0.3.0",
        "status": "online",
        "documentation": "/api/v1/docs",
        "health_check": "/api/v1/health"
    }


@app.get("/api/v1")
async def api_root() -> dict:
    """API v1 root endpoint"""
    return {
        "service": "CRM-VENDAS API",
        "version": "v1",
        "endpoints": {
            "auth": "/api/v1/auth",
            "health": "/api/v1/health",
            "docs": "/api/v1/docs"
        }
    }


# ═════════════════════════════════════════════════════════════════════════════
# Entry Point
# ═════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=os.getenv("ENVIRONMENT", "development") == "development"
    )
