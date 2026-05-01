/**
 * @file SyncClient.js
 * @description Cliente de sincronización: mantiene estado local sincronizado con el servidor
 *              vía WebSocket. Suscribe a eventos y notifica a la UI.
 * @version 1.0.0
 * @author RealPolitik Core Team
 * @dependencies WebSocket (nativo del navegador)
 * @changelog
 * - v1.0.0: Creación inicial. Implementa protocolo básico de sincronización.
 */

// Estado local
let localState = null;
let ws = null;
let subscribers = [];
//let isConnected = false;

// Configuración
const WS_URL = `ws://${window.location.host}`;
const RECONNECT_DELAY = 3000; // 3 segundos

/**
 * Obtiene el estado local actual.
 * @returns {Object|null} Estado local o null si no está inicializado
 */
export function getState() {
  return localState;
}

/**
 * Verifica si está conectado al servidor.
 * @returns {boolean} true si está conectado
 */
export function isConnected() {
  return isConnected;
}

/**
 * Inicializa el cliente de sincronización.
 */
export function initSyncClient() {
  console.log('[SyncClient] Inicializando...');
  connectWebSocket();
}

/**
 * Establece conexión WebSocket.
 */
function connectWebSocket() {
  console.log(`[SyncClient] Conectando a ${WS_URL}...`);

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[SyncClient] ✅ Conectado al servidor');
      isConnected = true;
      notifySubscribers('connected', {});
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error('[SyncClient] Error parsing message:', error);
      }
    };

    ws.onclose = () => {
      console.log('[SyncClient] ❌ Desconectado. Reconectando...');
      isConnected = false;
      notifySubscribers('disconnected', {});

      // Intentar reconectar
      setTimeout(connectWebSocket, RECONNECT_DELAY);
    };

    ws.onerror = (error) => {
      console.error('[SyncClient] Error de WebSocket:', error);
      notifySubscribers('error', { error });
    };

  } catch (error) {
    console.error('[SyncClient] Error creando WebSocket:', error);
    setTimeout(connectWebSocket, RECONNECT_DELAY);
  }
}

/**
 * Maneja mensajes entrantes del servidor.
 * @param {Object} message - Mensaje parseado del servidor
 */
function handleMessage(message) {
  const { type, state, tick, delta } = message;

  switch (type) {
    case 'init':
      // Estado inicial completo
      localState = state || {};
      console.log('[SyncClient] Estado inicial recibido:', localState);
      notifySubscribers('state_update', { state: localState, tick });
      break;

    case 'state_update':
      // Actualización completa de estado
      if (state) {
        localState = state;
      }
      notifySubscribers('state_update', { state: localState, tick });
      break;

    case 'delta':
      // Actualización delta (patch)
      if (delta && localState) {
        applyDelta(delta);
      }
      notifySubscribers('delta', { delta, tick });
      break;

    case 'tick':
      // Solo actualización de tick
      if (localState) {
        localState.tick = tick;
      }
      notifySubscribers('tick', { tick });
      break;

    case 'policy_decision':
      // Nueva decisión de política disponible
      notifySubscribers('policy_decision', { decision: message.decision });
      break;

    case 'intel_update':
      // Actualización de inteligencia
      notifySubscribers('intel_update', { items: message.items });
      break;

    default:
      console.log('[SyncClient] Mensaje desconocido:', type);
  }
}

/**
 * Aplica un delta al estado local.
 * @param {Object} delta - Delta a aplicar
 */
function applyDelta(delta) {
  // Implementación básica de merge
  // En producción, usar librería como lodash.merge o implementación custom
  if (!localState) {
    localState = delta;
    return;
  }

  // Merge superficial (para MVP)
  for (const key in delta) {
    if (delta.hasOwnProperty(key)) {
      if (typeof delta[key] === 'object' && delta[key] !== null && !Array.isArray(delta[key])) {
        if (!localState[key]) {
          localState[key] = {};
        }
        for (const subKey in delta[key]) {
          localState[key][subKey] = delta[key][subKey];
        }
      } else {
        localState[key] = delta[key];
      }
    }
  }
}

/**
 * Suscribe una función callback a eventos de sincronización.
 * @param {Function} callback - Función a llamar cuando ocurra un evento
 * @returns {Function} Función para cancelar suscripción
 */
export function subscribe(callback) {
  subscribers.push(callback);

  // Retornar función de cancelación
  return () => {
    subscribers = subscribers.filter(sub => sub !== callback);
  };
}

/**
 * Notifica a todos los suscriptores de un evento.
 * @param {string} eventType - Tipo de evento
 * @param {Object} data - Datos del evento
 */
function notifySubscribers(eventType, data) {
  subscribers.forEach(callback => {
    try {
      callback(eventType, data);
    } catch (error) {
      console.error('[SyncClient] Error en subscriber:', error);
    }
  });
}

/**
 * Envía un mensaje al servidor.
 * @param {string} type - Tipo de mensaje
 * @param {Object} data - Datos a enviar
 */
export function sendMessage(type, data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('[SyncClient] No se puede enviar: no conectado');
    return false;
  }

  const message = { type, ...data };
  ws.send(JSON.stringify(message));
  return true;
}

/**
 * Envía una decisión de política al servidor.
 * @param {string} nationId - ID de la nación
 * @param {number} optionIndex - Índice de la opción seleccionada
 * @param {Object} intent - Intención completa
 */
export function sendPolicyDecision(nationId, optionIndex, intent) {
  console.log('[SyncClient] Enviando decisión de política:', { nationId, optionIndex, intent });

  sendMessage('player_intent', {
    nationId,
    intentions: [intent],
    selectedOption: optionIndex
  });
}

/**
 * Consulta al asesor IA.
 * @param {string} type - Tipo de consulta
 * @param {Object} params - Parámetros de la consulta
 */
export function queryAdvisor(type, params) {
  console.log('[SyncClient] Consultando advisor:', type);

  sendMessage('advisor_query', {
    type,
    ...params
  });
}