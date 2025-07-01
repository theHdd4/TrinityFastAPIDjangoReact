# Build the React frontend
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN echo "[frontend] installing dependencies" \
    && npm install \
    && echo "[frontend] dependencies installed"
COPY . .
RUN echo "[frontend] running build" \
    && npm run build \
    && echo "[frontend] build complete"

# Serve the compiled app with Nginx
FROM nginx:1.25-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
