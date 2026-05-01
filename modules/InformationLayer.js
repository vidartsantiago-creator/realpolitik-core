/**
 * @file InformationLayer.js
 * @description Capa de información: niebla de guerra, filtrado de broadcast, desinformación pasiva.
 * @version 1.0.0
 * @author RealPolitik Core Team
 * @dependencies EventDispatcher, StateManager
 * @changelog
 * - v1.0.0: Creación inicial. Stub para MVP.
 */

import { on, emit } from '../core/EventDispatcher.js';
import { getState } from '../core/StateManager.js';

/**
 * Inicializa la capa de información.
 * @param {{ engine: Object, world: Object, modules: Object }} config - Configuración global
 */
export function init(state, eventEmitter) {
  console.log('[InformationLayer] Inicializado.');

  // Suscribirse a state_updated para filtrar estado antes de broadcast
  on('state_updated', handleStateUpdate);
}

/**
 * Filtra el estado según la perspectiva de una nación (niebla de guerra).
 * @param {string} viewerNationId - Nación que observa
 * @param {Object} fullState - Estado completo
 * @returns {Object} Estado filtrado
 */
export function filterState(viewerNationId, fullState) {
  // Stub MVP: en Fase 1 implementar filtrado real por alianzas/espionaje
  return fullState;
}

/**
 * Maneja actualizaciones de estado para filtrado.
 * @param {{ tick: number, version: number, delta: Object }} payload
 */
function handleStateUpdate(payload) {
  // Stub: aquí se aplicaría el filtrado antes del broadcast a clientes
  // emit('filtered_state', { viewerId, filteredState })
}