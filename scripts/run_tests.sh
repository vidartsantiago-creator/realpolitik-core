#!/bin/bash
# =============================================================================
# scripts/run_tests.sh
# Script de ejecución de tests unitarios para realpolitik-core
# =============================================================================
# Uso:
#   ./scripts/run_tests.sh              # Ejecuta todos los tests
#   ./scripts/run_tests.sh unit         # Solo tests unitarios
#   ./scripts/run_tests.sh faction      # Solo FactionRule
#   ./scripts/run_tests.sh espionage    # Solo EspionageRule
#   ./scripts/run_tests.sh crisis       # Solo CrisisRule
#   ./scripts/run_tests.sh diplomacy    # Solo DiplomacyRule
#   ./scripts/run_tests.sh stewardship  # Solo StewardshipEngine
#
# Requisitos:
#   - Node.js >= 18.0.0
#   - npm instalado
# =============================================================================

set -e

# Colores para salida
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directorio raíz del proyecto
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Función para mostrar ayuda
show_help() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  RealPolitik Core - Test Runner${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "Uso: $0 [opción]"
    echo ""
    echo "Opciones:"
    echo "  (ninguna)     Ejecutar todos los tests"
    echo "  unit          Ejecutar solo tests unitarios"
    echo "  faction       Ejecutar tests de FactionRule"
    echo "  espionage     Ejecutar tests de EspionageRule"
    echo "  crisis        Ejecutar tests de CrisisRule"
    echo "  diplomacy     Ejecutar tests de DiplomacyRule"
    echo "  stewardship   Ejecutar tests de StewardshipEngine"
    echo "  help          Mostrar esta ayuda"
    echo ""
}

# Función para verificar Node.js
check_node() {
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: Node.js no está instalado${NC}"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo -e "${RED}Error: Se requiere Node.js >= 18.0.0 (versión actual: $(node -v))${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Node.js $(node -v) detectado${NC}"
}

# Función para instalar dependencias
install_deps() {
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Instalando dependencias...${NC}"
        npm install --silent
        echo -e "${GREEN}✓ Dependencias instaladas${NC}"
    else
        echo -e "${GREEN}✓ Dependencias ya instaladas${NC}"
    fi
}

# Función para ejecutar tests con node:test nativo
run_tests_native() {
    local test_pattern="$1"
    local test_file="$2"
    
    if [ -n "$test_file" ]; then
        echo -e "${BLUE}Ejecutando: ${test_file}${NC}"
        node --test "$test_file"
    elif [ -n "$test_pattern" ]; then
        echo -e "${BLUE}Ejecutando tests que coinciden con: ${test_pattern}${NC}"
        node --test "tests/**/${test_pattern}*.test.js"
    else
        echo -e "${BLUE}Ejecutando todos los tests unitarios...${NC}"
        node --test "tests/unit/*.test.js"
    fi
}

# Función principal
main() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  RealPolitik Core - Test Runner${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    check_node
    install_deps
    
    echo ""
    
    case "${1:-all}" in
        "help"|"-h"|"--help")
            show_help
            exit 0
            ;;
        "unit")
            run_tests_native "" ""
            ;;
        "faction")
            run_tests_native "" "tests/unit/FactionRule.test.js"
            ;;
        "espionage")
            run_tests_native "" "tests/unit/EspionageRule.test.js"
            ;;
        "crisis")
            run_tests_native "" "tests/unit/CrisisRule.test.js"
            ;;
        "diplomacy")
            run_tests_native "" "tests/unit/DiplomacyRule.test.js"
            ;;
        "stewardship")
            run_tests_native "" "tests/unit/StewardshipEngine.test.js"
            ;;
        "all"|*)
            echo -e "${YELLOW}Ejecutando suite completa de tests...${NC}"
            echo ""
            
            # Contadores
            TOTAL=0
            PASSED=0
            FAILED=0
            
            # Ejecutar cada suite individualmente
            for test_file in tests/unit/*.test.js; do
                if [ -f "$test_file" ]; then
                    echo -e "${BLUE}----------------------------------------${NC}"
                    if node --test "$test_file"; then
                        ((PASSED++)) || true
                    else
                        ((FAILED++)) || true
                    fi
                    ((TOTAL++)) || true
                    echo ""
                fi
            done
            
            # Resumen final
            echo -e "${BLUE}========================================${NC}"
            echo -e "${BLUE}  RESUMEN FINAL${NC}"
            echo -e "${BLUE}========================================${NC}"
            echo -e "Total suites: ${TOTAL}"
            echo -e "${GREEN}Aprobadas: ${PASSED}${NC}"
            if [ $FAILED -gt 0 ]; then
                echo -e "${RED}Fallidas: ${FAILED}${NC}"
                exit 1
            else
                echo -e "${GREEN}Todas las pruebas aprobadas ✓${NC}"
            fi
            ;;
    esac
    
    echo ""
    echo -e "${GREEN}Finalizado.${NC}"
}

# Ejecutar main con todos los argumentos
main "$@"
