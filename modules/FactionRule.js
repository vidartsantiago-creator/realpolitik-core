/**
 * @file FactionRule.js
 * @description Lealtad dinámica, escalada de complots (3 etapas), señales veladas, bonificaciones por facción.
 * @version 1.0.0
 * @author RealPolitik Core Team
 * @dependencies EventDispatcher, StateManager, Rng
 * @changelog
 * - v1.0.0: Implementación completa - escala 5 niveles, complots 3 etapas, señales con confianza
 */

import { on, emit } from '../core/EventDispatcher.js';
import { getState, applyDelta } from '../core/StateManager.js';
import { rng, rngInt } from '../core/Rng.js';

// ============================================================================
// CONSTANTES Y CONFIGURACIÓN
// ============================================================================

/**
 * Escala de lealtad de facciones (5 niveles)
 */
const LOYALTY_TIERS = {
  ALLIED: { min: 80, max: 100, label: 'Aliados Activos' },
  NEUTRAL: { min: 60, max: 79, label: 'Neutrales' },
  DISCONTENT: { min: 40, max: 59, label: 'Descontentos' },
  ACTIVE: { min: 20, max: 39, label: 'Activos' },
  INSURGENT: { min: 0, max: 19, label: 'Insurgentes' }
};

/**
 * Etapas de complot (3 fases de escalada)
 */
const PLOT_STAGES = {
  RECRUITMENT: 'recruitment',
  PLANNING: 'planning',
  EXECUTION: 'execution'
};

/**
 * Tipos de facciones con sus demandas centrales
 */
const FACTION_TYPES = {
  MILITARISTS: 'militarists',
  TECHNOCRATS: 'technocrats',
  POPULISTS: 'populists',
  FINANCIAL_OLIGARCHY: 'financial_oligarchy',
  REGIONALISTS: 'regionalists'
};

/**
 * Configuración de ventanas de respuesta por etapa de complot (en ticks)
 */
const PLOT_RESPONSE_WINDOWS = {
  [PLOT_STAGES.RECRUITMENT]: { min: 8, max: 12 },
  [PLOT_STAGES.PLANNING]: { min: 4, max: 6 },
  [PLOT_STAGES.EXECUTION]: { min: 1, max: 2 }
};

/**
 * Rangos de confianza típicos por etapa
 */
const CONFIDENCE_RANGES = {
  [PLOT_STAGES.RECRUITMENT]: { min: 50, max: 65 },
  [PLOT_STAGES.PLANNING]: { min: 65, max: 80 },
  [PLOT_STAGES.EXECUTION]: { min: 80, max: 95 }
};

// ============================================================================
// ESTADO DEL MÓDULO
// ============================================================================

let config = null;

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

/**
 * Inicializa el módulo de facciones.
 * @param {{ engine: Object, world: Object, modules: Object }} cfg - Configuración global
 */
export function init(cfg) {
  config = cfg;

  // Suscribirse a eventos del core
  on('tick_start', processFactionTick);
  on('faction_action', handleFactionAction);
  on('policy_change', handlePolicyChange);

  console.log('[FactionRule] Inicializado con sistema de 5 niveles de lealtad y 3 etapas de complot.');
}

// ============================================================================
// PROCESAMIENTO POR TICK
// ============================================================================

/**
 * Procesa actualizaciones de facciones por tick.
 * @param {number} tick - Número de tick actual
 */
