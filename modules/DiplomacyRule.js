/**
 * @file DiplomacyRule.js
 * @description Módulo de reglas diplomáticas: matriz de relaciones, canales directos, sanciones colectivas.
 *              Implementa negociaciones bilaterales secretas y coordinación de sanciones entre aliados.
 * @version 2.0.0
 * @author RealPolitik Core Team
 * @dependencies EventDispatcher, StateManager, Rng, CrisisRule
 * @changelog
 * - v2.0.0: Implementación completa Canal Directo + Sanciones Colectivas.
 * - v1.0.0: Creación inicial. Stub para MVP.
 */

import { on, emit } from '../core/EventDispatcher.js';
import { applyDelta, getState } from '../core/StateManager.js';
import { rng, rngInt } from '../core/Rng.js';

/**
 * Configuración por defecto del sistema diplomático
 */
const DEFAULT_CONFIG = {
  directChannel: {
    maxChannels: 5,
    setupCost: 10,
    secrecyThreshold: 0.70,
    leakChance: 0.08,
    maxDuration: 50
  },
  sanctions: {
    minAllianceMembers: 2,
    coordinationWindow: 10,
    effectivenessBase: 0.40,
    scalingPerMember: 0.15,
    targetPenalty: 0.30,
    diplomaticCost: -5,
    duration: 30
  },
  relations: {
    maxValue: 100,
    minValue: -100,
    neutralRange: [-20, 20],
    allyThreshold: 60,
    enemyThreshold: -60
  }
};

/**
 * Estado interno del módulo de diplomacia
 */
let _state = {
  initialized: false,
  config: null,
  directChannels: new Map(),
  activeSanctions: new Map(),
  pendingCoordination: new Map(),
  negotiationQueue: []
};

/**
 * Inicializa el módulo de diplomacia.
 * @param {{ engine: Object, world: Object, modules: Object }} config - Configuración global
 * @returns {{ success: boolean, errors?: string[] }} Resultado de inicialización
 */
export function init(config) {
  if (_state.initialized) {
    const error = '[DiplomacyRule] Ya inicializado.';
    console.error(error);
    return { success: false, errors: [error] };
  }

  try {
    _state.config = {
      directChannel: { ...DEFAULT_CONFIG.directChannel, ...(config?.directChannel || {}) },
      sanctions: { ...DEFAULT_CONFIG.sanctions, ...(config?.sanctions || {}) },
      relations: { ...DEFAULT_CONFIG.relations, ...(config?.relations || {}) }
    };

    on('tick_start', handleTickStart);
    on('diplomatic_request', handleDiplomaticRequest);
    on('crisis_escalated', handleCrisisEscalated);
    on('alliance_formed', handleAllianceFormed);
    on('alliance_broken', handleAllianceBroken);
    on('nation_aggression', handleNationAggression);

    _state.initialized = true;
    _state.directChannels.clear();
    _state.activeSanctions.clear();
    _state.pendingCoordination.clear();
    _state.negotiationQueue = [];

    console.log('[DiplomacyRule] Inicializado con configuración:', JSON.stringify(_state.config, null, 2));

    return { success: true };
  } catch (error) {
    const errorMsg = `[DiplomacyRule] Error en inicialización: ${error.message}`;
    console.error(errorMsg);
    return { success: false, errors: [errorMsg] };
  }
}

/**
 * Maneja el inicio de cada tick.
 * @param {{ tick: number }} payload
 */
function handleTickStart(payload) {
  const currentTick = payload.tick;
  checkDirectChannelLeaks(currentTick);
  checkSanctionExpirations(currentTick);
  processPendingCoordination(currentTick);
}

/**
 * Maneja solicitudes diplomáticas.
 * @param {{ fromNationId: string, toNationId: string, requestType: string, terms?: Object }} payload
 */
function handleDiplomaticRequest(payload) {
  const { fromNationId, toNationId, requestType, terms } = payload;

  switch (requestType) {
    case 'direct_channel':
      establishDirectChannel(fromNationId, toNationId, terms);
      break;
    case 'treaty_proposal':
      proposeTreaty(fromNationId, toNationId, terms);
      break;
    case 'sanction_request':
      requestSanctionCoordination(fromNationId, toNationId, terms);
      break;
    default:
      console.warn(`[DiplomacyRule] Tipo de solicitud desconocida: ${requestType}`);
  }
}

