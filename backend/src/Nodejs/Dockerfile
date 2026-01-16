FROM node:22

WORKDIR /app

COPY package*.json ./

RUN npm install

RUN npm install dotenv --save

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]