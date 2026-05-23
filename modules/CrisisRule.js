/**
 * @file CrisisRule.js
 * @description Escalada en 4 fases, Tratados de Emergencia, penalizaciones por crisis global.
 * @version 1.0.0
 * @author RealPolitik Core Team
 * @dependencies EventDispatcher, StateManager, Rng
 * @changelog
 * - v1.0.0: Implementación completa - escalada 4 fases, tratados emergencia, sanciones colectivas
 */

import { on, emit } from '../core/EventDispatcher.js';
import { getState, applyDelta } from '../core/StateManager.js';
import { rng, rngInt } from '../core/Rng.js';

// ============================================================================
// CONSTANTES Y CONFIGURACIÓN
// ============================================================================

const CRISIS_PHASES = {
  LATENT: { id: 0, label: 'Latente', description: 'Tensiones subyacentes' },
  EMERGING: { id: 1, label: 'Emergente', description: 'Primeros signos de inestabilidad' },
  ACUTE: { id: 2, label: 'Aguda', description: 'Crisis activa con impacto' },
  SYSTEMIC: { id: 3, label: 'Sistémica', description: 'Colapso regional' }
};

const CRISIS_TYPES = {
  FINANCIAL: 'financial',
  MIGRATORY: 'migratory',
  HEALTH: 'health',
  ENVIRONMENTAL: 'environmental',
  GEOPOLITICAL: 'geopolitical',
  SUPPLY_CHAIN: 'supply_chain',
  TERRORISM: 'terrorism'
};

const SPREAD_THRESHOLDS = { 0: 0.05, 1: 0.15, 2: 0.30, 3: 0.50 };

const PHASE_DURATIONS = {
  0: { min: 10, max: 20 },
  1: { min: 6, max: 12 },
  2: { min: 4, max: 8 },
  3: { min: 8, max: 15 }
};

const ECONOMIC_PENALTIES = {
  0: { gdp: 0, trade: 0, investment: 0 },
  1: { gdp: -2, trade: -5, investment: -8 },
  2: { gdp: -8, trade: -15, investment: -20 },
  3: { gdp: -20, trade: -35, investment: -50 }
};

const EMERGENCY_TREATIES = {
  BAILOUT: {
    id: 'bailout', name: 'Rescate Financiero',
    requirements: { phase: 2, participants: 3 },
    effects: { stability: 15, gdp: 5, debt: 25 }, duration: 20
  },
  SANCTUARY: {
    id: 'sanctuary', name: 'Corredor Humanitario',
    requirements: { phase: 1, participants: 2 },
    effects: { stability: 8, migration_pressure: -40 }, duration: 15
  },
  EMBARGO: {
    id: 'embargo', name: 'Sanciones Colectivas',
    requirements: { phase: 2, participants: 4 },
    effects: { target_stability: -25, target_gdp: -15 }, duration: 25
  },
  JOINT_INTERVENTION: {
    id: 'joint_intervention', name: 'Intervención Conjunta',
    requirements: { phase: 3, participants: 5 },
    effects: { stability: 30, conflict_intensity: -50 }, duration: 30
  },
  TRADE_LIFELINE: {
    id: 'trade_lifeline', name: 'Corredor Comercial',
    requirements: { phase: 2, participants: 3 },
    effects: { trade: 25, supply_shortage: -30 }, duration: 18
  }
};

const CRISIS_SIGNALS = {
  0: ['Rumores en mercados financieros', 'Movimientos de capital inusuales'],
  1: ['Fuga de capitales acelerada', 'Desplazamiento interno documentado'],
  2: ['Default técnico inminente', 'Cadenas de suministro interrumpidas'],
  3: ['Contagio financiero global', 'Colapso humanitario']
};

// ============================================================================
// ESTADO DEL MÓDULO
// ============================================================================

let config = null;
let activeCrisis = null;
let treatyCooldowns = new Map();
let signalCooldown = 0;

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

export function init(cfg) {
  config = cfg;
  on('tick_start', processCrisisTick);
  on('crisis_trigger', triggerCrisis);
  on('crisis_activation', handleCrisisActivation);
  on('treaty_proposal', handleTreatyProposal);
  on('treaty_sign', handleTreatySigning);
  on('policy_change', evaluatePolicyImpactOnCrisis);
  console.log('[CrisisRule] Inicializado con escalada 4 fases y 5 tratados.');
}

// ============================================================================
// PROCESAMIENTO POR TICK
// ============================================================================

