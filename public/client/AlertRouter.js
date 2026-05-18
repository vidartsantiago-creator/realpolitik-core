/**
 * AlertRouter.js - Sistema de Enrutamiento y Priorización de Alertas
 *
 * Implementa jerarquía de 4 niveles para notificaciones críticas en tiempo real.
 * Filtra, agrupa y prioriza señales de todos los módulos de reglas.
 *
 * Niveles de Alerta:
 *   0 - informational: Contexto general, sin acción requerida
 *   1 - low: Monitoreo recomendado, impacto menor
 *   2 - urgent: Acción requerida en corto plazo, impacto moderado
 *   3 - critical: Acción inmediata requerida, impacto severo
 *
 * @module AlertRouter
 */

import { getState } from '../../core/StateManager.js';
import { subscribe, publish } from '../../core/EventDispatcher.js';

// ============================================================================
// CONFIGURACIÓN Y CONSTANTES
// ============================================================================

const ALERT_LEVELS = {
  INFORMATIONAL: 0,
  LOW: 1,
  URGENT: 2,
  CRITICAL: 3
};

const ALERT_LABELS = ['informational', 'low', 'urgent', 'critical'];

// Configuración de agrupamiento para evitar spam
const GROUPING_CONFIG = {
  windowMs: 5000,              // Ventana de agrupamiento (5 segundos)
  maxPerWindow: 3,             // Máximo alertas por tipo en ventana
  cooldownMs: 2000,            // Cooldown mínimo entre alertas idénticas
  burstThreshold: 5            // Umbral para considerar "burst" y agrupar
};

// Mapeo de tipos de evento a nivel de alerta por defecto
const EVENT_ALERT_MAPPING = {
  // Crisis - Alta prioridad
  'crisis_started': ALERT_LEVELS.CRITICAL,
  'crisis_escalated': ALERT_LEVELS.CRITICAL,
  'crisis_resolved': ALERT_LEVELS.LOW,

  // Facciones - Variable según contexto
  'faction_signal': ALERT_LEVELS.URGENT,
  'coup_attempt': ALERT_LEVELS.CRITICAL,
  'faction_loyalty_change': ALERT_LEVELS.LOW,

  // Diplomacia
  'treaty_signed': ALERT_LEVELS.INFORMATIONAL,
  'treaty_expired': ALERT_LEVELS.LOW,
  'treaty_rejected': ALERT_LEVELS.URGENT,
  'sanction_imposed': ALERT_LEVELS.URGENT,
  'war_declared': ALERT_LEVELS.CRITICAL,
  'peace_signed': ALERT_LEVELS.LOW,

  // Economía
  'market_crash': ALERT_LEVELS.CRITICAL,
  'budget_deficit_critical': ALERT_LEVELS.URGENT,
  'trade_embargo': ALERT_LEVELS.URGENT,

  // Espionaje
  'espionage_detected': ALERT_LEVELS.URGENT,
  'operation_successful': ALERT_LEVELS.LOW,
  'operation_failed': ALERT_LEVELS.INFORMATIONAL,

  // Default
  'default': ALERT_LEVELS.INFORMATIONAL
};

// Estado interno del router
let state = {
  initialized: false,
  alertQueue: [],
  activeAlerts: new Map(),        // key: alertId, value: alert object
  groupedAlerts: new Map(),       // key: groupKey, value: {count, lastTime, alerts[]}
  subscribers: new Set(),
  tickCount: 0,
  lastCleanupTick: 0
};

// ============================================================================
// UTILIDADES INTERNAS
// ============================================================================

/**
 * Genera ID único para alerta
 */
function generateAlertId(eventType, nationId, timestamp) {
  return `${eventType}_${nationId}_${Math.floor(timestamp / 1000)}`;
}

/**
 * Genera clave de agrupamiento
 */
function getGroupKey(alertType, nationId) {
  return `${alertType}:${nationId}`;
}

/**
 * Calcula score de prioridad para ordenamiento
 * Factores: nivel, frescura, relevancia para jugador
 */
function calculatePriorityScore(alert, playerNations) {
  const levelWeight = alert.level * 1000;
  const freshnessWeight = Math.max(0, 10000 - (Date.now() - alert.timestamp));
  const relevanceWeight = playerNations.includes(alert.nationId) ? 500 : 0;
  const escalationWeight = alert.escalated ? 200 : 0;

  return levelWeight + freshnessWeight + relevanceWeight + escalationWeight;
}

