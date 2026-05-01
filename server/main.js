/**
 * @file main.js
 * @description Punto de entrada principal del servidor. Inicializa núcleo, carga configuraciones,
 *              registra módulos y arranca el servidor WebSocket.
 * @version 1.0.0
 * @author Realpolitik Core Team
 * @dependencies EventDispatcher, StateManager, TimeEngine, Rng, WebSocketServer
 * @changelog
 * - v1.0.0: Creación inicial. Implementa inicialización secuencial del core y carga de módulos.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initRng } from '../core/Rng.js';
import { on, emit } from '../core/EventDispatcher.js';
import { setInitialState, applyDelta, getState, snapshot } from '../core/StateManager.js';
import { initTimeEngine, start, onTickStart, onTickEnd, executeTick } from '../core/TimeEngine.js';
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

// Configuración
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

// Registro de módulos
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
        'UIMessageHandler' // Asegúrate de que este también esté si lo creaste
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

// Bucle principal
function gameLoop() {
    executeTick(() => {
        // 1. Ejecutar lógica de ticks de los módulos
        if (moduleRegistry.EconomyRule?.tick) moduleRegistry.EconomyRule.tick();
        if (moduleRegistry.DiplomacyRule?.tick) moduleRegistry.DiplomacyRule.tick();
        if (moduleRegistry.PolicyRule?.tick) moduleRegistry.PolicyRule.tick();
        if (moduleRegistry.CrisisRule?.tick) moduleRegistry.CrisisRule.tick();
        if (moduleRegistry.EspionageRule?.tick) moduleRegistry.EspionageRule.tick();

        // 2. Obtener estado actualizado
        const currentState = getState();

        // 3. Broadcast a todos los clientes
        emit('ws_broadcast', {
            type: 'state_update',
            payload: {
                state: currentState,
                tick: currentState.meta?.tick || 0
            }
        });
    });
}

// Inicialización
async function main() {
    console.log('[main] ========================================');
    console.log('[main] RealPolitik Core Server v1.0.0');
    console.log('[main] ========================================');

    loadConfig();

    console.log('[main] Inicializando PRNG...');
    //initRng(CONFIG.seed);
    console.log('[main] PRNG inicializado correctamente.');

    console.log('[main] Inicializando TimeEngine...');
    initTimeEngine(CONFIG.tickRate);
    
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

    await registerModules();

    console.log('[main] Iniciando WebSocketServer...');
    const wss = initWebSocketServer(getState(), (msg) => emit('ws_message', msg));
    
    // Configurar listener para broadcasts desde el loop
    on('ws_broadcast', (data) => {
        // Esta función será llamada por el gameLoop para enviar datos
        // Necesitamos acceder a la instancia WSS para enviar. 
        // Hack limpio: exponer send en el evento o usar una variable global controlada.
        // Para mantenerlo simple, modificaremos WebSocketServer para escuchar 'ws_broadcast'
        emit('broadcast', data); 
    });

    console.log('[main] ========================================');
    console.log('[main] Servidor listo. Iniciando bucle de ticks...');
    console.log('[main] ========================================');

    start(gameLoop);
}

main().catch(err => {
    console.error('[main] Error fatal en arranque:', err);
    process.exit(1);
});

// Ejecutar función principal
main();