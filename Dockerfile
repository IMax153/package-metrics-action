FROM node:23-alpine AS base
ENV NODE_NO_WARNINGS=1
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY package.json pnpm-lock.yaml /app
WORKDIR /app

FROM base AS deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --prod --frozen-lockfile

FROM base
RUN --mount=type=cache,target=/var/cache/apk \
  apk add --update git
COPY --from=deps /app/node_modules /app/node_modules
COPY . .
ENTRYPOINT ["node", "/app/src/index.ts"]
