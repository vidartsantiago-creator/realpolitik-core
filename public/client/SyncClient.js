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
let connectionState = false;

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
  return connectionState;
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
      connectionState = true;
      
      // Enviar handshake inmediatamente después de conectar
      sendHandshake();
      
      notifySubscribers('connected', {});
    };

    ws.onmessage = (event) => {
      console.log('[SyncClient] RAW message:', event.data)
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error('[SyncClient] Error parsing message:', error);
      }
    };

    ws.onclose = () => {
      console.log('[SyncClient] ❌ Desconectado. Reconectando...');
      connectionState = false;
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
  const { type, state, tick, delta, command, success, error, path } = message;

  switch (type) {
    case 'handshake_ack':
      // Confirmación de handshake recibida
      console.log('[SyncClient] ✅ Handshake confirmado:', message);
      notifySubscribers('handshake_ack', message);
      break;

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

    case 'command_response':
      // Respuesta a comando (save_game, load_game, etc.)
      notifySubscribers('command_response', {
        command,
        success,
        error,
        path,
        tick
      });
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
 * Envía handshake al servidor para autenticar la sesión.
 */
function sendHandshake() {
  const playerId = 'player_' + Math.random().toString(36).substr(2, 9);
  const nationId = 'USA'; // Nación por defecto, debería venir de la UI
  
  console.log('[SyncClient] Enviando handshake:', { playerId, nationId });
  
  sendMessage('handshake', {
    playerId,
    nationId,
    clientVersion: '1.0.0'
  });
}

// --- EXPOSICIÓN GLOBAL PARA DEBUGGING (DEVTOOLS) ---
// Esto permite ejecutar comandos desde la consola del navegador
if (typeof window !== 'undefined') {
    window.sendMessage = sendMessage;       // Expone la función de envío
    window.initSyncClient = initSyncClient; // Expone el inicializador (si es necesario)
    window.isConnected = isConnected;       // Expone el estado de conexión
    
    // Opcional: Exponer el ID del jugador si existe una variable interna como 'playerId'
    // Descomenta la siguiente línea si 'playerId' es una variable accesible en este scope
    // window.getPlayerId = () => playerId; 
    
    console.log('[SyncClient] ✅ Funciones expuestas globalmente para debugging.');
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
 * Solicita guardar el estado actual del juego.
 * @param {string} [filename] - Nombre opcional del archivo
 */
export function requestSaveGame(filename = null) {
  console.log('[SyncClient] Solicitando guardado:', filename || 'auto');

  sendMessage('command_save_game', {
    filename,
    source: 'manual'
  });
}

/**
 * Solicita cargar una partida guardada.
 * @param {string} filename - Nombre del archivo a cargar
 */
export function requestLoadGame(filename) {
  console.log('[SyncClient] Solicitando carga:', filename);

  if (!filename) {
    console.error('[SyncClient] Error: nombre de archivo requerido para cargar');
    return false;
  }

  sendMessage('command_load_game', {
    filename
  });
  return true;
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