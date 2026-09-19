FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies for backend
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm ci --omit=dev

# Copy repo and build backend
COPY . .
RUN cd backend && npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/backend/dist ./dist
COPY backend/package.json ./backend/package.json
RUN cd backend && npm ci --omit=dev --no-audit --no-fund

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/backend/src/server.js"]
