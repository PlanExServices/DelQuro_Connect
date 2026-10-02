# Dockerfile for DelQuro Connect Backend (Coolify deployment)
# Fixes: "no Dockerfile" + package build failures (cryptography, motor, etc.)

FROM python:3.11

WORKDIR /app

# Install build dependencies needed by Python packages (cryptography, pymongo, etc.)
RUN apt-get update && apt-get install -y gcc libffi-dev python3-dev && rm -rf /var/lib/apt/lists/*

# Copy requirements first (better Docker caching)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY backend/ .

# Expose the port uvicorn uses
EXPOSE 8000

# Start command (matches Coolify build expectation)
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