function processFactionTick(tick) {
  const state = getState();
  if (!state || !state.nations) return;

  const deltas = [];

  // Procesar cada nación
  for (const [nationId, nation] of Object.entries(state.nations)) {
    if (!nation.factions) continue;

    // Procesar cada facción de la nación
    for (const [factionId, faction] of Object.entries(nation.factions)) {
      // 1. Actualizar tendencia de lealtad (decay natural si está en zona de riesgo)
      const loyaltyDecay = calculateLoyaltyDecay(faction, tick);

      // 2. Verificar y actualizar etapa de complot
      const plotUpdate = updatePlotStage(faction, tick);

      // 3. Generar señales si corresponde
      const signals = generateSignals(nationId, factionId, faction, tick);

      // 4. Aplicar bonificaciones/penalizaciones según nivel de lealtad
      const bonuses = applyFactionEffects(nationId, factionId, faction, tick);

      // Construir delta si hubo cambios
      if (loyaltyDecay !== 0 || plotUpdate || signals.length > 0 || bonuses) {
        deltas.push({
          source: 'faction_effect',
          nations: {
            [nationId]: {
              factions: {
                [factionId]: {
                  loyalty: faction.loyalty + loyaltyDecay,
                  plotStage: faction.plotStage || null,
                  plotTicksRemaining: faction.plotTicksRemaining,
                  lastSignalTick: faction.lastSignalTick || tick
                }
              }
            }
          }
        });
      }
    }
  }

  // Aplicar todos los deltas acumulados
  for (const delta of deltas) {
    applyDelta(delta);
  }

  // Emitir señales generadas
  for (const signal of collectSignals(deltas, tick)) {
    emit('faction_signal', signal);
  }

  // Verificar golpes de estado
  checkCoupAttempts(state, tick);
}

// ============================================================================
// CÁLCULO DE LEALTAD
// ============================================================================

/**
 * Calcula el decay natural de lealtad basado en el estado actual.
 * @param {Object} faction - Estado de la facción
 * @param {number} tick - Tick actual
 * @returns {number} - Cambio de lealtad (negativo para decay)
 */
function calculateLoyaltyDecay(faction, tick) {
  let decay = 0;
  const loyalty = faction.loyalty || 50;

  // Decay más pronunciado en zonas bajas
  if (loyalty < LOYALTY_TIERS.DISCONTENT.min) {
    decay = -rngInt(1, 3);
  } else if (loyalty < LOYALTY_TIERS.NEUTRAL.min) {
    decay = -rngInt(0, 1);
  }

  // Bonificación por estar en zona aliada
  if (loyalty >= LOYALTY_TIERS.ALLIED.min) {
    decay = rngInt(0, 1);
  }

  return decay;
}

/**
 * Actualiza la etapa del complot según lealtad y tiempo transcurrido.
 * @param {Object} faction - Estado de la facción
 * @param {number} tick - Tick actual
 * @returns {boolean} - true si hubo cambio de etapa
 */
function updatePlotStage(faction, tick) {
  const loyalty = faction.loyalty || 50;
  let stageChanged = false;

  // Si la lealtad sube a zona segura, resetear complot
  if (loyalty >= LOYALTY_TIERS.NEUTRAL.min && faction.plotStage) {
    faction.plotStage = null;
    faction.plotTicksRemaining = null;
    faction.plotStartTime = null;
    return true;
  }

  // Iniciar complot si cae a zona insurgente
  if (loyalty <= LOYALTY_TIERS.INSURGENT.max && !faction.plotStage) {
    faction.plotStage = PLOT_STAGES.RECRUITMENT;
    faction.plotStartTime = tick;
    faction.plotTicksRemaining = rngInt(
      PLOT_RESPONSE_WINDOWS[PLOT_STAGES.RECRUITMENT].min,
      PLOT_RESPONSE_WINDOWS[PLOT_STAGES.RECRUITMENT].max
    );
    return true;
  }

  // Avanzar etapa del complot
  if (faction.plotStage) {
    faction.plotTicksRemaining--;

    if (faction.plotTicksRemaining <= 0) {
      stageChanged = advancePlotStage(faction, tick);
    }
  }

  return stageChanged;
}

/**
 * Avanza el complot a la siguiente etapa.
 * @param {Object} faction - Estado de la facción
 * @param {number} tick - Tick actual
 * @returns {boolean} - true si avanzó
 */
