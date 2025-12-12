# Estágio de Build
FROM node:18-alpine as build

WORKDIR /app

# Copia os arquivos de dependência
COPY package*.json ./

# Instala as dependências
RUN npm install

# Copia todo o código fonte
COPY . .

# Recebe a API_KEY como argumento de build (definido no docker-compose.yml)
ARG API_KEY
# Define a variável de ambiente para que o Vite possa acessá-la durante o build
ENV API_KEY=$API_KEY

# Executa o build de produção (Vite substitui process.env.API_KEY pelo valor real)
RUN npm run build

# Estágio de Produção
FROM nginx:alpine

# Copia os arquivos estáticos gerados no build para o diretório do Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Copia a configuração customizada do Nginx
# NOTA: Certifique-se de ter o arquivo nginx.conf no mesmo diretório
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expõe a porta 80
EXPOSE 80

# Inicia o Nginx
CMD ["nginx", "-g", "daemon off;"]
