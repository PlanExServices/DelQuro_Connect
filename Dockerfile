# DelQuro Connect — production image (frontend + API in one container).
#
# This is the simplest Coolify/Render/Fly deployment: a single application,
# a single domain, no CORS and no build-time backend URL. FastAPI serves the
# API under /api and the built React app (with SPA deep-link fallback) at /.
#
#   docker build -t delquro-connect .
#   docker run -p 8000:8000 --env-file .env delquro-connect
#
# Required runtime env: MONGO_URL, DB_NAME, JWT_SECRET
# Optional: CORS_ORIGINS, ADMIN_BOOTSTRAP_CODE, PORT, FRONTEND_BUILD_DIR
# (see .env.example). Prefer splitting the services? Use backend/Dockerfile
# and frontend/Dockerfile instead — see docs/DEPLOYMENT.md.


# ---------- stage 1: build the React frontend ----------
FROM node:20-bookworm-slim AS frontend-build

WORKDIR /frontend

# Install dependencies from the lockfile first so this layer is cached.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY frontend/ ./

# REACT_APP_BACKEND_URL is deliberately left empty: the app then calls the
# relative "/api" path, which this same container serves.
ENV CI=false \
    GENERATE_SOURCEMAP=false \
    DISABLE_ESLINT_PLUGIN=true
RUN npm run build

# ---------- stage 2: backend runtime + static frontend ----------
FROM python:3.11-slim

WORKDIR /app

# Build tooling for dependencies without pre-built wheels on this architecture.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libffi-dev python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend-build /frontend/build ./frontend_build

ENV PORT=8000 \
    FRONTEND_BUILD_DIR=/app/frontend_build

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/health', timeout=4)"

CMD ["sh", "-c", "python -m uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