function processCrisisTick(tick) {
  if (!activeCrisis) {
    if (rng() < 0.002) triggerSpontaneousCrisis(tick);
    return;
  }

  activeCrisis.ticksInPhase++;
  const durationConfig = PHASE_DURATIONS[activeCrisis.phase];

  if (activeCrisis.ticksInPhase >= durationConfig.min) {
    if (rng() < calculateEscalationChance()) escalateCrisis(tick);
  }

  applyEconomicPenalties();

  if (signalCooldown <= 0 && tick % 5 === 0) {
    emitCrisisSignals(tick);
    signalCooldown = 8;
  } else {
    signalCooldown--;
  }

  if (shouldResolveCrisis()) resolveCrisis(tick, 'natural');
  updateTreatyCooldowns();
}

// ============================================================================
// TRIGGER Y ESCALADA
// ============================================================================

/**
 * Handler: Trigger de Crisis (evento legacy/alternativo)
 * Permite activar crisis desde eventos externos
 */
function triggerCrisis(data) {
  const state = getState();
  const tick = state?.tick || 0;

  const { crisisType, severity, epicenter, involvedNations } = data;

  if (!crisisType || !epicenter) {
    console.warn('[CrisisRule] triggerCrisis: datos inválidos');
    return;
  }

  const nations = involvedNations || [epicenter];
  const intensityMap = { 'low': 0.3, 'medium': 0.5, 'high': 0.7, 'critical': 0.9 };
  const intensity = intensityMap[severity] || 0.5;

  activeCrisis = {
    type: crisisType,
    phase: 0,
    epicenter,
    affectedNations: [...nations],
    startTick: tick,
    ticksInPhase: 0,
    intensity,
    treatiesActive: [],
     initCrisisData(crisisType)
  };

  emit('crisis_started', {
    type: crisisType,
    phase: 'Latente',
    epicenter,
    tick,
    severity
  });

  console.log(`[CrisisRule] Crisis ${crisisType} triggered en ${epicenter}`);
}

/**
 * Handler: Activación de Crisis desde IntentProcessor
 * Recibe datos de crisis_activation delta y crea la crisis
 */
function handleCrisisActivation(delta) {
  const state = getState();
  const tick = state?.tick || 0;

  const { crisisType, severity, involvedNations, triggeredBy } = delta;

  if (!crisisType || !involvedNations || involvedNations.length === 0) {
    console.warn('[CrisisRule] handleCrisisActivation: datos inválidos');
    return;
  }

  // Determinar epicentro (primera nación o la más vulnerable)
  let epicenter = involvedNations[0];
  let maxVuln = -1;

  for (const nid of involvedNations) {
    const nation = state.nations?.[nid];
    if (nation) {
      const vuln = calculateVulnerability(nation, crisisType);
      if (vuln > maxVuln) {
        maxVuln = vuln;
        epicenter = nid;
      }
    }
  }

  // Mapear severidad a intensidad
  const intensityMap = { 'low': 0.3, 'medium': 0.5, 'high': 0.7, 'critical': 0.9 };
  const intensity = intensityMap[severity] || 0.5;

  activeCrisis = {
    type: crisisType,
    phase: 0,
    epicenter,
    affectedNations: [...involvedNations],
    startTick: tick,
    ticksInPhase: 0,
    intensity,
    treatiesActive: [],
     initCrisisData(crisisType),
    triggeredBy
  };

  emit('crisis_started', {
    type: crisisType,
    phase: 'Latente',
    epicenter,
    tick,
    severity,
    involvedNations,
    triggeredBy
  });

  console.log(`[CrisisRule] Crisis ${crisisType} activada manualmente en ${epicenter} por ${triggeredBy}`);
}

function triggerSpontaneousCrisis(tick) {
  const state = getState();
  const nationIds = Object.keys(state?.nations || {});
  if (nationIds.length === 0) return;

  const types = Object.values(CRISIS_TYPES);
  const weights = [0.20, 0.15, 0.12, 0.13, 0.18, 0.15, 0.07];
  let roll = rng(), cumulative = 0, crisisType = types[types.length - 1];

  for (let i = 0; i < types.length; i++) {
    cumulative += weights[i];
    if (roll < cumulative) { crisisType = types[i]; break; }
  }

  let maxVuln = -1, epicenter = nationIds[0];
  for (const nid of nationIds) {
    const vuln = calculateVulnerability(state.nations[nid], crisisType);
    if (vuln > maxVuln) { maxVuln = vuln; epicenter = nid; }
  }

  activeCrisis = {
    type: crisisType, phase: 0, epicenter, affectedNations: [epicenter],
    startTick: tick, ticksInPhase: 0, intensity: 0.3, treatiesActive: [],
     initCrisisData(crisisType)
  };

  emit('crisis_started', { type: crisisType, phase: 'Latente', epicenter, tick });
  console.log(`[CrisisRule] Crisis ${crisisType} iniciada en ${epicenter}`);
}

