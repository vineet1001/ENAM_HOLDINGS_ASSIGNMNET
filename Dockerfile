# FINN in one container, for hosts that run a single service (Render, Railway, Hugging Face Spaces).
# Next.js serves the site on $PORT and forwards /api to the FastAPI backend on 127.0.0.1:8000 inside the container.

FROM node:20-bookworm-slim AS frontend
WORKDIR /frontend
ENV BACKEND_URL=http://127.0.0.1:8000
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build && npm prune --omit=dev

FROM python:3.11-slim-bookworm
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# Node runtime for the Next.js server, from the same Debian release as this image.
COPY --from=frontend /usr/local/bin/node /usr/local/bin/node

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/
COPY --from=frontend /frontend/package.json frontend/package.json
COPY --from=frontend /frontend/next.config.js frontend/next.config.js
COPY --from=frontend /frontend/node_modules frontend/node_modules
COPY --from=frontend /frontend/.next frontend/.next
COPY start-container.sh /app/start-container.sh
RUN chmod +x /app/start-container.sh

ENV PYTHONUNBUFFERED=1 NODE_ENV=production PORT=10000
EXPOSE 10000
CMD ["/app/start-container.sh"]
