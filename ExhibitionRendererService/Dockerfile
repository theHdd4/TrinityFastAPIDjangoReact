FROM node:20-slim AS base

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production \
    PORT=4100

EXPOSE 4100

CMD ["npm", "start"]
