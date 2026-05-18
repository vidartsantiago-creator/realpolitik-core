/**
 * @file IntentParser.js
 * @description Traduce objetivos abstractos → intenciones estructuradas.
 * @version 1.0.1
 * @author RealPolitik Core Team
 * @dependencies EventDispatcher, StateManager, Rng
 * @changelog
 * - v1.0.0: Creación inicial. Stub heurístico para MVP.
 * - v1.0.1: Agregado ciclo de sugerencias del asesor IA.
 */

import { on, emit } from '../core/EventDispatcher.js';
import { getState } from '../core/StateManager.js';
import { rng } from '../core/Rng.js';
import { getCurrentTick } from '../core/TimeEngine.js';

let advisorInterval = null;

/**
 * Inicializa el parser de intenciones.
 * @param {{ engine: Object, world: Object, modules: Object }} config - Configuración global
 */
export function init(config) {
  console.log('[IntentParser] Inicializado.');

  // Suscribirse a set_objective del cliente
  on('ws_message_set_objective', handleSetObjective);

  // Iniciar ciclo de sugerencias del asesor IA (cada 10 ticks ≈ 10 segundos)
  startAdvisorCycle();
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

/**
 * Inicia el ciclo de sugerencias del asesor IA
 * Emite sugerencias contextuales basadas en el estado del juego
 */
function startAdvisorCycle() {
  if (advisorInterval) {
    clearInterval(advisorInterval);
  }

  // Emitir sugerencia inicial inmediata
  setTimeout(() => {
    emitInitialSuggestion();
  }, 2000);

  // Ciclo periódico cada 10 segundos
  advisorInterval = setInterval(() => {
    generateAdvisorSuggestion();
  }, 10000);

  console.log('[IntentParser] Ciclo de asesor IA iniciado (10s)');
}

/**
 * Emite sugerencia inicial de bienvenida
 */
function emitInitialSuggestion() {
  const suggestion = {
    title: 'Bienvenido, Líder',
    text: 'Su nación está lista para comenzar. Revise las métricas económicas y considere establecer relaciones diplomáticas iniciales.',
    actions: [
      { type: 'nation_select', payload: { nationId: 'USA' }, label: 'Seleccionar Nación' },
      { type: 'policy_propose', payload: { policyType: 'economic_stimulus' }, label: 'Proponer Política Económica' }
    ]
  };

  emit('advisor_suggestion', { suggestion });
}

/**
 * Genera sugerencias contextuales basadas en el estado actual
 */
function generateAdvisorSuggestion() {
  const state = getState();
  if (!state || !state.nations) return;

  // Obtener primera nación disponible como ejemplo
  const nationIds = Object.keys(state.nations);
  if (nationIds.length === 0) return;

  const nationId = nationIds[0];
  const nation = state.nations[nationId];
  const currentTick = getCurrentTick();

  let suggestion = null;

  // Lógica contextual simple basada en métricas
  const economy = nation.stats?.economy || 0;
  const stability = nation.stats?.stability || 0;
  const budget = nation.stats?.budget || 0;

  if (economy < 40) {
    suggestion = {
      title: 'Alerta Económica',
      text: `El PIB de ${nation.name} está en niveles críticos (${economy}). Considere políticas de estímulo económico o acuerdos comerciales.`,
      actions: [
        { type: 'policy_propose', payload: { policyType: 'economic_stimulus', targetNation: nationId }, label: 'Estímulo Económico' },
        { type: 'diplomacy_request', payload: { action: 'trade_agreement', targetNation: nationId }, label: 'Acuerdo Comercial' }
      ]
    };
  } else if (stability < 50) {
    suggestion = {
      title: 'Inestabilidad Interna',
      text: `La estabilidad de ${nation.name} es baja (${stability}%). Las facciones internas están inquietas. Considere medidas de pacificación.`,
      actions: [
        { type: 'policy_propose', payload: { policyType: 'internal_security', targetNation: nationId }, label: 'Seguridad Interna' },
        { type: 'policy_propose', payload: { policyType: 'public_welfare', targetNation: nationId }, label: 'Bienestar Público' }
      ]
    };
  } else if (budget < 200) {
    suggestion = {
      title: 'Presupuesto Limitado',
      text: `El presupuesto nacional (${budget}M) es limitado. Optimice el gasto o busque aumentar ingresos mediante impuestos o comercio.`,
      actions: [
        { type: 'policy_propose', payload: { policyType: 'tax_reform', targetNation: nationId }, label: 'Reforma Fiscal' }
      ]
    };
  } else if (currentTick % 30 === 0 && economy > 60 && stability > 60) {
    // Cada 30 ticks, si la nación está bien, sugerir expansión
    suggestion = {
      title: 'Oportunidad de Expansión',
      text: `${nation.name} está en una posición fuerte. Considere expandir su influencia mediante diplomacia o proyectos de infraestructura.`,
      actions: [
        { type: 'diplomacy_request', payload: { action: 'alliance', targetNation: nationId }, label: 'Buscar Alianza' },
        { type: 'policy_propose', payload: { policyType: 'infrastructure_project', targetNation: nationId }, label: 'Proyecto de Infraestructura' }
      ]
    };
  } else {
    // Sugerencia genérica de mantenimiento
    const suggestions = [
      {
        title: 'Monitoreo Continuo',
        text: 'Mantenga vigilancia sobre las actividades de naciones vecinas. La inteligencia es clave para la supervivencia.',
        actions: []
      },
      {
        title: 'Desarrollo Sostenible',
        text: 'Considere invertir en desarrollo a largo plazo para mantener el crecimiento económico sostenido.',
        actions: [
          { type: 'policy_propose', payload: { policyType: 'education_reform', targetNation: nationId }, label: 'Reforma Educativa' }
        ]
      }
    ];
    suggestion = suggestions[Math.floor(rng() * suggestions.length)];
  }

  if (suggestion) {
    emit('advisor_suggestion', { suggestion });
  }
}

/**
 * Detiene el ciclo del asesor IA
 */
export function stopAdvisorCycle() {
  if (advisorInterval) {
    clearInterval(advisorInterval);
    advisorInterval = null;
    console.log('[IntentParser] Ciclo de asesor IA detenido.');
  }
}