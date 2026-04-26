/**
 * @file GlobalState.js
 * @description Índices macro (clima, energía, mercados), triggers de crisis.
 * @version 1.0.0
 * @author RealPolitik Core Team
 * @dependencies EventDispatcher, StateManager, Rng
 * @changelog
 * - v1.0.0: Creación inicial. Stub para MVP.
 */

import { on, emit } from '../core/EventDispatcher.js';
import { getState, applyDelta } from '../core/StateManager.js';
import { rng } from '../core/Rng.js';

/**
 * Inicializa el módulo de estado global.
 * @param {{ engine: Object, world: Object, modules: Object }} config - Configuración global
 */
export function init(config) {
  console.log('[GlobalState] Inicializado.');

  // Suscribirse a tick_start para actualizar índices globales
  on('tick_start', processGlobalTick);
}

/**
 * Procesa actualizaciones de índices globales por tick.
 * @param {number} tick - Número de tick actual
 */
function processGlobalTick(tick) {
  // Stub MVP: implementar índices macro en Fase 1
}