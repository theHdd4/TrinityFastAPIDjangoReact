# Build the React frontend
FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_BACKEND_ORIGIN
ARG VITE_FRONTEND_PORT
ENV VITE_BACKEND_ORIGIN=$VITE_BACKEND_ORIGIN \
    VITE_FRONTEND_PORT=$VITE_FRONTEND_PORT
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

# Serve the compiled app with Nginx
FROM nginx:1.25-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
