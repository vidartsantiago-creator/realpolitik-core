import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { on, off, emit } from '../core/EventDispatcher.js';
import { getState, applyDelta, setInitialState } from '../core/StateManager.js';
import { getCurrentTick } from '../core/TimeEngine.js';
import { validator } from './SchemaValidator.js';
import { processIntent } from '../modules/IntentProcessor.js';

export class GameWebSocketServer {
  constructor(httpServer, config = {}) {
    // httpServer es obligatorio ahora
    this.httpServer = httpServer;
    this.config = {
      tickRate: config.tickRate || 100,
      seed: config.seed || 42,
      ...config
    };

    this.wss = null;
    this.clients = new Map();

    // Inicializar validador de esquemas
    validator.init();

    console.log(`[WS] Constructor inicializado.`);

    // Suscribirse a eventos de respuesta de comandos
    on('command_response', (payload) => {
      // Reenviar a todos los clientes conectados
      this.broadcast({
        type: 'command_response',
        ...payload
      });
    });
  }

  start() {
    if (!this.httpServer) {
      throw new Error('[WS] Error crítico: No se proporcionó un servidor HTTP.');
    }

    // Crear el servidor WebSocket y adjuntarlo al HTTP existente
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws, req) => {
      const clientId = req.socket.remoteAddress + ':' + req.socket.remotePort;
      console.log(`[WS] Cliente conectado: ${clientId}`);

      this.clients.set(clientId, {
        ws,
        playerId: null,
        nationId: null,
        lastTick: 0,
        connectedAt: Date.now()
      });

      ws.on('message', (data) => this.handleMessage(clientId, data));
      ws.on('close', () => this.handleClose(clientId));
      ws.on('error', (err) => console.error(`[WS] Error en ${clientId}:`, err.message));
    });

    console.log(`[WS] Servidor WebSocket adjunto correctamente al servidor HTTP.`);
  }

  // ... (El resto de los métodos handleMessage, handleIntent, etc. se mantienen igual) ...

  handleMessage(clientId, rawData) {
    // ... (Tu lógica actual de handleMessage con validación) ...
    let message;
    try {
      message = JSON.parse(rawData.toString());
    } catch (e) {
      this.sendError(clientId, 'Invalid JSON');
      return;
    }

    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'handshake':
        this.handleHandshake(clientId, message);
        break;

      case 'intent':
      case 'player_intent':
        // Normalizar ambos tipos a 'player_intent' para UIMessageHandler
        emit('ws.message.player_intent', message.payload || message);
        break;

      case 'command_save_game':
        // Reenviar comando de guardado al PersistenceManager
        emit('command_save_game', message.payload || {});
        break;

      case 'command_load_game':
        // Reenviar comando de carga al PersistenceManager
        emit('command_load_game', message.payload || {});
        break;

      case 'ping':
        this.send(clientId, { type: 'pong', timestamp: Date.now() });
        break;

      default:
        console.warn(`[WS] Mensaje desconocido de ${clientId}: ${message.type}`);
    }
  }

  // ... (Mantén handleHandshake, handleIntent, handleClose, send, sendError, broadcast) ...
  handleHandshake(clientId, message) {
    const client = this.clients.get(clientId);
    if (client) {
      client.playerId = message.playerId;
      client.nationId = message.nationId;

      // Nota: getState y getCurrentTick deben ser importados del core si se usan aquí
      // O usar una referencia inyectada. Asumo que tienes acceso a ellos o usas state local.
      // Para este ejemplo, envío un ack básico.
      this.send(clientId, {
        type: 'handshake_ack',
        playerId: client.playerId,
        nationId: client.nationId,
        timestamp: Date.now()
      });

      console.log(`[WS] Handshake completado: ${message.playerId} en ${message.nationId}`);
    }
  }

  handleIntent(clientId, intentPayload) {
    const client = this.clients.get(clientId);

    // 1. Validar autenticación
    if (!client || !client.playerId) {
      this.sendError(clientId, 'Not authenticated');
      return;
    }

    // 2. Construir la intención completa con metadatos del servidor
    const fullIntent = {
      ...intentPayload,
      playerId: client.playerId,
      nationId: client.nationId || intentPayload.nationId,
      receivedAt: Date.now(),
      tick: getCurrentTick()
    };

    console.log(`[WS] Procesando intención: ${fullIntent.type} para ${fullIntent.nationId}`);

    // 3. Ejecutar lógica de negocio (IntentProcessor)
    // Asegúrate de haber importado: import { processIntent } from '../modules/IntentProcessor.js';
    // Y las funciones de estado: import { getState, applyDelta } from '../core/StateManager.js';

    const currentState = getState();
    const result = processIntent(fullIntent, currentState);

    // 4. Manejar resultado
    if (!result.success) {
      console.warn(`[WS] Intención rechazada (Lógica): ${result.error}`);
      this.sendError(clientId, 'Business Logic Error', { message: result.error });
      return;
    }

    // 5. Aplicar deltas al estado global
    if (result.deltas && result.deltas.length > 0) {
      result.deltas.forEach(delta => {
        const applyResult = applyDelta(delta, 'player_intent');
        if (!applyResult.success) {
          console.error('[WS] Fallo al aplicar delta:', applyResult.errors);
        }
      });

      // 6. Enviar confirmación al cliente
      this.send(clientId, {
        type: 'intent_accepted',
        tick: getCurrentTick(),
        changes: result.deltas,
        message: 'Intención procesada correctamente'
      });

      console.log(`[WS] ✅ Intención ${fullIntent.type} aplicada con éxito.`);
    } else {
      // Caso donde no hay deltas pero fue exitoso (ej. solo lectura o info)
      this.send(clientId, {
        type: 'intent_accepted',
        tick: getCurrentTick(),
        message: 'Intención recibida, sin cambios de estado'
      });
    }

    // 7. Emitir evento para otros módulos
    emit('intent_received', fullIntent);
  }

  handleClose(clientId) {
    console.log(`[WS] Cliente desconectado: ${clientId}`);
    this.clients.delete(clientId);
  }

  send(clientId, data) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  }

  sendError(clientId, message, details = []) {
    this.send(clientId, {
      type: 'error',
      message,
      details,
      timestamp: Date.now()
    });
  }

  broadcast(data, excludeId = null) {
    const payload = JSON.stringify(data);
    for (const [id, client] of this.clients.entries()) {
      if (id !== excludeId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }
}