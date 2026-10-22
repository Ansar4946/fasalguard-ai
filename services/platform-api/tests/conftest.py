import os

# Unit tests never touch real services; integration tests (-m integration) use the running stack.
os.environ.setdefault("DATABASE_URL", "postgresql://u:p@localhost:1/none")
os.environ.setdefault("JWT_ACCESS_SECRET", "unit-test-secret-unit-test-secret-0123456789")
os.environ.setdefault("JWT_ISSUER", "fasalguard-api")
os.environ.setdefault("JWT_AUDIENCE", "fasalguard-clients")