/**
 * Maneja escalada de crisis para diplomacia de emergencia.
 * @param {{ crisisId: string, phase: number, involvedNations: string[] }} payload
 */
function handleCrisisEscalated(payload) {
  const { crisisId, phase, involvedNations } = payload;

  if (phase >= 3) {
    for (let i = 0; i < involvedNations.length; i++) {
      for (let j = i + 1; j < involvedNations.length; j++) {
        createEmergencyChannel(involvedNations[i], involvedNations[j], crisisId);
      }
    }

    emit('emergency_diplomacy_activated', {
      crisisId,
      channelsCreated: (involvedNations.length * (involvedNations.length - 1)) / 2
    });
  }
}

/**
 * Maneja formación de alianzas.
 * @param {{ allianceId: string, members: string[], type: string }} payload
 */
function handleAllianceFormed(payload) {
  const { allianceId, members } = payload;

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      improveRelations(members[i], members[j], 15);
    }
  }

  emit('alliance_relations_updated', { allianceId, members, bonus: 15 });
}

/**
 * Maneja ruptura de alianzas.
 * @param {{ allianceId: string, members: string[], reason: string }} payload
 */
function handleAllianceBroken(payload) {
  const { allianceId, members } = payload;

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      damageRelations(members[i], members[j], 25);
    }
  }

  emit('alliance_relations_damaged', { allianceId, members, penalty: 25 });
}

/**
 * Maneja actos de agresión entre naciones.
 * @param {{ aggressorId: string, targetId: string, aggressionType: string }} payload
 */
function handleNationAggression(payload) {
  const { aggressorId, targetId } = payload;

  damageRelations(aggressorId, targetId, 40);
  notifyAlliesForSanction(targetId, aggressorId);
}

/**
 * Establece un canal directo bilateral secreto.
 * @param {string} nationA
 * @param {string} nationB
 * @param {Object} terms
 * @returns {{ success: boolean, channelId?: string, errors?: string[] }}
 */
export function establishDirectChannel(nationA, nationB, terms = {}) {
  const state = getState();

  if (!state.nations?.[nationA] || !state.nations?.[nationB]) {
    return { success: false, errors: ['Una o ambas naciones no existen'] };
  }

  const existingChannelsA = countActiveChannels(nationA);
  const existingChannelsB = countActiveChannels(nationB);

  if (existingChannelsA >= _state.config.directChannel.maxChannels ||
      existingChannelsB >= _state.config.directChannel.maxChannels) {
    return { success: false, errors: ['Límite de canales directos alcanzado'] };
  }

  const channelId = `dc_${Date.now()}_${rngInt(1000, 9999)}`;
  const currentState = getState();
  const currentTick = currentState.tick || 0;

  const channel = {
    id: channelId,
    participants: [nationA, nationB].sort(),
    secret: terms.secret ?? true,
    establishedTick: currentTick,
    maxDuration: terms.duration ?? _state.config.directChannel.maxDuration,
    terms: terms.terms || {},
    messages: [],
    leakLevel: 0
  };

  _state.directChannels.set(channelId, channel);

  const delta = {
    nations: {
      [nationA]: { resources: { treasury: -_state.config.directChannel.setupCost } },
      [nationB]: { resources: { treasury: -_state.config.directChannel.setupCost } }
    },
    diplomacy: {
      channels: {
        [channelId]: {
          participants: channel.participants,
          established: currentTick
        }
      }
    },
    tick: currentTick
  };

  const result = applyDelta(delta, 'diplomacy_direct_channel');

  if (result.success) {
    emit('direct_channel_established', {
      channelId,
      participants: channel.participants,
      secret: channel.secret,
      tick: currentTick
    });

    console.log(`[DiplomacyRule] Canal directo establecido: ${nationA} <-> ${nationB}`);

    return { success: true, channelId };
  }

  return { success: false, errors: ['Falló al aplicar delta'] };
}

/**
 * Crea un canal de emergencia durante crisis.
 * @param {string} nationA
 * @param {string} nationB
 * @param {string} crisisId
 */
