# Configuración Matemática y Balance de Estrategias

## 1. Estructura de `strategies.json`
Cada estrategia debe definir explícitamente su comportamiento matemático. La ausencia de estos campos causará que el sistema use valores por defecto no balanceados.

### Schema Obligatorio
```json
{
  "id": "string_unique_id",
  "name": "Nombre Visible",
  "category": "economic|military|diplomatic",
  "budget_range": {
    "min": 0,
    "default": 100,
    "max": 1000
  },
  "efficiency_curve": {
    "type": "linear|logarithmic|exponential|sigmoid",
    "coefficients": {
      "a": 0.5,
      "b": 0.01
    }
  },
  "risk_profile": {
    "base_risk": 0.05,
    "risk_scaling": {
      "type": "linear|exponential",
      "factor": 0.001
    }
  },
  "effects": { ... }
}