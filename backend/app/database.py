"""
Database configuration and session management for CRM-VENDAS
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
import os
from typing import Iterator

# Database URL from environment variable
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://vendas_user:vendas_pass_dev@localhost:5432/crm_vendas_dev"
)

# Create engine with environment-specific configuration
def create_db_engine(url: str = DATABASE_URL, echo: bool = False):
    """Create database engine with optimal settings"""
    engine = create_engine(
        url,
        echo=echo,
        pool_pre_ping=True,  # Test connections before using them
        pool_recycle=3600,   # Recycle connections every hour
        connect_args={
            "connect_timeout": 10,
            "options": "-c statement_timeout=30000",  # 30 second timeout
        }
    )
    return engine


# Default engine instance
engine = create_db_engine()

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Iterator[Session]:
    """Dependency for FastAPI to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
