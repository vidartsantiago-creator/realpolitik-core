/**
 * @file main.js
 * @description Punto de entrada principal del servidor. Inicializa núcleo, carga configuraciones,
 *              registra módulos y arranca el servidor WebSocket adjunto a HTTP.
 * @version 1.0.2
 * @author RealPolitik Core Team
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import IntentProcessor from '../modules/IntentProcessor.js';
import { fileURLToPath } from 'url';
import { initRng } from '../core/Rng.js';
import { on, emit } from '../core/EventDispatcher.js';
import { setInitialState, applyDelta, getState, snapshot } from '../core/StateManager.js';
import { initTimeEngine, start as startTimeEngine, onTickStart, onTickEnd, executeTick, getCurrentTick } from '../core/TimeEngine.js';
import { GameWebSocketServer } from '../network/WebSocketServer.js';
import { InformationLayer } from '../modules/InformationLayer.js';
import { initPersistenceManager } from '../core/PersistenceManager.js';
import { init as initIntentParser, stopAdvisorCycle } from '../ai/IntentParser.js';
import { init as initIntelGenerator } from '../modules/IntelGenerator.js';


// Configuración de rutas
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');



initIntentParser({ engine: null, world: null, modules: null });

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

let CONFIG = loadConfig();
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
        // 'InformationLayer', // Se maneja aparte si es una clase
        'GlobalState',
        'FactionRule',
        'CrisisRule',
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
                await initFn();
                console.log(`[main] ✅ Módulo '${moduleName}' inicializado correctamente.`);
            } else {
                console.warn(`[main] ⚠️ Módulo '${moduleName}' cargado pero no se encontró función de inicio.`);
            }

        } catch (error) {
            console.error(`[main] ❌ ERROR crítico inicializando ${moduleName}:`, error.message);
            // Continuar sin detener el servidor para desarrollo, o usar process.exit(1) en producción
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
    // Aquí puedes llamar a funciones .tick() si tus módulos las exponen
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
            { id: 'RUS', name: 'Rusia', stability: 60, economy: 50, influence: 75 }
        ];

        // Transformar array a objeto indexado por ID
        const nationsMap = nationsList.reduce((acc, nation) => ({
            ...acc,
            [nation.id]: {
                ...nation,
                stats: { stability: nation.stability, economy: nation.economy, influence: nation.influence },
                resources: { gold: 1000, food: 500 }, // Recursos iniciales por defecto
                units: [],
                factions: {}
            }
        }), {});

        const initialState = {
            meta: { tick: 0, status: 'running' },
            nations: nationsMap, // Ahora es un objeto: { USA: {...}, CHN: {...} }
            policies: [],
            intel: [],
            diplomacy: { relations: {}, channels: {} },
            crisis: { active: false, phase: 0 },
            espionage: { operations: {} },
            factions: {}
        };

        setInitialState(initialState);
        console.log(`[main] Estado inicial cargado: ${Object.keys(nationsMap).length} naciones.`);

        // 3. Registrar módulos
        await registerModules();

        // 4. Inicializar PersistenceManager para autoguardado
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

        // 5. Inicializar InformationLayer (si requiere instancia)
        try {
            // Ajustar según cómo InformationLayer necesite ser instanciado
            // const infoLayer = new InformationLayer(getState(), on);
            console.log('[main] InformationLayer listo (si aplica).');
        } catch (e) {
            console.warn('[main] InformationLayer no inicializado como clase.', e.message);
        }

        // 6. Inicializar TimeEngine
        console.log('[main] Inicializando TimeEngine...');
        initTimeEngine({ tickRate: CONFIG.tickRate, mode: 'continuous' });

        // 7. Configurar Servidor HTTP (ÚNICA VEZ)
        const httpServer = http.createServer((req, res) => {
            let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);

            // Seguridad básica
            if (!filePath.startsWith(PUBLIC_DIR)) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }

            fs.readFile(filePath, (err, data) => {
                if (err) {
                    if (err.code === 'ENOENT') {
                        res.writeHead(404);
                        res.end('Archivo no encontrado: ' + req.url);
                    } else {
                        res.writeHead(500);
                        res.end('Error del servidor');
                    }
                    return;
                }

                const ext = path.extname(filePath);
                const contentTypes = {
                    '.html': 'text/html',
                    '.js': 'application/javascript',
                    '.css': 'text/css',
                    '.json': 'application/json',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.ico': 'image/x-icon'
                };

                res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
                res.end(data);
            });
        });

        // 7. Configurar WebSocketServer adjunto al HTTP
        console.log('[main] Iniciando WebSocketServer adjunto a HTTP...');
        const wsServer = new GameWebSocketServer(httpServer, CONFIG);

        // Guardar referencia global para el broadcast desde el game loop
        global.gameServer = wsServer;

        // Iniciar lógica interna del WS (adjuntar eventos)
        wsServer.start();

        // 8. Iniciar Servidor HTTP (Escucha el puerto)
        httpServer.listen(PORT, () => {
            console.log('[main] ========================================');
            console.log(`[HTTP] Servidor web corriendo en http://localhost:${PORT}`);
            console.log('[main] Esperando conexiones de clientes...');
            console.log('[main] ========================================');
        });

        // 9. Suscribirse al bucle de ticks
        onTickStart((tick) => {
            // Ejecutar lógica de juego
            gameLoop(tick);

            // Obtener estado actualizado
            const currentState = getState();

            // Preparar paquete de broadcast
            const payload = {
                type: 'state_update',
                tick: tick,
                state: currentState,
                timestamp: Date.now()
            };

            // Enviar a todos los clientes
            if (global.gameServer && typeof global.gameServer.broadcast === 'function') {
                global.gameServer.broadcast(payload);
            }
        });
        
        // Arrancar el motor de tiempo
        startTimeEngine();

        // Inicializar parser de intenciones (Asesor IA)
        initIntentParser({ engine: null, world: null, modules: null });
        console.log('[main] 🤖 IntentParser inicializado');
        initIntelGenerator({ engine: null, world: null, modules: null });

        // ============================================
        // SECCIÓN NUEVA: Puente de Eventos IA → WebSocket
        // ============================================
        // Insertar AQUÍ el siguiente bloque:

        // Suscribirse a sugerencias del asesor IA y reenviarlas a clientes
        on('advisor_suggestion', (payload) => {
            if (global.gameServer && typeof global.gameServer.broadcast === 'function') {
                global.gameServer.broadcast({
                    type: 'advisor_suggestion',
                    suggestion: payload.suggestion,
                    timestamp: Date.now()
                });
                console.log('[main] 🤖 Sugerencia de asesor broadcasted:', payload.suggestion.title);
            }
        });

        // Suscribirse a señales de inteligencia y reenviarlas a clientes  
        on('intel_signal', (payload) => {
            if (global.gameServer && typeof global.gameServer.broadcast === 'function') {
                global.gameServer.broadcast({
                    type: 'intel_signal',
                    signal: payload.signal,
                    timestamp: Date.now()
                });
                console.log('[main] 📡 Señal de inteligencia broadcasted:', payload.signal?.source || 'desconocida');
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