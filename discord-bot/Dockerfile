FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build
RUN npm prune --production
CMD ["node", "dist/index.js"]
