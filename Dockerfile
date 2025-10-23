# Use a base Debian image (not slim)
FROM node:22-bookworm

# Install dependencies for mediasoup
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libatomic1 \
    libstdc++6 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Workdir
WORKDIR /usr/src/app

# Copy package.json
COPY package*.json ./

# Install dependencies (will build mediasoup worker)
RUN npm ci

# Copy source
COPY . .

# Build your app
RUN npm run build

COPY ./src/certs ./dist/certs 
COPY ./src/protos ./dist/protos

ENV REDIS_SERVER_URL=redis://host.docker.internal:6379 
ENV SERVER_ADDRESS=localhost 
# Expose ports for WebRTC and gRPC 
ENV RTC_MIN_PORT=2000
ENV RTC_MAX_PORT=2100
# Expose ports
EXPOSE 4000
EXPOSE 2000-2100/udp
EXPOSE 50052

# Start
CMD ["npm", "start"]
