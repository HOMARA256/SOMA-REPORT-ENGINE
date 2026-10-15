FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --omit=dev --ignore-scripts --workspace apps/api
COPY --chown=node:node apps/api apps/api
USER node
EXPOSE 3000 3001
CMD ["npm", "run", "start", "--workspace", "apps/api"]
