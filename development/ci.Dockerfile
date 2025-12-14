FROM registry.hub.docker.com/library/debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y nodejs npm && \
    apt-get clean

RUN npm install -g pnpm@^10.12.1
RUN pnpm install playwright@1.53.1
RUN pnpm exec playwright install chromium --with-deps

