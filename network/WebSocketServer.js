/**
 * @file WebSocketServer.js
 * @description Servidor WebSocket: handshake, autenticación, enrutamiento de mensajes.
 * @version 1.0.0
 * @author RealPolitik Core Team
 * @dependencies EventDispatcher, StateManager
 * @changelog
 * - v1.0.0: Creación inicial. Stub para MVP.
 * - v1.0.1: Implementación real con serve-static para HTTP y ws para WebSocket.
 */

import { on, emit } from '../core/EventDispatcher.js';
import { getState, snapshot } from '../core/StateManager.js';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

let wss = null;
let httpServer = null;

/**
 * Sirve archivos estáticos desde el directorio public/.
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
async function serveStatic(req, res) {
  try {
    let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);

    // Prevenir directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();

    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };

    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  } catch (error) {
    res.writeHead(404);
    res.end('Not Found');
  }
}

/**
 * Inicializa el servidor WebSocket y HTTP para archivos estáticos.
 * @param {number} port - Puerto donde escuchar
 * @returns {Promise<void>}
 */
export async function initWebSocketServer(port) {
  console.log(`[WebSocketServer] Iniciando en puerto ${port}...`);

  // Crear servidor HTTP para servir archivos estáticos
  httpServer = http.createServer(serveStatic);

  // Crear servidor WebSocket
  wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws, req) => {
    console.log('[WebSocketServer] Cliente conectado');

    // Enviar estado inicial y lista de módulos
    const state = getState();
    const modules = ['EconomyRule', 'DiplomacyRule', 'PolicyRule', 'InformationLayer', 'GlobalState', 'FactionRule', 'CrisisRule', 'EspionageRule'];

    ws.send(JSON.stringify({
      type: 'init',
      state: state,
      modules: modules,
      timestamp: Date.now()
    }));

    // Suscribirse a actualizaciones de estado
    const onStateUpdate = (payload) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'state_update',
          state: payload.state,
          tick: payload.tick,
          version: payload.version,
          timestamp: Date.now()
        }));
      }
    };

    on('state_updated', onStateUpdate);

    // Manejar mensajes del cliente
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        console.log('[WebSocketServer] Mensaje recibido:', data);
        emit('client_message', { ws, data });
      } catch (error) {
        console.error('[WebSocketServer] Error parseando mensaje:', error);
      }
    });

    // Manejar desconexión
    ws.on('close', () => {
      console.log('[WebSocketServer] Cliente desconectado');
      // Limpiar listener para evitar memory leaks
      // Nota: en producción usar WeakMap o similar para tracking
    });

    ws.on('error', (error) => {
      console.error('[WebSocketServer] Error en conexión:', error);
    });
  });

  // Iniciar servidor HTTP+WebSocket
  await new Promise((resolve, reject) => {
    httpServer.listen(port, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  console.log('[WebSocketServer] Servidor HTTP+WebSocket listo.');
  console.log(`[WebSocketServer] Web UI disponible en http://localhost:${port}`);
}

/**
 * Detiene el servidor WebSocket y HTTP.
 * @returns {Promise<void>}
 */
export async function stopWebSocketServer() {
  return new Promise((resolve) => {
    if (wss) {
      wss.close(() => {
        console.log('[WebSocketServer] WebSocket cerrado');
      });
    }
    if (httpServer) {
      httpServer.close(() => {
        console.log('[WebSocketServer] HTTP server cerrado');
        resolve();
      });
    } else {
      resolve();
    }
  });
}