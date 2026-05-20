/**
 * @file IntelGenerator.js
 * @description Genera señales de inteligencia asimétrica periódicas para el feed del jugador.
 * @version 1.0.0
 * @author RealPolitik Core Team
 * @dependencies EventDispatcher, StateManager, Rng, TimeEngine
 */

import { emit } from '../core/EventDispatcher.js';
import { getState } from '../core/StateManager.js';
import { rng } from '../core/Rng.js';
import { getCurrentTick } from '../core/TimeEngine.js';

let intelInterval = null;
const GENERATION_INTERVAL_MS = 15000; // 15 segundos entre señales

// Fuentes de inteligencia disponibles
const INTEL_SOURCES = [
  { id: 'IMINT', name: 'Imagen Satelital', reliability: 0.85 },
  { id: 'SIGINT', name: 'Interceptación Electrónica', reliability: 0.75 },
  { id: 'HUMINT', name: 'Fuente Humana', reliability: 0.65 },
  { id: 'OSINT', name: 'Fuentes Abiertas', reliability: 0.90 },
  { id: 'CYBINT', name: 'Ciberinteligencia', reliability: 0.70 }
];

// Tipos de eventos y sus plantillas de mensajes
const EVENT_TEMPLATES = [
  {
    type: 'military',
    templates: [
      'Movimiento de tropas detectado en coordenadas {coords}. Estimado: {troops} efectivos.',
      'Ejercicios militares no declarados en frontera con {nation}. Nivel de alerta elevado.',
      'Concentración de blindados reportada cerca de {location}. Posible preparación ofensiva.',
      'Actividad aérea inusual en base militar de {nation}. Patrullas intensificadas.'
    ]
  },
  {
    type: 'economic',
    templates: [
      'Flujo financiero anómalo detectado desde {nation}. Posible financiación encubierta.',
      'Escasez de recursos críticos reportada en {location}. Impacto económico inminente.',
      'Acuerdo comercial secreto entre {nation1} y {nation2} podría alterar balances regionales.',
      'Inversión masiva en infraestructura militar detectada en {nation}. Budget estimado: ${amount}M.'
    ]
  },
  {
    type: 'political',
    templates: [
      'Tensiones internas en {nation}. Protestas antigubernamentales en {location}.',
      'Cambio de gabinete ministerial en {nation}. Nuevo enfoque político esperado.',
      'Negociaciones diplomáticas secretas entre {nation1} y {nation2}. Temas desconocidos.',
      'Golpe de estado fallido reportado en {nation}. Líderes opositores detenidos.'
    ]
  },
  {
    type: 'technological',
    templates: [
      'Prueba de nuevo sistema armamentístico detectada en {nation}. Capacidad desconocida.',
      'Avance en ciberseguridad reportado por {nation}. Posible ventaja estratégica.',
      'Instalación de investigación nuclear en {location}. Monitoreo internacional solicitado.',
      'Despliegue de sistemas de defensa antimisiles en {nation}. Cobertura regional ampliada.'
    ]
  },
  {
    type: 'diplomatic',
    templates: [
      'Delegación de alto nivel de {nation} visita {nation2}. Agenda no revelada.',
      'Tratado de no agresión entre {nation1} y {nation2} en fase final de negociación.',
      'Sanciones económicas impuestas a {nation} por comunidad internacional.',
      'Ruptura de relaciones diplomáticas entre {nation1} y {nation2}. Embajadas cerradas.'
    ]
  }
];

// Nombres ficticios para ubicaciones y naciones
const LOCATIONS = ['Sector Norte', 'Región Central', 'Zona Fronteriza Alpha', 'Capital', 'Puerto Principal', 'Base Aérea Delta'];
const NATIONS = ['Federación del Este', 'República Unida', 'Alianza del Sur', 'Imperial Coast', 'Unión Continental'];

/**
 * Inicializa el generador de inteligencia.
 * @param {{ engine: Object, world: Object, modules: Object }} config - Configuración global
 */
export function init(config) {
  console.log('[IntelGenerator] 📡 Inicializado.');
  
  // Suscribirse a solicitudes manuales de inteligencia (opcional futuro)
  // on('request_intel', handleIntelRequest);
  
  // Iniciar ciclo automático de generación
  startIntelCycle();
}

