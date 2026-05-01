#!/bin/bash

# ==============================================================================
# Script: sync_github.sh
# Descripción: Sincronización rápida del repositorio local con GitHub.
# Autor: santivi17
# Fecha: 2026-05-01
# ==============================================================================

# Configuración
BRANCH="main" # Cambiar a 'master' si tu rama principal se llama así
COMMIT_PREFIX="chore: auto-sync update"

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Iniciando sincronización con GitHub...${NC}"

# 1. Verificar que estamos en un repo git
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    echo -e "${RED}Error: No estás en un repositorio Git.${NC}"
    exit 1
fi

# 2. Estado inicial
echo -e "Verificando estado del repositorio..."
git status --short

# 3. Añadir cambios (git add . respeta .gitignore, por lo que node_modules se excluye)
echo -e "\n${YELLOW}Añadiendo cambios al staging area (excluyendo node_modules)...${NC}"
git add .

# 4. Verificar si hay cambios para commitear
if git diff --staged --quiet; then
    echo -e "${GREEN}No hay cambios nuevos para commitear. El repositorio está actualizado.${NC}"
    exit 0
fi

# 5. Commit con mensaje automático y fecha
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
COMMIT_MSG="$COMMIT_PREFIX - $TIMESTAMP"

echo -e "\n${YELLOW}Creando commit...${NC}"
git commit -m "$COMMIT_MSG"

# 6. Push a GitHub
echo -e "\n${YELLOW}Subiendo cambios a la rama '$BRANCH'...${NC}"
if git push origin "$BRANCH"; then
    echo -e "\n${GREEN}✅ Sincronización completada con éxito.${NC}"
else
    echo -e "\n${RED}❌ Error al hacer push. Verifica tu conexión o credenciales.${NC}"
    exit 1
fi