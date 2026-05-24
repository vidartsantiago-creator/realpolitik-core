/**
 * MapRenderer.js - Motor de Renderizado Geopolítico
 * @description Convierte el estado del juego en representación visual en canvas.
 *              Implementa capas de renderizado, conversión geo->píxeles, y detección de interacción.
 * @version 1.0.0
 * @module MapRenderer
 */

export class MapRenderer {
    constructor(canvasElement) {
        // ✅ CORRECTO: La validación ocurre cuando se crea la instancia con el elemento pasado
        if (!canvasElement) {
            console.warn('[MapRenderer] Canvas no encontrado, modo headless.');
            this.ctx = null;
            return;
        }

        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');

        // Configuración
        this.config = {
            baseColor: '#1a1a2e',
            landColor: '#16213e',
            borderColor: '#0f3460',
            textColor: '#e94560',
            nodeRadius: 12,
            hoverRadius: 16,
            animationSpeed: 0.1
        };

        // Estado interno
        this.state = null;
        this.playerNationId = null;
        this.layers = {
            borders: true,
            nodes: true,
            relations: false,
            espionage: false,
            crisis: false,
            economy: false
        };

        // Datos geográficos
        this.nodes = new Map(); // id -> {x, y, name, nationId}
        this.projection = null;

        // Interacción
        this.hoveredNode = null;
        this.selectedNode = null;
        this.tooltip = { visible: false, x: 0, y: 0, content: '' };

        // Animaciones
        this.pulsePhase = 0;
        this.dirtyRects = [];

        // Inicialización
        this.resize();
        this.setupInteraction();
        window.addEventListener('resize', () => this.resize());

        // Loop de animación
        this.animate();
    }

    /**
     * Configura listeners para interacción (click, hover, move)
     */
    setupInteraction() {
        if (!this.canvas) return;

        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    }