/**
 * Determina si una alerta debe ser suprimida por cooldown/agrupamiento
 */
function shouldSuppressAlert(groupKey, currentTime) {
  const group = state.groupedAlerts.get(groupKey);

  if (!group) return false;

  // Verificar cooldown
  if (currentTime - group.lastTime < GROUPING_CONFIG.cooldownMs) {
    return true;
  }

  // Verificar límite por ventana
  const recentCount = group.alerts.filter(
    a => currentTime - a.timestamp < GROUPING_CONFIG.windowMs
  ).length;

  if (recentCount >= GROUPING_CONFIG.maxPerWindow) {
    return true;
  }

  return false;
}

/**
 * Actualiza tracking de agrupamiento
 */
function updateGroupTracking(groupKey, alert) {
  let group = state.groupedAlerts.get(groupKey);

  if (!group) {
    group = {
      count: 0,
      lastTime: 0,
      alerts: [],
      burstMode: false
    };
    state.groupedAlerts.set(groupKey, group);
  }

  group.count++;
  group.lastTime = alert.timestamp;
  group.alerts.push(alert);

  // Limpiar alertas viejas del grupo
  group.alerts = group.alerts.filter(
    a => alert.timestamp - a.timestamp < GROUPING_CONFIG.windowMs * 2
  );

  // Activar modo burst si supera umbral
  if (group.alerts.length >= GROUPING_CONFIG.burstThreshold) {
    group.burstMode = true;
  }

  return group;
}

/**
 * Limpieza periódica de estado
 */
function performCleanup(currentTick) {
  if (currentTick - state.lastCleanupTick < 60) return; // Cada 60 ticks

  const now = Date.now();

  // Limpiar grupos inactivos
  for (const [key, group] of state.groupedAlerts.entries()) {
    if (now - group.lastTime > GROUPING_CONFIG.windowMs * 4) {
      state.groupedAlerts.delete(key);
    }
  }

  // Limpiar alertas activas expiradas (más de 5 minutos)
  for (const [id, alert] of state.activeAlerts.entries()) {
    if (now - alert.timestamp > 300000) {
      state.activeAlerts.delete(id);
    }
  }

  state.lastCleanupTick = currentTick;
}

// ============================================================================
// LÓGICA PRINCIPAL DE ENRUTAMIENTO
// ============================================================================

/**
 * Procesa evento entrante y genera alerta si corresponde
 */
function processEvent(event) {
  if (!state.initialized) return;

  const { type, payload, timestamp = Date.now() } = event;

  // Determinar nivel de alerta
  let level = EVENT_ALERT_MAPPING[type] || EVENT_ALERT_MAPPING.default;

  // Ajustes contextuales basados en payload
  if (payload) {
    // Escalar si hay impacto crítico
    if (payload.intensity && payload.intensity > 0.8) {
      level = Math.max(level, ALERT_LEVELS.URGENT);
    }

    // Escalar crisis a critical si es fase sistémica
    if (type === 'crisis_escalated' && payload.phase === 3) {
      level = ALERT_LEVELS.CRITICAL;
    }

    // Escalar golpe de estado si probabilidad alta
    if (type === 'coup_attempt' && payload.confidence && payload.confidence > 80) {
      level = ALERT_LEVELS.CRITICAL;
    }
  }

  // Determinar nación afectada
  const nationId = payload?.nationId || payload?.targetNation || 'global';

  // Generar IDs
  const alertId = generateAlertId(type, nationId, timestamp);
  const groupKey = getGroupKey(ALERT_LABELS[level], nationId);

  // Verificar supresión
  if (shouldSuppressAlert(groupKey, timestamp)) {
    // En modo burst, crear alerta agrupada en lugar de suprimir completamente
    const group = state.groupedAlerts.get(groupKey);
    if (!group?.burstMode) {
      return;
    }
  }

  // Construir alerta
  const alert = {
    id: alertId,
    type,
    level,
    levelLabel: ALERT_LABELS[level],
    nationId,
    title: generateAlertTitle(type, payload),
    message: generateAlertMessage(type, payload),
    payload,
    timestamp,
    tick: state.tickCount,
    read: false,
    escalated: false,
    relatedAlerts: []
  };

  // Actualizar tracking
  const group = updateGroupTracking(groupKey, alert);

  // Si es modo burst, marcar como agrupada
  if (group.burstMode && group.alerts.length > 1) {
    alert.grouped = true;
    alert.groupCount = group.alerts.length;
    // Vincular alertas relacionadas
    alert.relatedAlerts = group.alerts
      .slice(-5)
      .filter(a => a.id !== alertId)
      .map(a => a.id);
  }

  // Almacenar alerta activa
  state.activeAlerts.set(alertId, alert);

  // Encolar para distribución
  state.alertQueue.push(alert);

  // Notificar suscriptores
  notifySubscribers(alert);

  // Publicar evento de alerta creada
  publish('alert_created', { alert });
}

