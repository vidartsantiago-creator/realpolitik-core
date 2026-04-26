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

import { initRng } from '../core/Rng.js';
import { on, emit } from '../core/EventDispatcher.js';
import { setInitialState, applyDelta, getState, snapshot } from '../core/StateManager.js';
import { initTimeEngine, start, onTickStart, onTickEnd, executeTick } from '../core/TimeEngine.js';
import { initWebSocketServer } from '../network/WebSocketServer.js';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Importar módulos de reglas (se registrarán dinámicamente)
import { init as initEconomyRule } from '../modules/EconomyRule.js';
import { init as initDiplomacyRule } from '../modules/DiplomacyRule.js';
import { init as initPolicyRule } from '../modules/PolicyRule.js';
import { init as initInformationLayer } from '../modules/InformationLayer.js';
import { init as initGlobalState } from '../modules/GlobalState.js';
import { init as initFactionRule } from '../modules/FactionRule.js';
import { init as initCrisisRule } from '../modules/CrisisRule.js';
import { init as initEspionageRule } from '../modules/EspionageRule.js';
import { init as initUIMessageHandler } from '../server/UIMessageHandler.js';

/**
 * Carga y parsea un archivo JSON de configuración.
 * @param {string} path - Ruta relativa del archivo JSON
 * @returns {Object} Configuración parseada
 */
async function loadConfig(path) {
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(path, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`[main] Error cargando ${path}:`, error.message);
    throw error;
  }
}

/**
 * Valida que la configuración engine.json tenga los campos requeridos.
 * @param {Object} config - Configuración a validar
 * @throws {Error} Si faltan campos requeridos
 */
function validateEngineConfig(config) {
  const requiredFields = ['seed', 'tickRate'];
  for (const field of requiredFields) {
    if (config[field] === undefined) {
      throw new Error(`[main] engine.json: campo requerido '${field}' no encontrado.`);
    }
  }
  
  if (typeof config.seed !== 'number' || !Number.isInteger(config.seed)) {
    throw new Error('[main] engine.json: seed debe ser un número entero.');
  }
  
  if (typeof config.tickRate !== 'number' || config.tickRate <= 0) {
    throw new Error('[main] engine.json: tickRate debe ser un número positivo.');
  }
}

/**
 * Inicializa todos los módulos activos según modules.json.
 * @param {Object} config - Configuración global
 * @param {string[]} activeModules - Lista de módulos activos
 */
function initializeModules(config, activeModules) {
  const moduleRegistry = {
    EconomyRule: initEconomyRule,
    DiplomacyRule: initDiplomacyRule,
    PolicyRule: initPolicyRule,
    InformationLayer: initInformationLayer,
    GlobalState: initGlobalState,
    FactionRule: initFactionRule,
    CrisisRule: initCrisisRule,
    EspionageRule: initEspionageRule,
    UIMessageHandler: initUIMessageHandler
  };

  console.log('[main] Inicializando módulos activos...');
  
  for (const moduleName of activeModules) {
    if (moduleRegistry[moduleName]) {
      try {
        moduleRegistry[moduleName](config);
        console.log(`[main] Módulo '${moduleName}' inicializado.`);
      } catch (error) {
        console.error(`[main] Error inicializando módulo '${moduleName}':`, error.message);
        throw error;
      }
    } else {
      console.warn(`[main] Módulo '${moduleName}' no encontrado en el registro.`);
    }
  }
}

/**
 * Configura listeners globales para eventos del ciclo de juego.
 */
function setupGlobalListeners() {
  // Listener para tick_start - ejecuta lógica de módulos
  onTickStart((tick) => {
    emit('tick_process', { tick });
  });

  // Listener para state_updated - logging y sincronización
  on('state_updated', (payload) => {
    // Aquí se podría añadir logging, persistencia, etc.
    if (process.env.DEBUG) {
      console.log(`[main] Estado actualizado: tick=${payload.tick}, version=${payload.version}`);
    }
  });

  // Listener para errores críticos
  on('critical_error', (payload) => {
    console.error('[main] Error crítico:', payload);
    // Podría implementarse graceful shutdown o notificación
  });
}

/**
 * Función principal de inicialización del servidor.
 * Sigue la secuencia: config → RNG → Core → Módulos → WS
 */
async function main() {
  console.log('[main] ========================================');
  console.log('[main] RealPolitik Core Server v1.0.0');
  console.log('[main] ========================================');

  try {
    // 1. Cargar configuraciones
    console.log('[main] Cargando configuraciones...');
    const engineConfig = await loadConfig('./config/engine.json');
    const worldConfig = await loadConfig('./config/world.json');
    const modulesConfig = await loadConfig('./config/modules.json');
    
    // Validar engine.json
    validateEngineConfig(engineConfig);
    
    console.log(`[main] Configuraciones cargadas: seed=${engineConfig.seed}, tickRate=${engineConfig.tickRate}ms`);

    // 2. Inicializar PRNG con seed (DEBE SER LO PRIMERO)
    console.log('[main] Inicializando PRNG...');
    initRng(engineConfig.seed);
    console.log('[main] PRNG inicializado correctamente.');

    // 3. Inicializar motor de tiempo
    console.log('[main] Inicializando TimeEngine...');
    initTimeEngine({
      tickRate: engineConfig.tickRate,
      mode: engineConfig.mode || 'continuous',
      batchWindow: engineConfig.batchWindow || 30
    });

    // 4. Establecer estado inicial desde world.json
    console.log('[main] Cargando estado inicial...');
    setInitialState(worldConfig);
    console.log(`[main] Estado inicial cargado: ${Object.keys(worldConfig.nations || {}).length} naciones.`);

    // 5. Configurar listeners globales
    setupGlobalListeners();

    // 6. Inicializar módulos activos
    const activeModules = modulesConfig.modules || [];
    initializeModules({
      engine: engineConfig,
      world: worldConfig,
      modules: modulesConfig
    }, activeModules);

    // 7. Iniciar servidor WebSocket (que incluye HTTP para estáticos)
    console.log('[main] Iniciando WebSocketServer...');
    const wsPort = engineConfig.wsPort || engineConfig.httpPort || 8080;
    await initWebSocketServer(wsPort);
    console.log(`[main] WebSocket server escuchando en puerto ${wsPort}`);

    // 8. Arrancar bucle de ticks
    console.log('[main] ========================================');
    console.log('[main] Servidor listo. Iniciando bucle de ticks...');
    console.log('[main] ========================================');
    start();

  } catch (error) {
    console.error('[main] Error fatal durante inicialización:', error);
    process.exit(1);
  }
}

// Manejo de señales para shutdown graceful
process.on('SIGINT', () => {
  console.log('\n[main] Recebida señal SIGINT. Cerrando servidor...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[main] Recebida señal SIGTERM. Cerrando servidor...');
  process.exit(0);
});

// Ejecutar función principal
main();
