/**
 * @file main.js
 * @description Punto de entrada principal del servidor. Inicializa núcleo, carga configuraciones,
 *              registra módulos y arranca el servidor WebSocket.
 * @version 1.0.1
 * @author Realpolitik Core Team
 * @dependencies EventDispatcher, StateManager, TimeEngine, Rng, WebSocketServer
 * @changelog
 * - v1.0.0: Creación inicial. Implementa inicialización secuencial del core y carga de módulos.
 * - v1.0.1: Corrección de errores de imports, variables no definidas y flujo de inicialización.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initRng } from '../core/Rng.js';
import { on, emit } from '../core/EventDispatcher.js';
import { setInitialState, applyDelta, getState, snapshot } from '../core/StateManager.js';
import { initTimeEngine, start as startTimeEngine, onTickStart, onTickEnd, executeTick, getCurrentTick } from '../core/TimeEngine.js';
import { initWebSocketServer } from '../network/WebSocketServer.js';

// Importar módulos de reglas
import { init as EconomyRule } from '../modules/EconomyRule.js';
import { init as DiplomacyRule } from '../modules/DiplomacyRule.js';
import { init as PolicyRule } from '../modules/PolicyRule.js';
import { init as InformationLayer } from '../modules/InformationLayer.js';
import { init as GlobalState } from '../modules/GlobalState.js';
import { init as FactionRule } from '../modules/FactionRule.js';
import { init as CrisisRule } from '../modules/CrisisRule.js';
import { init as EspionageRule } from '../modules/EspionageRule.js';
import { init as UIMessageHandler } from '../modules/UIMessageHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// ============================================
// Sección: Carga de Configuración
// ============================================
// Intenta leer la configuración desde game.config.json, usa valores por defecto si falla
let CONFIG = {};
function loadConfig() {
    try {
        const configPath = path.join(ROOT_DIR, 'config', 'game.config.json');
        const data = fs.readFileSync(configPath, 'utf8');
        CONFIG = JSON.parse(data);
        console.log('[main] Configuraciones cargadas:', `seed=${CONFIG.seed}, tickRate=${CONFIG.tickRate}ms`);
    } catch (e) {
        console.warn('[main] No se encontró game.config.json, usando defaults.');
        CONFIG = { seed: 42, tickRate: 1000 };
    }
}

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
        'InformationLayer',
        'GlobalState',
        'FactionRule',
        'CrisisRule',
        'EspionageRule',
        'UIMessageHandler'
    ];

    for (const moduleName of activeModules) {
        try {
            // Importación dinámica
            const mod = await import(`../modules/${moduleName}.js`);

            // Lógica adaptable: Detecta qué fue exportado
            let initFn = null;

            if (typeof mod.init === 'function') {
                // Caso A: Exportación nombrada "export function init()..."
                initFn = mod.init;
            } else if (typeof mod.default === 'function') {
                // Caso B: Exportación por defecto "export default function()..."
                initFn = mod.default;
            } else if (mod.default && typeof mod.default.init === 'function') {
                // Caso C: Objeto por defecto "export default { init: ... }"
                initFn = mod.default.init;
            }

            if (initFn) {
                await initFn(); // Ejecuta la función detectada
                console.log(`[main] ✅ Módulo '${moduleName}' inicializado correctamente.`);
            } else {
                console.warn(`[main] ⚠️ Módulo '${moduleName}' cargado pero no se encontró función de inicio (init/default).`);
            }

        } catch (error) {
            console.error(`[main] ❌ ERROR crítico inicializando ${moduleName}:`, error.message);
            // Si es crítico, detenemos el servidor. Si quieres continuar sin él, comenta la siguiente línea:
            process.exit(1);
        }
    }
}

// ============================================
// Sección: Bucle de Juego (Game Loop)
// ============================================
// Esta función ejecuta la lógica de cada tick
function gameLoop() {
    // 1. Ejecutar lógica de ticks de los módulos registrados
    if (moduleRegistry.EconomyRule?.tick) moduleRegistry.EconomyRule.tick();
    if (moduleRegistry.DiplomacyRule?.tick) moduleRegistry.DiplomacyRule.tick();
    if (moduleRegistry.PolicyRule?.tick) moduleRegistry.PolicyRule.tick();
    if (moduleRegistry.CrisisRule?.tick) moduleRegistry.CrisisRule.tick();
    if (moduleRegistry.EspionageRule?.tick) moduleRegistry.EspionageRule.tick();
}

// ============================================
// Sección: Inicialización Principal
// ============================================
async function main() {
    try {
        console.log('[main] ========================================');
        console.log('[main] RealPolitik
        // Cargar configuración
        loadConfig();

        // Inicializar PRNG (generador de números aleatorios)
        console.log('[main] Inicializando PRNG...');
        initRng(CONFIG.seed);
        console.log('[main] PRNG inicializado correctamente.');

        // Cargar estado inicial del juego
        console.log('[main] Cargando estado inicial...');
        const initialState = {
            meta: { tick: 0, status: 'running' },
            nations: [
                { id: 'USA', name: 'Estados Unidos', stability: 80, economy: 90, influence: 85 },
                { id: 'CHN', name: 'China', stability: 75, economy: 85, influence: 70 },
                { id: 'RUS', name: 'Rusia', stability: 60, economy: 50, influence: 75 }
            ],
            policies: [],
            intel: []
        };
        setInitialState(initialState);
        console.log(`[main] Estado inicial cargado: ${initialState.nations.length} naciones.`);

        // Registrar módulos del juego
        await registerModules();

        // ============================================
        // Sección: Inicialización de Módulos Core
        // ============================================

        // Inicializar el motor de tiempo con la configuración cargada
        console.log('[main] Inicializando TimeEngine...');
        initTimeEngine({ tickRate: CONFIG.tickRate });
        console.log('[main] TimeEngine inicializado correctamente.');

        // ============================================
        // Sección: Setup del WebSocket Server
        // ============================================
        console.log('[main] Iniciando WebSocketServer...');

        // Crear un emisor de eventos compatible con lo que espera WebSocketServer
        const eventEmitter = {
            emit: (event, data) => emit(event, data)
        };

        // Inicializar servidor WebSocket y obtener referencia para broadcast
        const wss = initWebSocketServer(getState(), eventEmitter);

        // Guardar referencia al servidor HTTP para poder hacer broadcast desde el game loop
        // El servidor HTTP tiene el método 'broadcast' asignado en WebSocketServer.js línea 132
        global.gameServer = wss.server;

        console.log('[main] WebSocketServer iniciado correctamente.');

        // ============================================
        // Sección: Bucle de Ticks
        // ============================================
        // Suscribirse al evento de inicio de tick para ejecutar lógica y enviar estado
        onTickStart((tick) => {
            // 1. Ejecutar lógica del game loop
            gameLoop();

            // 2. Obtener estado actualizado
            const currentState = getState();

            // 3. Preparar paquete de datos para clientes
            const payload = {
                type: 'state_update',
                tick: tick,
                state: currentState,
                timestamp: Date.now()
            };

            // 4. Broadcast a todos los clientes conectados
            if (global.gameServer && typeof global.gameServer.broadcast === 'function') {
                global.gameServer.broadcast(payload);
            }
        });

        // Iniciar el bucle de ticks del TimeEngine
        startTimeEngine();

        console.log('[main] ========================================');
        console.log('[main] Servidor listo. Iniciando bucle de ticks...');
        console.log('[main] ========================================');
        console.log(`[main] Tick rate: ${CONFIG.tickRate}ms`);
        console.log('[main] Esperando conexiones de clientes...');

    } catch (error) {
        // ============================================
        // Sección: Manejo de Errores
        // ============================================
        console.error('[main] Error fatal en arranque:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

// Ejecutar la función principal
main().catch(err => {
    console.error('[main] Error no capturado en main:', err);
    process.exit(1);
});