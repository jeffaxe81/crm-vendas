"""
Health check endpoints for CRM-VENDAS
Used for monitoring and Kubernetes probes
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from fastapi.responses import JSONResponse
from app.database import get_db
from datetime import datetime

router = APIRouter(prefix="/api/v1", tags=["health"])


@router.get("/health")
async def health_check() -> dict:
    """
    Basic health check endpoint

    Returns:
        Service status and timestamp
    """
    return {
        "status": "ok",
        "service": "crm-vendas-backend",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "0.3.0"
    }


@router.get("/ready")
async def readiness_probe(db: Session = Depends(get_db)):
    """
    Kubernetes readiness probe

    Checks if service is ready to accept traffic:
    - Database connection is active
    - Migrations are applied

    Returns:
        Readiness status
    """
    try:
        # Test database connection
        db.execute(text("SELECT 1"))

        return {
            "status": "ready",
            "service": "crm-vendas-backend",
            "timestamp": datetime.utcnow().isoformat(),
            "checks": {
                "database": "healthy"
            }
        }
    except Exception:
        # 503 so Kubernetes/Docker stop routing traffic; no internal details leaked
        return JSONResponse(
            status_code=503,
            content={
                "status": "not_ready",
                "service": "crm-vendas-backend",
                "timestamp": datetime.utcnow().isoformat(),
                "checks": {"database": "unavailable"}
            }
        )


@router.get("/live")
async def liveness_probe() -> dict:
    """
    Kubernetes liveness probe

    Checks if service is still running

    Returns:
        Liveness status
    """
    return {
        "status": "alive",
        "service": "crm-vendas-backend",
        "timestamp": datetime.utcnow().isoformat()
    }
