# The test and live sites build from this file, so Railway's automatic builder is not needed.
FROM node:24-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY . .
# The one setting read at build time: the site address in link previews (layout metadata).
ARG WOVI_APP_URL
# The build cache is only for the next local build; left in, it is most of the image and slows every upload.
RUN npm run build && rm -rf .next/cache

ENV PORT=3900
EXPOSE 3900
# Railway's start command (the launch agents, then the server) overrides this; it is the same.
CMD ["sh", "-c", "npx --yes tsx scripts/launch-agents.ts && npm start"]
