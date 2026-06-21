/**
 * server/utils/StrategyMath.js
 * Motor matemático para calcular efectos basados en presupuesto y curvas.
 */

export class StrategyMath {
  /**
   * Calcula el multiplicador de eficiencia (0.0 a 1.0+) basado en el presupuesto asignado.
   * @param {number} budget - Presupuesto asignado por el jugador.
   * @param {object} curveConfig - Configuración del JSON (type, coefficients).
   * @returns {number} - Factor multiplicador.
   */
  static calculateEfficiency(budget, curveConfig) {
    const { type, coefficients } = curveConfig;
    const min = curveConfig.budget_range?.min || 0; // Asumimos que pasa el rango o se calcula normalizado antes

    // Normalizar presupuesto (0.0 a 1.0) respecto al rango máximo para facilitar fórmulas
    // O usar el valor crudo si la fórmula lo requiere (ej. exponencial absoluta)

    switch (type) {
      case 'logarithmic': {
        // Fórmula: a * ln(b * budget + 1)
        // Útil para rendimientos decrecientes rápidos.
        const { a, b } = coefficients;
        // Ajuste: normalizamos el resultado para que 1.0 sea el "teórico máximo" o lo dejamos abierto
        const raw = a * Math.log(b * budget + 1);
        // Opcional: clampear entre 0 y 1 si se desea un tope estricto
        return Math.max(0, raw);
      }

      case 'exponential': {
        // Fórmula: (e^(growth_rate * budget) - 1) / factor_normalizador
        // O una versión con umbral: 0 si budget < threshold, luego crece rápido.
        const { growth_rate, threshold } = coefficients;

        if (budget < threshold) {
          // Zona muerta: ineficaz hasta cierto punto de inversión
          return 0.1; // Retorno mínimo simbólico o 0
        }

        const effectiveBudget = budget - threshold;
        return Math.exp(growth_rate * effectiveBudget) - 1;
      }

      case 'sigmoid': {
        // Fórmula logística: 1 / (1 + e^(-steepness * (budget - midpoint)))
        // Ideal para proyectos de infraestructura que requieren masa crítica.
        const { steepness, midpoint } = coefficients;
        const exponent = -steepness * (budget - midpoint);
        return 1 / (1 + Math.exp(exponent));
      }

      case 'linear':
      default:
        // Retorno proporcional directo
        return budget / (coefficients.max_ref || 1000);
    }
  }

  /**
   * Calcula la probabilidad final de un evento de riesgo.
   * @param {number} baseRisk - Probabilidad base (0.0 a 1.0).
   * @param {number} budget - Presupuesto actual.
   * @param {object} scalingConfig - Configuración de escalado (type, factor).
   * @returns {number} - Probabilidad final (0.0 a 1.0).
   */
  static calculateRiskProbability(baseRisk, budget, scalingConfig) {
    const { type, factor } = scalingConfig;
    let addedRisk = 0;

    switch (type) {
      case 'linear':
        // Riesgo aumenta constantemente por cada unidad monetaria
        addedRisk = budget * factor;
        break;

      case 'exponential':
        // El riesgo se dispara al aumentar la escala (ej. operaciones encubiertas masivas)
        addedRisk = (Math.exp(factor * budget) - 1) * 0.01; // Ajuste de escala
        break;

      case 'threshold':
        // Solo hay riesgo si se supera cierto monto
        const threshold = scalingConfig.threshold || 0;
        addedRisk = budget > threshold ? factor : 0;
        break;

      default:
        addedRisk = 0;
    }

    // Clampear entre 0 y 1 (100%)
    return Math.min(1.0, Math.max(0.0, baseRisk + addedRisk));
  }
}