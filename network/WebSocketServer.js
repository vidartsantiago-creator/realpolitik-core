/**
 * @file WebSocketServer.js
 * @description Servidor WebSocket: handshake, autenticación, enrutamiento de mensajes,
 *              broadcast de eventos filtrados por InformationLayer.
 * @version 1.1.0
 * @author RealPolitik Core Team
 * @dependencies EventDispatcher, StateManager, InformationLayer
 * @changelog
 * - v1.0.0: Creación inicial. Stub para MVP.
 * - v1.0.1: Implementación real con serve-static para HTTP y ws para WebSocket.
 * - v1.1.0: Integración con EventDispatcher, filtrado por InformationLayer, eventos de red.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer as WSServer } from 'ws';
import { on, emit, off } from '../core/EventDispatcher.js';
import { getState, snapshot } from '../core/StateManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const CLIENT_DIR = path.join(ROOT_DIR, 'client');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

/**
 * @typedef {Object} ConnectedClient
 * @property {import('ws').WebSocket} socket
 * @property {string} clientId
 * @property {string|null} nationId - Nación asignada tras autenticación
 * @property {number} connectedAt
 * @property {boolean} authenticated
 */

/** @type {Map<string, ConnectedClient>} */
const connectedClients = new Map();

/** @type {import('ws').WebSocketServer|null} */
let wssInstance = null;

/** @type {http.Server|null} */
let httpServer = null;

/**
 * Filtra el estado global según la visibilidad del cliente (InformationLayer).
 * Si no hay nationId asignada, devuelve solo datos públicos.
 * @param {Object} fullState - Estado completo del juego
 * @param {string|null} observerNationId - Nación del observador
 * @returns {Object} Estado filtrado visible para el cliente
 */
function filterStateForClient(fullState, observerNationId) {
    // Si no está autenticado, solo devuelve datos públicos mínimos
    if (!observerNationId) {
        return {
            tick: fullState.tick,
            version: fullState.version,
            publicData: {
                crisis: fullState.crisis?.active ?? false,
                nationCount: Object.keys(fullState.nations || {}).length
            }
        };
    }

    // TODO: Integrar con InformationLayer.filterDataByVisibility cuando esté disponible
    // Por ahora, devolvemos el estado completo menos datos sensibles internos
    const filteredState = {
        tick: fullState.tick,
        version: fullState.version,
        nations: {},
        diplomacy: fullState.diplomacy,
        crisis: fullState.crisis,
        factions: fullState.factions,
        espionage: {
            signals: fullState.espionage?.signals || [],
            // Ocultar operaciones activas de otros jugadores
            operations: {}
        }
    };

    // Incluir solo la nación del jugador completa, las demás filtradas
    for (const [nationId, nationData] of Object.entries(fullState.nations || {})) {
        if (nationId === observerNationId) {
            filteredState.nations[nationId] = nationData;
        } else {
            // Datos limitados de naciones enemigas
            filteredState.nations[nationId] = {
                id: nationId,
                stats: nationData.stats ? {
                    stability: nationData.stats.stability,
                    // Ocultar budget exacto, mostrar rango
                    budgetRange: nationData.stats.budget !== undefined
                        ? (nationData.stats.budget > 0 ? 'positive' : 'negative')
                        : 'unknown'
                } : {},
                resources: nationData.resources || {}
            };
        }
    }

    return filteredState;
}

/**
 * Genera un ID único para el cliente
 * @returns {string}
 */
