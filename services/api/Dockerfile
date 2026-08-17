FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
FROM dependencies AS build
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build
FROM node:22-alpine AS production
ENV NODE_ENV=production PROCESS_ROLE=api
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4000
CMD ["node","dist/main.js"]

FROM production AS worker
ENV PROCESS_ROLE=worker
CMD ["node","dist/worker.js"]
