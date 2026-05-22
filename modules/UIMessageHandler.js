/**
 * @file UIMessageHandler.js
 * @description Manejador de mensajes de la interfaz: procesa decisiones del jugador
 *              y emite eventos a los módulos correspondientes.
 * @version 1.0.1
 * @author RealPolitik Core Team
 */

import { on, emit } from '../core/EventDispatcher.js';
import { getState } from '../core/StateManager.js';
import { ACTION_REGISTRY } from '../config/actions.registry.js';

/**
 * Inicializa el manejador de mensajes de UI.
 */
export function init() {
  console.log('[UIMessageHandler] Inicializado.');
  setupMessageHandlers();
}

/**
 * Configura handlers para tipos de mensajes entrantes.
 */
function setupMessageHandlers() {
  // Escuchar player_intent desde WebSocketServer
  // Ahora este evento puede venir con dos formatos:
  // 1. Formato Antiguo: { nationId, intentions: [] }
  // 2. Formato Nuevo (Diplomacia): { type: 'covert_coup', payload: { targetNation: '...' } }
  on('ws.message.player_intent', handlePlayerIntent);

  on('ws.message.advisor_query', handleAdvisorQuery);

  console.log('[UIMessageHandler] Handlers configurados.');
}

/**
 * Maneja intenciones del jugador recibidas desde la UI.
 * @param {Object} payload - Datos del mensaje
 */
function handlePlayerIntent(payload) {
  console.log('[UIMessageHandler] Intención recibida:', payload);

  const state = getState();

  // --- DETECCIÓN DE FORMATO ---
  
  // CASO 1: Acción Directa (Nuevo formato para Diplomacia/Acciones)
  // Verificamos si tiene 'type' y si ese tipo existe en el registro
  if (payload.type && ACTION_REGISTRY && ACTION_REGISTRY[payload.type]) {
      console.log('[UIMessageHandler] 🚀 Reenviando acción directa:', payload.type);
      
      // Asegurar que targetNation esté accesible directamente o dentro de payload
      // Si viene del WS envuelto: payload.payload.targetNation
      // Si viene directo: payload.targetNation (pero aquí payload es el contenido)
      
      // Emitir el evento EXACTO que DiplomacyEngine escucha
      emit('player_intent', payload);
      return; // Salir para no ejecutar la lógica antigua
  }

  // Si llega aquí, es el formato antiguo o una acción no registrada
  const { nationId, intentions, selectedOption } = payload;

  if (!nationId || !intentions || intentions.length === 0) {
    // Si es una acción directa pero falló el check de registry (ej. por import faltante)
    if (payload.type) {
       console.warn('[UIMessageHandler] ⚠️ Acción desconocida o Registry no cargado:', payload.type);
    } else {
       console.warn('[UIMessageHandler] Intención inválida (formato antiguo):', payload);
    }
    
    emit('intent_rejected', {
      nationId: payload.nationId || 'unknown',
      reason: 'Datos incompletos o acción no registrada'
    });
    return;
  }

  // ... (Resto de la lógica antigua para PolicyRule) ...
  const nation = state.nations && state.nations[nationId];
  if (!nation) {
    console.warn('[UIMessageHandler] Nación no encontrada:', nationId);
    emit('intent_rejected', { nationId, reason: 'Nación no encontrada' });
    return;
  }

  emit('player_intent', {
    nationId,
    intentions,
    selectedOption,
    tick: state.meta?.tick || 0
  });
  console.log('[UIMessageHandler] Intención forward a PolicyRule:', nationId);
}

/**
 * Maneja consultas al asesor IA.
 */
function handleAdvisorQuery(payload) {
  console.log('[UIMessageHandler] Consulta advisor:', payload);
  const { nationId, type, params } = payload;

  const state = getState();
  const nation = state.nations && state.nations[nationId];

  if (!nation) {
    emit('advisor_response', { nationId, error: 'Nación no encontrada' });
    return;
  }

  const response = {
    nationId,
    type,
    suggestion: {
      headline: 'Análisis Básico',
      message: `Métricas: Estabilidad ${nation.stats?.stability || 0}, Presupuesto ${nation.stats?.budget || 0}`,
      recommendation: { actionType: 'monitor', priority: 'normal' }
    }
  };

  emit('advisor_response', response);
}