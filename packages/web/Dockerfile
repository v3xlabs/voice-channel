FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN pnpm ci

# Copy source code
COPY . .

# Build the app
RUN pnpm run build

# Runtime stage
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Use default nginx configuration

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"] 