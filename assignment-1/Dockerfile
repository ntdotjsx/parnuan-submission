FROM oven/bun:1.2-alpine
WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY static ./static

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
