# Node.js 20 Bullseye Full Image - maximum compatibility for native modules
FROM node:20-bullseye

# Install all system dependencies for canvas, sqlite3, voice, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    make \
    g++ \
    gcc \
    build-essential \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpng-dev \
    libfontconfig1-dev \
    libfreetype6-dev \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies with full compilation support
RUN npm install --omit=dev --build-from-source=false || npm install --omit=dev

# Copy source files
COPY . .

# Expose server port
EXPOSE 3000

# Start command
CMD [ "node", "src/index.js" ]