function calculateVulnerability(nation, crisisType) {
  const p = nation.policies || {}, s = nation.stats || {};
  switch (crisisType) {
    case 'financial': return 1 - ((p.fiscal_discipline || 0.5) * 0.4 + (s.foreign_reserves || 0.5) * 0.6);
    case 'migratory': return (s.population_density || 0.5) * 0.3 + (1 - (p.social_integration || 0.5)) * 0.4 + (s.unemployment || 0.5) * 0.3;
    case 'health': return 1 - ((p.healthcare_investment || 0.5) * 0.5 + (s.hospital_capacity || 0.5) * 0.5);
    case 'environmental': return (s.carbon_intensity || 0.5) * 0.4 + (1 - (p.environmental_protection || 0.5)) * 0.4;
    case 'geopolitical': return (s.military_spending_ratio || 0.5) * 0.3 + (1 - (s.alliance_strength || 0.5)) * 0.4;
    case 'supply_chain': return (s.import_dependency || 0.5) * 0.5 + (1 - (p.strategic_reserves || 0.5)) * 0.3;
    case 'terrorism': return (s.radicalization_index || 0.5) * 0.4 + (1 - (p.counter_terrorism || 0.5)) * 0.4;
    default: return 0.5;
  }
}

function initCrisisData(type) {
  const base = { casualties: 0, economic_loss: 0, displaced: 0 };
  if (type === 'financial') return { ...base, capital_flight: 0, default_risk: 0.3 };
  if (type === 'migratory') return { ...base, refugee_flow: 0, border_pressure: 0.2 };
  if (type === 'health') return { ...base, infection_rate: 0.1, mortality_rate: 0.02 };
  if (type === 'geopolitical') return { ...base, conflict_intensity: 0.3 };
  if (type === 'supply_chain') return { ...base, shortage_index: 0.2 };
  if (type === 'terrorism') return { ...base, attack_frequency: 0.1 };
  return base;
}

function calculateEscalationChance() {
  const base = SPREAD_THRESHOLDS[activeCrisis.phase];
  const treatyMod = activeCrisis.treatiesActive.length * -0.05;
  const intensityMod = activeCrisis.intensity * 0.1;
  const dur = PHASE_DURATIONS[activeCrisis.phase];
  const timeProgress = Math.max(0, (activeCrisis.ticksInPhase - dur.min) / (dur.max - dur.min));
  return Math.min(0.8, Math.max(0, base + intensityMod + timeProgress * 0.15 + treatyMod));
}

function escalateCrisis(tick) {
  const nextPhase = activeCrisis.phase + 1;
  if (nextPhase > 3) { activeCrisis.intensity = Math.min(1.0, activeCrisis.intensity + 0.1); return; }

  const labels = ['Latente', 'Emergente', 'Aguda', 'Sistémica'];
  activeCrisis.phase = nextPhase;
  activeCrisis.ticksInPhase = 0;
  activeCrisis.intensity = Math.min(1.0, activeCrisis.intensity + 0.15);
  expandAffectedNations();

  emit('crisis_escalated', {
    type: activeCrisis.type, fromPhase: labels[nextPhase - 1], toPhase: labels[nextPhase],
    intensity: activeCrisis.intensity, affectedCount: activeCrisis.affectedNations.length, tick
  });
  console.log(`[CrisisRule] Crisis escalada a ${labels[nextPhase]}`);
}

function expandAffectedNations() {
  const state = getState();
  const spreadChance = SPREAD_THRESHOLDS[activeCrisis.phase];
  for (const nid of Object.keys(state.nations || {})) {
    if (activeCrisis.affectedNations.includes(nid)) continue;
    let chance = spreadChance * activeCrisis.intensity;
    const nation = state.nations[nid];
    if (nation && (nation.region === state.nations[activeCrisis.epicenter]?.region)) chance *= 2;
    chance *= (0.5 + calculateVulnerability(nation, activeCrisis.type));
    if (rng() < chance) {
      activeCrisis.affectedNations.push(nid);
      emit('nation_crisis_affected', { nationId: nid, crisisType: activeCrisis.type, phase: activeCrisis.phase });
    }
  }
}

