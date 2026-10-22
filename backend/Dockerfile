# The API, for a server (deploy/docker-compose.yml). Build context: the repository root, because the
# database loader (npm run db:load) reads database/baseline and database/seed-assets.

FROM node:24-alpine
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY database/ /app/database/
# Uploads live in a volume mounted here, so they survive rebuilds.
RUN mkdir -p /data/uploads && chown -R node:node /data/uploads
ENV NODE_ENV=production \
    PORT=4000 \
    UPLOAD_DIR=/data/uploads
USER node
EXPOSE 4000
CMD ["node", "index.js"]
