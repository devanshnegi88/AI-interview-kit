FROM node:20-alpine AS builder
WORKDIR /app

# Install frontend deps
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN cd frontend && npm ci --omit=dev

# Copy repo and build frontend
COPY . .
RUN cd frontend && npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/frontend/.next ./.next
COPY --from=builder /app/frontend/node_modules ./node_modules
COPY frontend/package.json ./package.json

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start", "--prefix", "frontend"]
