# DelQuro Connect frontend — static React build served by nginx, with the API
# reverse-proxied through the same origin (so no CORS and no build-time backend
# URL are required).
#
# Build context is THIS directory:
#   docker build -t delquro-connect-web ./frontend
#   docker run -p 8080:80 -e BACKEND_URL=http://127.0.0.1:8000 delquro-connect-web
#
# In Coolify: Base Directory = /frontend , Dockerfile Location = /Dockerfile ,
# Ports Exposes = 80 , and set BACKEND_URL to the backend service URL
# (e.g. http://<backend-app-container-name>:8000 — copy the internal URL from
# the backend application's page, or use its public https:// URL).

# ---------- stage 1: build ----------
FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

COPY . .

# Optional: point the browser directly at a backend on another origin. Left
# empty (the default), the app calls the relative /api path, which nginx below
# proxies to BACKEND_URL — the recommended setup.
ARG REACT_APP_BACKEND_URL=""
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL \
    CI=false \
    GENERATE_SOURCEMAP=false \
    DISABLE_ESLINT_PLUGIN=true
RUN npm run build

# ---------- stage 2: serve ----------
FROM nginx:1.27-alpine

# The official image renders /etc/nginx/templates/*.template with envsubst on
# start, substituting only real environment variables (nginx's own $variables
# are left untouched).
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/build /usr/share/nginx/html

ENV BACKEND_URL=http://127.0.0.1:8000

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