// ============================================================================
// EFECTOS ECONÓMICOS
// ============================================================================

function applyEconomicPenalties() {
  const state = getState();
  const penalties = ECONOMIC_PENALTIES[activeCrisis.phase];
  const treatyBonus = activeCrisis.treatiesActive.length * 0.15;

  for (const nid of activeCrisis.affectedNations) {
    const nation = state.nations?.[nid];
    if (!nation) continue;
    applyDelta({
      nations: {
        [nid]: {
          gdp_growth: (nation.gdp_growth || 0) + penalties.gdp * (1 - treatyBonus),
          trade_volume: (nation.trade_volume || 100) * (1 + penalties.trade / 100 * (1 - treatyBonus)),
          foreign_investment: (nation.foreign_investment || 50) * (1 + penalties.investment / 100 * (1 - treatyBonus))
        }
      }
    });
  }
}

// ============================================================================
// SEÑALES
// ============================================================================

function emitCrisisSignals(tick) {
  const signals = CRISIS_SIGNALS[activeCrisis.phase];
  if (!signals?.length) return;
  const idx = rngInt(0, signals.length - 1);
  const confidence = 0.6 + activeCrisis.intensity * 0.35;

  emit('faction_signal', {
    source: 'intelligence_network', message: signals[idx],
    priority: activeCrisis.phase >= 3 ? 'critical' : activeCrisis.phase >= 2 ? 'urgent' : 'informational',
    confidence: Math.round(confidence * 100), crisisType: activeCrisis.type, tick
  });
}

// ============================================================================
// TRATADOS
// ============================================================================

function handleTreatyProposal(proposal) {
  if (!activeCrisis) { emit('treaty_rejected', { reason: 'No hay crisis activa' }); return; }
  const treaty = EMERGENCY_TREATIES[proposal.treatyId.toUpperCase()];
  if (!treaty) { emit('treaty_rejected', { reason: 'Tratado desconocido' }); return; }

  if (activeCrisis.phase < treaty.requirements.phase) {
    emit('treaty_rejected', { reason: 'Fase insuficiente' }); return;
  }
  const count = proposal.participants?.length || 0;
  if (count < treaty.requirements.participants) {
    emit('treaty_rejected', { reason: 'Participantes insuficientes' }); return;
  }
  if (treatyCooldowns.has(treaty.id)) { emit('treaty_rejected', { reason: 'En cooldown' }); return; }

  emit('treaty_approved', { treatyId: proposal.treatyId, effects: treaty.effects });
}

function handleTreatySigning(data) {
  if (!activeCrisis) return;
  const treaty = EMERGENCY_TREATIES[data.treatyId.toUpperCase()];
  if (!treaty) return;

  activeCrisis.treatiesActive.push(data.treatyId);
  treatyCooldowns.set(treaty.id, Date.now() + treaty.duration * 1000);
  applyTreatyEffects(treaty, data);

  setTimeout(() => expireTreaty(data.treatyId), treaty.duration * 1000);
  emit('treaty_signed', { treatyId: data.treatyId, name: treaty.name, duration: treaty.duration });
  console.log(`[CrisisRule] Tratado "${treaty.name}" firmado`);
}

function applyTreatyEffects(treaty, data) {
  const state = getState();
  const delta = { nations: {} };
  for (const nid of data.participants || []) {
    const nation = state.nations?.[nid];
    if (!nation) continue;
    const d = {};
    if (treaty.effects.stability) d.stability = (nation.stability || 50) + treaty.effects.stability;
    if (treaty.effects.gdp) d.gdp_growth = (nation.gdp_growth || 0) + treaty.effects.gdp;
    if (treaty.effects.trade) d.trade_volume = (nation.trade_volume || 100) * (1 + treaty.effects.trade / 100);
    if (Object.keys(d).length) delta.nations[nid] = d;
  }
  if (Object.keys(delta.nations).length) applyDelta(delta);
}

function expireTreaty(id) {
  if (!activeCrisis) return;
  const idx = activeCrisis.treatiesActive.indexOf(id);
  if (idx > -1) {
    activeCrisis.treatiesActive.splice(idx, 1);
    const t = EMERGENCY_TREATIES[id.toUpperCase()];
    emit('treaty_expired', { treatyId: id, name: t?.name });
  }
}

