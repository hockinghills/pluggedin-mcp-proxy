# Use a standard Node.js 20 slim image (Debian-based)
FROM node:20-slim

# Node.js and npm are pre-installed in this image.
# Install pnpm globally
RUN npm install -g pnpm

# Set the working directory
WORKDIR /app

# Copy package files
# Copy package files AND pnpm lock file
COPY package*.json pnpm-lock.yaml ./

# Install dependencies using pnpm
RUN pnpm install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

# Set environment variables
ENV NODE_ENV=production

# Expose the application port
EXPOSE 3000

# Run the application
ENTRYPOINT ["node", "dist/index.js"]
