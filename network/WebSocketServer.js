import http from 'http';
import { WebSocketServer as WS, WebSocket } from 'ws';
import { on, off, emit } from '../core/EventDispatcher.js';
import { getState, applyDelta, setInitialState } from '../core/StateManager.js';
import { getCurrentTick } from '../core/TimeEngine.js';
import validator from '../core/SchemaValidator.js';
import { processIntent } from '../modules/IntentProcessor.js';
import schemaValidator from '../core/SchemaValidator.js';

/**
 * @file WebSocketServer.js
 * @description Servidor WebSocket para comunicación en tiempo real con clientes.
 *              Gestiona conexiones, validación de intenciones y sincronización de estado.
 * @version 1.0.1
 * @changelog
 * - v1.0.1: Corrección: eliminar require() de 'ws', usar import ESM consistentemente
 */

export class WebSocketServer {
    /**
     * @param {http.Server} httpServer - Servidor HTTP existente
     * @param {Object} config - Configuración del juego
     * @param {Function} getState - Función para obtener el estado actual
     * @param {Object} intentProcessor - Objeto con método process
     * @param {Object} timeEngine - Módulo de tiempo
     */
    constructor(httpServer, config, getState, intentProcessor, timeEngine) {
        this.httpServer = httpServer;
        this.config = config;
        this.getState = getState;
        this.intentProcessor = intentProcessor;
        this.timeEngine = timeEngine;

        this.wss = null;
        this.clients = new Map(); // clientId -> { ws, playerId, nationId }

        console.log('[WS Server] Constructor inicializado con dependencias.');
    }

    start() {
        // Crear servidor WebSocket adjunto al HTTP
        this.wss = new WS({ noServer: true });

        this.httpServer.on('upgrade', (request, socket, head) => {
            this.wss.handleUpgrade(request, socket, head, (ws) => {
                this.wss.emit('connection', ws, request);
            });
        });

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
            this.send(clientId, {
                type: 'connected',
                clientId,
                message: 'Conectado a RealPolitik Core'
            });
        });

        console.log(`[WS Server] Escuchando en puerto ${this.config.port || 'adjunto a HTTP'}`);
    }

    /**
     * MÉTODO PÚBLICO CRÍTICO: Envía mensaje a un cliente específico.
     * Este es el método que main.js intenta vincular.
     */
    send(clientId, message) {
        const client = this.clients.get(clientId);
        if (client && client.ws && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
            return true;
        }
        return false;
    }

    /**
     * MÉTODO PÚBLICO: Emite mensaje a todos los clientes conectados.
     */
    broadcast(message) {
        const data = JSON.stringify(message);
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    }

    // ... Mantén tus métodos existentes (_handleMessage, _handleRegister, etc.) ...
    // Asegúrate de que dentro de _handleMessage uses this.send() en lugar de this._sendToClient() si quieres consistencia

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
                this.send(clientId, { type: 'pong', serverTime: Date.now() });
                break;

            default:
                console.warn(`[WS] Tipo de mensaje desconocido: ${message.type}`);
        }
    }

    _handleRegister(clientId, message) {
        const client = this.clients.get(clientId);
        if (client) {
            client.playerId = message.playerId || `Player_${clientId}`;
            client.nationId = message.nationId;
            console.log(`[WS] Cliente ${clientId} registrado como ${client.playerId} (${client.nationId})`);

            if (this.getState) {
                this.send(clientId, {
                    type: 'init_state',
                    state: this.getState()
                });
            }
        }
    }

    async _handleIntent(clientId, message) {
        const client = this.clients.get(clientId);
        const payload = (message.payload && typeof message.payload === 'object') ? message.payload : {};

        if (!client.playerId || !client.nationId) {
            client.playerId = client.playerId || payload.actor || `Player_${clientId}`;
            client.nationId = client.nationId || payload.nationId || message.nation_id || 'ARG';
        }

        const actionType = payload.actionType || payload.type || message.actionType;
        if (!actionType) {
            this.send(clientId, {
                type: 'intent_rejected',
                reason: 'Intención sin tipo de acción'
            });
            return;
        }

        // Normalización básica
        const normalizedIntent = {
            type: actionType,
            actionType,
            playerId: client.playerId,
            nationId: client.nationId,
            payload,
            parameters: payload.parameters || payload,
            receivedAt: Date.now(),
            tick: this.timeEngine.getCurrentTick()
        };

        // Validación
        const validation = schemaValidator.validateIntent(normalizedIntent);
        if (!validation.valid) {
            console.warn(`[WS] Intent inválido de ${clientId}:`, validation.errors);
            this.send(clientId, {
                type: 'intent_rejected',
                reason: 'Datos inválidos',
                details: validation.errors
            });
            return;
        }

        // Procesamiento
        try {
            const currentState = this.getState();
            // Asumiendo que intentProcessor.process devuelve { success, stateDelta, feedback, error }
            const result = this.intentProcessor.process(normalizedIntent, currentState);

            if (result.success) {
                // Aquí deberías aplicar el delta al estado global si tu arquitectura lo permite desde aquí
                // O devolver el delta para que main.js lo aplique

                this.send(clientId, {
                    type: 'intent_accepted',
                    tick: this.timeEngine.getCurrentTick(),
                    payload: result.feedback || {}
                });

                // Si hay cambios de estado, se deberían broadcastear
                if (result.stateDelta) {
                    this.broadcast({
                        type: 'state_update',
                        delta: result.stateDelta,
                        tick: this.timeEngine.getCurrentTick()
                    });
                }
            } else {
                this.send(clientId, {
                    type: 'intent_rejected',
                    reason: result.error || 'Procesamiento fallido'
                });
            }
        } catch (error) {
            console.error(`[WS] Error procesando intent de ${clientId}:`, error);
            this.send(clientId, {
                type: 'intent_rejected',
                reason: 'Error interno del servidor'
            });
        }
    }

    _handleDisconnect(clientId) {
        console.log(`[WS] Cliente desconectado: ${clientId}`);
        this.clients.delete(clientId);
    }

    _generateClientId() {
        return `client_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }
}

export default WebSocketServer;