# Use Node.js base image
FROM node:22-slim

# Install dependencies required for mediasoup
# Set environment variable to skip downloading prebuilt workers
ENV MEDIASOUP_SKIP_WORKER_PREBUILT_DOWNLOAD="true"
# Install necessary system packages and dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        python3 \
        python3-pip \
    && rm -rf /var/lib/apt/lists/*
# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm i


# Cleanup unnecessary packages and files
RUN apt-get purge -y --auto-remove \
    python3-pip \
    build-essential \
    && npm cache clean --force \
    && rm -rf /tmp/* /var/tmp/* /usr/share/doc/*

# Copy source code
COPY . .

# Build the application
RUN npm run build

COPY ./src/certs ./dist/certs
COPY ./src/protos ./dist/protos

ENV REDIS_SERVER_URL=redis://host.docker.internal:6379
ENV SERVER_ADDRESS=localhost
# Expose ports for WebRTC and gRPC

ENV RTC_MIN_PORT=2000
ENV RTC_MAX_PORT=2100
#SERVER PORT 
EXPOSE 4000
# WebRTC ports (customize as needed)
EXPOSE 2000-20100/udp
# gRPC port
EXPOSE 50052


# Start the server
CMD [ "npm", "start" ]
