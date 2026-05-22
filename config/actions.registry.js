/**
 * Registro Central de Acciones Diplomáticas
 * @description Define la metadata de todas las acciones posibles.
 *              El sistema lee esto para validar, calcular costos y ejecutar efectos.
 * 
 * Estructura de una acción:
 * - id: Identificador único (clave del objeto)
 * - label: Nombre visible en UI
 * - category: Categoría lógica (economic, covert, aid, investment)
 * - cost: Costo inmediato { gold, influence, stability }
 * - requirements: Requisitos mínimos { minRelation, minBudget, techLevel }
 * - effects: Efectos inmediatos y pasivos { relationDelta, reputationDelta, flags }
 * - handler: Ruta al módulo que contiene la lógica específica (opcional si es estándar)
 * - aiWeight: Probabilidad relativa de que la IA use esta acción (0-1)
 */

export const ACTION_REGISTRY = {
  // --- ACCIONES ECONÓMICAS ---
  'sanctions_economic': {
    label: 'Sanciones Económicas',
    category: 'economic',
    cost: { gold: 50, influence: 10 },
    requirements: { minRelation: -20, minBudget: 100 },
    effects: {
      relationDelta: -15,
      reputationDelta: -5,
      targetEffect: { tradeIncomeMultiplier: 0.5 }, // Reduce ingresos comerciales del objetivo
      duration: 20 // Ticks
    },
    aiWeight: 0.7
  },
  
  'sanctions_financial': {
    label: 'Sanciones Financieras',
    category: 'economic',
    cost: { gold: 30, influence: 15 },
    requirements: { minRelation: -10, minBudget: 80 },
    effects: {
      relationDelta: -10,
      reputationDelta: -2,
      targetEffect: { budgetDecayPerTick: 0.5 }, // Drena presupuesto lentamente
      duration: 15
    },
    aiWeight: 0.6
  },

  // --- ACCIONES ENCUBIERTAS ---
  'covert_coup': {
    label: 'Promover Golpe de Estado',
    category: 'covert',
    cost: { gold: 300, influence: 50 },
    requirements: { minRelation: -50, minBudget: 200, targetStabilityMax: 60 },
    effects: {
      relationDelta: -40, // Si falla o se descubre
      reputationDelta: -20,
      successChanceBase: 0.3, // 30% base + modificadores
      onSuccess: { stabilityDamage: 50, regimeChange: true },
      onFail: { warRisk: 0.8 } // 80% probabilidad de guerra
    },
    aiWeight: 0.2
  },

  // --- AYUDA HUMANITARIA ---
  'aid_humanitarian': {
    label: 'Ayuda Humanitaria',
    category: 'aid',
    cost: { gold: 100, food: 50 },
    requirements: { minBudget: 50, targetStabilityMax: 40 }, // Solo a naciones inestables/pobres
    effects: {
      relationDelta: 25,
      reputationDelta: 15,
      targetEffect: { stabilityBoost: 10, foodBoost: 20 },
      duration: 1 // Instantáneo
    },
    aiWeight: 0.8
  },

  'aid_refugees': {
    label: 'Aceptar Refugiados',
    category: 'aid',
    cost: { gold: 20, stability: 5 }, // Costo interno de estabilidad
    requirements: { minBudget: 30 },
    effects: {
      relationDelta: 15,
      reputationDelta: 10,
      targetEffect: { stabilityBoost: 5 },
      actorEffect: { populationGrowth: 0.02 } // Pequeño bonus poblacional
    },
    aiWeight: 0.5
  },

  // --- INVERSIONES ---
  'investment_infrastructure': {
    label: 'Inversión en Infraestructura',
    category: 'investment',
    cost: { gold: 500 },
    requirements: { minRelation: 20, minBudget: 300 },
    effects: {
      relationDelta: 10,
      reputationDelta: 5,
      targetEffect: { economyGrowthMultiplier: 1.2 },
      actorEffect: { passiveGoldIncome: 5 }, // Retorno de inversión por tick
      duration: 100 // Duración del tratado
    },
    aiWeight: 0.9
  },

  'investment_cultural': {
    label: 'Promoción Cultural',
    category: 'investment',
    cost: { gold: 150 },
    requirements: { minRelation: 0, minBudget: 100 },
    effects: {
      relationDelta: 5,
      reputationDelta: 2,
      targetEffect: { influenceDecayReduction: 0.1 },
      actorEffect: { influenceGainPerTick: 0.5 },
      duration: 50
    },
    aiWeight: 0.6
  }
};

// Helper para obtener una acción por ID
export function getAction(actionId) {
  return ACTION_REGISTRY[actionId] || null;
}

// Helper para listar acciones por categoría
export function getActionsByCategory(category) {
  return Object.entries(ACTION_REGISTRY)
    .filter(([_, data]) => data.category === category)
    .map(([id, data]) => ({ id, ...data }));
}

// Helper para listar todas las acciones disponibles
export function getAllActions() {
  return Object.entries(ACTION_REGISTRY).map(([id, data]) => ({ id, ...data }));
}