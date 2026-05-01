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

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const CLIENT_DIR = path.join(ROOT_DIR, 'client');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

let wssInstance = null;
let connectedClients = [];

// Función para broadcast segura
export function broadcastState(stateData) {
    if (!wssInstance || connectedClients.length === 0) return;
    
    const message = JSON.stringify({
        type: 'state_update',
        payload: stateData
    });

    connectedClients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(message);
        }
    });
}

export function initWebSocketServer(getStateFn, eventEmitter) {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        let filePath = '';
        
        // Seguridad básica contra directory traversal
        const sanitize = (p) => p.replace(/\.\./g, '');

        if (url.pathname.startsWith('/client/')) {
            const relativePath = sanitize(url.pathname.replace('/client/', ''));
            filePath = path.join(CLIENT_DIR, relativePath);
        } else {
            const relativePath = url.pathname === '/' ? 'index.html' : sanitize(url.pathname.slice(1));
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

    wssInstance = new WebSocketServer({ server });

    wssInstance.on('connection', (ws) => {
        console.log('[WebSocketServer] Nuevo cliente conectado.');
        connectedClients.push(ws);

        // Enviar estado inicial inmediato
        if (getStateFn) {
            const currentState = getStateFn();
            ws.send(JSON.stringify({
                type: 'state_update',
                payload: currentState
            }));
        }

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                console.log(`[WebSocketServer] Mensaje recibido: ${data.type}`);
                
                // Reenviar al EventDispatcher del core
                if (eventEmitter) {
                    eventEmitter.emit('ws_message', data);
                }
            } catch (e) {
                console.error('[WebSocketServer] Error parseando mensaje:', e);
            }
        });

        ws.on('close', () => {
            console.log('[WebSocketServer] Cliente desconectado.');
            connectedClients = connectedClients.filter(c => c !== ws);
        });
        
        ws.on('error', (err) => {
            console.error('[WebSocketServer] Error en socket:', err.message);
        });
    });

    const PORT = process.env.PORT || 8080;
    server.listen(PORT, () => {
        console.log(`[WebSocketServer] Servidor HTTP+WebSocket listo.`);
        console.log(`[WebSocketServer] Web UI disponible en http://localhost:${PORT}`);
        console.log(`[WebSocketServer] Client modules en http://localhost:${PORT}/client/`);
    });

    return wssInstance;
}