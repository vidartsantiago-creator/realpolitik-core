/**
 * @file UIMessageHandler.js
 * @description Manejador de mensajes de la interfaz: procesa decisiones del jugador
 *              y emite eventos a los módulos correspondientes (PolicyRule, etc).
 * @version 1.0.0
 * @author RealPolitik Core Team
 * @dependencies EventDispatcher, PolicyRule
 * @changelog
 * - v1.0.0: Creación inicial. Stub para MVP.
 */

import { on, emit } from '../core/EventDispatcher.js';
import { getState } from '../core/StateManager.js';

/**
 * Inicializa el manejador de mensajes de UI.
 * @param {Object} config - Configuración global
 */
export function init(config) {
  console.log('[UIMessageHandler] Inicializado.');

  // Suscribirse a mensajes WebSocket desde client
  setupMessageHandlers();
}

/**
 * Configura handlers para tipos de mensajes entrantes.
 */
function setupMessageHandlers() {
  // Escuchar player_intent desde WebSocketServer
  on('ws.message.player_intent', handlePlayerIntent);

  // Escuchar consultas al advisor
  on('ws.message.advisor_query', handleAdvisorQuery);

  console.log('[UIMessageHandler] Handlers configurados.');
}

/**
 * Maneja intenciones del jugador recibidas desde la UI.
 * @param {{ nationId: string, intentions: Array, selectedOption: number }} payload
 */
function handlePlayerIntent(payload) {
  console.log('[UIMessageHandler] Intención recibida:', payload);

  const { nationId, intentions, selectedOption } = payload;

  if (!nationId || !intentions || intentions.length === 0) {
    console.warn('[UIMessageHandler] Intención inválida:', payload);
    emit('intent_rejected', {
      nationId,
      reason: 'Datos incompletos'
    });
    return;
  }

  // Validar que la nación existe
  const state = getState();
  const nation = state.nations && state.nations[nationId];

  if (!nation) {
    console.warn('[UIMessageHandler] Nación no encontrada:', nationId);
    emit('intent_rejected', {
      nationId,
      reason: 'Nación no encontrada'
    });
    return;
  }

  // Emitir evento para que PolicyRule procese la intención
  // PolicyRule ya está suscrito a 'player_intent'
  emit('player_intent', {
    nationId,
    intentions,
    selectedOption,
    tick: state.tick
  });

  console.log('[UIMessageHandler] Intención forward a PolicyRule:', nationId);
}

/**
 * Maneja consultas al asesor IA.
 * @param {{ nationId: string, type: string, params: Object }} payload
 */
function handleAdvisorQuery(payload) {
  console.log('[UIMessageHandler] Consulta advisor:', payload);

  const { nationId, type, params } = payload;

  // Validar nación
  const state = getState();
  const nation = state.nations && state.nations[nationId];

  if (!nation) {
    emit('advisor_response', {
      nationId,
      error: 'Nación no encontrada'
    });
    return;
  }

  // Para MVP: responder con datos básicos
  // En Fase 2: conectar con AdvisorEngine.js
  const response = {
    nationId,
    type,
    suggestion: {
      headline: 'Análisis Básico',
      message: `Métricas actuales: Estabilidad ${nation.stats?.stability || 0}, Presupuesto ${nation.stats?.budget || 0}`,
      recommendation: {
        actionType: 'monitor',
        priority: 'normal'
      }
    }
  };

  emit('advisor_response', response);
}

/**
 * Envía respuesta al cliente vía WebSocket.
 * @param {string} eventType - Tipo de evento
 * @param {Object} data - Datos a enviar
 */
function sendToClient(eventType, data) {
  // El WebSocketServer escuchará estos eventos y los reenviará
  emit(eventType, data);
}