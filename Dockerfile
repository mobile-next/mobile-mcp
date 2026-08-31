FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
# adb client only; devices are reached through the host's adb server
RUN apt-get update && apt-get install -y --no-install-recommends adb && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
# --ignore-scripts: "prepare" runs husky, a devDependency
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/lib ./lib
# /app itself must be writable by node: save_screenshot writes below cwd
RUN chown node:node /app
USER node
ENV ADB_SERVER_SOCKET=tcp:host.docker.internal:5037
ENTRYPOINT ["node", "lib/index.js"]
