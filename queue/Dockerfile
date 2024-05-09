# Use latest Node.js LTS as base image
FROM node:latest

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to work directory
COPY package*.json ./

# Install necessary dependencies for Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
RUN npm install
RUN npx @puppeteer/browsers install chrome@stable

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
