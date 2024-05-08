# Use latest Node.js LTS as base image
FROM node:latest

# Set working directory inside the container
WORKDIR /app

# Install dependencies needed for Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libdrm2 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json to work directory
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all source code to work directory
COPY . .

# Expose the port your application runs on
EXPOSE 3000

# Copy start script into container
COPY start.sh /app

# Grant execute permission to start script
RUN chmod +x /app/start.sh

# Command to run your application
CMD ["./start.sh"]
