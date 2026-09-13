# Everything the app needs in one image: Next.js web server, the queue worker,
# and ffmpeg for the 16 kHz mono Opus conversion.
#
# `npm start` runs migrations, then supervises the web server and the worker
# together, so a Railway deploy is one service with one volume.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install with dev dependencies present: the build needs them, and tsx runs the
# worker and the migration runner at runtime.
COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
RUN npm run build

# Audio lives here. On Railway this path is a mounted volume; the directory is
# created so the app still starts (with a loud warning) if the volume is missing.
RUN mkdir -p /data/audio
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
