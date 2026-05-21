/**
 * @file IntelProcessor.js
 * @description Procesa acciones de inteligencia (investigar, descifrar) y actualiza el estado.
 */

import { emit } from '../core/EventDispatcher.js';
import { getState, setState } from '../core/StateManager.js';

/**
 * Inicializa el procesador de inteligencia.
 */
export function init() {
  console.log('[IntelProcessor] 🧠 Inicializado.');
  
  // Suscribirse a acciones de inteligencia desde el cliente
  emit('register_intent_handler', { type: 'intel_action', handler: handleIntelAction });
}

/**
 * Maneja acciones de inteligencia (investigar)
 * @param {{ nationId: string, action: string, signalId: string }} payload 
 */
function handleIntelAction(payload) {
  const { nationId, action, signalId } = payload;
  
  if (action !== 'investigate') return;

  const state = getState();
  if (!state || !state.nations || !state.nations[nationId]) {
    console.warn('[IntelProcessor] Nación no encontrada para acción de inteligencia.');
    return;
  }

  const nation = state.nations[nationId];
  const currentBudget = nation.stats?.budget || 0;
  const investigationCost = 100; // $100k

  if (currentBudget < investigationCost) {
    // Notificar error de fondos (opcional, vía evento)
    emit('intel_action_response', { 
      success: false, 
      reason: 'fondos_insuficientes', 
      signalId 
    });
    return;
  }

  // Descontar presupuesto
  nation.stats.budget = currentBudget - investigationCost;
  
  // Actualizar estado global
  setState(state);

  // Generar información detallada (simulada)
  const detailedInfo = generateDetailedInfo(signalId);

  // Emitir actualización de la señal
  emit('intel_signal_updated', {
    signalId,
    updatedData: {
      isInvestigated: true,
      confidenceLevel: 100,
      detailedText: detailedInfo,
      costDeducted: investigationCost
    }
  });

  console.log(`[IntelProcessor] ✅ Señal ${signalId} investigada. Costo: $${investigationCost}k. Nuevo presupuesto: $${nation.stats.budget}M`);
}

/**
 * Genera información detallada basada en el ID de la señal (simulación)
 */
function generateDetailedInfo(signalId) {
  const details = [
    "ANÁLISIS COMPLETO: Imágenes de alta resolución confirman presencia de batallón de tanques T-90. Capacidad operativa: 85%. Suministros para 3 semanas.",
    "INTERCEPTACIÓN DESCIFRADA: Comunicaciones revelan orden de movilización para el día 15. Objetivo probable: región fronteriza norte.",
    "INFORME DE ACTIVO HUMANO: Fuente confirma corrupción en cadena de mando local. Moral de tropas: baja. Probabilidad de deserción: 40%.",
    "ANÁLISIS CIBERNÉTICO: Acceso a bases de datos logísticas muestra acumulación de combustible y municiones en coordenadas específicas."
  ];
  // Seleccionar uno aleatorio o basado en hash del signalId
  const index = parseInt(signalId.split('_')[1] || '0', 10) % details.length;
  return details[index] || details[0];
}