/**
 * @file main.js
 * @description Punto de entrada principal del servidor. Inicializa núcleo, carga configuraciones,
 *              registra módulos y arranca el servidor WebSocket adjunto a HTTP.
 * @version 1.0.3 (Corregido: Eliminada arquitectura fantasma)
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initRng } from '../core/Rng.js';
import { on, emit } from '../core/EventDispatcher.js';
import { setInitialState, applyDelta, getState, snapshot } from '../core/StateManager.js';
import { initTimeEngine, start as startTimeEngine, onTickStart, onTickEnd, executeTick, getCurrentTick } from '../core/TimeEngine.js';
import { GameWebSocketServer } from '../network/WebSocketServer.js';
import { initPersistenceManager } from '../core/PersistenceManager.js';
import { init as initIntentParser, stopAdvisorCycle } from '../ai/IntentParser.js';
import { init as initIntelGenerator } from '../modules/IntelGenerator.js';
import { init as initDiplomacyEngine } from '../modules/diplomacy/core/DiplomacyEngine.js';
import { init as initDiplomacyAI } from '../modules/diplomacy/ai/DiplomacyAI.js';
import { init as IntentProcessor } from '../modules/IntentProcessor.js';

// Configuración de rutas
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

// ============================================
// Sección: Carga de Configuración
// ============================================

function loadConfig() {
    const defaultConfig = { seed: 42, tickRate: 1000, port: 8080 };
    try {
        const configPath = path.join(ROOT_DIR, 'config', 'game.config.json');
        const data = fs.readFileSync(configPath, 'utf8');
        const parsedConfig = JSON.parse(data);
        console.log('[main] Configuraciones cargadas:', `seed=${parsedConfig.seed}, tickRate=${parsedConfig.tickRate}ms`);
        return parsedConfig;
    } catch (e) {
        console.warn('[main] No se encontró game.config.json, usando defaults.');
        return defaultConfig;
    }
}

const CONFIG = loadConfig();
const PORT = CONFIG.port || process.env.PORT || 8080;

// ============================================
// Sección: Registro de Módulos
// ============================================
const moduleRegistry = {};

async function registerModules() {
    console.log('[main] Inicializando módulos activos...');

    const activeModules = [
        'EconomyRule',
        'DiplomacyRule',
        'PolicyRule',
        'GlobalState',
        'FactionRule',
        'CrisisRule', // Asegúrate de que este archivo exista en modules/
        'EspionageRule',
        'UIMessageHandler'
    ];

    for (const moduleName of activeModules) {
        try {
            const mod = await import(`../modules/${moduleName}.js`);
            let initFn = null;

            if (typeof mod.init === 'function') {
                initFn = mod.init;
            } else if (typeof mod.default === 'function') {
                initFn = mod.default;
            } else if (mod.default && typeof mod.default.init === 'function') {
                initFn = mod.default.init;
            }

            if (initFn) {
                await initFn({});
                moduleRegistry[moduleName] = mod.default || mod;
                console.log(`[main] ✅ Módulo '${moduleName}' inicializado correctamente.`);
            } else {
                moduleRegistry[moduleName] = mod.default || mod;
                console.warn(`[main] ⚠️ Módulo '${moduleName}' cargado pero no se encontró función de inicio.`);
            }

        } catch (error) {
            console.error(`[main] ❌ ERROR crítico inicializando ${moduleName}:`, error.message);
        }
    }

    try {
        await IntentProcessor.init();
        console.log('[main] ✅ Módulo \'IntentProcessor\' inicializado correctamente.');
    } catch (error) {
        console.error('[main] ❌ ERROR crítico inicializando IntentProcessor:', error.message);
    }
}

// ============================================
// Sección: Bucle de Juego (Game Loop)
// ============================================
function gameLoop(tick) {
    // Ejecutar lógica específica de cada módulo por tick si es necesario
    if (moduleRegistry.EconomyRule?.tick) moduleRegistry.EconomyRule.tick(tick);
    if (moduleRegistry.CrisisRule?.tick) moduleRegistry.CrisisRule.tick(tick);
    if (moduleRegistry.EspionageRule?.tick) moduleRegistry.EspionageRule.tick(tick);
}

// ============================================
// Sección: Inicialización Principal
// ============================================
async function main() {
    try {
        console.log('[main] ========================================');
        console.log('[main] RealPolitik Core - Servidor Principal');
        console.log(`[main] Puerto: ${PORT}, Seed: ${CONFIG.seed}`);

        // 1. Inicializar PRNG
        console.log('[main] Inicializando PRNG...');
        initRng(CONFIG.seed);
        console.log('[main] PRNG inicializado correctamente.');

        // 2. Cargar estado inicial
        console.log('[main] Cargando estado inicial...');

        const nationsList = [
            { id: 'USA', name: 'Estados Unidos', stability: 80, economy: 90, influence: 85 },
            { id: 'CHN', name: 'China', stability: 75, economy: 85, influence: 70 },
            { id: 'RUS', name: 'Rusia', stability: 60, economy: 50, influence: 75 },
            { id: 'BRA', name: 'Brasil', stability: 60, economy: 70, influence: 50 },
            { id: 'ARG', name: 'Argentina', stability: 50, economy: 60, influence: 45 }
        ];

        const nationsMap = nationsList.reduce((acc, nation) => ({
            ...acc,
            [nation.id]: {
                ...nation,
                stats: { stability: nation.stability, economy: nation.economy, influence: nation.influence },
                resources: { gold: 1000, food: 500 },
                units: [],
                factions: {}
            }
        }), {});

        const initialState = {
            meta: { tick: 0, status: 'running' },
            nations: nationsMap,
            policies: [],
            intel: [],
            intelQueue: [], // Cola para señales pendientes
            diplomacy: { relations: {}, channels: {} },
            crisis: { active: false, phase: 0, type: null, epicenter: null, intensity: 0, treaties: [] },
            espionage: { operations: {} },
            factions: {},
            playerNationId: 'ARG' // Jugador controla Argentina por defecto
        };

        setInitialState(initialState);
        console.log(`[main] Estado inicial cargado: ${Object.keys(nationsMap).length} naciones.`);

        // 3. Registrar módulos
        await registerModules();

        // Inicializar subsistemas de diplomacia explícitamente
        initDiplomacyEngine();
        console.log('[main] ✅ DiplomacyEngine listo.');

        initDiplomacyAI();
        console.log('[main] ✅ DiplomacyAI activa.');

        // 4. Inicializar PersistenceManager
        try {
            const persistenceResult = await initPersistenceManager({
                saveDir: path.join(ROOT_DIR, 'saves'),
                autoSaveInterval: 50,
                enableAutoSave: true
            });

            if (persistenceResult.success) {
                console.log('[main] ✅ PersistenceManager inicializado correctamente.');
            } else {
                console.warn('[main] ⚠️ PersistenceManager no se pudo inicializar:', persistenceResult.error);
            }
        } catch (e) {
            console.error('[main] ❌ ERROR inicializando PersistenceManager:', e.message);
        }

        // 5. Inicializar TimeEngine
        console.log('[main] Inicializando TimeEngine...');
        initTimeEngine({ tickRate: CONFIG.tickRate, mode: 'continuous' });

        // 6. Configurar Servidor HTTP y WebSocket
        const httpServer = http.createServer((req, res) => {
            // Normalizar URL: eliminar query params y manejar ruta raíz
            let urlPath = req.url.split('?')[0];
            
            if (urlPath === '/') {
                urlPath = '/index.html';
            }

            let filePath = path.join(PUBLIC_DIR, urlPath);

            // Seguridad: evitar directory traversal
            if (!filePath.startsWith(PUBLIC_DIR)) {
                res.writeHead(403, { 'Content-Type': 'text/plain' });
                res.end('403 Forbidden');
                return;
            }

            fs.readFile(filePath, (err, data) => {
                if (err) {
                    if (err.code === 'ENOENT') {
                        // Si es una ruta sin extensión, intentar servir index.html (SPA fallback)
                        if (!path.extname(urlPath)) {
                            fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, indexData) => {
                                if (err2) {
                                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                                    res.end('404 Not Found');
                                } else {
                                    res.writeHead(200, { 'Content-Type': 'text/html' });
                                    res.end(indexData);
                                }
                            });
                            return;
                        }
                        res.writeHead(404, { 'Content-Type': 'text/plain' });
                        res.end(`404 Not Found: ${urlPath}`);
                    } else {
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                        res.end('500 Internal Server Error');
                    }
                    return;
                }

                // CRÍTICO: MIME types correctos para ES Modules
                const ext = path.extname(filePath).toLowerCase();
                const contentTypes = {
                    '.html': 'text/html',
                    '.js': 'text/javascript',      // CAMBIO CRÍTICO: text/javascript para módulos ES6
                    '.mjs': 'text/javascript',
                    '.css': 'text/css',
                    '.json': 'application/json',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.svg': 'image/svg+xml',
                    '.ico': 'image/x-icon',
                    '.woff': 'font/woff',
                    '.woff2': 'font/woff2'
                };

                const contentType = contentTypes[ext] || 'application/octet-stream';
                
                res.writeHead(200, { 
                    'Content-Type': contentType,
                    'Cache-Control': 'no-cache, no-store, must-revalidate' // Evitar caché en desarrollo
                });
                res.end(data);
            });
        });

        console.log('[main] Iniciando WebSocketServer adjunto a HTTP...');
        const wsServer = new GameWebSocketServer(httpServer, CONFIG);
        global.gameServer = wsServer;
        wsServer.start();

        httpServer.listen(PORT, () => {
            console.log('[main] ========================================');
            console.log(`[HTTP] Servidor web corriendo en http://localhost:${PORT}`);
            console.log('[main] Esperando conexiones de clientes...');
            console.log('[main] ========================================');
        });

        // 7. Suscribirse al bucle de ticks
        onTickStart((tick) => {
            gameLoop(tick);
            const currentState = getState();

            const payload = {
                type: 'state_update',
                tick: tick,
                state: currentState,
                timestamp: Date.now()
            };

            if (global.gameServer && typeof global.gameServer.broadcast === 'function') {
                global.gameServer.broadcast(payload);
            }
        });

        // Arrancar el motor de tiempo
        startTimeEngine();

        // Inicializar parser de intenciones (Asesor IA) y Generador de Intel
        initIntentParser({ engine: null, world: null, modules: null });
        console.log('[main] 🤖 IntentParser inicializado');

        initIntelGenerator({ engine: null, world: null, modules: null });
        console.log('[main] 📡 IntelGenerator inicializado');

        // ============================================
        // Puente de Eventos → WebSocket
        // ============================================

        // Asesor IA
        on('advisor_suggestion', (payload) => {
            if (global.gameServer?.broadcast) {
                global.gameServer.broadcast({ type: 'advisor_suggestion', suggestion: payload.suggestion, timestamp: Date.now() });
            }
        });

        // Inteligencia
        on('intel_signal', (payload) => {
            if (global.gameServer?.broadcast) {
                global.gameServer.broadcast({ type: 'intel_signal', signal: payload.signal, timestamp: Date.now() });
            }
        });

        // Diplomacia
        on('diplomacy_action_result', (payload) => {
            if (global.gameServer?.broadcast) {
                global.gameServer.broadcast({ type: 'diplomacy_action_result', ...payload, timestamp: Date.now() });
                console.log('[main] 💼 Resultado diplomático:', payload.actionId, payload.success ? '✅' : '❌');
            }
        });

        // Crisis (Conexión con el módulo CrisisRule en /modules)
        on('crisis_started', (payload) => {
            if (global.gameServer?.broadcast) {
                global.gameServer.broadcast({ type: 'crisis_started', ...payload, timestamp: Date.now() });
                console.log('[main] 🚨 Crisis iniciada:', payload.type, 'en', payload.epicenter);
            }
        });

        on('crisis_escalated', (payload) => {
            if (global.gameServer?.broadcast) {
                global.gameServer.broadcast({ type: 'crisis_escalated', ...payload, timestamp: Date.now() });
                console.log('[main] ⬆️ Crisis escalada:', payload.fromPhase, '→', payload.toPhase);
            }
        });

        on('crisis_resolved', (payload) => {
            if (global.gameServer?.broadcast) {
                global.gameServer.broadcast({ type: 'crisis_resolved', ...payload, timestamp: Date.now() });
                console.log('[main] ✅ Crisis resuelta:', payload.type, payload.resolution);
            }
        });

        on('treaty_signed', (payload) => {
            if (global.gameServer?.broadcast) {
                global.gameServer.broadcast({ type: 'treaty_signed', ...payload, timestamp: Date.now() });
                console.log('[main] 📜 Tratado firmado:', payload.name);
            }
        });

        on('treaty_expired', (payload) => {
            if (global.gameServer?.broadcast) {
                global.gameServer.broadcast({ type: 'treaty_expired', ...payload, timestamp: Date.now() });
            }
        });

        // --- RELACIONES BILATERALES DETALLADAS (Respuesta punto a punto) ---
        on('relations_detail_response', (payload) => {
            // Este evento requiere envío directo al cliente solicitante, no broadcast
            const { wsClientId, success, error, requestId, data } = payload;

            if (!wsClientId) {
                console.warn('[main] ⚠️ relations_detail_response sin wsClientId, usando broadcast');
                if (global.gameServer?.broadcast) {
                    global.gameServer.broadcast({ type: 'relations_detail', ...payload, timestamp: Date.now() });
                }
                return;
            }

            // Enviar solo al cliente que lo solicitó
            if (global.gameServer?.send) {
                global.gameServer.send(wsClientId, {
                    type: 'relations_detail',
                    success,
                    error: error || null,
                    requestId,
                    data,
                    timestamp: Date.now()
                });
                console.log(`[main] 📤 Respuesta de relaciones enviada a cliente ${wsClientId}`);
            } else {
                console.error('[main] ❌ Error: gameServer.send no está disponible');
            }
        });

        // Listener para cuando el cliente SOLICITA relaciones detalladas
        on('request_relations_detail', async (payload) => {
            const { nationId, requestId, wsClientId } = payload;
            
            console.log(`[main] 📊 Procesando solicitud de relaciones para ${nationId} (requestId: ${requestId})`);

            try {
                // Importar función del DiplomacyEngine
                const { getActiveTreaties } = await import('../modules/diplomacy/core/DiplomacyEngine.js');
                
                const currentState = getState();
                
                // Obtener tratados activos para la nación
                const treaties = getActiveTreaties(currentState, nationId);
                
                // Calcular relaciones bilaterales
                const relations = [];
                if (currentState.diplomacy && currentState.diplomacy.relations) {
                    for (const [otherId, relationData] of Object.entries(currentState.diplomacy.relations)) {
                        if (otherId !== nationId) {
                            // Extraer valor de relación (ajustar según estructura real)
                            const value = relationData.value || relationData.score || 0;
                            const trend = relationData.trend || 'stable';
                            
                            const otherNation = currentState.nations[otherId];
                            relations.push({
                                nationId: otherId,
                                nationName: otherNation?.name || otherId,
                                value,
                                trend
                            });
                        }
                    }
                }

                // Historial reciente (placeholder - implementar si existe)
                const history = currentState.diplomacy?.history?.[nationId] || [];

                // Emitir respuesta DIRECTAMENTE al cliente solicitante
                emit('relations_detail_response', {
                    wsClientId,
                    success: true,
                    requestId,
                    data: {
                        nationId,
                        nationName: currentState.nations[nationId]?.name || nationId,
                        treaties,
                        relations,
                        history,
                        totalTreaties: treaties.length,
                        totalRelations: relations.length
                    }
                });

            } catch (error) {
                console.error('[main] ❌ Error procesando relaciones:', error.message);
                emit('relations_detail_response', {
                    wsClientId,
                    success: false,
                    requestId,
                    error: error.message
                });
            }
        });

    } catch (error) {
        console.error('[main] Error fatal en arranque:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

// Ejecutar
main().catch(err => {
    console.error('[main] Error no capturado en main:', err);
    process.exit(1);
});