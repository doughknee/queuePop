# Debian slim, not Alpine (DONI-711): musl's allocator kept ~1 GB/day of fragmented native memory in the crawler (JS heap 13 MB,
# RSS 4.3 GB after four days, took the Unraid host down 2026-10-23). glibc returns it; MALLOC_ARENA_MAX keeps its arenas few.
FROM node:24-slim
ENV NODE_ENV=production DB_PATH=/data/crawler.db PORT=47900 BACKUP_DIR=/backups MALLOC_ARENA_MAX=2
# ffmpeg makes the web copy of each published clip (src/clips.js)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY src ./src
RUN mkdir -p /data /backups /clips && chown node:node /data /backups /clips
USER node
VOLUME /data
EXPOSE 47900
# node, not wget: slim has no wget, and a dead health probe must exit, not hang (the host saw 1,000+ wget zombies, DONI-711)
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:47900/health',{signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "src/main.js"]