function advancePlotStage(faction, tick) {
  const currentStage = faction.plotStage;

  if (currentStage === PLOT_STAGES.RECRUITMENT) {
    faction.plotStage = PLOT_STAGES.PLANNING;
    faction.plotTicksRemaining = rngInt(
      PLOT_RESPONSE_WINDOWS[PLOT_STAGES.PLANNING].min,
      PLOT_RESPONSE_WINDOWS[PLOT_STAGES.PLANNING].max
    );
    return true;
  }

  if (currentStage === PLOT_STAGES.PLANNING) {
    faction.plotStage = PLOT_STAGES.EXECUTION;
    faction.plotTicksRemaining = rngInt(
      PLOT_RESPONSE_WINDOWS[PLOT_STAGES.EXECUTION].min,
      PLOT_RESPONSE_WINDOWS[PLOT_STAGES.EXECUTION].max
    );
    return true;
  }

  return false;
}

// ============================================================================
// GENERACIÓN DE SEÑALES
// ============================================================================

/**
 * Genera señales veladas para el feed de inteligencia.
 */
function generateSignals(nationId, factionId, faction, tick) {
  const signals = [];
  const loyalty = faction.loyalty || 50;

  if (loyalty >= LOYALTY_TIERS.DISCONTENT.min) return signals;

  const cooldownTicks = 5;
  if (faction.lastSignalTick && (tick - faction.lastSignalTick) < cooldownTicks) {
    return signals;
  }

  const plotStage = faction.plotStage;
  if (!plotStage) return signals;

  const confidenceRange = CONFIDENCE_RANGES[plotStage];
  const confidence = rngInt(confidenceRange.min, confidenceRange.max) / 100;
  const signalText = getSignalText(faction.type, plotStage, confidence);

  signals.push({
    nationId,
    factionId,
    plotStage,
    signalText,
    confidenceLevel: confidence,
    tick,
    priority: getSignalPriority(plotStage)
  });

  faction.lastSignalTick = tick;
  return signals;
}

/**
 * Obtiene el texto de la señal según tipo de facción y etapa.
 */
function getSignalText(factionType, stage, confidence) {
  const signalTemplates = {
    [FACTION_TYPES.MILITARISTS]: {
      [PLOT_STAGES.RECRUITMENT]: ['Reuniones no registradas en cuarteles del sur', 'Contactos frecuentes entre oficiales retirados'],
      [PLOT_STAGES.PLANNING]: ['Movimientos inusuales de fondos en cuentas de oficiales', 'Comunicaciones encriptadas desde instalaciones militares'],
      [PLOT_STAGES.EXECUTION]: ['Fuentes confirman movilización en zonas clave de la capital', 'Unidades militares en posición de alerta no autorizada']
    },
    [FACTION_TYPES.POPULISTS]: {
      [PLOT_STAGES.RECRUITMENT]: ['Asambleas sindicales extraordinarias', 'Discursos inflamatorios en redes sociales'],
      [PLOT_STAGES.PLANNING]: ['Acopio de materiales para manifestaciones masivas', 'Convocatoria a huelga general en discusión'],
      [PLOT_STAGES.EXECUTION]: ['Movilizaciones masivas convergiendo al centro', 'Ocupación de espacios públicos estratégicos']
    },
    [FACTION_TYPES.FINANCIAL_OLIGARCHY]: {
      [PLOT_STAGES.RECRUITMENT]: ['Transferencias sospechosas a cuentas offshore', 'Reuniones cerradas con inversores extranjeros'],
      [PLOT_STAGES.PLANNING]: ['Fuga de capitales acelerada detectada', 'Presión coordinada sobre calificadoras de riesgo'],
      [PLOT_STAGES.EXECUTION]: ['Colapso cambiario inminente por venta masiva', 'Default técnico en preparación']
    },
    [FACTION_TYPES.TECHNOCRATS]: {
      [PLOT_STAGES.RECRUITMENT]: ['Renuncias en masa de funcionarios técnicos', 'Filtración de informes críticos a prensa'],
      [PLOT_STAGES.PLANNING]: ['Sabotaje burocrático a políticas clave', 'Retención de información estratégica'],
      [PLOT_STAGES.EXECUTION]: ['Parálisis administrativa generalizada', 'Éxodo de profesionales clave anunciado']
    },
    [FACTION_TYPES.REGIONALISTS]: {
      [PLOT_STAGES.RECRUITMENT]: ['Declaraciones autonomistas en asambleas locales', 'Coordinación con gobiernos provinciales'],
      [PLOT_STAGES.PLANNING]: ['Referéndum consultivo en preparación', 'Bloqueo de rutas interprovinciales'],
      [PLOT_STAGES.EXECUTION]: ['Declaración unilateral de autonomía', 'Control regional de recursos estratégicos']
    }
  };

  const typeTemplates = signalTemplates[factionType] || signalTemplates[FACTION_TYPES.MILITARISTS];
  const stageTemplates = typeTemplates[stage] || ['Actividad sospechosa detectada'];
  const index = rngInt(0, stageTemplates.length - 1);
  return stageTemplates[index];
}

