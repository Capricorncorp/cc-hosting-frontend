FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* .npmrc ./
RUN npm_config_fetch_retries=5 npm_config_fetch_retry_mintimeout=20000 npm_config_fetch_retry_maxtimeout=120000 npm install --ignore-scripts --no-audit --no-fund

COPY . .

ARG VITE_GATEWAY_URL=https://gateway.capricorncorp.com
ARG VITE_OIDC_URL=https://auth.capricorncorp.com
ENV VITE_GATEWAY_URL=$VITE_GATEWAY_URL
ENV VITE_OIDC_URL=$VITE_OIDC_URL

RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

# SPA fallback — React Router needs all routes to serve index.html
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
