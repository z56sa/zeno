FROM node:20-bookworm-slim

# Install necessary system dependencies for canvas and audio
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application source code
COPY . .

# Environment variables default
ENV PORT=10000
ENV NODE_ENV=production

EXPOSE 10000

CMD ["node", "src/index.js"]
