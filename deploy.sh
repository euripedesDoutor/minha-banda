#!/bin/bash

echo "🚀 Iniciando deploy do Minha Banda Studio..."

# Para containers em execução e remove volumes órfãos
docker-compose down

# Constrói a imagem novamente e sobe o container em background
# A flag --build garante que alterações no código sejam recompiladas
docker-compose up -d --build

echo "✅ Deploy concluído!"
echo "📡 Aplicação rodando em: http://localhost:8000"
