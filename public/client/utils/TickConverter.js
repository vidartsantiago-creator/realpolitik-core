/**
 * Utilidad para conversión determinista de tiempo basada en Ticks del servidor.
 * @module TickConverter
 */

const TICK_RATE_MS = 1000; // Asumiendo 1 tick = 1 segundo (configurable según backend)

export const TickConverter = {
    /**
     * Convierte una diferencia de ticks a formato MM:SS
     * @param {number} deltaTicks - Diferencia entre expiresAtTick y currentTick
     * @returns {string} Formato "MM:SS"
     */
    ticksToTime(deltaTicks) {
        if (deltaTicks <= 0) return "00:00";
        const totalSeconds = Math.floor(deltaTicks * (TICK_RATE_MS / 1000));
        const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
        const s = (totalSeconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    },

    /**
     * Calcula el tiempo restante basado en estado global
     * @param {number} expiresAtTick 
     * @param {number} currentTick 
     * @returns {string}
     */
    getRemainingTime(expiresAtTick, currentTick) {
        return this.ticksToTime(expiresAtTick - currentTick);
    }
};