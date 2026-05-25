FROM node:22-alpine

WORKDIR /app
COPY package.json server.js ./
COPY public ./public
COPY data/matches.seed.json ./data/matches.seed.json

ENV PORT=3000
ENV DATA_DIR=/data
ENV SEED_PATH=/app/data/matches.seed.json
EXPOSE 3000

CMD ["node", "server.js"]
