# syntax=docker/dockerfile:1

# --- build stage ---
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma/
COPY src ./src/

# Generate Prisma client then compile TypeScript
RUN npx prisma generate
RUN npm run build

# --- runtime stage ---
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output and generated Prisma client
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

COPY prisma ./prisma/

EXPOSE 3000

# Apply pending migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
