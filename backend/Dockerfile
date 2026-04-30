FROM node:20-alpine
WORKDIR /app
COPY backend/package.json ./backend/package.json
COPY backend/src ./backend/src
COPY frontend ./frontend
COPY sample-data ./sample-data
COPY scripts ./scripts
WORKDIR /app/backend
EXPOSE 8080
CMD ["npm", "start"]
