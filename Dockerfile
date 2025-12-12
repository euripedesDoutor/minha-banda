# Estágio 1: Build da aplicação React/Vite
FROM node:20-alpine as build

WORKDIR /app

# Copia arquivos de dependência
COPY package.json package-lock.json* ./

# Instala dependências
RUN npm install

# Copia o restante do código fonte
COPY . .

# Executa o build de produção (gera pasta /dist)
RUN npm run build

# Estágio 2: Servidor Web Nginx
FROM nginx:alpine

# Copia os arquivos estáticos gerados no estágio anterior para o Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Expõe a porta 80 do container
EXPOSE 80

# Inicia o Nginx
CMD ["nginx", "-g", "daemon off;"]
