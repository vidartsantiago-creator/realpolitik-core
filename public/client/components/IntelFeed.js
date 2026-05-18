/**
 * Componente para el Feed de Inteligencia Asimétrica.
 * Renderiza señales veladas y gestiona acciones de investigación.
 * @module IntelFeed
 */

import { TickConverter } from '../utils/TickConverter.js';

export class IntelFeed {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.feedList = this.container.querySelector('#feed-list');
        this.signals = [];
        this.filter = 'all';
        
        this.setupTabs();
    }

    setupTabs() {
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
        this.feedList.innerHTML = '';
        const filtered = this.filter === 'all' 
            ? this.signals 
            : this.signals.filter(s => s.source === this.filter);

        filtered.forEach(signal => {
            const card = document.createElement('div');
            card.className = `intel-card ${this.getCssClassForConfidence(signal.confidenceLevel)}`;
            
            const color = this.getColorForConfidence(signal.confidenceLevel);
            
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <strong>${signal.source.toUpperCase()}</strong>
                    <small style="color:${color}">${signal.confidenceLevel}% Confianza</small>
                </div>
                <p style="margin: 5px 0; font-style: italic;">"${signal.signalText}"</p>
                <div class="confidence-bar">
                    <div class="confidence-fill" style="width: ${signal.confidenceLevel}%; background-color: ${color}"></div>
                </div>
                <button class="investigate-btn" data-id="${signal.signalId}" style="margin-top:5px; font-size:0.8rem;">
                    Investigar (-$100k)
                </button>
            `;

            card.querySelector('.investigate-btn').addEventListener('click', () => {
                this.onInvestigate(signal.signalId);
            });

            this.feedList.appendChild(card);
        });
    }

    /**
     * Emite evento al servidor para investigar señal
     * @param {string} signalId 
     */
    onInvestigate(signalId) {
        // El envío real lo gestiona app.js a través del callback
        if (this.onActionCallback) {
            this.onActionCallback('intel_action', { signalId, action: 'investigate' });
        }
    }

    setActionCallback(callback) {
        this.onActionCallback = callback;
    }
}