function createEmergencyChannel(nationA, nationB, crisisId) {
  const channelId = `ec_${crisisId}_${nationA}_${nationB}`;
  const currentState = getState();
  const currentTick = currentState.tick || 0;

  const channel = {
    id: channelId,
    participants: [nationA, nationB].sort(),
    secret: false,
    establishedTick: currentTick,
    maxDuration: 10,
    terms: { emergency: true, crisisId },
    messages: [],
    leakLevel: 0
  };

  _state.directChannels.set(channelId, channel);

  emit('emergency_channel_created', {
    channelId,
    participants: channel.participants,
    crisisId,
    tick: currentTick
  });
}

/**
 * Verifica fugas de información en canales directos.
 * @param {number} currentTick
 */
function checkDirectChannelLeaks(currentTick) {
  for (const [channelId, channel] of _state.directChannels.entries()) {
    if (currentTick - channel.establishedTick > channel.maxDuration) {
      closeDirectChannel(channelId, 'expired');
      continue;
    }

    if (!channel.secret) continue;

    if (rng() < _state.config.directChannel.leakChance) {
      channel.leakLevel = Math.min(channel.leakLevel + 1, 3);

      const leakSeverity = ['suspicion', 'partial_leak', 'compromised'][channel.leakLevel - 1];

      emit('direct_channel_leak', {
        channelId,
        participants: channel.participants,
        leakLevel: channel.leakLevel,
        severity: leakSeverity,
        tick: currentTick
      });

      if (channel.leakLevel >= 3) {
        closeDirectChannel(channelId, 'compromised');
      }
    }
  }
}

/**
 * Cierra un canal directo.
 * @param {string} channelId
 * @param {string} reason
 */
function closeDirectChannel(channelId, reason = 'manual') {
  const channel = _state.directChannels.get(channelId);

  if (!channel) return;

  _state.directChannels.delete(channelId);

  emit('direct_channel_closed', {
    channelId,
    participants: channel.participants,
    reason,
    lastedTicks: (getState().tick || 0) - channel.establishedTick
  });
}

/**
 * Cuenta canales activos de una nación.
 * @param {string} nationId
 * @returns {number}
 */
function countActiveChannels(nationId) {
  let count = 0;
  for (const channel of _state.directChannels.values()) {
    if (channel.participants.includes(nationId)) {
      count++;
    }
  }
  return count;
}

/**
 * Propone un tratado entre dos naciones.
 * @param {string} proposerId
 * @param {string} targetId
 * @param {Object} terms
 */
function proposeTreaty(proposerId, targetId, terms) {
  const currentState = getState();
  const currentTick = currentState.tick || 0;

  _state.negotiationQueue.push({
    id: `negot_${Date.now()}_${rngInt(1000, 9999)}`,
    type: 'treaty',
    proposer: proposerId,
    target: targetId,
    terms,
    proposedTick: currentTick,
    status: 'pending'
  });

  emit('treaty_proposed', {
    proposer: proposerId,
    target: targetId,
    terms,
    tick: currentTick
  });
}

/**
 * Solicita coordinación de sanción a aliados.
 * @param {string} requesterId
 * @param {string} targetId
 * @param {Object} reasons
 */
function requestSanctionCoordination(requesterId, targetId, reasons) {
  const state = getState();
  const currentState = getState();
  const currentTick = currentState.tick || 0;

  const allies = getAllies(requesterId, state);

  if (allies.length < _state.config.sanctions.minAllianceMembers - 1) {
    emit('sanction_coordination_failed', {
      reason: 'insufficient_allies',
      required: _state.config.sanctions.minAllianceMembers,
      available: allies.length + 1,
      tick: currentTick
    });
    return;
  }

  const coordinationId = `coord_sanction_${Date.now()}_${rngInt(1000, 9999)}`;

  _state.pendingCoordination.set(coordinationId, {
    id: coordinationId,
    initiator: requesterId,
    target: targetId,
    potentialMembers: [requesterId, ...allies],
    tickRequested: currentTick,
    deadline: currentTick + _state.config.sanctions.coordinationWindow,
    reasons,
    responses: {}
  });

  for (const allyId of allies) {
    emit('sanction_coordination_request', {
      coordinationId,
      initiator: requesterId,
      target: targetId,
      allyId,
      deadline: _state.config.sanctions.coordinationWindow,
      reasons
    });
  }

  console.log(`[DiplomacyRule] Coordinación de sanción iniciada contra ${targetId}. Aliados notificados: ${allies.length}`);
}

