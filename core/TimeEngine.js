/**
 * @file TimeEngine.js
 * @description Motor de bucle de ticks determinista con soporte para modos continuous y batch.
 *              Gestiona pausa, aceleración y sincronización con el sistema de eventos.
 * @version 1.0.1
 * @author Realpolitik Core Team
 * @dependencies EventDispatcher, Rng
 * @changelog
 * - v1.0.0: Creación inicial. Implementa bucle de ticks con modos continuous/batch.
 * - v1.0.1: Corrección ESM: eliminar module.exports, consolidar exportaciones, arreglar executeTick
 */

import { emit, on } from './EventDispatcher.js';
import { rng } from './Rng.js';

/**
 * Configuración del motor de tiempo
 * @type {{ tickRate: number, mode: 'continuous'|'batch', paused: boolean, speed: number, currentTick: number, batchWindow: number, batchIntentQueue: Array }}
 */
const _config = {
  tickRate: 1000,        // ms por tick (configurable desde engine.json)
  mode: 'continuous',    // 'continuous' o 'batch'
  paused: false,
  speed: 1,              // multiplicador de velocidad
  currentTick: 0,
  batchWindow: 30,       // ticks por ventana en modo batch
  batchIntentQueue: []   // cola de intenciones en modo batch
};

/**
 * ID del intervalo del bucle principal
 * @type {NodeJS.Timeout|null}
 */
let _intervalId = null;

// ---> INTEGRACIÓN DEL PARCHE: Añadir estas dos variables de control
let _timeoutId = null;
let _expectedTime = 0n; // Almacenará el timestamp absoluto esperado en nanosegundos (BigInt)

/**
 * Callbacks registrados para el evento tick_start
 * @type {Array<Function>}
 */
const _tickListeners = [];

/**
 * Callbacks registrados para el evento tick_end
 * @type {Array<Function>}
 */
const _tickEndListeners = [];

/**
 * Registra un listener para el evento tick_start.
 * @param {Function} callback - Función que recibe el número de tick
 */
export function onTickStart(callback) {
  if (typeof callback !== 'function') {
    throw new Error('[TimeEngine] Listener debe ser una función.');
  }
  _tickListeners.push(callback);
}

/**
 * Registra un listener para el evento tick_end.
 * @param {Function} callback - Función que recibe el número de tick
 */
export function onTickEnd(callback) {
  if (typeof callback !== 'function') {
    throw new Error('[TimeEngine] Listener debe ser una función.');
  }
  _tickEndListeners.push(callback);
}

/**
 * Ejecuta un tick completo del motor.
 * Emite tick_start, ejecuta listeners, emite tick_end.
 * ✅ CORRECCIÓN: Retorna { tick, success } simple, no métodos internos
 * @returns {{ tick: number, success: boolean }}
 */
export function executeTick() {
  if (_config.paused) {
    return { tick: _config.currentTick, success: false };
  }

  const tick = ++_config.currentTick;

  try {
    // Emitir tick_start
    emit('tick_start', { tick });

    // Ejecutar listeners internos
    for (const listener of _tickListeners) {
      listener(tick);
    }

    // Procesar cola de intenciones en modo batch
    if (_config.mode === 'batch' && _config.batchIntentQueue.length > 0) {
      const intents = [..._config.batchIntentQueue];
      _config.batchIntentQueue = [];
      emit('batch_intents', { tick, intents });
    }

    // Emitir tick_end
    emit('tick_end', { tick });

    for (const listener of _tickEndListeners) {
      listener(tick);
    }

    return { tick, success: true };
  } catch (error) {
    console.error(`[TimeEngine] Error en tick ${tick}:`, error);
    emit('tick_error', { tick, error: error.message });
    return { tick, success: false };
  }
}

/**
 * Inicia el bucle de ticks continuo.
 * En modo continuous, ejecuta un tick cada tickRate ms.
 * En modo batch, acumula intenciones y ejecuta al final de la ventana.
 */
