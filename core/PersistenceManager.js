/**
 * @file PersistenceManager.js
 * @description Sistema de persistencia para guardado y carga de snapshots del juego.
 *              Implementa guardado periódico (cada N ticks) y bajo demanda.
 *              Usa JSON comprimido con zlib para almacenamiento eficiente.
 * @version 1.0.0
 * @author RealPolitik Core Team
 * @dependencies EventDispatcher, StateManager, fs, zlib
 * @changelog
 * - v1.0.0: Creación inicial. Implementa save_game, load_game, auto-save periódico.
 */

import fs from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import { on, emit } from './EventDispatcher.js';
import { getState, snapshot, setInitialState, ResetForTests } from './StateManager.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Directorio por defecto para guardar partidas
 * @type {string}
 */
const DEFAULT_SAVE_DIR = path.join(process.cwd(), 'saves');

/**
 * Intervalo de auto-guardado en ticks
 * @type {number}
 */
let autoSaveIntervalTicks = 50;

/**
 * Tick actual para seguimiento de auto-guardado
 * @type {number}
 */
let currentTick = 0;

/**
 * Estado del manager
 * @type {{ initialized: boolean, autoSaveEnabled: boolean, lastSaveTick: number, savePath: string|null }}
 */
const managerState = {
  initialized: false,
  autoSaveEnabled: true,
  lastSaveTick: -1,
  savePath: null
};

/**
 * Inicializa el PersistenceManager
 * @param {Object} options - Opciones de configuración
 * @param {string} [options.saveDir] - Directorio para guardar partidas
 * @param {number} [options.autoSaveInterval] - Intervalo de auto-guardado en ticks (0 para desactivar)
 * @param {boolean} [options.enableAutoSave=true] - Habilitar/deshabilitar auto-guardado
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function initPersistenceManager(options = {}) {
  const {
    saveDir = DEFAULT_SAVE_DIR,
    autoSaveInterval = 50,
    enableAutoSave = true
  } = options;

  try {
    // Crear directorio de guardado si no existe
    await fs.mkdir(saveDir, { recursive: true });
    
    autoSaveIntervalTicks = autoSaveInterval;
    managerState.autoSaveEnabled = enableAutoSave;
    managerState.savePath = saveDir;
    managerState.initialized = true;

    console.log(`[PersistenceManager] Inicializado. Directorio: ${saveDir}`);
    console.log(`[PersistenceManager] Auto-save cada ${autoSaveIntervalTicks} ticks: ${enableAutoSave ? 'ACTIVO' : 'DESACTIVADO'}`);

    // Suscribirse a eventos de tick para auto-guardado
    if (enableAutoSave && autoSaveIntervalTicks > 0) {
      on('tick_completed', handleTickCompleted, 50);
    }

    // Suscribirse a comandos de guardado/carga
    on('command_save_game', handleSaveCommand, 100);
    on('command_load_game', handleLoadCommand, 100);

    emit('persistence_initialized', {
      saveDir,
      autoSaveInterval: autoSaveIntervalTicks,
      autoSaveEnabled: enableAutoSave
    });

    return { success: true };
  } catch (error) {
    const errorMsg = `[PersistenceManager] Error inicializando: ${error.message}`;
    console.error(errorMsg);
    emit('persistence_error', { operation: 'init', error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Maneja el evento de tick completado para auto-guardado
 * @param {{ tick: number }} payload
 */
async function handleTickCompleted(payload) {
  currentTick = payload.tick;

  if (!managerState.autoSaveEnabled || autoSaveIntervalTicks <= 0) {
    return;
  }

  // Guardar cada N ticks
  if (currentTick > 0 && currentTick % autoSaveIntervalTicks === 0) {
    if (currentTick !== managerState.lastSaveTick) {
      await autoSave();
    }
  }
}

/**
 * Realiza un auto-guardado automático
 * @returns {Promise<{ success: boolean, path?: string, error?: string }>}
 */
async function autoSave() {
  const filename = `autosave_tick_${currentTick}.json.gz`;
  const result = await saveGame(filename, 'auto');
  
  if (result.success) {
    managerState.lastSaveTick = currentTick;
    console.log(`[PersistenceManager] Auto-guardado completado: ${filename}`);
  }
  
  return result;
}

/**
 * Guarda el estado actual del juego en un archivo
 * @param {string} [filename] - Nombre del archivo (opcional, genera uno por defecto)
 * @param {string} [source='manual'] - Origen del guardado: 'manual', 'auto', 'checkpoint'
 * @returns {Promise<{ success: boolean, path?: string, error?: string, size?: number }>}
 */