/**
 * Inicia el ciclo de generación de señales de inteligencia
 */
function startIntelCycle() {
  if (intelInterval) {
    clearInterval(intelInterval);
  }

  // Primera señal después de 5 segundos
  setTimeout(() => {
    generateIntelSignal();
  }, 5000);

  // Ciclo regular cada 15 segundos
  intelInterval = setInterval(() => {
    generateIntelSignal();
  }, GENERATION_INTERVAL_MS);

  console.log(`[IntelGenerator] 🔄 Ciclo de inteligencia iniciado (${GENERATION_INTERVAL_MS/1000}s)`);
}

/**
 * Genera una señal de inteligencia aleatoria basada en el estado actual
 */
function generateIntelSignal() {
  const state = getState();
  if (!state || !state.nations) return;

  const nationIds = Object.keys(state.nations);
  if (nationIds.length === 0) return;

  // Seleccionar fuente de inteligencia aleatoria
  const sourceConfig = INTEL_SOURCES[Math.floor(rng() * INTEL_SOURCES.length)];
  
  // Seleccionar tipo de evento aleatorio
  const eventCategory = EVENT_TEMPLATES[Math.floor(rng() * EVENT_TEMPLATES.length)];
  
  // Seleccionar plantilla de mensaje aleatoria
  const template = eventCategory.templates[Math.floor(rng() * eventCategory.templates.length)];
  
  // Generar datos contextuales aleatorios
  const context = {
    coords: `${Math.floor(rng() * 90).toFixed(4)}°N, ${Math.floor(rng() * 180).toFixed(4)}°E`,
    troops: Math.floor(rng() * 50000) + 5000,
    location: LOCATIONS[Math.floor(rng() * LOCATIONS.length)],
    nation: NATIONS[Math.floor(rng() * NATIONS.length)],
    nation1: NATIONS[Math.floor(rng() * NATIONS.length)],
    nation2: NATIONS[Math.floor(rng() * NATIONS.length)],
    amount: Math.floor(rng() * 500) + 100
  };
  
  // Asegurar que nation1 y nation2 sean diferentes
  while (context.nation1 === context.nation2) {
    context.nation2 = NATIONS[Math.floor(rng() * NATIONS.length)];
  }

  // Reemplazar placeholders en la plantilla
  let message = template;
  for (const [key, value] of Object.entries(context)) {
    message = message.replace(new RegExp(`{${key}}`, 'g'), value);
  }

  // Calcular nivel de confianza basado en confiabilidad de la fuente + variación aleatoria
  const baseConfidence = sourceConfig.reliability * 100;
  const variance = (rng() - 0.5) * 20; // ±10%
  const confidenceLevel = Math.max(30, Math.min(98, Math.round(baseConfidence + variance)));

  // Crear objeto de señal
  const signal = {
    signalId: `intel_${Date.now()}_${Math.floor(rng() * 1000)}`,
    signalText: message,
    confidenceLevel: confidenceLevel,
    source: sourceConfig.id,
    sourceName: sourceConfig.name,
    category: eventCategory.type,
    receivedTick: getCurrentTick(),
    timestamp: Date.now(),
    isInvestigated: false,
    investigationCost: 100 // $100k para investigar
  };

  // Emitir evento global para que main.js lo capture y broadcastee
  emit('intel_signal', { signal });
  
  console.log(`[IntelGenerator] 📡 Señal generada: ${sourceConfig.id} - ${eventCategory.type} (${confidenceLevel}% confianza)`);
}

/**
 * Maneja solicitudes manuales de inteligencia (stub para futura implementación)
 * @param {{ nationId: string, targetType: string }} payload
 */
function handleIntelRequest(payload) {
  console.log('[IntelGenerator] Solicitud manual de inteligencia recibida:', payload);
  // Futura implementación: generar señal específica bajo demanda
  generateIntelSignal();
}

/**
 * Detiene el ciclo de generación de inteligencia
 */
export function stopIntelCycle() {
  if (intelInterval) {
    clearInterval(intelInterval);
    intelInterval = null;
    console.log('[IntelGenerator] ⏹️ Ciclo de inteligencia detenido.');
  }
}