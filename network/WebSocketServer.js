import http from 'http';
import { WebSocketServer } from 'ws';
import { on, off, emit } from '../core/EventDispatcher.js';
import { getState, applyDelta, setInitialState } from '../core/StateManager.js';
import { getCurrentTick } from '../core/TimeEngine.js';
import { validator } from './SchemaValidator.js';

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
        const validation = validator.validateIntent(message.payload);
        
        if (!validation.valid) {
          console.warn(`[WS] Intención rechazada para ${clientId}:`, validation.errors);
          this.sendError(clientId, 'Invalid Intent Structure', validation.errors);
          return;
        }
        
        this.handleIntent(clientId, message.payload);
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
    if (!client || !client.playerId) {
      this.sendError(clientId, 'Not authenticated');
      return;
    }

    const fullIntent = {
      ...intentPayload,
      playerId: client.playerId,
      nationId: client.nationId,
      receivedAt: Date.now()
    };

    // Emitir al core (necesitas importar 'emit' del core)
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