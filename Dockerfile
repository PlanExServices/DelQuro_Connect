# Dockerfile for the DelQuro Connect backend (Coolify / any Docker host).
#
# Build from the repository root:
#   docker build -t delquro-connect-api .
#   docker run -p 8000:8000 --env-file backend/.env delquro-connect-api
#
# Required env vars at runtime: MONGO_URL, DB_NAME, JWT_SECRET
# (optional: CORS_ORIGINS, ADMIN_BOOTSTRAP_CODE, PORT - see backend/.env.example).

FROM python:3.11-slim

WORKDIR /app

# Build tooling for any dependency that has no pre-built wheel on this
# architecture (cryptography/bcrypt/pymongo all ship wheels for amd64+arm64).
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libffi-dev python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Requirements first so the dependency layer is cached.
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Application source (server.py, auth.py, ...).
COPY backend/ ./

EXPOSE 8000

# Honour the port injected by the platform, defaulting to uvicorn's 8000.
ENV PORT=8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/health', timeout=4)"

CMD ["sh", "-c", "python -m uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
