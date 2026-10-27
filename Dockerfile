FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build


FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

COPY package*.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm ci --omit=dev --ignore-scripts \
    && apk del .build-deps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/client/public ./apps/client/public

EXPOSE 5000

CMD ["node", "dist/apps/server/index.js"]
