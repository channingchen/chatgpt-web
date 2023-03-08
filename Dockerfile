# build front-end
FROM node:lts-alpine AS builder

COPY ./ /app
WORKDIR /app

RUN npm install pnpm -g && pnpm install && pnpm run build

# service
FROM node:lts-alpine
RUN apk add py3-pip make g++

COPY /service /app
COPY --from=builder /app/dist /app/public

WORKDIR /app
# RUN  npm config set python /usr/bin/python
RUN npm install pnpm -g && pnpm install

EXPOSE 3002

CMD ["pnpm", "run", "start"]