function generateClientId() {
    return `client_${Date.now()}_${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
}

/**
 * Envía un evento a un cliente específico
 * @param {string} clientId
 * @param {string} eventType
 * @param {any} payload
 */
function sendToClient(clientId, eventType, payload) {
    const client = connectedClients.get(clientId);
    if (client && client.socket.readyState === 1) { // WebSocket.OPEN
        try {
            client.socket.send(JSON.stringify({
                type: eventType,
                payload,
                timestamp: Date.now()
            }));
        } catch (e) {
            console.error(`[WebSocketServer] Error enviando a ${clientId}:`, e.message);
        }
    }
}

/**
 * Broadcast a todos los clientes conectados
 * @param {string} eventType
 * @param {any} payload
 * @param {string} [excludeClientId] - Opcional: excluir un cliente del broadcast
 */
function broadcast(eventType, payload, excludeClientId = null) {
    const message = {
        type: eventType,
        payload,
        timestamp: Date.now()
    };
    const serialized = JSON.stringify(message);

    for (const [clientId, client] of connectedClients.entries()) {
        if (clientId !== excludeClientId && client.socket.readyState === 1) {
            try {
                client.socket.send(serialized);
            } catch (e) {
                console.error(`[WebSocketServer] Error en broadcast a ${clientId}:`, e.message);
            }
        }
    }
}

/**
 * Maneja la conexión de un nuevo cliente WebSocket
 * @param {import('ws').WebSocket} ws
 * @param {http.IncomingMessage} req
 */
function handleConnection(ws, req) {
    const clientId = generateClientId();
    const clientInfo = {
        socket: ws,
        clientId,
        nationId: null,
        connectedAt: Date.now(),
        authenticated: false
    };

    connectedClients.set(clientId, clientInfo);
    console.log(`[WebSocketServer] Cliente conectado: ${clientId} (${req.socket.remoteAddress})`);

    // Emitir evento de conexión
    emit('client_connected', { clientId, address: req.socket.remoteAddress });

    // Enviar mensaje de bienvenida con ID de cliente
    sendToClient(clientId, 'connection_ack', {
        clientId,
        message: 'Conexión establecida. Esperando autenticación.',
        serverTime: Date.now()
    });

    // Enviar estado inicial público (sin autenticar)
    const initialState = filterStateForClient(getState(), null);
    sendToClient(clientId, 'state_sync', {
        state: initialState,
        tick: initialState.tick
    });

    // Handler para mensajes entrantes
    ws.on('message', (message) => handleMessage(clientId, message));

    // Handler para desconexión
    ws.on('close', () => handleDisconnect(clientId));

    // Handler para errores
    ws.on('error', (error) => {
        console.error(`[WebSocketServer] Error en socket ${clientId}:`, error.message);
        emit('client_error', { clientId, error: error.message });
    });
}

/**
 * Maneja mensajes recibidos de un cliente
 * @param {string} clientId
 * @param {Buffer} messageBuffer
 */
function handleMessage(clientId, messageBuffer) {
    let data;
    try {
        data = JSON.parse(messageBuffer.toString());
    } catch (e) {
        console.error(`[WebSocketServer] Mensaje inválido de ${clientId}:`, e.message);
        sendToClient(clientId, 'error', { code: 'INVALID_JSON', message: 'Mensaje no válido' });
        return;
    }

    const client = connectedClients.get(clientId);
    if (!client) return;

    // console.log(`[WebSocketServer] Mensaje de ${clientId}: ${data.type}`);

    switch (data.type) {
        case 'authenticate':
            handleAuthentication(clientId, data.payload);
            break;

        case 'player_intent':
        case 'policy_decision':
        case 'diplomatic_action':
        case 'espionage_order':
            // Re-enviar al sistema central para procesamiento
            emit('ws_message', {
                clientId,
                nationId: client.nationId,
                ...data
            });
            break;

        case 'ping':
            sendToClient(clientId, 'pong', { serverTime: Date.now() });
            break;

        default:
            console.warn(`[WebSocketServer] Tipo de mensaje desconocido: ${data.type}`);
    }
}

/**
 * Maneja autenticación de cliente
 * @param {string} clientId
 * @param {{nationId?: string, token?: string}} payload
 */
function handleAuthentication(clientId, payload) {
    const client = connectedClients.get(clientId);
    if (!client) return;

    // Autenticación básica: verificar nationId válida
    // TODO: Implementar verificación de token/session real
    const state = getState();
    const nationId = payload?.nationId;

    if (nationId && state.nations?.[nationId]) {
        client.nationId = nationId;
        client.authenticated = true;

        console.log(`[WebSocketServer] Cliente ${clientId} autenticado como ${nationId}`);

        // Emitir evento de autenticación
        emit('client_authenticated', { clientId, nationId });

        // Enviar estado completo filtrado para esta nación
        const filteredState = filterStateForClient(state, nationId);
        sendToClient(clientId, 'state_sync', {
            state: filteredState,
            tick: filteredState.tick,
            authenticated: true
        });

        // Notificar a otros clientes (opcional, para admin)
        broadcast('player_joined', {
            nationId,
            clientId,
            timestamp: Date.now()
        }, clientId);

    } else {
        sendToClient(clientId, 'auth_failed', {
            code: 'INVALID_NATION',
            message: 'Nación no válida o no existe',
            availableNations: Object.keys(state.nations || {})
        });
    }
}

/**
 * Maneja desconexión de cliente
 * @param {string} clientId
 */
function handleDisconnect(clientId) {
    const client = connectedClients.get(clientId);
    if (!client) return;

    console.log(`[WebSocketServer] Cliente desconectado: ${clientId}`);

    // Emitir evento de desconexión
    emit('client_disconnected', {
        clientId,
        nationId: client.nationId,
        sessionDuration: Date.now() - client.connectedAt
    });

    // Notificar a otros clientes si estaba autenticado
    if (client.authenticated && client.nationId) {
        broadcast('player_left', {
            nationId: client.nationId,
            clientId,
            timestamp: Date.now()
        });
    }

    connectedClients.delete(clientId);
}

/**
 * Suscribe el servidor WebSocket a eventos del EventDispatcher
 * para hacer broadcast automático a clientes
 */
function subscribeToGameEvents() {
    // Escuchar actualizaciones de estado para hacer sync
    on('state_updated', (data) => {
        const fullState = getState();

        // Broadcast a cada cliente con su estado filtrado personalizado
        for (const [clientId, client] of connectedClients.entries()) {
            const filteredState = filterStateForClient(fullState, client.nationId);
            sendToClient(clientId, 'state_update', {
                tick: data.tick,
                version: data.version,
                delta: data.delta,
                source: data.source,
                state: filteredState
            });
        }
    }, 100); // Alta prioridad

    // Escuchar eventos de crisis para alertas
    on('crisis_escalated', (data) => {
        broadcast('alert', {
            category: 'crisis',
            level: 'high',
            message: `Crisis escalada a fase ${data.phase}`,
            data
        });
    }, 90);

    // Escuchar eventos de diplomacia
    on('treaty_signed', (data) => {
        broadcast('diplomacy_event', {
            category: 'treaty',
            message: `Tratado firmado: ${data.treatyType}`,
            data
        });
    }, 90);

    // Escuchar eventos de espionaje (solo para el jugador afectado)
    on('espionage_detected', (data) => {
        // Enviar solo al jugador objetivo
        if (data.targetNationId) {
            for (const [clientId, client] of connectedClients.entries()) {
                if (client.nationId === data.targetNationId) {
                    sendToClient(clientId, 'intel_alert', {
                        category: 'espionage',
                        message: 'Actividad de espionaje detectada',
                        data
                    });
                }
            }
        }
    }, 90);
}

/**
 * Inicializa el servidor WebSocket y HTTP
 * @param {Object} state - Estado inicial del juego (referencia)
 * @param {Object} eventEmitter - Emisor de eventos (compatibilidad legacy)
 * @returns {{ server: http.Server, broadcast: Function, getClientCount: Function }}
 */
export function initWebSocketServer(state, eventEmitter) {
    // Crear servidor HTTP para archivos estáticos
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        let filePath = '';

        // Ruteo de carpetas
        if (url.pathname.startsWith('/client/')) {
            const relativePath = url.pathname.replace('/client/', '');
            if (relativePath.includes('..')) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }
            filePath = path.join(CLIENT_DIR, relativePath);
        } else {
            const relativePath = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
            filePath = path.join(PUBLIC_DIR, relativePath);
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end(`404 Not Found: ${url.pathname}`);
                } else {
                    res.writeHead(500);
                    res.end(`Server Error: ${err.code}`);
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            }
        });
    });

    // Crear servidor WebSocket
    const wss = new WSServer({
        server,
        path: '/ws' // Endpoint específico para WebSocket
    });

    wssInstance = wss;
    httpServer = server;

    // Suscribirse a eventos del juego
    subscribeToGameEvents();

    // Manejar nuevas conexiones
    wss.on('connection', handleConnection);

    const PORT = process.env.PORT || 8080;

    server.listen(PORT, () => {
        console.log(`[WebSocketServer] Servidor HTTP+WebSocket listo en puerto ${PORT}.`);
        console.log(`[WebSocketServer] Web UI: http://localhost:${PORT}`);
        console.log(`[WebSocketServer] WebSocket endpoint: ws://localhost:${PORT}/ws`);
        console.log(`[WebSocketServer] Client Modules: http://localhost:${PORT}/client/`);
    });

    // Función de broadcast legacy (para compatibilidad con main.js)
    server.broadcast = (data) => {
        broadcast('state_update', data);
    };

    // Función para obtener count de clientes
    server.getClientCount = () => connectedClients.size;

    server.getConnectedClients = () => {
        const clients = [];
        for (const [id, client] of connectedClients.entries()) {
            clients.push({
                clientId: id,
                nationId: client.nationId,
                authenticated: client.authenticated,
                connectedAt: client.connectedAt
            });
        }
        return clients;
    };

    return {
        server,
        broadcast: server.broadcast,
        getClientCount: server.getClientCount,
        getConnectedClients: server.getConnectedClients
    };
}

