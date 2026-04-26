/**
 * @file IntentParser.js
 * @description Traduce objetivos abstractos → intenciones estructuradas.
 * @version 1.0.0
 * @author RealPolitik Core Team
 * @dependencies EventDispatcher, StateManager, Rng
 * @changelog
 * - v1.0.0: Creación inicial. Stub heurístico para MVP.
 */

import { on, emit } from '../core/EventDispatcher.js';
import { getState } from '../core/StateManager.js';
import { rng } from '../core/Rng.js';

/**
 * Inicializa el parser de intenciones.
 * @param {{ engine: Object, world: Object, modules: Object }} config - Configuración global
 */
export function init(config) {
  console.log('[IntentParser] Inicializado.');

  // Suscribirse a set_objective del cliente
  on('ws_message_set_objective', handleSetObjective);
}

/**
 * Maneja mensajes de establecimiento de objetivo.
 * @param {{ nationId: string, objective: string, tick: number }} payload
 */
function handleSetObjective(payload) {
  console.log('[IntentParser] Objetivo recibido:', payload);

  const intentPackage = parseObjective(payload.nationId, payload.objective, payload.tick);

  emit('player_intent', {
    nationId: payload.nationId,
    intentions: intentPackage.intentions,
    tick: payload.tick
  });
}

/**
 * Parsea un objetivo abstracto en intenciones estructuradas.
 * @param {string} nationId - ID de la nación
 * @param {string} objectiveKey - Clave del objetivo
 * @param {number} tick - Tick actual
 * @returns {{ intentions: Array, priority: number, justification: string, confidence: number }}
 */
export function parseObjective(nationId, objectiveKey, tick) {
  // Stub MVP: implementación heurística básica
  return {
    intentions: [],
    priority: 0.5,
    justification: 'Objetivo recibido (stub)',
    confidence: 0.8
  };
}