function updateTreatyCooldowns() {
  const now = Date.now();
  for (const [id, end] of treatyCooldowns.entries()) {
    if (now > end) treatyCooldowns.delete(id);
  }
}

// ============================================================================
// RESOLUCIÓN
// ============================================================================

function shouldResolveCrisis() {
  if (!activeCrisis) return false;
  const dur = PHASE_DURATIONS[activeCrisis.phase];
  if (activeCrisis.ticksInPhase > dur.max * 2) return true;
  if (activeCrisis.treatiesActive.length >= 3 && activeCrisis.intensity < 0.2) return true;
  return false;
}

function resolveCrisis(tick, reason) {
  const final = { ...activeCrisis };
  emit('crisis_resolved', {
    type: final.type, finalPhase: ['Latente', 'Emergente', 'Aguda', 'Sistémica'][final.phase],
    resolution: reason, totalTicks: tick - final.startTick,
    treatiesUsed: final.treatiesActive, affectedCount: final.affectedNations.length
  });
  activeCrisis = null;
  console.log(`[CrisisRule] Crisis resuelta (${reason})`);
}

function evaluatePolicyImpactOnCrisis(change) {
  if (!activeCrisis) return;
  const map = {
    fiscal_austerity: activeCrisis.type === 'financial' ? -0.08 : 0.02,
    healthcare_investment: activeCrisis.type === 'health' ? -0.10 : 0,
    environmental_regulation: activeCrisis.type === 'environmental' ? -0.07 : 0,
    military_buildup: activeCrisis.type === 'geopolitical' ? 0.05 : -0.02,
    trade_liberalization: activeCrisis.type === 'supply_chain' ? -0.06 : 0.01,
    counter_terrorism: activeCrisis.type === 'terrorism' ? -0.09 : 0
  };
  const effect = map[change.policy] || 0;
  if (effect !== 0) {
    activeCrisis.intensity = Math.max(0.1, Math.min(1.0, activeCrisis.intensity + effect));
    emit('policy_crisis_impact', { policy: change.policy, impact: effect > 0 ? 'negative' : 'positive' });
  }
}

// ============================================================================
// UTILIDADES PÚBLICAS
// ============================================================================

export function getCrisisInfo() {
  if (!activeCrisis) return null;
  return {
    active: true, type: activeCrisis.type,
    phase: ['Latente', 'Emergente', 'Aguda', 'Sistémica'][activeCrisis.phase],
    phaseId: activeCrisis.phase, epicenter: activeCrisis.epicenter,
    affectedNations: activeCrisis.affectedNations, affectedCount: activeCrisis.affectedNations.length,
    intensity: activeCrisis.intensity, ticksInPhase: activeCrisis.ticksInPhase,
    treatiesActive: activeCrisis.treatiesActive, startTick: activeCrisis.startTick
  };
}

export function getTreatyDefinition(id) {
  const t = EMERGENCY_TREATIES[id.toUpperCase()];
  if (!t) return null;
  return { ...t, available: !!activeCrisis && activeCrisis.phase >= t.requirements.phase && !treatyCooldowns.has(t.id) };
}

export function getAvailableTreaties() {
  if (!activeCrisis) return [];
  return Object.keys(EMERGENCY_TREATIES).filter(k => {
    const t = EMERGENCY_TREATIES[k];
    return activeCrisis.phase >= t.requirements.phase && !treatyCooldowns.has(t.id);
  });
}

export const CRISIS_PHASES_PUBLIC = CRISIS_PHASES;
export const CRISIS_TYPES_PUBLIC = CRISIS_TYPES;
export const EMERGENCY_TREATIES_PUBLIC = EMERGENCY_TREATIES;

export default {
  init, getCrisisInfo, getTreatyDefinition, getAvailableTreaties,
  CRISIS_PHASES: CRISIS_PHASES_PUBLIC, CRISIS_TYPES: CRISIS_TYPES_PUBLIC,
  EMERGENCY_TREATIES: EMERGENCY_TREATIES_PUBLIC,
  triggerCrisis, handleCrisisActivation
};

/**
 * Reinicia estado interno. SOLO para tests.
 * @package
 */
export function ResetForTests() {
  activeCrisis = null;
  treatyCooldowns = new Map();
  signalCooldown = 0;
}
