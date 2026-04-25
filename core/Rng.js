/**
 * @file Rng.js
 * @description Único generador de números pseudoaleatorios autorizado del sistema.
 *              Inicializado con seed de engine.json. Prohibido Math.random() en lógica de simulación.
 * @version 1.0.0
 * @author Realpolitik Core Team
 * @dependencies Ninguna
 * @changelog
 * - v1.0.0: Creación inicial. Implementa Mulberry32 PRNG determinista.
 */

let _rng = null;

/**
 * Implementación del algoritmo Mulberry32 - PRNG determinista rápido y de buena calidad
 * @param {number} seed - Semilla inicial (entero 32-bit)
 * @returns {Function} Función que retorna float en [0,1)
 */
function createSeededRng(seed) {
  let state = seed >>> 0; // Asegurar entero sin signo 32-bit
  
  return function mulberry32() {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Inicializa el generador PRNG con una semilla específica.
 * Debe llamarse UNA SOLA VEZ al arranque desde main.js.
 * @param {number} seed - Semilla proveniente de config/engine.json
 * @throws {Error} Si ya está inicializado
 */
export function initRng(seed) {
  if (_rng !== null) {
    throw new Error('[Rng] Ya inicializado. initRng() solo puede llamarse una vez.');
  }
  if (typeof seed !== 'number' || !Number.isInteger(seed)) {
    throw new Error('[Rng] Seed debe ser un número entero.');
  }
  _rng = createSeededRng(seed);
}

/**
 * Retorna un número pseudoaleatorio en el rango [0, 1).
 * Usar en lugar de Math.random() en toda la lógica de simulación.
 * @returns {number} Float en [0, 1)
 * @throws {Error} Si no se ha llamado initRng(seed) primero
 */
export function rng() {
  if (!_rng) {
    throw new Error('[Rng] No inicializado. Llamar initRng(seed) en main.js primero.');
  }
  return _rng();
}

/**
 * Retorna un entero pseudoaleatorio en el rango [min, max] (inclusivo).
 * @param {number} min - Límite inferior (entero)
 * @param {number} max - Límite superior (entero)
 * @returns {number} Entero en [min, max]
 * @throws {Error} Si no se ha llamado initRng(seed) primero o si min > max
 */
export function rngInt(min, max) {
  if (!_rng) {
    throw new Error('[Rng] No inicializado. Llamar initRng(seed) en main.js primero.');
  }
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new Error('[Rng] min y max deben ser enteros.');
  }
  if (min > max) {
    throw new Error('[Rng] min no puede ser mayor que max.');
  }
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Reinicia el RNG con una nueva semilla. SOLO para tests.
 * No usar en producción.
 * @param {number} seed - Nueva semilla
 * @package
 */
export function _resetRngForTests(seed) {
  _rng = createSeededRng(seed);
}