/**
 * Genera título de alerta basado en tipo y payload
 */
function generateAlertTitle(eventType, payload) {
  const titles = {
    'crisis_started': `Crisis ${payload?.crisisType || 'Global'} Detectada`,
    'crisis_escalated': `CRISIS ESCALADA - Fase ${payload?.phase || '?'}`,
    'crisis_resolved': `Crisis Resuelta`,
    'faction_signal': `Señal de Facción: ${payload?.factionName || 'Desconocida'}`,
    'coup_attempt': `⚠️ INTENTO DE GOLPE DE ESTADO`,
    'coup_success': `Golpe de Estado Exitoso`,
    'coup_failed': `Golpe de Estado Fracasado`,
    'faction_loyalty_change': `Cambio de Lealtad - ${payload?.factionName || 'Facción'}`,
    'treaty_signed': `Tratado Firmado: ${payload?.treatyName || 'Desconocido'}`,
    'treaty_expired': `Tratado Expirado`,
    'treaty_rejected': `Tratado Rechazado`,
    'sanction_imposed': `Sanciones Impuestas`,
    'war_declared': `🚨 GUERRA DECLARADA`,
    'peace_signed': `Acuerdo de Paz Firmado`,
    'market_crash': `COLAPSO DE MERCADO`,
    'budget_deficit_critical': `Déficit Crítico`,
    'trade_embargo': `Embargo Comercial`,
    'espionage_detected': `Espionaje Detectado`,
    'operation_successful': `Operación Exitosa`,
    'operation_failed': `Operación Fallida`
  };

  return titles[eventType] || `Evento: ${eventType}`;
}

/**
 * Genera mensaje detallado de alerta
 */
function generateAlertMessage(eventType, payload) {
  if (!payload) return 'Sin detalles disponibles';

  const messages = {
    'crisis_started': `Crisis ${payload.crisisType || 'desconocida'} iniciada en ${payload.epicenter || 'región desconocida'}. Intensidad: ${(payload.intensity * 100).toFixed(0)}%`,
    'crisis_escalated': `La crisis ha escalado a fase ${payload.phase}. Intensidad actual: ${(payload.intensity * 100).toFixed(0)}%`,
    'crisis_resolved': `La crisis ha sido resuelta después de ${payload.duration || '?'} ticks.`,
    'faction_signal': `Facción "${payload.factionName}" (${payload.loyaltyTier}) muestra señales de ${payload.signalType}. Confianza: ${payload.confidence}%`,
    'coup_attempt': `Facción militarista iniciando golpe. Probabilidad éxito: ${payload.probability || '?'}%. Ejecución en ${payload.timeToExecution || '?'} ticks.`,
    'faction_loyalty_change': `${payload.factionName} cambió de ${payload.oldTier} a ${payload.newTier}. Delta: ${payload.change}`,
    'treaty_signed': `${payload.participants?.length || 0} naciones firmaron ${payload.treatyName}. Efectos: ${payload.effects?.join(', ') || 'varios'}`,
    'treaty_expired': `El tratado ${payload.treatyName} ha expirado. Efectos terminados.`,
    'treaty_rejected': `Propuesta de ${payload.treatyName} rechazada por ${payload.rejectingNation || 'múltiples naciones'}.`,
    'sanction_imposed': `Sanciones impuestas a ${payload.targetNation}. Tipo: ${payload.sanctionType}, Impacto estimado: ${payload.estimatedImpact || 'desconocido'}`,
    'war_declared': `${payload.attacker} declaró guerra a ${payload.defender}. Casus belli: ${payload.casusBellii || 'no especificado'}`,
    'peace_signed': `Conflicto entre ${payload.party1} y ${payload.party2} terminado. Términos: ${payload.terms || 'no especificados'}`,
    'market_crash': `Caída del ${payload.dropPercent || '?'}% en mercados de ${payload.affectedNation || 'múltiples naciones'}. Contagio probable.`,
    'budget_deficit_critical': `Déficit presupuestario crítico en ${payload.nationName}. Deuda: ${payload.debtRatio || '?'}% del GDP`,
    'trade_embargo': `Embargo comercial activo contra ${payload.targetNation}. Duración estimada: ${payload.duration || 'indefinida'}`,
    'espionage_detected': `Actividad de espionaje detectada de ${payload.sourceNation} en ${payload.targetNation}. Operación: ${payload.operationType || 'desconocida'}`,
    'operation_successful': `Operación de ${payload.operationType} completada exitosamente por ${payload.actorNation || 'nación'}.`,
    'operation_failed': `Operación de ${payload.operationType} falló. Agente comprometido: ${payload.agentCompromised ? 'Sí' : 'No'}`
  };

  return messages[eventType] || JSON.stringify(payload);
}

