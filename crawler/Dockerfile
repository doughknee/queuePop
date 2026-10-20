FROM node:24-alpine
ENV NODE_ENV=production DB_PATH=/data/crawler.db PORT=47900 BACKUP_DIR=/backups
WORKDIR /app
COPY package.json ./
COPY src ./src
RUN mkdir -p /data /backups && chown node:node /data /backups
USER node
VOLUME /data
EXPOSE 47900
HEALTHCHECK CMD wget -qO- http://127.0.0.1:47900/health || exit 1
CMD ["node", "src/main.js"]
