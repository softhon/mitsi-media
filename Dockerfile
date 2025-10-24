FROM node:22-bookworm

# Install dependencies for mediasoup
RUN apt-get update && \
    apt-get install -y \
    git \
    build-essential \
    python3 \
    pkg-config \
    libssl-dev \
    python3-pip \
    net-tools \
    valgrind \
    # Additional mediasoup dependencies
    libc6 \
    libsrtp2-1 \
    openssl \
    libopus0 \
    libvpx7 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package.json
COPY package*.json ./

RUN npm ci

# Copy source
COPY . .

# IMPORTANT: Rebuild mediasoup native bindings inside Docker
# This ensures the binary is compiled for the correct architecture
RUN npm rebuild mediasoup

RUN npm run build

COPY ./src/certs ./dist/certs 
COPY ./src/protos ./dist/protos

# Expose ports
EXPOSE 4000
EXPOSE 2000-2100/udp
EXPOSE 50052

# Start
CMD ["npm", "start"]
