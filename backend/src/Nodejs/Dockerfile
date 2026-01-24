# node:18
FROM node@sha256:c6ae79e38498325db67193d391e6ec1d224d96c693a8a4d943498556716d3783

WORKDIR /app

COPY package*.json ./

RUN npm install

RUN npm install dotenv --save

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]