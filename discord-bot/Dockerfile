FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Expose port (Cloud Run requires a port to be exposed)
EXPOSE 8080

# Health check endpoint (Cloud Run will ping this)
# We'll add a simple HTTP server for health checks
CMD ["node", "index.js"]