export async function saveGame(filename = null, source = 'manual') {
  if (!managerState.initialized) {
    const error = '[PersistenceManager] No inicializado. Llama a initPersistenceManager primero.';
    console.error(error);
    return { success: false, error };
  }

  try {
    // Generar nombre de archivo si no se proporciona
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename = `save_${timestamp}_tick_${currentTick}.json.gz`;
    }

    // Asegurar extensión .gz
    if (!filename.endsWith('.json.gz')) {
      if (filename.endsWith('.json')) {
        filename += '.gz';
      } else {
        filename += '.json.gz';
      }
    }

    const filePath = path.join(managerState.savePath, filename);

    // Obtener snapshot completo del estado
    const snap = snapshot();
    const saveData = {
      metadata: {
        version: '1.0.0',
        savedAt: new Date().toISOString(),
        tick: snap.tick,
        source,
        gameVersion: process.env.GAME_VERSION || '1.0.0'
      },
      state: snap.state
    };

    // Serializar a JSON
    const jsonString = JSON.stringify(saveData, null, 2);
    const jsonBuffer = Buffer.from(jsonString, 'utf8');

    // Comprimir con gzip
    const compressedBuffer = await gzip(jsonBuffer, { level: 6 });

    // Escribir archivo
    await fs.writeFile(filePath, compressedBuffer);

    const fileSizeKB = (compressedBuffer.length / 1024).toFixed(2);
    console.log(`[PersistenceManager] Partida guardada: ${filename} (${fileSizeKB} KB)`);

    // Emitir evento de guardado completado
    emit('game_saved', {
      path: filePath,
      filename,
      tick: snap.tick,
      source,
      size: compressedBuffer.length
    });

    return {
      success: true,
      path: filePath,
      size: compressedBuffer.length
    };

  } catch (error) {
    const errorMsg = `[PersistenceManager] Error guardando partida: ${error.message}`;
    console.error(errorMsg);
    emit('persistence_error', { operation: 'save', error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Carga una partida desde un archivo
 * @param {string} filename - Nombre del archivo a cargar
 * @returns {Promise<{ success: boolean, state?: Object, tick?: number, error?: string }>}
 */
export async function loadGame(filename) {
  if (!managerState.initialized) {
    const error = '[PersistenceManager] No inicializado. Llama a initPersistenceManager primero.';
    console.error(error);
    return { success: false, error };
  }

  try {
    const filePath = path.join(managerState.savePath, filename);

    // Verificar existencia del archivo
    try {
      await fs.access(filePath);
    } catch (accessError) {
      const error = `[PersistenceManager] Archivo no encontrado: ${filename}`;
      console.error(error);
      return { success: false, error };
    }

    // Leer archivo comprimido
    const compressedBuffer = await fs.readFile(filePath);

    // Descomprimir con gunzip
    const jsonBuffer = await gunzip(compressedBuffer);
    const jsonString = jsonBuffer.toString('utf8');

    // Parsear JSON
    const saveData = JSON.parse(jsonString);

    // Validar estructura básica
    if (!saveData.metadata || !saveData.state) {
      const error = '[PersistenceManager] Archivo de guardado corrupto o inválido.';
      console.error(error);
      return { success: false, error };
    }

    // Restaurar estado
    const loadedState = saveData.state;
    
    // Resetear estado interno del StateManager
    ResetForTests(loadedState);
    
    // Establecer estado inicial con la información cargada
    setInitialState(loadedState);

    currentTick = saveData.metadata.tick || loadedState.tick || 0;

    console.log(`[PersistenceManager] Partida cargada: ${filename} (tick ${currentTick})`);

    // Emitir evento de carga completada
    emit('game_loaded', {
      path: filePath,
      filename,
      tick: currentTick,
      metadata: saveData.metadata
    });

    return {
      success: true,
      state: loadedState,
      tick: currentTick,
      metadata: saveData.metadata
    };

  } catch (error) {
    const errorMsg = `[PersistenceManager] Error cargando partida: ${error.message}`;
    console.error(errorMsg);
    emit('persistence_error', { operation: 'load', error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Lista todas las partidas guardadas disponibles
 * @returns {Promise<{ success: boolean, saves?: Array<{filename: string, tick: number, date: string, size: number}>, error?: string }>}
 */
export async function listSaves() {
  if (!managerState.initialized) {
    const error = '[PersistenceManager] No inicializado. Llama a initPersistenceManager primero.';
    console.error(error);
    return { success: false, error };
  }

  try {
    const files = await fs.readdir(managerState.savePath);
    const saveFiles = files.filter(f => f.endsWith('.json.gz'));

    const saves = [];

    for (const file of saveFiles) {
      try {
        const filePath = path.join(managerState.savePath, file);
        const stats = await fs.stat(filePath);
        
        // Leer metadata sin descomprimir todo el archivo
        const compressedBuffer = await fs.readFile(filePath);
        const jsonBuffer = await gunzip(compressedBuffer);
        const jsonString = jsonBuffer.toString('utf8');
        const saveData = JSON.parse(jsonString);

        saves.push({
          filename: file,
          tick: saveData.metadata?.tick || saveData.state?.tick || 0,
          date: saveData.metadata?.savedAt || stats.mtime.toISOString(),
          size: stats.size,
          source: saveData.metadata?.source || 'unknown'
        });
      } catch (readError) {
        console.warn(`[PersistenceManager] No se pudo leer ${file}: ${readError.message}`);
      }
    }

    // Ordenar por fecha descendente (más reciente primero)
    saves.sort((a, b) => new Date(b.date) - new Date(a.date));

    return { success: true, saves };

  } catch (error) {
    const errorMsg = `[PersistenceManager] Error listando partidas: ${error.message}`;
    console.error(errorMsg);
    return { success: false, error: error.message };
  }
}

/**
 * Elimina una partida guardada
 * @param {string} filename - Nombre del archivo a eliminar
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function deleteSave(filename) {
  if (!managerState.initialized) {
    const error = '[PersistenceManager] No inicializado. Llama a initPersistenceManager primero.';
    console.error(error);
    return { success: false, error };
  }

  try {
    const filePath = path.join(managerState.savePath, filename);
    
    await fs.unlink(filePath);
    
    console.log(`[PersistenceManager] Partida eliminada: ${filename}`);
    
    emit('save_deleted', { filename });
    
    return { success: true };
  } catch (error) {
    const errorMsg = `[PersistenceManager] Error eliminando partida: ${error.message}`;
    console.error(errorMsg);
    return { success: false, error: error.message };
  }
}

/**
 * Maneja el comando de guardado desde WebSocket u otra fuente
 * @param {{ filename?: string, source?: string }} payload
 */
async function handleSaveCommand(payload) {
  const filename = payload?.filename || null;
  const source = payload?.source || 'command';
  
  const result = await saveGame(filename, source);
  
  if (!result.success) {
    emit('command_response', {
      command: 'save_game',
      success: false,
      error: result.error
    });
  }
}

/**
 * Maneja el comando de carga desde WebSocket u otra fuente
 * @param {{ filename: string }} payload
 */
async function handleLoadCommand(payload) {
  const filename = payload?.filename;
  
  if (!filename) {
    emit('command_response', {
      command: 'load_game',
      success: false,
      error: 'Nombre de archivo requerido'
    });
    return;
  }
  
  const result = await loadGame(filename);
  
  if (!result.success) {
    emit('command_response', {
      command: 'load_game',
      success: false,
      error: result.error
    });
  }
}

/**
 * Exporta el estado actual como JSON sin comprimir (para debugging o intercambio)
 * @param {string} filename - Nombre del archivo
 * @returns {Promise<{ success: boolean, path?: string, error?: string }>}
 */
export async function exportStateJSON(filename) {
  if (!managerState.initialized) {
    const error = '[PersistenceManager] No inicializado. Llama a initPersistenceManager primero.';
    console.error(error);
    return { success: false, error };
  }

  try {
    const snap = snapshot();
    const exportData = {
      metadata: {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        tick: snap.tick,
        format: 'json_uncompressed'
      },
      state: snap.state
    };

    const filePath = path.join(managerState.savePath, filename);
    const jsonString = JSON.stringify(exportData, null, 2);
    
    await fs.writeFile(filePath, jsonString, 'utf8');
    
    console.log(`[PersistenceManager] Estado exportado (JSON): ${filename}`);
    
    return { success: true, path: filePath };
  } catch (error) {
    const errorMsg = `[PersistenceManager] Error exportando: ${error.message}`;
    console.error(errorMsg);
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene el estado actual del manager
 * @returns {{ initialized: boolean, autoSaveEnabled: boolean, autoSaveInterval: number, currentTick: number, lastSaveTick: number }}
 */
export function getManagerState() {
  return {
    initialized: managerState.initialized,
    autoSaveEnabled: managerState.autoSaveEnabled,
    autoSaveInterval: autoSaveIntervalTicks,
    currentTick,
    lastSaveTick: managerState.lastSaveTick
  };
}

/**
 * Habilita o deshabilita el auto-guardado
 * @param {boolean} enabled
 */
export function setAutoSaveEnabled(enabled) {
  managerState.autoSaveEnabled = enabled;
  console.log(`[PersistenceManager] Auto-save ${enabled ? 'HABILITADO' : 'DESHABILITADO'}`);
  emit('autosave_toggled', { enabled });
}

/**
 * Establece el intervalo de auto-guardado en ticks
 * @param {number} intervalTicks - Intervalo en ticks (0 para desactivar)
 */
export function setAutoSaveInterval(intervalTicks) {
  autoSaveIntervalTicks = Math.max(0, intervalTicks);
  console.log(`[PersistenceManager] Intervalo de auto-save: ${autoSaveIntervalTicks} ticks`);
  emit('autosave_interval_changed', { interval: autoSaveIntervalTicks });
}

/**
 * Fuerza un guardado inmediato independientemente del intervalo
 * @param {string} [filename] - Nombre opcional del archivo
 * @returns {Promise<{ success: boolean, path?: string, error?: string }>}
 */
export async function forceSave(filename = null) {
  return saveGame(filename, 'force');
}

/**
 * Reinicia el estado del manager para tests
 * @package
 */
export function _resetPersistenceForTests() {
  managerState.initialized = false;
  managerState.autoSaveEnabled = true;
  managerState.lastSaveTick = -1;
  managerState.savePath = null;
  currentTick = 0;
  autoSaveIntervalTicks = 50;
}