/**
 * Detiene el servidor WebSocket y HTTP
 * @returns {Promise<void>}
 */
export async function shutdownWebSocketServer() {
    return new Promise((resolve, reject) => {
        console.log('[WebSocketServer] Cerrando servidor...');

        // Desuscribir de eventos
        off('state_updated');
        off('crisis_escalated');
        off('treaty_signed');
        off('espionage_detected');

        // Cerrar todas las conexiones de clientes
        for (const [clientId, client] of connectedClients.entries()) {
            client.socket.close(1000, 'Server shutting down');
        }
        connectedClients.clear();

        // Cerrar servidor WebSocket
        if (wssInstance) {
            wssInstance.close((err) => {
                if (err) reject(err);
                else {
                    wssInstance = null;

                    // Cerrar servidor HTTP
                    if (httpServer) {
                        httpServer.close((err) => {
                            if (err) reject(err);
                            else {
                                httpServer = null;
                                console.log('[WebSocketServer] Servidor cerrado.');
                                resolve();
                            }
                        });
                    } else {
                        resolve();
                    }
                }
            });
        } else {
            resolve();
        }
    });
}

// Exportar funciones útiles para testing
export function _getConnectedClientsForTests() {
    return connectedClients;
}

export function ResetForTests() {
    for (const [clientId, client] of connectedClients.entries()) {
        client.socket.close();
    }
    connectedClients.clear();
    wssInstance = null;
    httpServer = null;
}