/**
 * Procesa coordinaciones pendientes de sanción.
 * @param {number} currentTick
 */
function processPendingCoordination(currentTick) {
  for (const [coordId, coordination] of _state.pendingCoordination.entries()) {
    if (currentTick >= coordination.deadline) {
      finalizeSanctionCoordination(coordId, currentTick);
    }
  }
}

/**
 * Finaliza una coordinación de sanción.
 * @param {string} coordinationId
 * @param {number} currentTick
 */
function finalizeSanctionCoordination(coordinationId, currentTick) {
  const coordination = _state.pendingCoordination.get(coordinationId);

  if (!coordination) return;

  const confirmedMembers = [coordination.initiator];

  for (const [memberId, response] of Object.entries(coordination.responses)) {
    if (response === 'accept') {
      confirmedMembers.push(memberId);
    }
  }

  if (confirmedMembers.length >= _state.config.sanctions.minAllianceMembers) {
    implementCollectiveSanction(coordination.target, confirmedMembers, coordination.reasons, currentTick);
  } else {
    emit('sanction_coordination_failed', {
      coordinationId,
      reason: 'insufficient_confirmations',
      confirmed: confirmedMembers.length,
      required: _state.config.sanctions.minAllianceMembers,
      tick: currentTick
    });
  }

  _state.pendingCoordination.delete(coordinationId);
}

/**
 * Implementa una sanción colectiva.
 * @param {string} targetId
 * @param {Array<string>} memberIds
 * @param {Object} reasons
 * @param {number} currentTick
 */
function implementCollectiveSanction(targetId, memberIds, reasons, currentTick) {
  const sanctionId = `sanction_${Date.now()}_${rngInt(1000, 9999)}`;

  const memberCount = memberIds.length;
  const effectiveness = Math.min(
    _state.config.sanctions.effectivenessBase +
    (memberCount - 1) * _state.config.sanctions.scalingPerMember,
    0.95
  );

  _state.activeSanctions.set(sanctionId, {
    id: sanctionId,
    target: targetId,
    members: memberIds,
    tickStarted: currentTick,
    duration: _state.config.sanctions.duration,
    effectiveness
  });

  const state = getState();
  const targetNation = state.nations?.[targetId];

  if (!targetNation) return;

  const resources = targetNation.resources || {};
  const totalResources = Object.values(resources).reduce((sum, r) => sum + (typeof r === 'number' ? r : 0), 0);
  const penaltyAmount = Math.floor(totalResources * _state.config.sanctions.targetPenalty * effectiveness);

  const resourceDelta = {};
  const resourceKeys = Object.keys(resources).filter(k => typeof resources[k] === 'number');

  for (const resKey of resourceKeys) {
    resourceDelta[resKey] = -Math.floor(penaltyAmount / resourceKeys.length);
  }

  const delta = {
    nations: {
      [targetId]: {
        resources: resourceDelta,
        stats: {
          stability: -Math.floor(effectiveness * 10)
        }
      }
    },
    tick: currentTick
  };

  const result = applyDelta(delta, 'collective_sanction');

  if (result.success) {
    for (const memberId of memberIds) {
      damageRelations(memberId, targetId, Math.abs(_state.config.sanctions.diplomaticCost));
    }

    emit('collective_sanction_imposed', {
      sanctionId,
      target: targetId,
      members: memberIds,
      effectiveness,
      penaltyApplied: penaltyAmount,
      duration: _state.config.sanctions.duration,
      reasons,
      tick: currentTick
    });

    console.log(`[DiplomacyRule] Sanción colectiva impuesta a ${targetId}. Efectividad: ${(effectiveness * 100).toFixed(1)}%`);
  }
}

/**
 * Verifica expiración de sanciones activas.
 * @param {number} currentTick
 */
function checkSanctionExpirations(currentTick) {
  for (const [sanctionId, sanction] of _state.activeSanctions.entries()) {
    if (currentTick - sanction.tickStarted >= sanction.duration) {
      _state.activeSanctions.delete(sanctionId);

      emit('collective_sanction_expired', {
        sanctionId,
        target: sanction.target,
        lastedTicks: sanction.duration
      });
    }
  }
}

