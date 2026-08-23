# Multi-stage build para Angular Front-end
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build -- --configuration production

# Servir com Nginx
FROM nginx:alpine
COPY --from=build /app/dist/discord-clone/browser /usr/share/nginx/html
# Configuração do Nginx para suportar roteamento SPA e proxy reverso para a API
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
