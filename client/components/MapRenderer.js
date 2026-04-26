/**
 * Renderizador del mapa mundial usando Canvas API.
 * Gestiona capas de visualización y respeta estrictamente la Niebla de Guerra.
 * @module MapRenderer
 */

export class MapRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.layers = { commercial: false, military: false, crisis: false };
        this.state = null;
        this.playerNationId = null;
        
        // Coordenadas simplificadas para MVP (En prod usar proyección real)
        this.nodes = new Map(); 
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = this.canvas.parentElement.clientWidth;
        this.canvas.height = this.canvas.parentElement.clientHeight;
        if(this.state) this.render();
    }

    setLayer(layerName, isActive) {
        this.layers[layerName] = isActive;
        this.render();
    }

    /**
     * Actualiza el estado interno y renderiza
     * @param {Object} state - Estado sincronizado desde app.js
     * @param {string} playerNationId 
     */
    update(state, playerNationId) {
        this.state = state;
        this.playerNationId = playerNationId;
        this.initNodes(state);
        this.render();
    }

    initNodes(state) {
        // Generación procedural simple de posiciones para el MVP
        // En una versión completa, esto vendría en el estado inicial
        if (this.nodes.size === 0 && state.nations) {
            const keys = Object.keys(state.nations);
            keys.forEach((id, index) => {
                const angle = (index / keys.length) * Math.PI * 2;
                const radius = Math.min(this.canvas.width, this.canvas.height) * 0.4;
                this.nodes.set(id, {
                    x: this.canvas.width/2 + Math.cos(angle) * radius,
                    y: this.canvas.height/2 + Math.sin(angle) * radius,
                    name: state.nations[id].name
                });
            });
        }
    }

    render() {
        if (!this.ctx || !this.state) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Dibujar Nodos
        this.nodes.forEach((node, id) => {
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, 8, 0, Math.PI * 2);
            this.ctx.fillStyle = id === this.playerNationId ? '#3b82f6' : '#64748b';
            this.ctx.fill();
            
            // Label
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '10px Arial';
            this.ctx.fillText(node.name, node.x + 10, node.y);
        });

        // 2. Dibujar Relaciones (Solo si son visibles)
        if (this.layers.commercial || this.layers.military) {
            const relations = this.state.diplomacy?.relations || {};
            const myRelations = relations[this.playerNationId] || {};

            Object.entries(myRelations).forEach(([targetId, data]) => {
                if (!this.nodes.has(targetId)) return; // Niebla de guerra: si no existe en nodos visibles, no dibuja
                
                const start = this.nodes.get(this.playerNationId);
                const end = this.nodes.get(targetId);

                this.ctx.beginPath();
                this.ctx.moveTo(start.x, start.y);
                // Curva Bezier cuadrática para arco
                const cpX = (start.x + end.x) / 2;
                const cpY = (start.y + end.y) / 2 - 50; 
                this.ctx.quadraticCurveTo(cpX, cpY, end.x, end.y);
                
                this.ctx.strokeStyle = data.value > 0.5 ? '#10b981' : '#ef4444';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            });
        }

        // 3. Capa de Crisis
        if (this.layers.crisis && this.state.events?.global_crisis_phase > 1) {
            this.ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
}