"""Database access to the shared Fasal Guard PostgreSQL.

The schema is owned by the NestJS TypeORM migrations during the incremental migration; this
service must not create or alter tables. Queries use explicit SQL against that schema.
"""

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine

from app.config import get_settings

_engine: Engine | None = None


def engine() -> Engine:
    global _engine
    if _engine is None:
        url = get_settings().database_url
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg2://" + url[len("postgresql://") :]
        _engine = create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5, connect_args={"connect_timeout": 5})
    return _engine


@contextmanager
def transaction() -> Iterator[Connection]:
    """One committed transaction. Commit happens on exit, before any task dispatch by callers."""
    with engine().begin() as conn:
        yield conn


def ping() -> bool:
    with engine().connect() as conn:
        return conn.execute(text("SELECT 1")).scalar() == 1
