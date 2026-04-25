/**
 * @file EventDispatcher.js
 * @description Bus central de eventos Pub/Sub determinista con soporte para prioridades y aislamiento de errores.
 *              Permite a los módulos comunicarse sin acoplamiento directo.
 * @version 1.0.0
 * @author Realpolitik Core Team
 * @dependencies Ninguna
 * @changelog
 * - v1.0.0: Creación inicial. Implementa pub/sub con prioridades y manejo seguro de errores.
 */

/**
 * @typedef {Object} EventHandler
 * @property {Function} handler - Función callback que maneja el evento
 * @property {number} priority - Prioridad del handler (mayor número = mayor prioridad)
 */

/**
 * Mapa de eventos registrados y sus handlers
 * @type {Map<string, EventHandler[]>}
 */
const eventRegistry = new Map();

/**
 * Registra un handler para un evento específico.
 * @param {string} event - Nombre del evento (snake_case)
 * @param {Function} handler - Función callback que recibe el payload
 * @param {number} [priority=0] - Prioridad del handler (mayor = primero)
 * @throws {Error} Si handler no es una función
 */
export function on(event, handler, priority = 0) {
  if (typeof handler !== 'function') {
    throw new Error(`[EventDispatcher] Handler para '${event}' debe ser una función.`);
  }

  if (!eventRegistry.has(event)) {
    eventRegistry.set(event, []);
  }

  const handlers = eventRegistry.get(event);
  handlers.push({ handler, priority });
  
  // Ordenar por prioridad descendente (mayor prioridad primero)
  handlers.sort((a, b) => b.priority - a.priority);
}

/**
 * Elimina un handler específico de un evento.
 * @param {string} event - Nombre del evento
 * @param {Function} [handler] - Función específica a eliminar. Si no se proporciona, elimina todos.
 * @returns {boolean} True si se eliminó al menos un handler
 */
export function off(event, handler) {
  if (!eventRegistry.has(event)) {
    return false;
  }

  const handlers = eventRegistry.get(event);
  
  if (!handler) {
    // Eliminar todos los handlers del evento
    eventRegistry.delete(event);
    return true;
  }

  const initialLength = handlers.length;
  const filteredHandlers = handlers.filter(h => h.handler !== handler);
  
  if (filteredHandlers.length === 0) {
    eventRegistry.delete(event);
    return filteredHandlers.length !== initialLength;
  }
  
  eventRegistry.set(event, filteredHandlers);
  return filteredHandlers.length !== initialLength;
}

/**
 * Emite un evento a todos los handlers registrados.
 * Los handlers se ejecutan en orden de prioridad (mayor primero).
 * Los errores en handlers individuales no detienen la ejecución de los demás.
 * @param {string} event - Nombre del evento
 * @param {any} payload - Datos del evento
 * @returns {{ success: boolean, errors: string[] }} Resultado de la emisión
 */
export function emit(event, payload) {
  const errors = [];
  
  if (!eventRegistry.has(event)) {
    return { success: true, errors }; // No hay listeners, pero no es error
  }

  const handlers = eventRegistry.get(event);
  
  for (const { handler, priority } of handlers) {
    try {
      handler(payload);
    } catch (error) {
      const errorMsg = `[EventDispatcher] Error en handler '${event}' (priority:${priority}): ${error.message}`;
      console.error(errorMsg);
      errors.push(errorMsg);
    }
  }

  return { success: errors.length === 0, errors };
}

/**
 * Verifica si un evento tiene handlers registrados.
 * @param {string} event - Nombre del evento
 * @returns {boolean} True si hay al menos un handler
 */
export function hasListeners(event) {
  return eventRegistry.has(event) && eventRegistry.get(event).length > 0;
}

/**
 * Obtiene el número de handlers para un evento.
 * @param {string} event - Nombre del evento
 * @returns {number} Cantidad de handlers registrados
 */
export function listenerCount(event) {
  if (!eventRegistry.has(event)) {
    return 0;
  }
  return eventRegistry.get(event).length;
}

/**
 * Limpia todos los eventos registrados. SOLO para tests.
 * @package
 */
export function _clearAllForTests() {
  eventRegistry.clear();
}
