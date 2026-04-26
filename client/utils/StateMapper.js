/**
 * Mapea el estado crudo del servidor a formatos optimizados para componentes UI.
 * @module StateMapper
 */

export const StateMapper = {
    /**
     * Extrae métricas vitales para el Dashboard
     * @param {Object} state - Estado completo del servidor
     * @param {string} nationId - ID de la nación del jugador
     * @returns {Object}
     */
    mapDashboardMetrics(state, nationId) {
        const nation = state.nations?.[nationId];
        if (!nation) return null;
        return {
            name: nation.name,
            gdp: nation.economy?.gdp || 0,
            budget: nation.economy?.budget || 0,
            stability: nation.internal?.stability || 0
        };
    },

    /**
     * Obtiene relaciones visibles según la niebla de guerra
     * @param {Object} state 
     * @param {string} nationId 
     * @returns {Array} Lista de relaciones visibles
     */
    getVisibleRelations(state, nationId) {
        const relations = state.diplomacy?.relations || {};
        // Solo retornamos las que el servidor ha filtrado como visibles
        return Object.entries(relations[nationId] || {}).map(([targetId, data]) => ({
            targetId,
            value: data.value,
            visible: true // Si está aquí, es visible
        }));
    }
};