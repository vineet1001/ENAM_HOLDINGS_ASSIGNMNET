"""Database engine and session management."""
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import create_engine
from app.core.config import DATABASE_URL, SYNC_DATABASE_URL

# Async engine for FastAPI
engine = create_async_engine(DATABASE_URL, echo=False, future=True, poolclass=NullPool)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Sync engine for migrations/seeding
sync_engine = create_engine(SYNC_DATABASE_URL, echo=False, future=True, poolclass=NullPool)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """Dependency that yields an async database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Create all tables."""
    from app.models import company, price, announcement, alert, financial, document, research  # noqa: F401
    Base.metadata.create_all(sync_engine)
    sync_engine.dispose()


async def close_db():
    """Dispose of the engine."""
    await engine.dispose()

