FROM node:20.17.0-alpine3.20
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY db ./db
USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
