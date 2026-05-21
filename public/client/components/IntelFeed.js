/**
 * Componente para el Feed de Inteligencia Asimétrica.
 * Renderiza señales veladas y gestiona acciones de investigación.
 * @module IntelFeed
 */

import { TickConverter } from '../utils/TickConverter.js';

export class IntelFeed {
    constructor(containerId = 'intel-feed') {
        this.containerId = containerId;
        this.container = null;
        this.feedList = null;
        this.signals = [];
        this.filter = 'all';
        this.onActionCallback = null;
        
        // Intentar inicializar cuando el DOM esté listo
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        this.container = document.getElementById(this.containerId);
        if (!this.container) {
            console.warn(`[IntelFeed] Contenedor #${this.containerId} no encontrado. Modo headless.`);
            return;
        }
        
        // Si existe #feed-list lo usamos, si no, usamos el propio contenedor
        this.feedList = this.container.querySelector('#feed-list') || this.container;
        
        this.setupTabs();
    }

    setupTabs() {
        if (!this.container) return;
        
        this.container.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.filter = e.target.dataset.source;
                this.render();
            });
        });
    }

    /**
     * Agrega una nueva señal recibida por WebSocket
     * @param {Object} payload - { signalId, signalText, confidenceLevel, source, receivedTick }
     */
    addSignal(payload) {
        this.signals.unshift(payload);
        this.render();
    }

    getColorForConfidence(level) {
        if (level < 40) return 'gray';
        if (level < 65) return 'yellow';
        if (level < 85) return 'orange';
        return '#ef4444'; // Red
    }

    getCssClassForConfidence(level) {
        if (level < 40) return 'low';
        if (level < 65) return 'medium';
        return 'high';
    }

    render() {
        if (!this.feedList) return;
        
        this.feedList.innerHTML = '';
        const filtered = this.filter === 'all' 
            ? this.signals 
            : this.signals.filter(s => s.source === this.filter);

        filtered.forEach(signal => {
            const card = document.createElement('div');
            card.className = `intel-card ${this.getCssClassForConfidence(signal.confidenceLevel)}`;
            
            const color = signal.isInvestigated ? '#10b981' : this.getColorForConfidence(signal.confidenceLevel);
            const confidenceDisplay = signal.isInvestigated ? '100% (VERIFICADO)' : `${signal.confidenceLevel}% Confianza`;
            
            // Mostrar información detallada si está investigada
            let contentHtml = '';
            if (signal.isInvestigated && signal.detailedInfo) {
                const info = signal.detailedInfo;
                contentHtml = `
                    <div style="background: rgba(16, 185, 129, 0.1); border-left: 3px solid #10b981; padding: 0.8rem; margin-top: 0.5rem;">
                        <strong style="color: #10b981;">✅ INFORMACIÓN VERIFICADA</strong>
                        <p style="margin: 0.5rem 0; font-size: 0.85rem;">${info.analysis}</p>
                        <div style="font-size: 0.8rem; margin-top: 0.5rem;">
                            <p><strong>Nación:</strong> ${info.verifiedData.nationInvolved}</p>
                            <p><strong>Tropas:</strong> ${info.verifiedData.troopMovement} efectivos</p>
                            <p><strong>Equipo:</strong> ${info.verifiedData.equipmentType}</p>
                            <p><strong>Intención:</strong> ${info.verifiedData.strategicIntent}</p>
                            <p><strong>Marco Temporal:</strong> ${info.verifiedData.timeFrame}</p>
                        </div>
                        <div style="margin-top: 0.5rem; font-style: italic; font-size: 0.75rem; color: #94a3b8;">
                            ${info.recommendations.map(r => `• ${r}`).join('<br>')}
                        </div>
                    </div>
                `;
            } else {
                contentHtml = `
                    <p style="margin: 5px 0; font-style: italic;">"${signal.signalText || 'Sin información'}"</p>
                    <button class="investigate-btn" data-id="${signal.signalId || ''}" style="margin-top:5px; font-size:0.8rem;">
                        Investigar (-$100k)
                    </button>
                `;
            }
            
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <strong>${signal.source?.toUpperCase() || 'DESCONOCIDA'}</strong>
                    <small style="color:${color}">${confidenceDisplay}</small>
                </div>
                ${contentHtml}
            `;

            // Agregar event listener solo si no está investigada
            if (!signal.isInvestigated) {
                const btn = card.querySelector('.investigate-btn');
                if (btn && signal.signalId) {
                    btn.addEventListener('click', () => {
                        if (typeof window.investigateSignal === 'function') {
                            window.investigateSignal(signal.signalId);
                        }
                    });
                }
            }

            this.feedList.appendChild(card);
        });
    }

    /**
     * Emite evento al servidor para investigar señal
     * @param {string} signalId 
     */
    onInvestigate(signalId) {
        if (this.onActionCallback) {
            this.onActionCallback('intel_action', { signalId, action: 'investigate' });
        } else {
            console.log('[IntelFeed] Acción de investigar:', signalId);
        }
    }

    setActionCallback(callback) {
        this.onActionCallback = callback;
    }
    
    clear() {
        this.signals = [];
        this.render();
    }
}

export default IntelFeed;