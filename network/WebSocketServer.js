/**
 * @file WebSocketServer.js
 * @description Servidor WebSocket: handshake, autenticación, enrutamiento de mensajes.
 * @version 1.0.0
 * @author RealPolitik Core Team
 * @dependencies EventDispatcher, StateManager
 * @changelog
 * - v1.0.0: Creación inicial. Stub para MVP.
 */

import { on, emit } from '../core/EventDispatcher.js';
import { getState, snapshot } from '../core/StateManager.js';

/**
 * Inicializa el servidor WebSocket.
 * @param {number} port - Puerto donde escuchar
 * @returns {Promise<void>}
 */
export async function initWebSocketServer(port) {
  console.log(`[WebSocketServer] Iniciando en puerto ${port}...`);
  
  // Stub MVP: implementación real con 'ws' o similar en Fase 1
  // const WebSocket = await import('ws');
  // const wss = new WebSocket.Server({ port });
  
  console.log('[WebSocketServer] Listo (stub).');
}
