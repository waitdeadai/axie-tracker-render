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

COPY package*.json ./
COPY tsconfig.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./

# Install dependencies (approves builds for better-sqlite3)
RUN pnpm install --frozen-lockfile

COPY src ./src

RUN pnpm run build && pnpm prune --omit=dev

# Copy payment.html into dist — served as root page
COPY src/payment.html ./dist/payment.html

RUN mkdir -p /data && chmod 775 /data
VOLUME /data

ENV PORT=4000
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PYTHON_BIN=python3

EXPOSE 4000

CMD ["node", "dist/index.js"]
