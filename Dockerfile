# Use stable Debian-slim Node 20 runtime (supports Canvas and Better-Sqlite3 out of the box)
FROM node:20-slim

# Install system dependencies required for native packages & font rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy source files
COPY . .

# Expose server port
EXPOSE 3000

# Start command
CMD [ "node", "src/index.js" ]