export function start() {
  if (_intervalId !== null) {
    console.warn('[TimeEngine] Ya está en ejecución.');
    return;
  }

  _config.paused = false;

  if (_config.mode === 'continuous') {
    const intervalMs = _config.tickRate / _config.speed;


    // ---> INTEGRACIÓN DEL PARCHE: Configurar reloj de alta resolución
    const tickRateNs = BigInt(Math.floor(intervalMs)) * 1000000n; // Convertir ms a nanosegundos
    _expectedTime = process.hrtime.bigint() + tickRateNs;

    // Definimos el bucle recursivo autorregulado
    const _loop = () => {
      executeTick();

      // Recalcular el intervalo considerando la velocidad actual dinámicamente
      const currentIntervalMs = _config.tickRate / _config.speed;
      const currentTickRateNs = BigInt(Math.floor(currentIntervalMs)) * 1000000n;

      _expectedTime += currentTickRateNs;
      let nextDelayNs = _expectedTime - process.hrtime.bigint();

      if (nextDelayNs < 0n) nextDelayNs = 0n; // Salvaguarda si hay lag crítico

      _timeoutId = setTimeout(_loop, Number(nextDelayNs / 1000000n));
    };

    // Lanzar el bucle por primera vez
    _timeoutId = setTimeout(_loop, Math.floor(intervalMs));
    console.log(`[TimeEngine] Bucle determinista de alta precisión iniciado (${intervalMs}ms/tick)`);

  } else if (_config.mode === 'batch') {
    console.log(`[TimeEngine] Modo batch iniciado (ventana=${_config.batchWindow} ticks)`);
  }
}

/**
 * Detiene el bucle de ticks.
 */
export function stop() {
  // ---> INTEGRACIÓN DEL PARCHE: Limpiar temporizador de alta resolución
  if (_timeoutId !== null) {
    clearTimeout(_timeoutId);
    _timeoutId = null;
  }

  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  console.log('[TimeEngine] Bucle detenido.');
}

/**
 * Pausa el bucle de ticks sin detenerlo.
 * Los ticks no se ejecutan pero el intervalo continúa.
 */
export function pause() {
  _config.paused = true;
  emit('game_paused', { tick: _config.currentTick });
  console.log('[TimeEngine] Pausado.');
}

/**
 * Reanuda el bucle de ticks tras una pausa.
 */
export function resume() {
  _config.paused = false;
  emit('game_resumed', { tick: _config.currentTick });
  console.log('[TimeEngine] Reanudado.');
}

/**
 * Establece la velocidad del juego (multiplicador).
 * @param {number} speed - Multiplicador (0.5 = medio, 1 = normal, 2 = doble)
 */
export function setSpeed(speed) {
  if (typeof speed !== 'number' || speed <= 0) {
    throw new Error('[TimeEngine] Speed debe ser un número positivo.');
  }

  _config.speed = speed;

  // Reiniciar intervalo si está en modo continuous
  if (_config.mode === 'continuous' && _intervalId !== null) {
    stop();
    start();
  }

  console.log(`[TimeEngine] Velocidad establecida: ${speed}x`);
}

/**
 * Obtiene el tick actual.
 * @returns {number} Número de tick actual
 */
export function getCurrentTick() {
  return _config.currentTick;
}

/**
 * Obtiene el estado actual del motor.
 * @returns {{ tick: number, paused: boolean, mode: string, speed: number }}
 */
export function getStatus() {
  return {
    tick: _config.currentTick,
    paused: _config.paused,
    mode: _config.mode,
    speed: _config.speed
  };
}

/**
 * Encola una intención para procesamiento en modo batch.
 * @param {Object} intent - Intención a procesar
 */
export function queueIntent(intent) {
  if (_config.mode !== 'batch') {
    console.warn('[TimeEngine] queueIntent solo tiene efecto en modo batch.');
  }
  _config.batchIntentQueue.push(intent);
}

/**
 * Ejecuta manualmente un tick (útil para modo batch o tests).
 * @returns {{ tick: number, success: boolean }}
 */
export function step() {
  return executeTick();
}

/**
 * Reinicia el motor a estado inicial. SOLO para tests.
 * @package
 */
export function ResetForTests() {
  stop();
  _timeoutId = null; // ---> PARCHE: Limpieza de referencia
  _expectedTime = 0n; // ---> PARCHE: Limpieza de referencia
  _config.currentTick = 0;
  _config.paused = false;
  _config.speed = 1;
  _config.batchIntentQueue = [];
  _tickListeners.length = 0;
  _tickEndListeners.length = 0;
}