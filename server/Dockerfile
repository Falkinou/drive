FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY scripts ./scripts

RUN mkdir -p /data/uploads && chown -R node:node /data
USER node

EXPOSE 3000
CMD ["node", "src/server.js"]
