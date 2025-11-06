# Build the React frontend
FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_BACKEND_ORIGIN
ARG VITE_FRONTEND_PORT
ARG VITE_DJANGO_PORT
ARG VITE_FASTAPI_PORT
ARG VITE_HOST_IP
ARG NODE_ENV=production
# Copy package files first
COPY package.json package-lock.json ./
# Install ALL dependencies (including devDependencies needed for build)
# Explicitly set NODE_ENV to development during install to ensure devDependencies install
# ARG doesn't automatically become ENV, but we explicitly override it here for safety
RUN NODE_ENV=development npm install
# Set environment variables after npm install
ENV VITE_BACKEND_ORIGIN=$VITE_BACKEND_ORIGIN \
    VITE_FRONTEND_PORT=$VITE_FRONTEND_PORT \
    VITE_DJANGO_PORT=$VITE_DJANGO_PORT \
    VITE_FASTAPI_PORT=$VITE_FASTAPI_PORT \
    VITE_HOST_IP=$VITE_HOST_IP \
    NODE_ENV=$NODE_ENV
# Copy source code
COPY . .
# Build the application
# Use --mode flag based on NODE_ENV to ensure console logs are handled correctly
RUN if [ "$NODE_ENV" = "production" ]; then npm run build; else npm run build:dev; fi

# Serve the compiled app with Nginx
FROM nginx:1.25-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