/**
 * Notifica a aliados para posible sanción colectiva.
 * @param {string} victimId
 * @param {string} aggressorId
 */
function notifyAlliesForSanction(victimId, aggressorId) {
  const state = getState();
  const allies = getAllies(victimId, state);

  if (allies.length >= _state.config.sanctions.minAllianceMembers - 1) {
    emit('allies_notified_aggression', {
      victim: victimId,
      aggressor: aggressorId,
      allies: allies,
      sanctionOptionAvailable: true
    });
  }
}

/**
 * Obtiene aliados de una nación.
 * @param {string} nationId
 * @param {Object} state
 * @returns {Array<string>}
 */
function getAllies(nationId, state) {
  const allies = [];
  const relations = state.diplomacy?.relations || {};

  for (const [relKey, relValue] of Object.entries(relations)) {
    if (typeof relValue !== 'number') continue;

    const parts = relKey.split('_');
    if (parts.length >= 2) {
      const otherNation = parts.find(p => p !== nationId);

      if (otherNation && relValue >= _state.config.relations.allyThreshold) {
        allies.push(otherNation);
      }
    }
  }

  return allies;
}

/**
 * Mejora la relación entre dos naciones.
 * @param {string} nationA
 * @param {string} nationB
 * @param {number} amount
 */
function improveRelations(nationA, nationB, amount) {
  const relationKey = [nationA, nationB].sort().join('_');

  const delta = {
    diplomacy: {
      relations: {
        [relationKey]: amount
      }
    },
    tick: getState().tick || 0
  };

  applyDelta(delta, 'diplomacy_improvement');
}

/**
 * Deteriora la relación entre dos naciones.
 * @param {string} nationA
 * @param {string} nationB
 * @param {number} amount
 */
function damageRelations(nationA, nationB, amount) {
  const relationKey = [nationA, nationB].sort().join('_');

  const delta = {
    diplomacy: {
      relations: {
        [relationKey]: -amount
      }
    },
    tick: getState().tick || 0
  };

  applyDelta(delta, 'diplomacy_damage');
}

/**
 * Responde a una solicitud de coordinación de sanción.
 * @param {string} coordinationId
 * @param {string} responderId
 * @param {'accept' | 'decline'} response
 */
export function respondToSanctionRequest(coordinationId, responderId, response) {
  const coordination = _state.pendingCoordination.get(coordinationId);

  if (!coordination) {
    return { success: false, errors: ['Coordinación no encontrada'] };
  }

  if (!coordination.potentialMembers.includes(responderId)) {
    return { success: false, errors: ['Nación no es parte de esta coordinación'] };
  }

  coordination.responses[responderId] = response;

  emit('sanction_response_received', {
    coordinationId,
    responder: responderId,
    response,
    tick: getState().tick || 0
  });

  return { success: true };
}

/**
 * Envía un mensaje por canal directo.
 * @param {string} channelId
 * @param {string} senderId
 * @param {string} message
 */
export function sendDirectMessage(channelId, senderId, message) {
  const channel = _state.directChannels.get(channelId);

  if (!channel) {
    return { success: false, errors: ['Canal no encontrado'] };
  }

  if (!channel.participants.includes(senderId)) {
    return { success: false, errors: ['Nación no es participante del canal'] };
  }

  channel.messages.push({
    sender: senderId,
    content: message,
    tick: getState().tick || 0,
    timestamp: Date.now()
  });

  emit('direct_message_sent', {
    channelId,
    sender: senderId,
    recipient: channel.participants.find(p => p !== senderId),
    tick: getState().tick || 0
  });

  return { success: true };
}

/**
 * Obtiene el estado diplomático actual.
 * @returns {Object}
 */
export function getDiplomacyState() {
  return Object.freeze({
    initialized: _state.initialized,
    directChannelsCount: _state.directChannels.size,
    activeSanctionsCount: _state.activeSanctions.size,
    pendingCoordinationCount: _state.pendingCoordination.size,
    config: { ..._state.config }
  });
}

/**
 * Reinicia el estado del módulo. SOLO para tests.
 * @package
 */
export function _resetForTests() {
  _state = {
    initialized: false,
    config: null,
    directChannels: new Map(),
    activeSanctions: new Map(),
    pendingCoordination: new Map(),
    negotiationQueue: []
  };
}