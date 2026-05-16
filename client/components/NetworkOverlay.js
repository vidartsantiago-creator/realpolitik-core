/**
 * NetworkOverlay.js - Visualizador de Redes Geopolíticas
 * @description Capa especializada para visualizar relaciones invisibles:
 *              diplomacia, espionaje, logística y flujos de información.
 *              Se superpone al MapRenderer usando canvas transparente.
 * @version 1.0.0
 * @module NetworkOverlay
 */

export class NetworkOverlay {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.warn('[NetworkOverlay] Canvas no encontrado, modo headless.');
            this.ctx = null;
            return;
        }

        this.ctx = this.canvas.getContext('2d');

        // Configuración
        this.config = {
            diplomacyColor: '#3b82f6',
            espionageColor: '#8b5cf6',
            logisticsColor: '#10b981',
            informationColor: '#f59e0b',
            lineWidth: 2,
            animationSpeed: 0.05,
            particleCount: 3,
            fadeRate: 0.02
        };

        // Estado
        this.state = null;
        this.playerNationId = null;
        this.visibleLayers = {
            diplomacy: false,
            espionage: false,
            logistics: false,
            information: false
        };

        // Animaciones
        this.particles = []; // Partículas en movimiento
        this.connections = []; // Conexiones activas con animación
        this.phase = 0;

        // Referencia al MapRenderer para obtener coordenadas
        this.mapRenderer = null;

        // Inicialización
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Loop de animación
        this.animate();
    }

    /**
     * Establece referencia al MapRenderer para coordenadas
     */
    setMapRenderer(mapRenderer) {
        this.mapRenderer = mapRenderer;
    }

    /**
     * Ajusta tamaño del canvas
     */
    resize() {
        if (!this.canvas) return;

        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;

        this.render();
    }

    /**
     * Activa/desactiva capa de visualización
     */
    setLayer(layerName, isActive) {
        if (this.visibleLayers.hasOwnProperty(layerName)) {
            this.visibleLayers[layerName] = isActive;
            this.render();
        } else {
            console.warn(`[NetworkOverlay] Capa desconocida: ${layerName}`);
        }
    }

    /**
     * Actualiza estado interno
     */
    update(state, playerNationId) {
        this.state = state;
        this.playerNationId = playerNationId;
        this.updateParticles();
        this.render();
    }

    /**
     * Actualiza partículas de animación
     */
    updateParticles() {
        // Agregar nuevas partículas para conexiones activas
        if (this.visibleLayers.diplomacy && this.state?.diplomacy?.relations) {
            const relations = this.state.diplomacy.relations[this.playerNationId] || {};

            for (const [targetId, data] of Object.entries(relations)) {
                if (Math.random() < 0.02) { // 2% chance por tick
                    this.addParticle(this.playerNationId, targetId, 'diplomacy');
                }
            }
        }

        // Actualizar posición de partículas existentes
        this.particles = this.particles.filter(p => {
            p.progress += 0.02;
            return p.progress < 1;
        });

        this.phase += this.config.animationSpeed;
        if (this.phase > Math.PI * 2) {
            this.phase = 0;
        }
    }

    /**
     * Agrega partícula animada
     */
    addParticle(fromId, toId, type) {
        this.particles.push({
            from: fromId,
            to: toId,
            progress: 0,
            type: type
        });
    }

    /**
     * Loop de animación principal
     */
    animate() {
        this.updateParticles();
        this.render();
        requestAnimationFrame(() => this.animate());
    }

    /**
     * Renderiza todas las capas visibles
     */
    render() {
        if (!this.ctx || !this.state) return;

        const width = this.canvas.width;
        const height = this.canvas.height;

        // Limpiar canvas
        this.ctx.clearRect(0, 0, width, height);

        // 1. Capa de diplomacia
        if (this.visibleLayers.diplomacy) {
            this.renderDiplomacy();
        }

        // 2. Capa de espionaje
        if (this.visibleLayers.espionage) {
            this.renderEspionage();
        }

        // 3. Capa de logística
        if (this.visibleLayers.logistics) {
            this.renderLogistics();
        }

        // 4. Capa de información
        if (this.visibleLayers.information) {
            this.renderInformation();
        }

        // 5. Partículas animadas
        this.renderParticles();
    }

    /**
     * Obtiene coordenadas de un nodo desde MapRenderer
     */
    getNodePosition(nationId) {
        if (this.mapRenderer?.nodes?.has(nationId)) {
            const node = this.mapRenderer.nodes.get(nationId);
            return { x: node.x, y: node.y };
        }
        return null;
    }

    /**
     * Renderiza red diplomática
     */
    renderDiplomacy() {
        const relations = this.state.diplomacy?.relations || {};
        const myRelations = relations[this.playerNationId] || {};

        for (const [targetId, data] of Object.entries(myRelations)) {
            const start = this.getNodePosition(this.playerNationId);
            const end = this.getNodePosition(targetId);

            if (!start || !end) continue;

            const relationValue = data.value ?? 0;

            // Color según tipo de relación
            let color = this.config.diplomacyColor;
            let lineStyle = 'solid';
            let lineWidth = this.config.lineWidth;

            if (relationValue > 0.7) {
                color = '#10b981'; // Verde brillante (aliado fuerte)
                lineWidth = 4;
            } else if (relationValue > 0.4) {
                color = '#3b82f6'; // Azul (neutral-amistoso)
                lineWidth = 2;
            } else if (relationValue > 0.2) {
                color = '#f59e0b'; // Naranja (tenso)
                lineStyle = 'dashed';
            } else {
                color = '#ef4444'; // Rojo (hostil)
                lineStyle = 'dotted';
                lineWidth = 3;
            }

            // Dibujar línea con efecto de pulso
            this.drawAnimatedLine(start, end, color, lineWidth, lineStyle);

            // Dibujar icono de tipo de relación
            this.drawRelationIcon(start, end, data.type || 'neutral');
        }
    }

    /**
     * Renderiza red de espionaje
     */
    renderEspionage() {
        const espionage = this.state.espionage?.networks || {};

        for (const [sourceId, targets] of Object.entries(espionage)) {
            const start = this.getNodePosition(sourceId);
            if (!start) continue;

            for (const [targetId, opData] of Object.entries(targets)) {
                const end = this.getNodePosition(targetId);
                if (!end) continue;

                // Solo mostrar operaciones detectadas o propias
                if (!opData.detected && sourceId !== this.playerNationId) continue;

                let color = this.config.espionageColor;
                let lineStyle = 'dotted';
                let alpha = 0.5;

                if (opData.type === 'active') {
                    color = '#ef4444';
                    lineStyle = 'dashed';
                    alpha = 0.8;
                } else if (opData.detected) {
                    color = '#fbbf24';
                    alpha = 0.7;
                }

                // Línea semitransparente
                this.ctx.globalAlpha = alpha;
                this.drawCurvedLine(start, end, color, 2, lineStyle);
                this.ctx.globalAlpha = 1.0;

                // Marcar nodos de operación
                if (opData.type === 'active') {
                    this.drawOperationMarker(end, 'active');
                }
            }
        }
    }

    /**
     * Renderiza rutas logísticas
     */
    renderLogistics() {
        const routes = this.state.economy?.tradeRoutes || [];

        for (const route of routes) {
            const start = this.getNodePosition(route.from);
            const end = this.getNodePosition(route.to);

            if (!start || !end) continue;

            const volume = route.volume || 0;
            const intensity = Math.min(volume / 1000, 1);

            // Color gradiente según volumen
            const r = Math.round(255 * (1 - intensity));
            const g = Math.round(255 * intensity + 50);
            const b = 100;
            const color = `rgb(${r}, ${g}, ${b})`;

            // Grosor según volumen
            const lineWidth = 2 + intensity * 4;

            this.drawCurvedLine(start, end, color, lineWidth);

            // Etiquetar volumen
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2 - 20;

            this.ctx.fillStyle = color;
            this.ctx.font = '10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`${volume}k`, midX, midY);
        }
    }

    /**
     * Renderiza flujos de información
     */
    renderInformation() {
        const intel = this.state.intelligence?.flows || [];

        for (const flow of intel) {
            const start = this.getNodePosition(flow.from);
            const end = this.getNodePosition(flow.to);

            if (!start || !end) continue;

            // Color según tipo de inteligencia
            let color = this.config.informationColor;

            if (flow.type === 'classified') {
                color = '#ef4444';
            } else if (flow.type === 'open') {
                color = '#10b981';
            }

            // Línea ondulante para información
            this.drawWavyLine(start, end, color, 2);
        }
    }

    /**
     * Renderiza partículas animadas
     */
    renderParticles() {
        for (const particle of this.particles) {
            const start = this.getNodePosition(particle.from);
            const end = this.getNodePosition(particle.to);

            if (!start || !end) continue;

            // Calcular posición actual con curva
            const progress = particle.progress;
            const x = start.x + (end.x - start.x) * progress;
            const y = start.y + (end.y - start.y) * progress - Math.sin(progress * Math.PI) * 40;

            // Color según tipo
            let color;
            switch (particle.type) {
                case 'diplomacy': color = '#3b82f6'; break;
                case 'espionage': color = '#8b5cf6'; break;
                case 'logistics': color = '#10b981'; break;
                default: color = '#ffffff';
            }

            // Dibujar partícula
            this.ctx.beginPath();
            this.ctx.arc(x, y, 4, 0, Math.PI * 2);
            this.ctx.fillStyle = color;
            this.ctx.fill();

            // Glow effect
            this.ctx.shadowColor = color;
            this.ctx.shadowBlur = 10;
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }
    }

    /**
     * Dibuja línea animada con efecto de pulso
     */
    drawAnimatedLine(start, end, color, lineWidth, lineStyle) {
        const pulse = Math.sin(this.phase) * 0.3 + 0.7;

        this.ctx.save();
        this.ctx.globalAlpha = pulse;
        this.drawCurvedLine(start, end, color, lineWidth, lineStyle);
        this.ctx.restore();
    }

    /**
     * Dibuja línea curva básica
     */
    drawCurvedLine(start, end, color, lineWidth, lineStyle = 'solid') {
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);

        const cpX = (start.x + end.x) / 2;
        const cpY = (start.y + end.y) / 2 - 40;

        this.ctx.quadraticCurveTo(cpX, cpY, end.x, end.y);

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;

        if (lineStyle === 'dashed') {
            this.ctx.setLineDash([5, 5]);
        } else if (lineStyle === 'dotted') {
            this.ctx.setLineDash([2, 2]);
        } else {
            this.ctx.setLineDash([]);
        }

        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    /**
     * Dibuja línea ondulante para información
     */
    drawWavyLine(start, end, color, lineWidth) {
        const amplitude = 10;
        const frequency = 0.1;

        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const steps = 20;

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = start.x + dx * t;
            const y = start.y + dy * t + Math.sin(t * Math.PI * frequency) * amplitude;

            this.ctx.lineTo(x, y);
        }

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.stroke();
    }

    /**
     * Dibuja ícono de tipo de relación
     */
    drawRelationIcon(start, end, type) {
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2 - 50;

        let icon = '';
        switch (type) {
            case 'alliance': icon = '🤝'; break;
            case 'trade': icon = '💰'; break;
            case 'war': icon = '⚔️'; break;
            case 'tension': icon = '⚠️'; break;
            default: icon = '•';
        }

        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(icon, midX, midY);
    }

    /**
     * Dibuja marcador de operación de espionaje
     */
    drawOperationMarker(position, type) {
        const size = 6;

        this.ctx.save();

        if (type === 'active') {
            // Triángulo rojo parpadeante
            const pulse = Math.sin(this.phase * 2) * 0.5 + 0.5;
            this.ctx.globalAlpha = pulse;
            this.ctx.fillStyle = '#ef4444';

            this.ctx.beginPath();
            this.ctx.moveTo(position.x, position.y - size);
            this.ctx.lineTo(position.x + size, position.y + size);
            this.ctx.lineTo(position.x - size, position.y + size);
            this.ctx.closePath();
            this.ctx.fill();
        }

        this.ctx.restore();
    }

    /**
     * Limpia todas las partículas
     */
    clearParticles() {
        this.particles = [];
    }

    /**
     * Fuerza re-renderizado
     */
    forceRender() {
        this.render();
    }
}