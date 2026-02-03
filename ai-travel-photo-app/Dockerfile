FROM node:20-bullseye-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "pnpm run db:push && pnpm run dev"]
