# Dockerfile for DelQuro Connect Backend (Coolify deployment)
# This fixes the deployment error: "open Dockerfile: no such file or directory"

FROM python:3.11-slim

WORKDIR /app

# Copy requirements first (better Docker caching)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY backend/ .

# Expose the port uvicorn uses
EXPOSE 8000

# Start command (matches Coolify build expectation)
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
