FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# El worker no suele exponer puertos, solo escucha a RabbitMQ
CMD ["node", "worker.js"]