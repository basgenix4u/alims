FROM node:22-slim
WORKDIR /app

# Install all three packages (root, server, client) for layer caching.
COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/
COPY client/package.json client/package-lock.json ./client/
RUN npm ci && npm ci --prefix server && npm ci --prefix client

# Build the client SPA.
COPY . .
RUN npm run build

# PORT is injected by the host (Render); the server reads process.env.PORT.
# JWT_SECRET must be provided via the environment in production.
ENV NODE_ENV=production
EXPOSE 4000
CMD ["npm", "start"]