/**
 * Notifica a todos los suscriptores registrados
 */
function notifySubscribers(alert) {
  for (const callback of state.subscribers) {
    try {
      callback(alert);
    } catch (error) {
      console.error(`[AlertRouter] Error en subscriber:`, error);
    }
  }
}

// ============================================================================
// API PÚBLICA
// ============================================================================

/**
 * Inicializa el AlertRouter
 * @param {Object} cfg - Configuración opcional
 */
export function init(cfg = {}) {
  if (state.initialized) {
    console.warn('[AlertRouter] Ya inicializado');
    return;
  }

  // Aplicar configuración custom
  if (cfg.grouping) {
    Object.assign(GROUPING_CONFIG, cfg.grouping);
  }

  if (cfg.eventMapping) {
    Object.assign(EVENT_ALERT_MAPPING, cfg.eventMapping);
  }

  state.initialized = true;
  state.tickCount = 0;

  // Suscribirse a eventos relevantes
  const eventsToListen = Object.keys(EVENT_ALERT_MAPPING);

  for (const eventType of eventsToListen) {
    subscribe(eventType, processEvent);
  }

  // Suscribirse al tick global para limpieza
  subscribe('tick_start', () => {
    state.tickCount++;
    performCleanup(state.tickCount);
  });

  console.log('[AlertRouter] Inicializado con', eventsToListen.length, 'tipos de evento monitoreados');
}

/**
 * Registra un subscriber para recibir alertas en tiempo real
 * @param {Function} callback - Función(alert) a llamar cuando haya nueva alerta
 * @returns {Function} Función para cancelar suscripción
 */
export function subscribeToAlerts(callback) {
  if (typeof callback !== 'function') {
    throw new Error('Callback debe ser una función');
  }

  state.subscribers.add(callback);

  // Retornar función de unsubscribe
  return () => {
    state.subscribers.delete(callback);
  };
}

/**
 * Obtiene todas las alertas activas
 * @param {Object} filters - Filtros opcionales {level, nationId, type, unread}
 * @returns {Array} Array de alertas ordenadas por prioridad
 */
export function getActiveAlerts(filters = {}) {
  let alerts = Array.from(state.activeAlerts.values());

  // Aplicar filtros
  if (filters.level !== undefined) {
    alerts = alerts.filter(a => a.level === filters.level);
  }

  if (filters.nationId) {
    alerts = alerts.filter(a => a.nationId === filters.nationId || a.nationId === 'global');
  }

  if (filters.type) {
    alerts = alerts.filter(a => a.type === filters.type);
  }

  if (filters.unread) {
    alerts = alerts.filter(a => !a.read);
  }

  if (filters.minLevel !== undefined) {
    alerts = alerts.filter(a => a.level >= filters.minLevel);
  }

  // Ordenar por prioridad
  const playerNations = getPlayerNations();
  alerts.sort((a, b) => {
    const scoreA = calculatePriorityScore(a, playerNations);
    const scoreB = calculatePriorityScore(b, playerNations);
    return scoreB - scoreA; // Descendente
  });

  return alerts;
}

/**
 * Obtiene una alerta específica por ID
 * @param {string} alertId
 * @returns {Object|null}
 */
export function getAlert(alertId) {
  return state.activeAlerts.get(alertId) || null;
}

