/**
 * @file PolicyRule.js
 * @description Ejecutor de intenciones: validación → delta → apply.
 * @version 1.0.0
 * @author RealPolitik Core Team
 * @dependencies EventDispatcher, StateManager, Rng
 * @changelog
 * - v1.0.0: Creación inicial. Stub para MVP.
 */

import { on, emit } from '../core/EventDispatcher.js';
import { applyDelta, validate, getState } from '../core/StateManager.js';
import { rng } from '../core/Rng.js';

/**
 * Inicializa el módulo de políticas.
 * @param {{ engine: Object, world: Object, modules: Object }} config - Configuración global
 */
export function init(config) {
  console.log('[PolicyRule] Inicializado.');

  // Suscribirse a player_intent para ejecutar intenciones
  on('player_intent', handlePlayerIntent);
}

/**
 * Maneja intenciones del jugador.
 * @param {{ nationId: string, intentions: Array, tick: number }} payload
 */
function handlePlayerIntent(payload) {
  console.log('[PolicyRule] Intención del jugador:', payload);
  
  for (const intent of payload.intentions || []) {
    const validation = validate({
      nations: {
        [payload.nationId]: {
          stats: { budget: -intent.cost }
        }
      }
    });

    if (validation.valid) {
      applyDelta({
        nations: {
          [payload.nationId]: {
            stats: { budget: -intent.cost }
          }
        },
        tick: payload.tick
      }, 'player');
    } else {
      console.warn('[PolicyRule] Intención inválida:', validation.errors);
      emit('intent_rejected', { 
        nationId: payload.nationId, 
        intent, 
        errors: validation.errors 
      });
    }
  }
}
