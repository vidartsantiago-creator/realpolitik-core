/**
 * @file CountryActionPanel.js
 * @description Panel de acciones para países seleccionados
 */

export class CountryActionPanel {
    constructor() {
        this.panel = null;
        this.currentCountryId = null;
        this.setupDOM();
    }

    setupDOM() {
        // Crear estructura HTML si no existe
        if (!document.getElementById('country-action-panel')) {
            const container = document.createElement('div');
            container.id = 'country-action-panel';
            container.className = 'country-action-panel';
            container.style.display = 'none';
            container.innerHTML = `
                <div class="panel-header">
                    <span id="cap-country-name" class="country-name">PAÍS</span>
                    <button id="cap-close" class="close-btn">×</button>
                </div>
                <div class="panel-content">
                    <div class="stat-row">
                        <span class="stat-label">Estabilidad:</span>
                        <span id="cap-stability" class="stat-value">--</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Relación:</span>
                        <span id="cap-relation" class="stat-value">--</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Estado:</span>
                        <span id="cap-status" class="stat-value">--</span>
                    </div>
                    
                    <div class="actions-grid">
                        <button id="cap-improve-relations" class="action-btn btn-success">
                            🤝 Mejorar Relaciones
                        </button>
                        <button id="cap-spy-operation" class="action-btn btn-warning">
                            🕵️ Operación de Espionaje
                        </button>
                        <button id="cap-sanctions" class="action-btn btn-danger">
                            ⚠️ Imponer Sanciones
                        </button>
                        <button id="cap-declare-war" class="action-btn btn-hostile">
                            ⚔️ Declarar Guerra
                        </button>
                    </div>
                    
                    <div id="cap-feedback" class="feedback-message"></div>
                </div>
            `;
            document.body.appendChild(container);
            
            // Estilos CSS (inyectar dinámicamente)
            const style = document.createElement('style');
            style.textContent = `
                .country-action-panel {
                    position: absolute;
                    top: 60px;
                    right: 320px; /* Entre canvas y panel derecho */
                    width: 280px;
                    background: #1a1a1a;
                    border: 2px solid #00ff00;
                    border-radius: 4px;
                    padding: 15px;
                    z-index: 1000;
                    font-family: 'Courier New', monospace;
                    color: #d0d0d0;
                    box-shadow: 0 0 20px rgba(0, 255, 0, 0.2);
                }
                .panel-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid #333;
                    padding-bottom: 10px;
                    margin-bottom: 15px;
                }
                .country-name {
                    font-size: 16px;
                    font-weight: bold;
                    color: #00ff00;
                    text-transform: uppercase;
                }
                .close-btn {
                    background: none;
                    border: none;
                    color: #707070;
                    font-size: 20px;
                    cursor: pointer;
                }
                .close-btn:hover { color: #fff; }
                .stat-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                    font-size: 12px;
                }
                .stat-label { color: #a0a0a0; }
                .stat-value { color: #fff; font-weight: bold; }
                .actions-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                    margin-top: 15px;
                }
                .action-btn {
                    padding: 8px;
                    border: 1px solid #333;
                    background: #252525;
                    color: #d0d0d0;
                    font-family: 'Courier New', monospace;
                    font-size: 10px;
                    cursor: pointer;
                    transition: all 0.2s;
                    border-radius: 2px;
                }
                .action-btn:hover {
                    background: #333;
                    border-color: #00ff00;
                    transform: translateY(-1px);
                }
                .btn-success:hover { border-color: #00ff00; color: #00ff00; }
                .btn-warning:hover { border-color: #ffaa00; color: #ffaa00; }
                .btn-danger:hover { border-color: #ff3333; color: #ff3333; }
                .btn-hostile:hover { border-color: #ff0000; color: #ff0000; }
                .feedback-message {
                    margin-top: 10px;
                    padding: 8px;
                    background: #252525;
                    border-radius: 2px;
                    font-size: 10px;
                    min-height: 20px;
                    text-align: center;
                }
            `;
            document.head.appendChild(style);
        }

        this.panel = document.getElementById('country-action-panel');
        this.bindEvents();
    }

    bindEvents() {
        // Botón cerrar
        document.getElementById('cap-close').addEventListener('click', () => this.hide());

        // Botones de acción
        document.getElementById('cap-improve-relations').addEventListener('click', () => 
            this.sendAction('improve_relations'));
        
        document.getElementById('cap-spy-operation').addEventListener('click', () => 
            this.sendAction('spy_operation'));
        
        document.getElementById('cap-sanctions').addEventListener('click', () => 
            this.sendAction('sanctions'));
        
        document.getElementById('cap-declare-war').addEventListener('click', () => 
            this.sendAction('declare_war'));
    }

    show(countryId, countryData) {
        this.currentCountryId = countryId;
        
        // Actualizar datos
        document.getElementById('cap-country-name').textContent = countryData.name || countryId;
        document.getElementById('cap-stability').textContent = `${countryData.stability || 0}%`;
        
        // Calcular relación (esto debería venir del estado)
        const relation = countryData.relation || 0;
        const relationEl = document.getElementById('cap-relation');
        relationEl.textContent = relation > 0 ? `+${relation}` : relation;
        relationEl.style.color = relation > 0 ? '#00ff00' : relation < 0 ? '#ff3333' : '#888888';
        
        const statusEl = document.getElementById('cap-status');
        if (countryData.in_crisis) {
            statusEl.textContent = '⚠️ EN CRISIS';
            statusEl.style.color = '#ff0000';
        } else if (relation > 50) {
            statusEl.textContent = '🤝 Aliado';
            statusEl.style.color = '#00aaff';
        } else if (relation < -50) {
            statusEl.textContent = '⚔️ Hostil';
            statusEl.style.color = '#ff3333';
        } else {
            statusEl.textContent = '➖ Neutral';
            statusEl.style.color = '#888888';
        }

        // Mostrar panel
        this.panel.style.display = 'block';
        document.getElementById('cap-feedback').textContent = '';
    }

    hide() {
        this.panel.style.display = 'none';
        this.currentCountryId = null;
    }

    update(countryId, countryData) {
        if (this.currentCountryId === countryId && this.panel.style.display !== 'none') {
            this.show(countryId, countryData);
        }
    }

    sendAction(actionType) {
        if (!this.currentCountryId) return;

        const feedbackEl = document.getElementById('cap-feedback');
        feedbackEl.textContent = `Enviando ${actionType} a ${this.currentCountryId}...`;
        feedbackEl.style.color = '#ffaa00';

        // Enviar intención al servidor
        if (window.sendIntent) {
            window.sendIntent(actionType, { target_id: this.currentCountryId });
            
            setTimeout(() => {
                feedbackEl.textContent = `✓ ${actionType} enviado correctamente`;
                feedbackEl.style.color = '#00ff00';
                
                setTimeout(() => {
                    feedbackEl.textContent = '';
                }, 2000);
            }, 500);
        } else {
            feedbackEl.textContent = 'Error: No hay conexión con el servidor';
            feedbackEl.style.color = '#ff3333';
        }
    }
}