/**
 * Obtiene la prioridad de la señal según etapa.
 */
function getSignalPriority(stage) {
  switch (stage) {
    case PLOT_STAGES.EXECUTION: return 'critical';
    case PLOT_STAGES.PLANNING: return 'urgent';
    default: return 'informational';
  }
}

// ============================================================================
// EFECTOS DE FACCIÓN
// ============================================================================

/**
 * Aplica bonificaciones o penalizaciones según nivel de lealtad.
 */
function applyFactionEffects(nationId, factionId, faction, tick) {
  const loyalty = faction.loyalty || 50;
  const effects = { budget: 0, stability: 0, intelligence: 0 };

  if (loyalty >= LOYALTY_TIERS.ALLIED.min) {
    switch (faction.type) {
      case FACTION_TYPES.MILITARISTS: effects.stability += 2; break;
      case FACTION_TYPES.TECHNOCRATS: effects.budget += 5; break;
      case FACTION_TYPES.POPULISTS: effects.stability += 1; break;
      case FACTION_TYPES.FINANCIAL_OLIGARCHY: effects.budget += 8; break;
      case FACTION_TYPES.REGIONALISTS: effects.stability += 1; break;
    }
  }

  if (loyalty < LOYALTY_TIERS.DISCONTENT.min && loyalty >= LOYALTY_TIERS.ACTIVE.min) {
    effects.stability -= 3;
    effects.intelligence -= 10;
  }

  if (loyalty <= LOYALTY_TIERS.INSURGENT.max) {
    effects.stability -= 8;
    effects.budget -= 5;
    effects.intelligence -= 25;
  }

  if (effects.budget !== 0 || effects.stability !== 0 || effects.intelligence !== 0) {
    applyDelta({
      source: 'faction_effect',
      nations: {
        [nationId]: {
          stats: { budget: effects.budget, stability: effects.stability },
          intelligence: effects.intelligence
        }
      }
    });
    return effects;
  }

  return null;
}

// ============================================================================
// MANEJO DE ACCIONES DEL JUGADOR
// ============================================================================

/**
 * Maneja acciones del jugador que afectan facciones.
 */
