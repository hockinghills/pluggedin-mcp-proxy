# Build stage
FROM node:20-slim AS builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package files
COPY package*.json pnpm-lock.yaml ./

# Install all dependencies (including dev dependencies for building)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-slim

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package files
COPY package*.json pnpm-lock.yaml ./

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy required config files
COPY smithery.yaml ./

# Set environment variables
ENV NODE_ENV=production

# Expose the application port
EXPOSE 3000

# Run the application
ENTRYPOINT ["node", "dist/index.js"]