    /**
     * Maneja evento de movimiento del mouse
     */
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Detectar nodo bajo el cursor
        let foundNode = null;
        for (const [id, node] of this.nodes.entries()) {
            const dx = mouseX - node.x;
            const dy = mouseY - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= this.config.nodeRadius + 4) {
                foundNode = { id, ...node };
                break;
            }
        }

        if (foundNode?.id !== this.hoveredNode?.id) {
            this.hoveredNode = foundNode;
            this.canvas.style.cursor = foundNode ? 'pointer' : 'default';
            this.render();
        }

        // Actualizar tooltip
        if (this.hoveredNode) {
            this.tooltip.visible = true;
            this.tooltip.x = mouseX + 15;
            this.tooltip.y = mouseY - 10;
            this.tooltip.content = this.getTooltipContent(this.hoveredNode);
        } else {
            this.tooltip.visible = false;
        }
    }

    /**
     * Maneja click en el mapa
     */
    handleClick(e) {
        if (this.hoveredNode) {
            this.selectedNode = this.hoveredNode.id === this.selectedNode ? null : this.hoveredNode;
            this.onNodeSelect?.(this.selectedNode);
            this.render();
        }
    }

    /**
     * Maneja salida del mouse del canvas
     */
    handleMouseLeave() {
        this.hoveredNode = null;
        this.tooltip.visible = false;
        this.render();
    }

    /**
     * Obtiene contenido del tooltip para un nodo
     */
    getTooltipContent(node) {
        if (!this.state?.nations?.[node.nationId]) return node.name;

        const nation = this.state.nations[node.nationId];
        const stability = nation.internal?.stability ?? 0;
        const gdp = nation.economy?.gdp ?? 0;

        return `
            <strong>${nation.name}</strong><br>
            Estabilidad: ${stability}%<br>
            GDP: $${gdp.toLocaleString()}M
        `;
    }

    /**
     * Ajusta tamaño del canvas al contenedor
     */
    resize() {
        if (!this.canvas) return;

        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;

        // Recalcular proyección si hay estado
        if (this.state) {
            this.initNodes(this.state);
        }

        this.render();
    }

    /**
     * Activa/desactiva una capa de visualización
     */
    setLayer(layerName, isActive) {
        if (this.layers.hasOwnProperty(layerName)) {
            this.layers[layerName] = isActive;
            this.render();
        } else {
            console.warn(`[MapRenderer] Capa desconocida: ${layerName}`);
        }
    }

    /**
     * Actualiza estado interno y renderiza
     */
    update(state, playerNationId) {
        this.state = state;
        this.playerNationId = playerNationId;
        this.initNodes(state);
        this.render();
    }

    /**
     * Inicializa nodos desde el estado del juego
     */
    initNodes(state) {
        if (!state?.nations || !this.canvas) return;

        // Si ya existen nodos, solo actualizar datos
        if (this.nodes.size > 0) {
            for (const [id, node] of this.nodes.entries()) {
                if (state.nations[id]) {
                    node.name = state.nations[id].name;
                    node.nationId = id;
                }
            }
            return;
        }

        // Generar disposición circular para MVP
        const nationIds = Object.keys(state.nations);
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const radius = Math.min(centerX, centerY) * 0.6;

        nationIds.forEach((id, index) => {
            const angle = (index / nationIds.length) * Math.PI * 2 - Math.PI / 2;
            this.nodes.set(id, {
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius,
                name: state.nations[id].name,
                nationId: id
            });
        });
    }

    /**
     * Loop de animación principal
     */
    animate() {
        this.pulsePhase += this.config.animationSpeed;
        if (this.pulsePhase > Math.PI * 2) {
            this.pulsePhase = 0;
        }

        // Re-renderizar si hay animaciones activas
        if (this.layers.crisis || this.hoveredNode) {
            this.render();
        }

        requestAnimationFrame(() => this.animate());
    }

    /**
     * Renderiza todas las capas del mapa
     */
    render() {
        if (!this.ctx || !this.state) return;

        const width = this.canvas.width;
        const height = this.canvas.height;

        // Limpiar canvas
        this.ctx.clearRect(0, 0, width, height);

        // 1. Capa base (fondo)
        this.renderBaseLayer(width, height);

        // 2. Capa de fronteras (si está activa)
        if (this.layers.borders) {
            this.renderBorders();
        }

        // 3. Capa de nodos (naciones)
        if (this.layers.nodes) {
            this.renderNodes();
        }

        // 4. Capa de relaciones (diplomacia)
        if (this.layers.relations) {
            this.renderRelations();
        }

        // 5. Capa de espionaje
        if (this.layers.espionage) {
            this.renderEspionage();
        }

        // 6. Capa de economía
        if (this.layers.economy) {
            this.renderEconomy();
        }

        // 7. Capa de crisis
        if (this.layers.crisis) {
            this.renderCrisisOverlay();
        }

        // 8. Tooltip
        if (this.tooltip.visible) {
            this.renderTooltip();
        }

        // 9. Indicador de selección
        if (this.selectedNode) {
            this.renderSelectionIndicator();
        }
    }

    /**
     * Renderiza capa base (fondo oceánico)
     */
    renderBaseLayer(width, height) {
        this.ctx.fillStyle = this.config.baseColor;
        this.ctx.fillRect(0, 0, width, height);

        // Patrón decorativo sutil
        this.ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        this.ctx.lineWidth = 1;
        const gridSize = 50;

        for (let x = 0; x < width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
            this.ctx.stroke();
        }

        for (let y = 0; y < height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
        }
    }

    /**
     * Renderiza fronteras entre naciones adyacentes
     */
    renderBorders() {
        if (this.nodes.size < 2) return;

        this.ctx.strokeStyle = this.config.borderColor;
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);

        const nodeArray = Array.from(this.nodes.values());

        for (let i = 0; i < nodeArray.length; i++) {
            const next = nodeArray[(i + 1) % nodeArray.length];
            const curr = nodeArray[i];

            this.ctx.beginPath();
            this.ctx.moveTo(curr.x, curr.y);
            this.ctx.lineTo(next.x, next.y);
            this.ctx.stroke();
        }

        this.ctx.setLineDash([]);
    }

    /**
     * Renderiza nodos (naciones)
     */
    renderNodes() {
        for (const [id, node] of this.nodes.entries()) {
            const isPlayer = id === this.playerNationId;
            const isHovered = this.hoveredNode?.id === id;
            const isSelected = this.selectedNode?.id === id;

            // Determinar color según estado
            let fillColor = isPlayer ? '#3b82f6' : '#64748b';
            let strokeColor = '#ffffff';
            let radius = this.config.nodeRadius;

            if (isHovered) {
                radius = this.config.hoverRadius;
                strokeColor = '#fbbf24';
            }

            if (isSelected) {
                strokeColor = '#ef4444';
            }

            // Efecto de pulso para jugador
            if (isPlayer) {
                const pulse = Math.sin(this.pulsePhase) * 2;
                radius += pulse;
            }

            // Dibujar círculo exterior (borde)
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius + 2, 0, Math.PI * 2);
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // Dibujar círculo interior (relleno)
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            this.ctx.fillStyle = fillColor;
            this.ctx.fill();

            // Label
            this.ctx.fillStyle = this.config.textColor;
            this.ctx.font = 'bold 12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(node.name, node.x, node.y - radius - 8);
        }
    }

    /**
     * Renderiza relaciones diplomáticas
     */
    renderRelations() {
        const relations = this.state.diplomacy?.relations || {};

        // Renderizar TODAS las relaciones, no solo las del jugador
        // Usamos un Set para evitar duplicados (cada relación se almacena una vez con clave ordenada)
        const renderedPairs = new Set();

        for (const [relationKey, data] of Object.entries(relations)) {
            // La clave es "NATION1_NATION2" ordenada alfabéticamente
            const [nation1, nation2] = relationKey.split('_');

            // Evitar procesar la misma relación dos veces
            if (renderedPairs.has(relationKey)) continue;
            renderedPairs.add(relationKey);

            if (!this.nodes.has(nation1) || !this.nodes.has(nation2)) continue;

            const start = this.nodes.get(nation1);
            const end = this.nodes.get(nation2);

            // Color según valor de relación (escala -100 a 100)
            const relationValue = data.value ?? 0;
            let color;
            let statusLabel;

            if (relationValue >= 60) {
                color = '#10b981'; // Verde (aliado)
                statusLabel = 'Alianza';
            } else if (relationValue >= 20) {
                color = '#3b82f6'; // Azul (amistoso)
                statusLabel = 'Amistoso';
            } else if (relationValue >= -20) {
                color = '#fbbf24'; // Amarillo (neutral)
                statusLabel = 'Neutral';
            } else if (relationValue >= -60) {
                color = '#f97316'; // Naranja (tenso)
                statusLabel = 'Tenso';
            } else {
                color = '#ef4444'; // Rojo (hostil/guerra)
                statusLabel = 'Hostil';
            }

            // Grosor según intensidad de relación (más fuerte = más grueso)
            const lineWidth = 2 + Math.abs(relationValue) / 25;

            // Dibujar arco
            this.drawCurvedLine(start, end, color, lineWidth);

            // Label de estado en el punto medio
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2 - 25;

            // Fondo semi-transparente para el label
            const labelWidth = this.ctx.measureText(statusLabel).width + 8;
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            this.ctx.fillRect(midX - labelWidth / 2, midY - 12, labelWidth, 16);

            // Texto de estado
            this.ctx.fillStyle = color;
            this.ctx.font = 'bold 10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(statusLabel, midX, midY);

            // Valor numérico debajo
            const valueY = midY + 12;
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '9px Arial';
            this.ctx.fillText(`${Math.round(relationValue)}`, midX, valueY);
        }
    }

    /**
     * Renderiza red de espionaje
     */
    renderEspionage() {
        const espionage = this.state.espionage?.networks || {};

        for (const [sourceId, targets] of Object.entries(espionage)) {
            if (!this.nodes.has(sourceId)) continue;

            const start = this.nodes.get(sourceId);

            for (const [targetId, opData] of Object.entries(targets)) {
                if (!this.nodes.has(targetId)) continue;

                const end = this.nodes.get(targetId);

                // Color según tipo de operación
                let color = '#8b5cf6'; // Violeta por defecto
                let lineStyle = 'dotted';

                if (opData.type === 'active') {
                    color = '#ef4444';
                    lineStyle = 'dashed';
                } else if (opData.detected) {
                    color = '#fbbf24';
                }

                this.drawCurvedLine(start, end, color, 2, lineStyle);
            }
        }
    }

    /**
     * Renderiza flujos económicos
     */
    renderEconomy() {
        const trade = this.state.economy?.tradeRoutes || [];

        for (const route of trade) {
            if (!this.nodes.has(route.from) || !this.nodes.has(route.to)) continue;

            const start = this.nodes.get(route.from);
            const end = this.nodes.get(route.to);

            // Color según volumen
            const volume = route.volume || 0;
            const intensity = Math.min(volume / 1000, 1);
            const r = Math.round(255 * (1 - intensity));
            const g = Math.round(255 * intensity);
            const color = `rgb(${r}, ${g}, 100)`;

            this.drawCurvedLine(start, end, color, 3);

            // Animación de flujo
            const progress = (Date.now() / 1000) % 1;
            const flowX = start.x + (end.x - start.x) * progress;
            const flowY = start.y + (end.y - start.y) * progress - Math.sin(progress * Math.PI) * 30;

            this.ctx.beginPath();
            this.ctx.arc(flowX, flowY, 4, 0, Math.PI * 2);
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fill();
        }
    }

    /**
     * Renderiza overlay de crisis global
     */
    renderCrisisOverlay() {
        const crisisLevel = this.state.events?.global_crisis_phase || 0;

        if (crisisLevel <= 1) return;

        // Intensidad según nivel de crisis
        const intensity = Math.min(crisisLevel / 4, 1);
        const alpha = 0.1 + intensity * 0.3;

        // Overlay rojo parpadeante
        const pulse = Math.sin(this.pulsePhase * 2) * 0.1 + 0.2;

        this.ctx.fillStyle = `rgba(239, 68, 68, ${alpha + pulse})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Borde de alerta
        this.ctx.strokeStyle = `rgba(239, 68, 68, ${0.5 + intensity * 0.5})`;
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(10, 10, this.canvas.width - 20, this.canvas.height - 20);

        // Texto de alerta
        this.ctx.fillStyle = '#ef4444';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`⚠️ CRISIS NIVEL ${crisisLevel}`, this.canvas.width / 2, 50);
    }

    /**
     * Renderiza tooltip flotante
     */
    renderTooltip() {
        const padding = 10;
        const lineHeight = 18;
        const lines = this.tooltip.content.split('<br>');

        // Calcular ancho máximo
        this.ctx.font = '12px Arial';
        let maxWidth = 0;
        for (const line of lines) {
            const text = line.replace(/<[^>]*>/g, '');
            const width = this.ctx.measureText(text).width;
            maxWidth = Math.max(maxWidth, width);
        }

        const width = maxWidth + padding * 2;
        const height = lines.length * lineHeight + padding * 2;

        // Ajustar posición si se sale del canvas
        let x = this.tooltip.x;
        let y = this.tooltip.y;

        if (x + width > this.canvas.width) {
            x = this.canvas.width - width - 10;
        }
        if (y + height > this.canvas.height) {
            y = this.canvas.height - height - 10;
        }

        // Fondo
        this.ctx.fillStyle = 'rgba(26, 26, 46, 0.95)';
        this.ctx.strokeStyle = '#e94560';
        this.ctx.lineWidth = 2;
        this.ctx.fillRect(x, y, width, height);
        this.ctx.strokeRect(x, y, width, height);

        // Texto
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'left';

        let textY = y + padding + 14;
        for (const line of lines) {
            const text = line.replace(/<[^>]*>/g, '');
            const isBold = line.includes('<strong>');

            if (isBold) {
                this.ctx.font = 'bold 12px Arial';
            } else {
                this.ctx.font = '12px Arial';
            }

            this.ctx.fillText(text, x + padding, textY);
            textY += lineHeight;
        }
    }

    /**
     * Renderiza indicador de nodo seleccionado
     */
    renderSelectionIndicator() {
        const node = this.nodes.get(this.selectedNode);
        if (!node) return;

        const outerRadius = this.config.hoverRadius + 8;
        const innerRadius = this.config.hoverRadius + 4;

        // Anillo giratorio
        const rotation = this.pulsePhase;

        this.ctx.strokeStyle = '#ef4444';
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([10, 5]);

        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, outerRadius, rotation, rotation + Math.PI);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, outerRadius, rotation + Math.PI, rotation + Math.PI * 2);
        this.ctx.strokeStyle = '#fbbf24';
        this.ctx.stroke();

        this.ctx.setLineDash([]);
    }

    /**
     * Dibuja línea curva entre dos puntos
     */
    drawCurvedLine(start, end, color, lineWidth, lineStyle = 'solid') {
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);

        // Punto de control para curva Bezier
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
     * Setter para callback de selección de nodo
     */
    set onNodeSelect(callback) {
        this._onNodeSelect = callback;
    }

    /**
     * Getter para callback de selección de nodo
     */
    get onNodeSelect() {
        return this._onNodeSelect;
    }
}
export default MapRenderer;