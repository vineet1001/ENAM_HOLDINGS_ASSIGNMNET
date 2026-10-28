"""Standalone runner to initialize database and seed demo data."""
import sys
import asyncio
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.core.database import init_db, async_session_factory, engine
from app.demo_data.seed import seed_demo_data


async def main():
    print("Initializing database tables...")
    await init_db()
    print("Tables initialized.")
    
    print("Seeding demo data...")
    async with async_session_factory() as session:
        result = await seed_demo_data(session)
        print("Seed result:", result)
    
    await engine.dispose()
    print("Done!")


if __name__ == "__main__":
    asyncio.run(main())