function handleFactionAction(event) {
  const { nationId, factionId, actionType, magnitude } = event;
  const state = getState();

  if (!state || !state.nations?.[nationId]?.factions?.[factionId]) {
    console.warn(`[FactionRule] Facción no encontrada: ${nationId}/${factionId}`);
    return;
  }

  const faction = state.nations[nationId].factions[factionId];
  let loyaltyChange = 0;

  switch (actionType) {
    case 'satisfy_demand': loyaltyChange = Math.min(20, magnitude * 10); break;
    case 'ignore_demand': loyaltyChange = -Math.min(15, magnitude * 5); break;
    case 'repress':
      loyaltyChange = -Math.min(25, magnitude * 15);
      if (faction.plotStage) advancePlotStage(faction, state.tick);
      break;
    case 'negotiate': loyaltyChange = rngInt(5, 15); break;
    case 'concede': loyaltyChange = rngInt(10, 20); break;
    default:
      console.warn(`[FactionRule] Acción desconocida: ${actionType}`);
      return;
  }

  const newLoyalty = Math.max(0, Math.min(100, faction.loyalty + loyaltyChange));

  applyDelta({
    source: 'player',
    nations: { [nationId]: { factions: { [factionId]: { loyalty: newLoyalty } } } }
  });

  emit('faction_loyalty_change', {
    nationId, factionId, oldLoyalty: faction.loyalty, newLoyalty,
    change: loyaltyChange, actionType, tick: state.tick
  });
}

/**
 * Maneja cambios de política que afectan facciones.
 */
function handlePolicyChange(event) {
  const { policyType } = event;
  const state = getState();
  if (!state || !state.nations) return;

  const factionImpacts = {
    military_spending_increase: { [FACTION_TYPES.MILITARISTS]: 10, [FACTION_TYPES.POPULISTS]: -5, [FACTION_TYPES.TECHNOCRATS]: -3 },
    austerity_measures: { [FACTION_TYPES.POPULISTS]: -15, [FACTION_TYPES.FINANCIAL_OLIGARCHY]: 8, [FACTION_TYPES.TECHNOCRATS]: 5 },
    privatization: { [FACTION_TYPES.FINANCIAL_OLIGARCHY]: 12, [FACTION_TYPES.POPULISTS]: -10, [FACTION_TYPES.REGIONALISTS]: -5 },
    decentralization: { [FACTION_TYPES.REGIONALISTS]: 15, [FACTION_TYPES.MILITARISTS]: -5 },
    welfare_expansion: { [FACTION_TYPES.POPULISTS]: 12, [FACTION_TYPES.FINANCIAL_OLIGARCHY]: -8 }
  };

  const impacts = factionImpacts[policyType];
  if (!impacts) return;

  for (const [nationId, nation] of Object.entries(state.nations)) {
    if (!nation.factions) continue;

    for (const [factionId, faction] of Object.entries(nation.factions)) {
      const factionImpact = impacts[faction.type];
      if (factionImpact === undefined) continue;

      const newLoyalty = Math.max(0, Math.min(100, faction.loyalty + factionImpact));

      if (newLoyalty !== faction.loyalty) {
        applyDelta({
          source: 'policy_change',
          nations: { [nationId]: { factions: { [factionId]: { loyalty: newLoyalty } } } }
        });

        emit('faction_loyalty_change', {
          nationId, factionId, oldLoyalty: faction.loyalty, newLoyalty,
          change: factionImpact, policyType, tick: state.tick
        });
      }
    }
  }
}

// ============================================================================
// VERIFICACIÓN DE GOLPES DE ESTADO
// ============================================================================

/**
 * Verifica y ejecuta intentos de golpe de estado.
 */
