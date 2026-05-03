/**
 * network/WebSocketServer.js
 * 
 * Servidor HTTP y WebSocket para RealPolitik.
 * Maneja conexiones de clientes, sirve estáticos y proporciona el mecanismo de broadcast.
 * 
 * Cambios Críticos:
 * - La función initWebSocketServer ahora retorna un objeto explícito { broadcast, wss, server }.
 * - Se elimina la dependencia de variables globales para el broadcast.
 * - Se asegura que la lista de clientes sea accesible para el envío masivo.
 */
/**
 * network/WebSocketServer.js
 * 
 * Servidor HTTP y WebSocket para RealPolitik.
 * Sirve archivos estáticos desde la carpeta 'public' y maneja conexiones WS.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

// Configuración de rutas ESM robusta
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CORRECCIÓN CRÍTICA: Calcular ruta absoluta correcta hacia 'public'
// Estamos en /network/, así que subimos dos niveles: ../..
const PUBLIC_DIR = path.resolve (__dirname, '..', '..', 'public');

console.log('[DEBUG] Ruta absoluta de PUBLIC_DIR:', PUBLIC_DIR);

let wssInstance = null;
let httpServerInstance = null;

export function initWebSocketServer(initialState = {}) {
    httpServerInstance = http.createServer((req, res) => {
        // Manejo seguro de rutas
        let urlPath = req.url === '/' ? '/index.html' : req.url;
        // Eliminar parámetros de consulta (?)
        urlPath = urlPath.split('?')[0]; 
        
        let filePath = path.join(PUBLIC_DIR, urlPath);

        // Seguridad: Prevenir Directory Traversal
        if (!filePath.startsWith(PUBLIC_DIR)) {
            res.writeHead(403);
            res.end('Acceso denegado');
            return;
        }

        const extname = path.extname(filePath);
        const contentTypes = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon'
        };

        const contentType = contentTypes[extname] || 'application/octet-stream';

        fs.readFile(filePath, (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    console.warn(`[HTTP] 404 - Archivo no encontrado: ${filePath}`);
                    res.writeHead(404);
                    res.end('Archivo no encontrado: ' + urlPath);
                } else {
                    console.error(`[HTTP] 500 - Error interno: ${err.code}`);
                    res.writeHead(500);
                    res.end('Error interno del servidor');
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            }
        });
    });

    wssInstance = new WebSocketServer({ server: httpServerInstance });

    wssInstance.on('connection', (ws) => {
        console.log('[WS] Cliente conectado.');
        
        // Enviar estado inicial si existe
        if (initialState && Object.keys(initialState).length > 0) {
            ws.send(JSON.stringify({
                type: 'init',
                state: initialState,
                tick: 0
            }));
        }

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                // Aquí iría el manejo de mensajes entrantes
                // console.log('[WS] Mensaje recibido:', data.type);
            } catch (e) {
                console.error('[WS] Error al parsear mensaje:', e);
            }
        });

        ws.on('close', () => console.log('[WS] Cliente desconectado.'));
        ws.on('error', (err) => console.error('[WS] Error:', err));
    });

    // Función de broadcast expuesta
    const broadcast = (data) => {
        if (!wssInstance) return;
        const message = JSON.stringify(data);
        let count = 0;
        wssInstance.clients.forEach(client => {
            if (client.readyState === 1) { // OPEN
                client.send(message);
                count++;
            }
        });
        // Opcional: Log de broadcast
        // if (count > 0) console.log(`[Broadcast] Enviado a ${count} clientes (Tick: ${data.tick})`);
    };

    const PORT = process.env.PORT || 3000;
    httpServerInstance.listen(PORT, () => {
        console.log(`[Server] Servidor HTTP/WS corriendo en http://localhost:${PORT}`);
        console.log(`[Server] Sirviendo estáticos desde: ${PUBLIC_DIR}`);
    });

    return {
        broadcast,
        wss: wssInstance,
        server: httpServerInstance
    };
}