/**
 * RelationsPanel - Panel de Relaciones Bilaterales
 * @description Componente UI para visualizar relaciones diplomáticas,
 *              historial de acciones y tratados activos.
 * @version 1.0.0
 * @module RelationsPanel
 */

export class RelationsPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentRelations = {};
        this.activeTreaties = [];
        this.diplomaticHistory = [];
        this.selectedNation = null;
        this.filter = 'all'; // all, allies, neutral, hostile

        if (!this.container) {
            console.warn('[RelationsPanel] Contenedor no encontrado. Creando en memoria...');
        }
    }

    /**
     * Actualiza las relaciones bilaterales
     * @param {Object} relations - Objeto con relaciones { "NATION1_NATION2": { value, trends } }
     */
    updateRelations(relations) {
        this.currentRelations = relations || {};
        this.render();
    }

    /**
     * Agrega un tratado activo
     * @param {Object} treaty - { id, type, parties, expiresAt, benefits }
     */
    addTreaty(treaty) {
        this.activeTreaties.push(treaty);
        this.render();
    }

    /**
     * Remueve un tratado expirado
     * @param {string} treatyId - ID del tratado
     */
    removeTreaty(treatyId) {
        this.activeTreaties = this.activeTreaties.filter(t => t.id !== treatyId);
        this.render();
    }

    /**
     * Agrega entrada al historial diplomático
     * @param {Object} entry - { tick, action, actor, target, result, details }
     */
    addToHistory(entry) {
        this.diplomaticHistory.unshift(entry);
        // Mantener solo últimos 50 eventos
        if (this.diplomaticHistory.length > 50) {
            this.diplomaticHistory = this.diplomaticHistory.slice(0, 50);
        }
        this.render();
    }

    /**
     * Establece filtro de visualización
     * @param {string} filterType - 'all', 'allies', 'neutral', 'hostile'
     */
    setFilter(filterType) {
        this.filter = filterType;
        this.render();
    }

    /**
     * Selecciona una nación para ver detalles
     * @param {string} nationId - ID de la nación
     */
    selectNation(nationId) {
        this.selectedNation = this.selectedNation === nationId ? null : nationId;
        this.render();
    }

    /**
     * Obtiene el estado de una relación basado en su valor
     * @param {number} value - Valor de relación (-100 a 100)
     * @returns {Object} { label, color, icon }
     */
    getRelationStatus(value) {
        if (value >= 60) return { label: 'Alianza', color: '#10b981', icon: '🤝' };
        if (value >= 20) return { label: 'Amistoso', color: '#3b82f6', icon: '😊' };
        if (value >= -20) return { label: 'Neutral', color: '#fbbf24', icon: '😐' };
        if (value >= -60) return { label: 'Tenso', color: '#f97316', icon: '😠' };
        return { label: 'Hostil', color: '#ef4444', icon: '⚔️' };
    }

    /**
     * Filtra relaciones según el filtro actual
     * @returns {Array} Relaciones filtradas
     */
    getFilteredRelations() {
        const entries = Object.entries(this.currentRelations);

        switch (this.filter) {
            case 'allies':
                return entries.filter(([_, data]) => data.value >= 60);
            case 'neutral':
                return entries.filter(([_, data]) => data.value >= -20 && data.value < 20);
            case 'hostile':
                return entries.filter(([_, data]) => data.value < -20);
            default:
                return entries;
        }
    }

    /**
     * Renderiza el panel completo
     */
    render() {
        if (!this.container) return;

        const filteredRelations = this.getFilteredRelations();

        this.container.innerHTML = `
            <div style="padding: 1rem; border-bottom: 1px solid #0f3460; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="color: #e94560; margin: 0;">🌐 Relaciones Diplomáticas</h3>
                <div style="display: flex; gap: 0.3rem;">
                    <button onclick="window.relationsPanel.setFilter('all')"
                            style="font-size: 0.7rem; padding: 0.3rem 0.5rem; background: ${this.filter === 'all' ? '#3b82f6' : 'transparent'}; border: 1px solid #3b82f6; color: ${this.filter === 'all' ? 'white' : '#3b82f6'};">
                        Todas
                    </button>
                    <button onclick="window.relationsPanel.setFilter('allies')"
                            style="font-size: 0.7rem; padding: 0.3rem 0.5rem; background: ${this.filter === 'allies' ? '#10b981' : 'transparent'}; border: 1px solid #10b981; color: ${this.filter === 'allies' ? 'white' : '#10b981'};">
                        🤝 Aliados
                    </button>
                    <button onclick="window.relationsPanel.setFilter('hostile')"
                            style="font-size: 0.7rem; padding: 0.3rem 0.5rem; background: ${this.filter === 'hostile' ? '#ef4444' : 'transparent'}; border: 1px solid #ef4444; color: ${this.filter === 'hostile' ? 'white' : '#ef4444'};">
                        ⚔️ Hostiles
                    </button>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; height: calc(200px - 60px); overflow: hidden;">
                <!-- Lista de Relaciones -->
                <div style="border-right: 1px solid #0f3460; overflow-y: auto; padding: 0.5rem;">
                    ${this.renderRelationsList(filteredRelations)}
                </div>

                <!-- Detalles / Historial -->
                <div style="overflow-y: auto; padding: 0.5rem;">
                    ${this.selectedNation ? this.renderNationDetails() : this.renderActiveTreaties()}
                </div>
            </div>
        `;
    }

    /**
     * Renderiza la lista de relaciones
     * @param {Array} relations - Array de [key, data]
     * @returns {string} HTML
     */
    renderRelationsList(relations) {
        if (relations.length === 0) {
            return '<p style="color: #94a3b8; font-size: 0.8rem; text-align: center; padding: 1rem;">Sin relaciones registradas</p>';
        }

        return relations.map(([key, data]) => {
            const [nation1, nation2] = key.split('_').slice(1); // Remover 'nation' del ID
            const status = this.getRelationStatus(data.value);
            const isSelected = this.selectedNation === key;

            // Determinar si el jugador está involucrado
            const playerNationId = 'nation_001'; // Esto debería venir del estado global
            const isPlayerInvolved = key.includes(playerNationId);

            return `
                <div onclick="window.relationsPanel.selectNation('${key}')"
                     style="background: ${isSelected ? 'rgba(59, 130, 246, 0.2)' : 'rgba(15, 52, 96, 0.3)'};
                            border: 1px solid ${isSelected ? '#3b82f6' : '#0f3460'};
                            border-radius: 4px; padding: 0.5rem; margin-bottom: 0.3rem; cursor: pointer; transition: all 0.2s;"
                     onmouseover="this.style.background='${isSelected ? 'rgba(59, 130, 246, 0.3)' : 'rgba(15, 52, 96, 0.5)'}'"
                     onmouseout="this.style.background='${isSelected ? 'rgba(59, 130, 246, 0.2)' : 'rgba(15, 52, 96, 0.3)'}'">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem;">
                        <span style="font-weight: bold; color: ${isPlayerInvolved ? '#3b82f6' : '#94a3b8'}; font-size: 0.85rem;">
                            ${status.icon} ${nation1.toUpperCase()} ↔ ${nation2.toUpperCase()}
                        </span>
                        <span style="color: ${status.color}; font-weight: bold; font-size: 0.8rem;">${data.value}</span>
                    </div>
                    <div style="background: rgba(0,0,0,0.3); height: 4px; border-radius: 2px; overflow: hidden;">
                        <div style="width: ${Math.max(0, Math.min(100, ((data.value + 100) / 200) * 100))}%;
                                    height: 100%;
                                    background: ${status.color};
                                    transition: width 0.3s;"></div>
                    </div>
                    <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 0.3rem;">${status.label}</div>
                </div>
            `;
        }).join('');
    }

    /**
     * Renderiza detalles de una nación seleccionada
     * @returns {string} HTML
     */
    renderNationDetails() {
        const [nation1, nation2] = this.selectedNation.split('_').slice(1);
        const relationData = this.currentRelations[this.selectedNation];
        const status = this.getRelationStatus(relationData?.value || 0);

        // Obtener historial relevante
        const relevantHistory = this.diplomaticHistory.filter(h =>
            h.actor === this.selectedNation || h.target === this.selectedNation
        ).slice(0, 10);

        return `
            <div style="margin-bottom: 1rem;">
                <h4 style="color: #e94560; margin-bottom: 0.5rem; font-size: 0.9rem;">
                    ${status.icon} Relación: ${nation1.toUpperCase()} ↔ ${nation2.toUpperCase()}
                </h4>
                <div style="background: rgba(15, 52, 96, 0.5); border-radius: 4px; padding: 0.5rem; margin-bottom: 0.5rem;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.3rem;">
                        <span style="color: #94a3b8; font-size: 0.8rem;">Valor Actual:</span>
                        <span style="color: ${status.color}; font-weight: bold;">${relationData?.value || 0}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: #94a3b8; font-size: 0.8rem;">Estado:</span>
                        <span style="color: ${status.color};">${status.label}</span>
                    </div>
                </div>
            </div>

            <div>
                <h4 style="color: #e94560; margin-bottom: 0.5rem; font-size: 0.9rem;">📜 Historial Reciente</h4>
                ${relevantHistory.length > 0 ?
                    relevantHistory.map(entry => `
                        <div style="background: rgba(15, 52, 96, 0.3); border-left: 2px solid ${entry.result === 'success' ? '#10b981' : '#ef4444'};
                                    border-radius: 2px; padding: 0.4rem; margin-bottom: 0.3rem; font-size: 0.75rem;">
                            <div style="color: #94a3b8; font-size: 0.7rem;">Tick ${entry.tick}</div>
                            <div style="color: #e0e0e0;">${entry.action} - ${entry.result === 'success' ? '✅' : '❌'}</div>
                        </div>
                    `).join('') :
                    '<p style="color: #94a3b8; font-size: 0.75rem; font-style: italic;">Sin historial reciente</p>'
                }
            </div>
        `;
    }

    /**
     * Renderiza tratados activos
     * @returns {string} HTML
     */
    renderActiveTreaties() {
        if (this.activeTreaties.length === 0) {
            return `
                <div>
                    <h4 style="color: #e94560; margin-bottom: 0.5rem; font-size: 0.9rem;">📋 Tratados Activos</h4>
                    <p style="color: #94a3b8; font-size: 0.75rem; font-style: italic;">No hay tratados activos</p>
                </div>
            `;
        }

        return `
            <div>
                <h4 style="color: #e94560; margin-bottom: 0.5rem; font-size: 0.9rem;">📋 Tratados Activos</h4>
                ${this.activeTreaties.map(treaty => `
                    <div style="background: rgba(15, 52, 96, 0.3); border: 1px solid #0f3460;
                                border-radius: 4px; padding: 0.5rem; margin-bottom: 0.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem;">
                            <span style="font-weight: bold; color: #3b82f6; font-size: 0.85rem;">
                                ${this.getTreatyIcon(treaty.type)} ${treaty.type.replace('_', ' ').toUpperCase()}
                            </span>
                            <span style="color: #94a3b8; font-size: 0.7rem;">
                                ⏱️ ${treaty.expiresAt ? `Exp: Tick ${treaty.expiresAt}` : '∞'}
                            </span>
                        </div>
                        <div style="font-size: 0.7rem; color: #94a3b8; margin-bottom: 0.3rem;">
                            Partes: ${treaty.parties.join(', ')}
                        </div>
                        ${treaty.benefits ? `
                            <div style="background: rgba(16, 185, 129, 0.1); border-left: 2px solid #10b981;
                                        padding: 0.3rem; font-size: 0.7rem; color: #10b981;">
                                ${treaty.benefits}
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    /**
     * Obtiene ícono para tipo de tratado
     * @param {string} type - Tipo de tratado
     * @returns {string} Ícono emoji
     */
    getTreatyIcon(type) {
        const icons = {
            'sanctions_economic': '💰',
            'sanctions_financial': '🏦',
            'investment_infrastructure': '🏗️',
            'investment_cultural': '🎭',
            'aid_humanitarian': '🚑',
            'aid_refugees': '🏠',
            'alliance': '🤝',
            'trade': '✈️'
        };
        return icons[type] || '📄';
    }

    /**
     * Procesa resultado de acción diplomática para actualizar UI
     * @param {Object} result - { actionId, success, actor, target, timestamp, details }
     */
    processDiplomaticResult(result) {
        // Agregar al historial
        this.addToHistory({
            tick: result.tick || Date.now(),
            action: result.actionId,
            actor: result.actor,
            target: result.target,
            result: result.success ? 'success' : 'failed',
            details: result.error || result.details?.metadata?.message
        });

        // Si fue exitosa y es un tratado duradero, agregar a tratados activos
        if (result.success && ['investment_infrastructure', 'investment_cultural', 'sanctions_economic', 'sanctions_financial'].includes(result.actionId)) {
            const duration = result.details?.metadata?.duration || 0;
            const currentTick = result.tick || 0;

            this.addTreaty({
                id: result.details?.metadata?.effectId || `treaty_${Date.now()}`,
                type: result.actionId,
                parties: [result.actor, result.target],
                expiresAt: currentTick + duration,
                benefits: this.getTreatyBenefits(result.actionId)
            });
        }

        this.render();
    }

    /**
     * Obtiene descripción de beneficios para un tratado
     * @param {string} type - Tipo de tratado
     * @returns {string} Descripción
     */
    getTreatyBenefits(type) {
        const benefits = {
            'investment_infrastructure': '+6 $/tick para inversor, +20% crecimiento económico',
            'investment_cultural': '+0.5 influencia/tick, -10% decay de influencia',
            'sanctions_economic': '-50% ingresos comerciales objetivo, -2 $/tick mantenedor',
            'sanctions_financial': '-2 $/tick drenaje de presupuesto objetivo'
        };
        return benefits[type] || 'Beneficios personalizados';
    }
}

// Exportar instancia global para acceso desde HTML
if (typeof window !== 'undefined') {
    window.RelationsPanelClass = RelationsPanel;
}