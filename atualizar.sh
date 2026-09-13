#!/bin/bash
set -e

echo "=========================================="
echo "🚀 [ChatterHub] Atualizando Aplicação..."
echo "=========================================="

# 1. Puxar últimas alterações do GitHub
echo "📥 Baixando novidades do GitHub..."
git pull origin main

# 2. Reconstruir e subir os contêineres no Docker
echo "🐳 Reconstruindo contêineres Docker..."
docker compose up -d --build

# 3. Limpar imagens antigas para economizar espaço em disco
echo "🧹 Removendo imagens antigas..."
docker image prune -f

echo "=========================================="
echo "✅ [ChatterHub] Atualizado com sucesso!"
echo "=========================================="
docker compose ps
