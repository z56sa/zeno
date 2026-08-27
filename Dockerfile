FROM node:20-bullseye-slim

# Install runtime and build dependencies
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
    libfontconfig1-dev \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

# إنشاء مجلد البيانات مسبقاً لضمان عمل Railway Volume بشكل صحيح
RUN mkdir -p /usr/src/app/data && chmod 777 /usr/src/app/data

EXPOSE 3000

CMD ["node", "src/index.js"]