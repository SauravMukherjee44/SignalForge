FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV SIGNALFORGE_PLATFORM=railway
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production SIGNALFORGE_PLATFORM=railway SIGNALFORGE_DATABASE_PATH=/data/signalforge.sqlite
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/runtime ./runtime
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/start-railway.mjs ./scripts/start-railway.mjs
CMD ["node", "scripts/start-railway.mjs"]
