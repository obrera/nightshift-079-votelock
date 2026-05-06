FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && npm install -g bun@1.3.12

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./package.json
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["bun", "run", "server/index.ts"]
