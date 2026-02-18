# Adapted from https://docs.docker.com/guides/nodejs/containerize/

ARG NODE_VERSION=25-alpine
FROM node:${NODE_VERSION} AS base

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app


FROM base AS deps

COPY package*.json ./

# Install production dependencies
# Cache mount for faster subsequent builds
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev && \
    npm cache clean --force

RUN chown -R nodejs:nodejs /app


FROM base AS build-deps

COPY package*.json ./

# Install all dependencies
# Cache mount for faster subsequent builds
# Also typescript for code compilation
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --no-audit --no-fund && \
    npm install typescript && \
    npm cache clean --force

RUN chown -R nodejs:nodejs /app


FROM build-deps AS build

COPY --chown=nodejs:nodejs . .

# Compile
RUN ./node_modules/.bin/tsc

RUN chown -R nodejs:nodejs /app


FROM node:${NODE_VERSION} AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

ENV NODE_ENV=production

# Dependencies
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=nodejs:nodejs /app/package*.json ./

# Compiled JS
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist

USER nodejs

CMD ["node", "dist/app.js"]