# Stage 1: Build frontend
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY server/ server/
COPY --from=builder /app/dist/ static/
EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost:8001/api/watch || exit 1
CMD ["python", "server/main.py"]
