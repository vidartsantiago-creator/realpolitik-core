import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { on, off, emit } from '../core/EventDispatcher.js';
import { getState, applyDelta, setInitialState } from '../core/StateManager.js';
import { getCurrentTick } from '../core/TimeEngine.js';
import { validator } from './SchemaValidator.js';
import { processIntent } from '../modules/IntentProcessor.js';

/**
 * @file WebSocketServer.js
 * @description Servidor WebSocket para comunicación en tiempo real con clientes.
 *              Gestiona conexiones, validación de intenciones y sincronización de estado.
 * @version 1.0.1
 * @changelog
 * - v1.0.1: Corrección: eliminar require() de 'ws', usar import ESM consistentemente
 */

class WebSocketServer {
    constructor(port, stateManager, intentProcessor, timeEngine) {
        this.port = port;
        this.stateManager = stateManager;
        this.intentProcessor = intentProcessor;
        this.timeEngine = timeEngine;
        
        this.wss = null;
        this.clients = new Map(); // clientId -> { ws, playerId, nationId }

        // Inicializar validador explícitamente
        validator.init();
    }

    start() {
        this.wss = new WebSocketServer({ port: this.port });
        console.log(`[WS Server] Escuchando en puerto ${this.port}`);

        this.wss.on('connection', (ws, req) => {
            const clientId = this._generateClientId();
            console.log(`[WS] Nuevo cliente conectado: ${clientId}`);

            this.clients.set(clientId, {
                ws,
                playerId: null,
                nationId: null,
                connectedAt: Date.now()
            });

            ws.on('message', (data) => this._handleMessage(clientId, data));
            ws.on('close', () => this._handleDisconnect(clientId));
            ws.on('error', (err) => console.error(`[WS] Error cliente ${clientId}:`, err));

            // Enviar handshake inicial
            this._sendToClient(clientId, {
                type: 'connected',
                clientId,
                message: 'Conectado a RealPolitik Core'
            });
        });
    }

    /**
     * Maneja los mensajes entrantes y enruta según el tipo.
     */
    _handleMessage(clientId, rawData) {
        let message;
        try {
            message = JSON.parse(rawData.toString());
        } catch (e) {
            console.warn(`[WS] JSON inválido de ${clientId}`);
            return;
        }

        const client = this.clients.get(clientId);
        if (!client) return;

        switch (message.type) {
            case 'register_player':
                this._handleRegister(clientId, message);
                break;
            
            case 'intent':
                this._handleIntent(clientId, message);
                break;

            case 'ping':
                this._sendToClient(clientId, { type: 'pong', serverTime: Date.now() });
                break;

            default:
                console.warn(`[WS] Tipo de mensaje desconocido: ${message.type}`);
        }
    }

    /**
     * CRÍTICO: Normaliza y valida Intents antes de procesar.
     */
    _handleIntent(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client.playerId || !client.nationId) {
            this._sendToClient(clientId, {
                type: 'intent_rejected',
                reason: 'No registrado o sin nación seleccionada'
            });
            return;
        }

        // 1. NORMALIZACIÓN ESTRUCTURAL
        // Evita errores de "payload.payload.unitType" vs "payload.unitType"
        const rawPayload = message.payload;
        const normalizedPayload = (rawPayload && typeof rawPayload === 'object') 
            ? rawPayload 
            : {};

        const normalizedIntent = {
            type: message.type, // 'intent'
            actionType: message.actionType || normalizedPayload.action, // Extraer tipo de acción real
            playerId: client.playerId,
            nationId: client.nationId,
            payload: normalizedPayload,
            receivedAt: Date.now(),
            tick: this.timeEngine.getCurrentTick()
        };

        // 2. VALIDACIÓN ESTRICTA CONTRA SCHEMA
        // El schema debe esperar la estructura normalizada
        const validation = validator.validateIntent(normalizedIntent);
        
        if (!validation.valid) {
            console.warn(`[WS] Intent inválido de ${clientId}:`, validation.errors);
            this._sendToClient(clientId, {
                type: 'intent_rejected',
                reason: 'Datos inválidos',
                details: validation.errors
            });
            return;
        }

        // 3. PROCESAMIENTO
        try {
            const currentState = this.stateManager.getState();
            const result = processIntent(normalizedIntent, currentState);

            if (result.success) {
                // Aplicar cambios al estado si los hay
                if (result.deltas && result.deltas.length > 0) {
                    result.deltas.forEach(delta => {
                        this.stateManager.applyDelta(delta);
                    });
                    
                    // Broadcast del delta a todos los clientes
                    this.broadcast({
                        type: 'state_update',
                        deltas: result.deltas,
                        tick: this.timeEngine.getCurrentTick()
                    });
                }

                this._sendToClient(clientId, {
                    type: 'intent_accepted',
                    tick: this.timeEngine.getCurrentTick(),
                    payload: result.feedback || {}
                });
            } else {
                this._sendToClient(clientId, {
                    type: 'intent_rejected',
                    reason: result.error || 'Procesamiento fallido'
                });
            }
        } catch (error) {
            console.error(`[WS] Error procesando intent de ${clientId}:`, error);
            this._sendToClient(clientId, {
                type: 'intent_rejected',
                reason: 'Error interno del servidor'
            });
        }
    }

    _handleRegister(clientId, message) {
        const client = this.clients.get(clientId);
        if (client) {
            client.playerId = message.playerId || `Player_${clientId}`;
            client.nationId = message.nationId;
            console.log(`[WS] Cliente ${clientId} registrado como ${client.playerId} (${client.nationId})`);
            
            // Enviar estado inicial completo
            this._sendToClient(clientId, {
                type: 'init_state',
                state: this.stateManager.getState()
            });
        }
    }

    _handleDisconnect(clientId) {
        console.log(`[WS] Cliente desconectado: ${clientId}`);
        this.clients.delete(clientId);
    }

    _sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    }

    broadcast(message) {
        const data = JSON.stringify(message);
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    }

    _generateClientId() {
        return `client_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }
}

export default WebSocketServer;