FROM node:24.20.0-bookworm-slim AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.3.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/contracts packages/contracts

RUN pnpm --filter @axes/api prisma:generate \
    && pnpm --filter @axes/contracts build \
    && pnpm --filter @axes/api build

FROM node:24.20.0-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3001

WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist

USER node
WORKDIR /app/apps/api

EXPOSE 3001

CMD ["node", "dist/main.js"]
