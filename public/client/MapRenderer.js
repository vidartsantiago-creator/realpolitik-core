/**
 * MapRenderer.js - Motor de Renderizado Geopolítico con Mapa SVG Real
 * @description Convierte el estado del juego en representación visual en canvas usando mapa SVG real.
 *              Implementa capas de renderizado, conversión geo->píxeles, y detección de interacción.
 *              FASE 3: Carga de SVG real, coloreado dinámico por país, efectos glow/pulse
 * @version 3.0.0
 * @module MapRenderer
 * @changes
 *   - Carga y parseo de SVG del mapa mundial real (/assets/maps/world-map.svg)
 *   - Extracción de paths de cada país como Path2D objects
 *   - Mapeo de coordenadas SVG→Canvas manteniendo proyección original
 *   - Coloreado dinámico según estado diplomático (player, ally, hostile, neutral)
 *   - Efectos glow/pulse sobre países activos
 *   - Interactividad click/hover por país real
 * @preserves
 *   - Constructor(canvasElement) firma intacta
 *   - Método update(state, playerNationId) intacto
 *   - Sistema de capas toggleable
 *   - Handlers de interacción
 *   - Tooltips y selección
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

        // ✅ NUEVO: Paleta de colores tema hi-tech console (definido ANTES de loadSVGMap)
        this.themeColors = {
            // Fondos
            background: {
                primary: '#0a0a0a',
                secondary: '#1a1a1a',
                tertiary: '#252525'
            },
            // Texto
            text: {
                primary: '#d0d0d0',
                secondary: '#a0a0a0',
                muted: '#707070'
            },
            // Estados Nacionales
            nations: {
                player: '#00ff00',      // Verde neon
                ally: '#00aaff',        // Azul cian
                neutral: '#888888',     // Gris
                hostile: '#ff3333',     // Rojo
                unknown: '#ff9900'      // Naranja
            },
            // Eventos & Alertas
            events: {
                crisis: '#ff0000',
                warning: '#ffaa00',
                success: '#00ff00',
                info: '#00aaff'
            },
            // Acentos
            accent: {
                primary: '#00ff00',
                secondary: '#00aaff',
                warning: '#ff6600'
            }
        };

        // Configuración mejorada (definida ANTES de loadSVGMap)
        this.config = {
            baseColor: this.themeColors.background.primary,
            gridColor: 'rgba(100, 100, 100, 0.1)',
            borderColor: this.themeColors.text.muted,
            textColor: this.themeColors.text.primary,
            nodeRadius: 14,
            hoverRadius: 18,
            selectedRadius: 20,
            animationSpeed: 0.08,
            glowIntensity: 0.6,
            pulseAmplitude: 3,
            svgPath: '/assets/maps/world-map.svg'
        };

        // Inicializar propiedades
        this.countryPaths = new Map();
        this.countryBounds = new Map();
        this.svgViewBox = { x: 0, y: 0, width: 0, height: 0 };
        this.transform = { scale: 1, offsetX: 0, offsetY: 0 };

        // Cargar SVG UNA SOLA VEZ
        this.mapLoaded = false;
        this.loadSVGMap();  // ← Solo aquí, NO en update()

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

        // ✅ NUEVO: Datos geográficos desde SVG
        this.countryPaths = new Map(); // id -> Path2D
        this.countryBounds = new Map(); // id -> {minX, minY, maxX, maxY}
        this.svgViewBox = { x: 0, y: 0, width: 1009.67, height: 665.96 }; // Default viewBox del SVG
        this.scaleFactor = 1;
        this.offsetX = 0;
        this.offsetY = 0;

        // Interacción
        this.hoveredCountry = null;
        this.selectedCountry = null;
        this.tooltip = { visible: false, x: 0, y: 0, content: '' };

        // Animaciones
        this.pulsePhase = 0;
        this.dirtyRects = [];

        // ✅ NUEVO: Cache de renderizado para performance
        this.renderCache = {
            countries: new Map(),
            lastUpdate: 0
        };

        // Inicialización
        this.resize();
        this.setupInteraction();
        window.addEventListener('resize', () => this.resize());

        // Loop de animación
        this.animate();
    }

    /**
     * Carga y parsea el SVG del mapa mundial
     * @returns {Promise<Map>} Mapa de countryId -> Path2D
     */
    async loadSVGMap() {
        try {
            const response = await fetch(this.config.svgPath);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const svgText = await response.text();
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');

            // Extraer viewBox del SVG (soportar namespaces como ns1:geoViewBox)
            const svgElement = svgDoc.querySelector('svg');
            if (svgElement) {
                // Intentar obtener viewBox de diferentes atributos
                let viewBox = svgElement.getAttribute('viewBox');

                // Si no hay viewBox estándar, usar ns1:geoViewBox y convertirlo
                if (!viewBox) {
                    const geoViewBox = svgElement.getAttribute('ns1:geoViewBox');
                    if (geoViewBox) {
                        // geoViewBox formato: "minLon minLat maxLon maxLat"
                        const [minLon, minLat, maxLon, maxLat] = geoViewBox.split(/\s+/).map(Number);
                        // Convertir coordenadas geográficas a coordenadas SVG usando width/height
                        const svgWidth = svgElement.getAttribute('width') || 1009.67;
                        const svgHeight = svgElement.getAttribute('height') || 665.96;

                        // Calcular viewBox en coordenadas SVG
                        const x = minLon;
                        const y = maxLat; // Invertir porque latitud va de norte a sur
                        const width = maxLon - minLon;
                        const height = minLat - maxLat; // Invertir

                        viewBox = `${x} ${y} ${width} ${height}`;
                        console.log(`[MapRenderer] geoViewBox convertido: ${viewBox}`);
                    }
                }

                if (viewBox) {
                    const [x, y, w, h] = viewBox.split(/\s+/).map(Number);
                    this.svgViewBox = {
                        x: x || 0,
                        y: y || 0,
                        width: Math.abs(w) || 1009.67,
                        height: Math.abs(h) || 665.96
                    };
                    console.log(`[MapRenderer] viewBox establecido: ${JSON.stringify(this.svgViewBox)}`);
                }

                // Extraer dimensiones del SVG si están disponibles
                const attrWidth = svgElement.getAttribute('width');
                const attrHeight = svgElement.getAttribute('height');
                if (attrWidth && attrHeight) {
                    // Usar las dimensiones del SVG como referencia
                    this.svgViewBox.width = parseFloat(attrWidth);
                    this.svgViewBox.height = parseFloat(attrHeight);
                }
            }

            // Extraer todos los paths con ID (soportar namespaces como ns0:path)
            const pathElements = svgDoc.querySelectorAll('[id]');
            const countryPaths = Array.from(pathElements).filter(el =>
                el.tagName.toLowerCase().includes('path') ||
                el.tagName.toLowerCase().includes('polygon')
            );

            console.log(`[MapRenderer] SVG cargado: ${countryPaths.length} países encontrados`);

            countryPaths.forEach(path => {
                const id = path.getAttribute('id');
                const d = path.getAttribute('d');
                const title = path.getAttribute('title') || id;

                if (id && d) {
                    const path2D = new Path2D(d);
                    this.countryPaths.set(id, path2D);

                    // Calcular bounds aproximados
                    const bounds = this.calculatePathBounds(d);
                    if (bounds) {
                        this.countryBounds.set(id, bounds);
                    }
                }
            });

            console.log(`[MapRenderer] ${this.countryPaths.size} países procesados`);

            // Recalcular transformación si hay estado
            if (this.state) {
                this.calculateTransform();
                this.render();
            }

            this.mapLoaded = true;
            console.log('[MapRenderer] Mapa cargado exitosamente');

            return this.countryPaths;
        } catch (error) {
            console.error('[MapRenderer] Error cargando SVG:', error);
            throw error;
        }
    }

    /**
     * Calcula los bounds de un path SVG
     * @param {string} d - Path data string
     * @returns {{minX: number, minY: number, maxX: number, maxY: number}|null}
     */
    calculatePathBounds(d) {
        if (!d) return null;

        // Parsear comandos del path para encontrar coordenadas
        const coords = [];
        const regex = /([MLQCZ])([^MLQCZ]*)/gi;
        let match;

        while ((match = regex.exec(d)) !== null) {
            const command = match[1].toUpperCase();
            const params = match[2].trim().split(/[\s,]+/).map(Number);

            if (command === 'M' || command === 'L' || command === 'Q' || command === 'C') {
                for (let i = 0; i < params.length; i += 2) {
                    if (!isNaN(params[i]) && !isNaN(params[i + 1])) {
                        coords.push({ x: params[i], y: params[i + 1] });
                    }
                }
            }
        }

        if (coords.length === 0) return null;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        coords.forEach(coord => {
            minX = Math.min(minX, coord.x);
            minY = Math.min(minY, coord.y);
            maxX = Math.max(maxX, coord.x);
            maxY = Math.max(maxY, coord.y);
        });

        return { minX, minY, maxX, maxY };
    }

    /**
     * Calcula factor de escala y offset para ajustar SVG al canvas
     */
    calculateTransform() {
        if (this.svgViewBox.width === 0 || this.canvas.width === 0) {
            return;
        }

        const scaleX = this.canvas.width / this.svgViewBox.width;
        const scaleY = this.canvas.height / this.svgViewBox.height;

        // Mantener aspect ratio
        this.transform.scale = Math.min(scaleX, scaleY);

        // Centrar el mapa
        const scaledWidth = this.svgViewBox.width * this.transform.scale;
        const scaledHeight = this.svgViewBox.height * this.transform.scale;

        this.transform.offsetX = (this.canvas.width - scaledWidth) / 2;
        this.transform.offsetY = (this.canvas.height - scaledHeight) / 2;
    }

    /**
     * Transforma coordenadas SVG a coordenadas Canvas
     * @param {number} svgX - Coordenada X en SVG
     * @param {number} svgY - Coordenada Y en SVG
     * @returns {{x: number, y: number}}
     */
    svgToCanvas(svgX, svgY) {
        return {
            x: (svgX - this.svgViewBox.x) * this.transform.scale + this.transform.offsetX,
            y: (svgY - this.svgViewBox.y) * this.transform.scale + this.transform.offsetY
        };
    }

    /**
     * Transforma coordenadas Canvas a coordenadas SVG
     * @param {number} canvasX - Coordenada X en Canvas
     * @param {number} canvasY - Coordenada Y en Canvas
     * @returns {{x: number, y: number}}
     */
    canvasToSvg(canvasX, canvasY) {
        return {
            x: (canvasX - this.offsetX) / this.scaleFactor,
            y: (canvasY - this.offsetY) / this.scaleFactor
        };
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
     * Maneja evento de movimiento del mouse - Detecta país bajo el cursor
     */
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // ✅ NUEVO: Detectar país bajo el cursor usando Path2D
        let foundCountry = null;

        // Convertir coordenadas del canvas a SVG
        const svgCoords = this.canvasToSvg(mouseX, mouseY);

        for (const [id, path] of this.countryPaths.entries()) {
            // Crear un contexto temporal para verificar si el punto está en el path
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.svgViewBox.width;
            tempCanvas.height = this.svgViewBox.height;
            const tempCtx = tempCanvas.getContext('2d');

            if (tempCtx.isPointInPath(path, svgCoords.x, svgCoords.y)) {
                const nation = this.state?.nations?.[id];
                foundCountry = {
                    id,
                    name: nation?.name || id,
                    nationId: id
                };
                break;
            }
        }

        if (foundCountry?.id !== this.hoveredCountry?.id) {
            this.hoveredCountry = foundCountry;
            this.canvas.style.cursor = foundCountry ? 'pointer' : 'default';
            this.render();
        }

        // Actualizar tooltip
        if (this.hoveredCountry) {
            this.tooltip.visible = true;
            this.tooltip.x = mouseX + 15;
            this.tooltip.y = mouseY - 10;
            this.tooltip.content = this.getTooltipContent(this.hoveredCountry);
        } else {
            this.tooltip.visible = false;
        }
    }

    /**
     * Maneja click en el mapa - Selecciona país
     */
    handleClick(e) {
        if (this.hoveredCountry) {
            this.selectedCountry = this.hoveredCountry.id === this.selectedCountry?.id ? null : this.hoveredCountry;
            this.onNodeSelect?.(this.selectedCountry);
            this.render();
        }
        if (this.onCountrySelect && this.selectedCountry) {
            this.onCountrySelect(this.selectedCountry);
        }
    }

    /**
     * Maneja salida del mouse del canvas
     */
    handleMouseLeave() {
        this.hoveredCountry = null;
        this.tooltip.visible = false;
        this.render();
    }

    /**
     * Obtiene contenido del tooltip para un país
     */
    getTooltipContent(country) {
        if (!this.state?.nations?.[country.nationId]) return country.name;

        const nation = this.state.nations[country.nationId];
        const stability = nation.internal?.stability ?? 0;
        const gdp = nation.economy?.gdp ?? 0;
        const status = this.getNationStatus(country.nationId);

        return `
            <strong>${nation.name}</strong><br>
            Estado: ${status}<br>
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

        // Recalcular transformación para el SVG
        this.calculateTransform();

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
     * @param {Object} state - Estado del juego
     * @param {string} playerNationId - ID de la nación del jugador
     */
    update(state, playerNationId) {
        this.state = state;
        this.playerNationId = playerNationId;

        // CRÍTICO: Si el mapa no cargó, NO limpiar ni dibujar nada.
        // Esto evita el flash blanco mientras carga el SVG.
        if (!this.mapLoaded || !this.countryPaths.size) {
            return;
        }

        // Solo limpiar y dibujar si estamos seguros de tener los datos
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.render();
    }

    /**
     * Obtiene el estado diplomático de una nación
     * @param {string} nationId - ID de la nación
     * @returns {string} 'player' | 'ally' | 'hostile' | 'neutral' | 'unknown'
     */
    getNationStatus(nationId) {
        if (!this.state?.nations?.[nationId]) return 'unknown';

        if (nationId === this.playerNationId) return 'player';

        // Verificar relaciones diplomáticas
        const relations = this.state.diplomacy?.relations;
        if (relations) {
            const relationKey = `${this.playerNationId}-${nationId}`;
            const reverseKey = `${nationId}-${this.playerNationId}`;
            const relation = relations[relationKey] || relations[reverseKey];

            if (relation?.value > 50) return 'ally';
            if (relation?.value < -50) return 'hostile';
        }

        return 'neutral';
    }

    /**
     * Obtiene el color de una nación según su estado diplomático
     * @param {string} nationId - ID de la nación
     * @param {Object} nation - Datos de la nación
     * @returns {string} Color en formato hexadecimal
     */
    getNationColor(nationId, nation) {
        const status = this.getNationStatus(nationId);

        switch (status) {
            case 'player':
                return this.themeColors.nations.player;
            case 'ally':
                return this.themeColors.nations.ally;
            case 'hostile':
                return this.themeColors.nations.hostile;
            case 'neutral':
                return this.themeColors.nations.neutral;
            default:
                return this.themeColors.nations.unknown;
        }
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

        // 1. Capa base (fondo con SVG real)
        this.renderBaseLayer(width, height);

        // 2. ✅ NUEVO: Capa de países desde SVG (reemplaza nodos abstractos)
        if (this.layers.nodes) {
            this.renderCountries();
        }

        // 3. Capa de fronteras (si está activa) - ahora dibuja bordes entre países
        if (this.layers.borders) {
            this.renderBorders();
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
        if (this.selectedCountry) {
            this.renderSelectionIndicator();
        }
    }

    /**
     * Renderiza capa base (fondo)
     */
    renderBaseLayer(width, height) {
        // Fondo principal
        this.ctx.fillStyle = this.themeColors.background.primary;
        this.ctx.fillRect(0, 0, width, height);

        // ✅ NUEVO: Grid técnico sutil (efecto consola)
        this.ctx.strokeStyle = this.config.gridColor;
        this.ctx.lineWidth = 1;
        const gridSize = 60;

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

        // ✅ NOTA: Ya no dibujamos contornos simplificados porque usamos el SVG real
    }

    /**
     * ✅ NUEVO: Renderiza todos los países desde el SVG con colores dinámicos
     */
    renderCountries() {
        if (this.countryPaths.size === 0) return;

        // Dibujar cada país
        for (const [nationId, path] of this.countryPaths.entries()) {
            const nation = this.state?.nations?.[nationId];

            // Determinar color según estado diplomático
            let fillColor = this.themeColors.nations.neutral;
            let strokeColor = this.themeColors.text.muted;
            let lineWidth = 0.5;

            if (nation) {
                fillColor = this.getNationColor(nationId, nation);
                strokeColor = this.themeColors.text.secondary;
                lineWidth = 1;
            }

            // Aplicar transformación y dibujar
            this.ctx.save();
            this.ctx.translate(this.offsetX, this.offsetY);
            this.ctx.scale(this.scaleFactor, this.scaleFactor);

            // Relleno del país
            this.ctx.fillStyle = fillColor;
            this.ctx.fill(path);

            // Borde del país
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = lineWidth;
            this.ctx.stroke(path);

            this.ctx.restore();
        }

        // ✅ Efectos especiales para países activos
        this.renderCountryEffects();
    }

    /**
     * Verifica que los bounds contengan valores numéricos finitos
     * @param {Object} bounds - Objeto con minX, minY, maxX, maxY
     * @returns {boolean}
     * @private
     */
    isFiniteBounds(bounds) {
        return bounds &&
            typeof bounds.minX === 'number' && isFinite(bounds.minX) &&
            typeof bounds.minY === 'number' && isFinite(bounds.minY) &&
            typeof bounds.maxX === 'number' && isFinite(bounds.maxX) &&
            typeof bounds.maxY === 'number' && isFinite(bounds.maxY);
    }

    /**
     * Renderiza efectos visuales sobre países (glow, pulse, selección)
     * @private
     */
    renderCountryEffects() {
        if (!this.ctx || !this.state) return;
        
        const currentTime = Date.now();
        
        
        
        // 2. Efecto pulse para naciones en crisis
        if (this.state.crisis && this.state.crisis.active && this.state.crisis.affected_nations) {
            this.state.crisis.affected_nations.forEach(nationId => {
                const bounds = this.countryBounds.get(nationId);
                if (bounds && this.isFiniteBounds(bounds)) {
                    const centerX = (bounds.minX + bounds.maxX) / 2;
                    const centerY = (bounds.minY + bounds.maxY) / 2;
                    const radius = Math.max(
                        bounds.maxX - bounds.minX,
                        bounds.maxY - bounds.minY
                    ) / 2;
                    
                    const pulse = Math.sin(currentTime * 0.005) * 0.4 + 0.6;
                    this.drawGlowEffect(
                        centerX,
                        centerY,
                        radius * 1.8,
                        this.themeColors.events.crisis,
                        pulse
                    );
                }
            });
        }
        
        
        
        
    }

    /**
     * ✅ NUEVO: Dibuja efecto glow alrededor de un path
     * @param {Path2D} path - Path del país
     * @param {string} color - Color del glow
     * @param {number} blur - Intensidad del blur
     */
    drawGlowEffect(path, color, blur = 15) {
        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scaleFactor, this.scaleFactor);

        // Glow exterior
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 3;
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = blur;
        this.ctx.globalAlpha = 0.7;
        this.ctx.stroke(path);

        // Glow interior más suave
        this.ctx.lineWidth = 1;
        this.ctx.shadowBlur = blur / 2;
        this.ctx.globalAlpha = 0.4;
        this.ctx.stroke(path);

        this.ctx.restore();
    }

    /**
     * Renderiza fronteras entre países adyacentes
     */
    renderBorders() {
        // ✅ NUEVO: Dibujar bordes de todos los países
        if (this.countryPaths.size === 0) return;

        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scaleFactor, this.scaleFactor);

        this.ctx.strokeStyle = this.themeColors.text.muted;
        this.ctx.lineWidth = 0.5;
        this.ctx.globalAlpha = 0.5;

        for (const path of this.countryPaths.values()) {
            this.ctx.stroke(path);
        }

        this.ctx.restore();
    }

    /**
     * ✅ NUEVO: Renderiza nodos (naciones) como fallback si no hay SVG
     * @deprecated - Usar renderCountries() en su lugar
     */
    renderNodes() {
        // Fallback para cuando el SVG no está disponible
        if (this.countryPaths.size > 0) {
            return; // Usar renderCountries() en su lugar
        }

        for (const [id, node] of this.nodes.entries()) {
            const nation = this.state?.nations?.[id];
            const isPlayer = id === this.playerNationId;
            const isHovered = this.hoveredCountry?.id === id;
            const isSelected = this.selectedCountry?.id === id;

            // Determinar color según relación con jugador
            let nationColor = this.getNationColor(id, nation);
            let strokeColor = this.themeColors.text.secondary;
            let radius = this.config.nodeRadius;
            let glowEnabled = false;

            if (isHovered) {
                radius = this.config.hoverRadius;
                strokeColor = this.themeColors.accent.warning;
                glowEnabled = true;
            }

            if (isSelected) {
                radius = this.config.selectedRadius;
                strokeColor = this.themeColors.events.crisis;
                glowEnabled = true;
            }

            // Efecto de pulso mejorado para jugador y naciones en crisis
            if (isPlayer || nation?.affected_by_crisis) {
                const pulse = Math.sin(this.pulsePhase) * this.config.pulseAmplitude;
                radius += Math.abs(pulse);
                glowEnabled = true;
            }

            // Efecto glow alrededor del nodo
            if (glowEnabled && this.config.glowIntensity > 0) {
                this.drawGlowEffect(node.x, node.y, radius + 8, nationColor, 0.4);
            }

            // Dibujar círculo exterior (borde con glow si está activo)
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius + 2, 0, Math.PI * 2);
            this.ctx.strokeStyle = strokeColor;
            this.ctx.lineWidth = glowEnabled ? 3 : 2;
            if (glowEnabled) {
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = strokeColor;
            }
            this.ctx.stroke();
            this.ctx.shadowBlur = 0;

            // Dibujar círculo interior (relleno)
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            this.ctx.fillStyle = nationColor;
            this.ctx.fill();

            // Indicador de crisis (anillo rojo parpadeante)
            if (nation?.affected_by_crisis) {
                const crisisPulse = (Math.sin(this.pulsePhase * 2) + 1) / 2;
                this.ctx.beginPath();
                this.ctx.arc(node.x, node.y, radius + 5, 0, Math.PI * 2);
                this.ctx.strokeStyle = `rgba(255, 0, 0, ${0.3 + crisisPulse * 0.5})`;
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            }

            // Label con tipografía monospace
            this.ctx.fillStyle = this.themeColors.text.primary;
            this.ctx.font = 'bold 11px "Courier New", monospace';
            this.ctx.textAlign = 'center';
            this.ctx.shadowBlur = 4;
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            this.ctx.fillText(node.name, node.x, node.y - radius - 10);
            this.ctx.shadowBlur = 0;
        }
    }

    /**
     * Obtiene color de nación según estado diplomático
     * @param {string} nationId - ID de la nación
     * @param {Object} nation - Datos de la nación
     * @returns {string} Color hexadecimal
     */
    getNationColor(nationId, nation) {
        if (!nation) return this.themeColors.nations.unknown;

        if (nationId === this.playerNationId) {
            return this.themeColors.nations.player;
        }

        // Verificar relaciones diplomáticas
        const relations = this.state?.diplomacy?.relations || {};

        for (const [key, data] of Object.entries(relations)) {
            const [n1, n2] = key.split('_');
            if ((n1 === this.playerNationId && n2 === nationId) ||
                (n2 === this.playerNationId && n1 === nationId)) {
                const value = data.value ?? 0;
                if (value >= 60) return this.themeColors.nations.ally;
                if (value <= -60) return this.themeColors.nations.hostile;
            }
        }

        return this.themeColors.nations.neutral;
    }

    /**
     * Dibuja efecto glow alrededor de un elemento
     * @param {number} x - Centro X
     * @param {number} y - Centro Y
     * @param {number} radius - Radio del glow
     * @param {string} color - Color del glow
     * @param {number} intensity - Intensidad (0-1)
     */
    drawGlowEffect(x, y, radius, color, intensity = 0.5) {
        // Validar que todos los valores sean finitos
        if (!isFinite(x) || !isFinite(y) || !isFinite(radius) || radius <= 0) {
            return;
        }

        // Clamp intensity entre 0 y 1
        intensity = Math.max(0, Math.min(1, intensity));
        const gradient = this.ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius);
        gradient.addColorStop(0, `${color}${Math.floor(intensity * 255).toString(16).padStart(2, '0')}`);
        gradient.addColorStop(1, 'transparent');

        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
    }

    /**
     * Renderiza relaciones diplomáticas con animación de flujo
     */
    renderRelations() {
        const relations = this.state.diplomacy?.relations || {};

        // Renderizar TODAS las relaciones, no solo las del jugador
        const renderedPairs = new Set();

        for (const [relationKey, data] of Object.entries(relations)) {
            const [nation1, nation2] = relationKey.split('_');

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
                color = this.themeColors.nations.ally;
                statusLabel = 'Alianza';
            } else if (relationValue >= 20) {
                color = this.themeColors.accent.secondary;
                statusLabel = 'Amistoso';
            } else if (relationValue >= -20) {
                color = this.themeColors.nations.neutral;
                statusLabel = 'Neutral';
            } else if (relationValue >= -60) {
                color = this.themeColors.accent.warning;
                statusLabel = 'Tenso';
            } else {
                color = this.themeColors.nations.hostile;
                statusLabel = 'Hostil';
            }

            // Grosor según intensidad de relación
            const lineWidth = 2 + Math.abs(relationValue) / 25;

            // ✅ NUEVO: Dibujar línea curva con efecto glow para relaciones fuertes
            this.drawAnimatedRelationLine(start, end, color, lineWidth, relationValue);

            // Label de estado en el punto medio
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2 - 25;

            // Fondo semi-transparente para el label
            this.ctx.fillStyle = 'rgba(10, 10, 10, 0.85)';
            const labelWidth = this.ctx.measureText(statusLabel).width + 10;
            this.ctx.fillRect(midX - labelWidth / 2, midY - 12, labelWidth, 18);

            // Borde del label
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(midX - labelWidth / 2, midY - 12, labelWidth, 18);

            // Texto de estado
            this.ctx.fillStyle = color;
            this.ctx.font = 'bold 10px "Courier New", monospace';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(statusLabel, midX, midY);

            // Valor numérico debajo
            const valueY = midY + 14;
            this.ctx.fillStyle = this.themeColors.text.secondary;
            this.ctx.font = '9px "Courier New", monospace';
            this.ctx.fillText(`${Math.round(relationValue)}`, midX, valueY);
        }
    }

    /**
     * Dibuja línea de relación con animación de flujo
     * @param {Object} start - Nodo inicial
     * @param {Object} end - Nodo final
     * @param {string} color - Color de la línea
     * @param {number} lineWidth - Grosor de línea
     * @param {number} relationValue - Valor de relación para dirección de flechas
     */
    drawAnimatedRelationLine(start, end, color, lineWidth, relationValue) {
        // Línea base
        this.drawCurvedLine(start, end, color, lineWidth);

        // ✅ NUEVO: Animación de partículas fluyendo
        const time = Date.now() / 1000;
        const flowSpeed = 0.5;
        const particleCount = 3;

        for (let i = 0; i < particleCount; i++) {
            const progress = ((time * flowSpeed + i / particleCount) % 1);
            const t = progress;

            // Calcular posición en la curva Bezier
            const cpX = (start.x + end.x) / 2;
            const cpY = (start.y + end.y) / 2 - 40;

            // Interpolación cuadrática de Bezier
            const x = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * cpX + t * t * end.x;
            const y = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * cpY + t * t * end.y;

            // Dibujar partícula
            this.ctx.beginPath();
            this.ctx.arc(x, y, 3, 0, Math.PI * 2);
            this.ctx.fillStyle = color;
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = color;
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }

        // ✅ NUEVO: Flechas direccionales según signo de relación
        const arrowCount = Math.floor(Math.abs(relationValue) / 20);
        if (arrowCount > 0) {
            const direction = relationValue > 0 ? 1 : -1;
            for (let i = 0; i < Math.min(arrowCount, 5); i++) {
                const arrowProgress = 0.3 + (i / 5) * 0.4;
                this.drawArrowOnCurve(start, end, arrowProgress, color, direction);
            }
        }
    }

    /**
     * Dibuja flecha en un punto de la curva
     */
    drawArrowOnCurve(start, end, progress, color, direction) {
        const cpX = (start.x + end.x) / 2;
        const cpY = (start.y + end.y) / 2 - 40;
        const t = progress;

        // Posición en la curva
        const x = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * cpX + t * t * end.x;
        const y = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * cpY + t * t * end.y;

        // Tangente para rotación
        const tx = 2 * (1 - t) * (cpX - start.x) + 2 * t * (end.x - cpX);
        const ty = 2 * (1 - t) * (cpY - start.y) + 2 * t * (end.y - cpY);
        const angle = Math.atan2(ty, tx) * direction;

        // Dibujar flecha
        const arrowSize = 6;
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(angle);

        this.ctx.beginPath();
        this.ctx.moveTo(arrowSize, 0);
        this.ctx.lineTo(-arrowSize / 2, arrowSize / 2);
        this.ctx.lineTo(-arrowSize / 2, -arrowSize / 2);
        this.ctx.closePath();
        this.ctx.fillStyle = color;
        this.ctx.fill();

        this.ctx.restore();
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
        this.ctx.font = '12px "Courier New", monospace';
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

        // Fondo con tema hi-tech
        this.ctx.fillStyle = 'rgba(26, 26, 26, 0.95)';
        this.ctx.strokeStyle = this.themeColors.accent.primary;
        this.ctx.lineWidth = 2;
        this.ctx.fillRect(x, y, width, height);
        this.ctx.strokeRect(x, y, width, height);

        // Texto
        this.ctx.fillStyle = this.themeColors.text.primary;
        this.ctx.font = '12px "Courier New", monospace';
        this.ctx.textAlign = 'left';

        let textY = y + padding + 14;
        for (const line of lines) {
            const text = line.replace(/<[^>]*>/g, '');
            const isBold = line.includes('<strong>');

            if (isBold) {
                this.ctx.font = 'bold 12px "Courier New", monospace';
            } else {
                this.ctx.font = '12px "Courier New", monospace';
            }

            this.ctx.fillText(text, x + padding, textY);
            textY += lineHeight;
        }
    }

    /**
     * ✅ NUEVO: Renderiza indicador de país seleccionado
     */
    renderSelectionIndicator() {
        if (!this.selectedCountry?.id) return;

        const path = this.countryPaths.get(this.selectedCountry.id);
        if (!path) return;

        // Anillo giratorio alrededor del país
        const rotation = this.pulsePhase;

        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scaleFactor, this.scaleFactor);

        this.ctx.strokeStyle = this.themeColors.accent.warning;
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([10, 5]);
        this.ctx.shadowColor = this.themeColors.accent.warning;
        this.ctx.shadowBlur = 10;

        // Dibujar contorno animado
        this.ctx.globalAlpha = 0.8;
        this.ctx.stroke(path);

        this.ctx.restore();
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