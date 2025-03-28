FROM node:23-alpine AS deps
WORKDIR /app
ENV COREPACK_INTEGRITY_KEYS=0
COPY package.json pnpm-lock.yaml ./
RUN corepack pnpm install --prod --frozen-lockfile

FROM node:23-alpine AS runner

RUN apk update && apk add --no-cache git

WORKDIR /app

ENV NODE_ENV=production

COPY package.json tsconfig.json ./
COPY src src
COPY --from=deps /app/node_modules ./node_modules

CMD ["/app/src/index.ts"]
ENTRYPOINT ["node"]