/**
 * Marca una o más alertas como leídas
 * @param {string|string[]} alertIds
 * @returns {number} Cantidad de alertas marcadas
 */
export function markAsRead(alertIds) {
  const ids = Array.isArray(alertIds) ? alertIds : [alertIds];
  let count = 0;

  for (const id of ids) {
    const alert = state.activeAlerts.get(id);
    if (alert) {
      alert.read = true;
      count++;
    }
  }

  if (count > 0) {
    publish('alerts_marked_read', { count, ids });
  }

  return count;
}

/**
 * Marca todas las alertas como leídas
 * @returns {number} Cantidad total
 */
export function markAllAsRead() {
  let count = 0;
  for (const alert of state.activeAlerts.values()) {
    if (!alert.read) {
      alert.read = true;
      count++;
    }
  }

  if (count > 0) {
    publish('alerts_marked_read', { count, all: true });
  }

  return count;
}

/**
 * Dismiss (elimina) una alerta específica
 * @param {string} alertId
 * @returns {boolean} True si se eliminó
 */
export function dismissAlert(alertId) {
  const existed = state.activeAlerts.delete(alertId);

  if (existed) {
    publish('alert_dismissed', { alertId });
  }

  return existed;
}

/**
 * Obtiene resumen de alertas por nivel
 * @returns {Object} {total, byLevel: {}, unread: {}}
 */
export function getAlertSummary() {
  const summary = {
    total: state.activeAlerts.size,
    byLevel: {
      informational: 0,
      low: 0,
      urgent: 0,
      critical: 0
    },
    unread: {
      total: 0,
      critical: 0,
      urgent: 0
    }
  };

  for (const alert of state.activeAlerts.values()) {
    const label = alert.levelLabel;
    summary.byLevel[label]++;

    if (!alert.read) {
      summary.unread.total++;
      if (label === 'critical') summary.unread.critical++;
      if (label === 'urgent') summary.unread.urgent++;
    }
  }

  return summary;
}

/**
 * Obtiene estadísticas de agrupamiento
 * @returns {Object}
 */
export function getGroupingStats() {
  const stats = {
    activeGroups: state.groupedAlerts.size,
    burstModeActive: 0,
    totalGroupedAlerts: 0
  };

  for (const group of state.groupedAlerts.values()) {
    if (group.burstMode) stats.burstModeActive++;
    stats.totalGroupedAlerts += group.alerts.length;
  }

  return stats;
}

/**
 * Fuerza emisión de alerta manual (para testing o eventos custom)
 * @param {Object} alertData
 * @returns {string} alertId
 */
export function triggerManualAlert(alertData) {
  const {
    type = 'custom_event',
    level = ALERT_LEVELS.INFORMATIONAL,
    nationId = 'global',
    title,
    message,
    payload = {}
  } = alertData;

  const alert = {
    id: generateAlertId(type, nationId, Date.now()),
    type,
    level,
    levelLabel: ALERT_LABELS[level],
    nationId,
    title: title || `Evento Custom: ${type}`,
    message: message || JSON.stringify(payload),
    payload,
    timestamp: Date.now(),
    tick: state.tickCount,
    read: false,
    escalated: false,
    manual: true
  };

  state.activeAlerts.set(alert.id, alert);
  state.alertQueue.push(alert);
  notifySubscribers(alert);
  publish('alert_created', { alert });

  return alert.id;
}

/**
 * Utilidad: obtiene naciones del jugador desde el estado global
 */
function getPlayerNations() {
  const gameState = getState();
  if (!gameState?.nations) return [];

  return Object.entries(gameState.nations)
    .filter(([_, nation]) => nation.isPlayer)
    .map(([id, _]) => id);
}

/**
 * Reinicia estado del router (para testing o nueva partida)
 */
export function reset() {
  state = {
    initialized: state.initialized,
    alertQueue: [],
    activeAlerts: new Map(),
    groupedAlerts: new Map(),
    subscribers: state.subscribers,
    tickCount: 0,
    lastCleanupTick: 0
  };

  console.log('[AlertRouter] Reset completado');
}

// ============================================================================
// EXPORTACIÓN DE CONSTANTES PARA USO EXTERNO
// ============================================================================

export {
  ALERT_LEVELS,
  ALERT_LABELS,
  GROUPING_CONFIG,
  EVENT_ALERT_MAPPING
};