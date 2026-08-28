FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Must match EXPOSE/HEALTHCHECK below. index.ts reads process.env.PORT and
# otherwise defaults to 10000 — without this, a container run without an
# explicit PORT override would listen on 10000 while this image's EXPOSE/
# HEALTHCHECK/port-mapping assume 4000, breaking the container healthcheck
# and any port publishing that relies on the Dockerfile's declared port.
ENV PORT=4000
COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
RUN chown -R node:node /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "dist/index.js"]
