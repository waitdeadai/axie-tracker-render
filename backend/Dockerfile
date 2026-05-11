FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 \
    python3-dev \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

COPY backend/package*.json ./backend/
COPY backend/tsconfig.json ./backend/
COPY backend/pnpm-lock.yaml ./backend/
COPY backend/pnpm-workspace.yaml ./backend/
COPY frontend/package*.json ./frontend/

WORKDIR /app/backend

# Install dependencies (approves builds for better-sqlite3) and frontend deps
RUN pnpm install --frozen-lockfile
RUN npm --prefix /app/frontend install

COPY backend/src ./src
COPY frontend /app/frontend

RUN pnpm run build && npm --prefix /app/frontend run build && pnpm prune --prod

# Copy payment.html into dist — legacy fallback root page
COPY backend/src/payment.html ./dist/payment.html

RUN mkdir -p /data && chmod 775 /data
VOLUME /data

ENV PORT=4000
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PYTHON_BIN=python3

EXPOSE 4000

CMD ["node", "dist/index.js"]
