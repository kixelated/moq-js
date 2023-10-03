FROM node:lts AS base

COPY . /app
WORKDIR /app

FROM base AS prod-deps
RUN --mount=type=cache,id=npm,target=/app/.npm \
	npm set cache /app/.npm && \
	npm ci --production

FROM base AS build
RUN --mount=type=cache,id=npm,target=/app/.npm \
	npm set cache /app/.npm && \
	npm ci
RUN npm run build

FROM base
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/web/dist /app/web/dist

ENV HOST="0.0.0.0"
CMD [ "node", "./web/dist/server/entry.mjs" ]
