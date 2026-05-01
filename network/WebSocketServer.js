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
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

let wssInstance = null; // Guardar referencia al servidor WebSocket

export function initWebSocketServer(state, eventEmitter) {
    const server = http.createServer((req, res) => {
        // 1. Manejo exclusivo de peticiones HTTP (Archivos estáticos)
        const url = new URL(req.url, `http://${req.headers.host}`);
        let filePath = '';

        
        // Ruteo de carpetas
        if (url.pathname.startsWith('/client/')) {
            const relativePath = url.pathname.replace('/client/', '');
            // Seguridad básica contra traversal
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
    

    // 2. Configuración exclusiva de WebSocket
    const wss = new WebSocketServer({ 
        server, 
        path: '/' // Escucha en la raíz para WS
    });

    wss.on('connection', (ws, req) => {
        console.log('[WebSocketServer] Nuevo cliente WebSocket conectado.');
        
        // Enviar estado inicial inmediatamente
        try {
            ws.send(JSON.stringify({ 
                type: 'state_update', 
                payload: state,
                tick: 0 
            }));
        } catch (e) {
            console.error('[WebSocketServer] Error al enviar estado inicial:', e);
        }

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                // console.log(`[WebSocketServer] Mensaje recibido: ${data.type}`);

                // Emitir eventos al sistema central
                if (data.type === 'player_intent' || data.type === 'policy_decision') {
                    eventEmitter.emit('ws_message', data);
                }
            } catch (e) {
                console.error('[WebSocketServer] Error parseando mensaje:', e);
            }
        });

        ws.on('close', () => {
            console.log('[WebSocketServer] Cliente desconectado.');
        });

        ws.on('error', (error) => {
            console.error('[WebSocketServer] Error en socket:', error.message);
        });
    });

    const PORT = process.env.PORT || 8080;
    
    server.listen(PORT, () => {
        console.log(`[WebSocketServer] Servidor HTTP+WebSocket listo en puerto ${PORT}.`);
        console.log(`[WebSocketServer] Web UI: http://localhost:${PORT}`);
        console.log(`[WebSocketServer] Client Modules: http://localhost:${PORT}/client/`);
    });

    // Exponer función de broadcast para que main.js pueda enviar actualizaciones
    server.broadcast = (data) => {
        const message = JSON.stringify(data);
        wss.clients.forEach(client => {
            if (client.isReadyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    };

    return wss;
}