function checkCoupAttempts(state, tick) {
  if (!state || !state.nations) return;

  for (const [nationId, nation] of Object.entries(state.nations)) {
    if (!nation.factions) continue;

    for (const [factionId, faction] of Object.entries(nation.factions)) {
      if (faction.type !== FACTION_TYPES.MILITARISTS) continue;
      if (faction.plotStage !== PLOT_STAGES.EXECUTION) continue;
      if (faction.plotTicksRemaining > 0) continue;

      const successChance = calculateCoupSuccessChance(faction, nation);
      const roll = rng();
      const coupSuccessful = roll < successChance;

      emit('coup_attempt', {
        nationId, factionId, success: coupSuccessful,
        confidence: faction.loyalty / 100, tick,
        casualties: coupSuccessful ? rngInt(10, 100) : rngInt(50, 500),
        internationalResponse: getInternationalResponse(coupSuccessful)
      });

      if (coupSuccessful) {
        applyDelta({
          source: 'faction_effect',
          nations: {
            [nationId]: {
              stats: { stability: -50, budget: -30 },
              government: 'junta_militar',
              internationalStatus: 'sanctioned'
            }
          }
        });
      } else {
        applyDelta({
          source: 'faction_effect',
          nations: {
            [nationId]: {
              factions: { [factionId]: { loyalty: 0, plotStage: null, plotTicksRemaining: null } },
              stats: { stability: -20, military: -15 }
            }
          }
        });
      }
    }
  }
}

/**
 * Calcula probabilidad de éxito de un golpe.
 */
function calculateCoupSuccessChance(faction, nation) {
  let chance = 0.3;
  chance += (LOYALTY_TIERS.INSURGENT.max - faction.loyalty) / 200;
  if (nation.militaryStrength) chance += Math.min(0.2, nation.militaryStrength / 500);
  if (nation.stats?.stability > 60) chance -= 0.15;
  chance += (rng() - 0.5) * 0.2;
  return Math.max(0.1, Math.min(0.9, chance));
}

/**
 * Determina respuesta internacional a un golpe.
 */
function getInternationalResponse(successful) {
  if (!successful) return 'condemnation_attempted';
  const responses = ['sanctions', 'embargo', 'diplomatic_isolation', 'military_intervention_threat'];
  return responses[rngInt(0, responses.length - 1)];
}

// ============================================================================
// UTILIDADES
// ============================================================================

function collectSignals(deltas, tick) {
  const signals = [];
  for (const delta of deltas) {
    if (!delta.nations) continue;
    for (const [nationId, nationData] of Object.entries(delta.nations)) {
      if (!nationData.factions) continue;
      for (const [factionId, factionData] of Object.entries(nationData.factions)) {
        if (factionData.plotStage) {
          const confidenceRange = CONFIDENCE_RANGES[factionData.plotStage];
          signals.push({
            nationId, factionId,
            plotStage: factionData.plotStage,
            signalText: 'Actualización de actividad de facción',
            confidenceLevel: rngInt(confidenceRange.min, confidenceRange.max) / 100,
            tick,
            priority: getSignalPriority(factionData.plotStage)
          });
        }
      }
    }
  }
  return signals;
}

/**
 * Obtiene el tier de lealtad actual.
 */
export function getLoyaltyTier(loyalty) {
  for (const [tierName, tier] of Object.entries(LOYALTY_TIERS)) {
    if (loyalty >= tier.min && loyalty <= tier.max) return tierName;
  }
  return 'UNKNOWN';
}

/**
 * Obtiene información detallada de una facción.
 */
export function getFactionInfo(nationId, factionId) {
  const state = getState();
  if (!state || !state.nations?.[nationId]?.factions?.[factionId]) return null;

  const faction = state.nations[nationId].factions[factionId];
  const tier = getLoyaltyTier(faction.loyalty);

  return {
    ...faction,
    loyaltyTier: tier,
    tierLabel: LOYALTY_TIERS[tier]?.label || 'Desconocido',
    plotStageLabel: faction.plotStage ? faction.plotStage.charAt(0).toUpperCase() + faction.plotStage.slice(1) : null,
    ticksUntilNextStage: faction.plotTicksRemaining
  };
}

// Exportar constantes para tests
export { LOYALTY_TIERS, PLOT_STAGES, FACTION_TYPES, CONFIDENCE_RANGES };

/**
 * Reinicia estado interno. SOLO para tests.
 * @package
 */
export function ResetForTests() {
  // No hay estado interno persistente en este módulo más allá del StateManager global
  // El reset se maneja vía StateManager.ResetForTests()
}