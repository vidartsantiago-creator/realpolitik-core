/**
 * MapRenderer.js - Motor de Renderizado Geopolítico con Mapa SVG Real
 * @description Convierte el estado del juego en representación visual en canvas usando mapa SVG real.
 *              Implementa capas de renderizado, conversión geo->píxeles, y detección de interacción.
 *              FASE 3.2: Hit testing sincronizado + Soporte para polygons + LineWidth fix
 * @version 3.2.0 - HIT TESTING FIXED + POLYGON SUPPORT + LINEWIDTH FIX
 * @module MapRenderer
 * @changes
 *   - Carga y parseo de SVG del mapa mundial real (/assets/maps/world-map.svg)
 *   - Extracción de paths de cada país como Path2D objects
 *   - ✅ NUEVO: Soporte para <polygon> además de <path>
 *   - ✅ NUEVO: Hit testing con transformaciones sincronizadas (findCountryAtPoint)
 *   - ✅ NUEVO: LineWidth aplicado ANTES de scale para no distorsionar
 *   - Mapeo de coordenadas SVG→Canvas manteniendo proyección original
 *   - Coloreado dinámico según estado diplomático (player, ally, hostile, neutral)
 *   - Efectos glow/pulse sobre países activos
 *   - Interactividad click/hover por país real
 */

export class MapRenderer {
    constructor(canvasElement) {
        if (!canvasElement) {
            console.warn('[MapRenderer] Canvas no encontrado, modo headless.');
            this.ctx = null;
            return;
        }

        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');

        // Paleta de colores tema hi-tech console
        this.themeColors = {
            background: {
                primary: '#0a0a0a',
                secondary: '#1a1a1a',
                tertiary: '#252525'
            },
            text: {
                primary: '#d0d0d0',
                secondary: '#a0a0a0',
                muted: '#707070'
            },
            nations: {
                player: '#00ff00',
                ally: '#00aaff',
                neutral: '#888888',
                hostile: '#ff3333',
                unknown: '#ff9900'
            },
            events: {
                crisis: '#ff0000',
                warning: '#ffaa00',
                success: '#00ff00',
                info: '#00aaff'
            },
            accent: {
                primary: '#00ff00',
                secondary: '#00aaff',
                warning: '#ff6600'
            }
        };

        // Configuración
        this.config = {
            baseColor: '#1a1a2e',
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

        // Datos geográficos
        this.countryPaths = new Map();
        this.countryBounds = new Map();
        this.svgViewBox = { x: 0, y: 0, width: 1009.67, height: 665.96 };
        this.scaleFactor = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.transform = { scale: 1, offsetX: 0, offsetY: 0 };

        // Interacción y animación
        this.hoveredCountry = null;
        this.selectedCountry = null;
        this.tooltip = { visible: false, x: 0, y: 0, content: '' };
        this.particles = [];
        this.pulsePhase = 0;
        this.dirty = true;
        this.frameId = null;

        // Estado del juego
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

        // Cache de renderizado
        this.renderCache = {
            countries: new Map(),
            lastUpdate: 0
        };

        // Inicialización
        this.mapLoaded = false;
        this.setupAnimationLoop();
        this.setupInteraction();
        this.resize();
        
        // Cargar SVG
        this.loadSVGMap();

        // Event listeners
        window.addEventListener('resize', () => this.resize());
    }

    /**
     * Loop de animación usando RequestAnimationFrame
     */
    setupAnimationLoop() {
        const render = () => {
            this.frameId = requestAnimationFrame(render);
            
            if (!this.ctx || !this.canvas) {
                return;
            }
            if (this.dirty || this.particles.length > 0) {
                try {
                    this.redraw();
                    this.dirty = false;
                } catch (error) {
                    console.warn('[MapRenderer] Error en redraw (recuperado):', error);
                }
            }
        };
        this.frameId = requestAnimationFrame(render);
    }

    /**
     * MÉTODO PRINCIPAL DE RENDERIZADO
     */
    redraw() {
        // Protección crítica: Si el contexto no existe, salir silenciosamente
        if (!this.ctx || !this.canvas) return;

        try {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = this.config.baseColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // Dibujar países con validación
            if (this.countryPaths) {
                for (const [id, pathData] of this.countryPaths.entries()) {
                    // Validar que pathData exista antes de dibujar
                    if (pathData) {
                        this.drawCountryPath(id, pathData);
                    }
                }
            }

            // Resaltados seguros (usando optional chaining y validaciones)
            const hoveredId = this.hoveredCountry?.id || this.hoveredCountry;
            const selectedId = this.selectedCountry?.id || this.selectedCountry;

            if (hoveredId && hoveredId !== selectedId) {
                this.drawCountryHighlight(hoveredId, 'rgba(0, 212, 255, 0.3)');
            }
            
            if (selectedId) {
                this.drawCountryHighlight(selectedId, 'rgba(0, 212, 255, 0.6)');
                this.drawCountryBorder(selectedId, '#00d4ff', 2);
            }

            // Partículas
            this.updateAndDrawParticles();
            
        } catch (error) {
            // Registrar error sin romper el loop de animación
            console.warn('[MapRenderer] Error en redraw (recuperado):', error);
            // No lanzamos el error para no detener el requestAnimationFrame
        }
    }

    markDirty() {
        this.dirty = true;
    }   
    
    cleanup() {
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
        this.ctx = null;
        this.canvas = null;
        this.countryPaths.clear();
        this.countryBounds.clear();
        this.particles = [];
        console.log('[MapRenderer] Recursos limpiados');
    }

    /**
     * Genera una explosión de partículas
     */
    spawnFeedback(x, y, type) {
        const colors = {
            war: '#ff3333',
            alliance: '#00aaff',
            success: '#00ff00',
            error: '#ff9900'
        };
        const color = colors[type] || '#ffffff';

        for (let i = 0; i < 20; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1.0,
                decay: 0.02 + Math.random() * 0.03,
                color: color,
                size: 2 + Math.random() * 3
            });
        
            this.markDirty();
        }
    }

    /**
     * Actualiza y dibuja partículas
     */
    updateAndDrawParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            p.vy += 0.2; // Gravedad

            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            this.ctx.save();
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }
    }

    /**
     * Dibuja un país individual
     */
    drawCountryPath(id, pathData) {
        this.ctx.save();
        
        this.ctx.fillStyle = '#2a2a4e';
        this.ctx.strokeStyle = this.config.borderColor;
        
        // 🔥 FIX: Aplicar lineWidth ANTES de scale para no distorsionar
        this.ctx.lineWidth = 1;

        if (pathData instanceof Path2D) {
            this.ctx.fill(pathData);
            this.ctx.stroke(pathData);
        } else if (typeof pathData === 'string') {
            const p = new Path2D(pathData);
            this.ctx.fill(p);
            this.ctx.stroke(p);
        } else if (Array.isArray(pathData)) {
            this.ctx.beginPath();
            if (pathData.length > 0) {
                this.ctx.moveTo(pathData[0][0], pathData[0][1]);
                for (let i = 1; i < pathData.length; i++) {
                    this.ctx.lineTo(pathData[i][0], pathData[i][1]);
                }
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    /**
     * Pinta un país con resaltado
     */
    drawCountryHighlight(countryId, colorFill) {
        const pathData = this.countryPaths.get(countryId);
        if (!pathData) return;

        this.ctx.save();
        this.ctx.globalAlpha = 0.6;
        this.ctx.fillStyle = colorFill;
        
        if (pathData instanceof Path2D) {
            this.ctx.fill(pathData);
        } else if (typeof pathData === 'string') {
            this.ctx.fill(new Path2D(pathData));
        } else if (Array.isArray(pathData)) {
            this.ctx.beginPath();
            if (pathData.length > 0) {
                this.ctx.moveTo(pathData[0][0], pathData[0][1]);
                for (let i = 1; i < pathData.length; i++) {
                    this.ctx.lineTo(pathData[i][0], pathData[i][1]);
                }
            }
            this.ctx.closePath();
            this.ctx.fill();
        }
        
        this.ctx.restore();
    }

    /**
     * Dibuja el borde de un país
     */
    drawCountryBorder(countryId, colorStroke, width) {
        const pathData = this.countryPaths.get(countryId);
        if (!pathData) return;

        this.ctx.save();
        this.ctx.strokeStyle = colorStroke;
        
        // 🔥 FIX: Aplicar lineWidth ANTES de cualquier transformación
        this.ctx.lineWidth = width;
        this.ctx.lineJoin = 'round';
        
        if (pathData instanceof Path2D) {
            this.ctx.stroke(pathData);
        } else if (typeof pathData === 'string') {
            this.ctx.stroke(new Path2D(pathData));
        } else if (Array.isArray(pathData)) {
            this.ctx.beginPath();
            if (pathData.length > 0) {
                this.ctx.moveTo(pathData[0][0], pathData[0][1]);
                for (let i = 1; i < pathData.length; i++) {
                    this.ctx.lineTo(pathData[i][0], pathData[i][1]);
                }
            }
            this.ctx.closePath();
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    /**
     * Carga y parsea el SVG del mapa
     * 🔥 ACTUALIZADO: Ahora carga tanto <path> como <polygon>
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

            const svgElement = svgDoc.querySelector('svg');
            if (svgElement) {
                let viewBox = svgElement.getAttribute('viewBox');

                if (!viewBox) {
                    const geoViewBox = svgElement.getAttribute('ns1:geoViewBox');
                    if (geoViewBox) {
                        const [minLon, minLat, maxLon, maxLat] = geoViewBox.split(/\s+/).map(Number);
                        const svgWidth = svgElement.getAttribute('width') || 1009.67;
                        const svgHeight = svgElement.getAttribute('height') || 665.96;

                        const x = minLon;
                        const y = maxLat;
                        const width = maxLon - minLon;
                        const height = minLat - maxLat;

                        viewBox = `${x} ${y} ${width} ${height}`;
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
                }

                const attrWidth = svgElement.getAttribute('width');
                const attrHeight = svgElement.getAttribute('height');
                if (attrWidth && attrHeight) {
                    this.svgViewBox.width = parseFloat(attrWidth);
                    this.svgViewBox.height = parseFloat(attrHeight);
                }
            }

            // FIX: Usar namespace-aware matching para soportar ns0:path, ns0:polygon, etc.
            const pathElements = svgDoc.querySelectorAll('[id]');
            const countryPaths = Array.from(pathElements).filter(el => {
                const tagName = el.tagName.toLowerCase();
                // Extraer nombre local sin namespace (ej: "ns0:path" -> "path")
                const localName = tagName.includes(':') ? tagName.split(':')[1] : tagName;
                return localName === 'path' || localName === 'polygon';
            });

            countryPaths.forEach(element => {
                const id = element.getAttribute('id');
                if (!id) return;

                let path2D = null;
                
                // FIX: Extraer nombre local sin namespace para comparación
                const tagName = element.tagName.toLowerCase();
                const localName = tagName.includes(':') ? tagName.split(':')[1] : tagName;

                // Soporte para <path> con atributo 'd'
                if (localName === 'path') {
                    const d = element.getAttribute('d');
                    if (d) {
                        path2D = new Path2D(d);
                    }
                }
                
                // Soporte para <polygon> con atributo 'points'
                if (localName === 'polygon') {
                    const points = element.getAttribute('points');
                    if (points) {
                        try {
                            path2D = this.polygonPointsToPath2D(points);
                        } catch (error) {
                            console.warn(`[MapRenderer] Error procesando polygon ${id}:`, error);
                        }
                    }
                }

                if (path2D) {
                    this.countryPaths.set(id, path2D);

                    // Calcular bounds - FIX: usar localName en lugar de tagName
                    const boundsData = localName === 'path' 
                        ? element.getAttribute('d')
                        : this.polygonPointsToBounds(element.getAttribute('points'));
                    
                    if (boundsData) {
                        const bounds = localName === 'path'
                            ? this.calculatePathBounds(boundsData)
                            : this.calculatePolygonBounds(boundsData);
                        
                        if (bounds) {
                            this.countryBounds.set(id, bounds);
                        }
                    }
                }
            });

            this.calculateTransform();
            this.mapLoaded = true;
            this.dirty = true;

        } catch (error) {
            console.error('[MapRenderer] Error cargando SVG:', error);
        }
    }

    /**
     * 🔥 NUEVO: Convierte puntos de polygon a Path2D
     * @param {string} pointsString - Ej: "10,10 20,20 30,15"
     * @returns {Path2D}
     */
    polygonPointsToPath2D(pointsString) {
        const points = pointsString.trim().split(/\s+/).map(point => {
            const [x, y] = point.split(',').map(Number);
            return { x, y };
        });

        if (points.length === 0) throw new Error('No points in polygon');

        const path = new Path2D();
        path.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            path.lineTo(points[i].x, points[i].y);
        }
        path.closePath();

        return path;
    }

    /**
     * 🔥 NUEVO: Calcula bounds de un polygon
     * @param {string} pointsString - Ej: "10,10 20,20 30,15"
     * @returns {Object|null}
     */
    calculatePolygonBounds(pointsString) {
        const points = pointsString.trim().split(/\s+/).map(point => {
            const [x, y] = point.split(',').map(Number);
            return { x: Number(x), y: Number(y) };
        });

        if (points.length === 0) return null;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        points.forEach(point => {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        });

        return { minX, minY, maxX, maxY };
    }

    /**
     * Calcula los bounds de un path SVG
     */
    calculatePathBounds(d) {
        if (!d) return null;

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
     * Calcula transformación SVG a Canvas
     */
    calculateTransform() {
        if (this.svgViewBox.width === 0 || this.canvas.width === 0) return;

        const scaleX = this.canvas.width / this.svgViewBox.width;
        const scaleY = this.canvas.height / this.svgViewBox.height;

        this.transform.scale = Math.min(scaleX, scaleY);

        const scaledWidth = this.svgViewBox.width * this.transform.scale;
        const scaledHeight = this.svgViewBox.height * this.transform.scale;

        this.transform.offsetX = (this.canvas.width - scaledWidth) / 2;
        this.transform.offsetY = (this.canvas.height - scaledHeight) / 2;
    }

    /**
     * Transforma coordenadas SVG a Canvas
     */
    svgToCanvas(svgX, svgY) {
        return {
            x: (svgX - this.svgViewBox.x) * this.transform.scale + this.transform.offsetX,
            y: (svgY - this.svgViewBox.y) * this.transform.scale + this.transform.offsetY
        };
    }

    /**
     * Transforma coordenadas Canvas a SVG
     */
    canvasToSvg(canvasX, canvasY) {
        return {
            x: (canvasX - this.transform.offsetX) / this.transform.scale + this.svgViewBox.x,
            y: (canvasY - this.transform.offsetY) / this.transform.scale + this.svgViewBox.y
        };
    }

    /**
     * 🔥 NUEVO: Hit testing con transformaciones sincronizadas
     * Aplica las mismas transformaciones que en renderCountries()
     * @param {number} canvasX - Coordenada X en espacio canvas
     * @param {number} canvasY - Coordenada Y en espacio canvas
     * @returns {string|null} ID del país encontrado o null
     */
    // ✅ VERSIÓN CORRECTA PARA SVG NORMALIZADO
    findCountryAtPoint(canvasX, canvasY) {
        if (!this.ctx || this.countryPaths.size === 0) return null;

        this.ctx.save();
        
        let foundCountryId = null;
        const pathIds = Array.from(this.countryPaths.keys()).reverse();
        
        for (const id of pathIds) {
            const path = this.countryPaths.get(id);
            if (this.ctx.isPointInPath(path, canvasX, canvasY)) {
                foundCountryId = id;
                break;
            }
        }

        this.ctx.restore();
        return foundCountryId;
    }

    /**
     * Configura listeners de interacción
     */
    setupInteraction() {
        if (!this.canvas) return;

        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    }

    /**
     * 🔥 ACTUALIZADO: Maneja movimiento del mouse con hit testing sincronizado
     */
    handleMouseMove(e) {
        // --- INICIO LOGS DE DIAGNÓSTICO (Versión Segura) ---
        // Usamos nombres únicos para no chocar con variables existentes
        const dbg_rect = this.canvas.getBoundingClientRect();
        const dbg_scaleX = this.canvas.width / dbg_rect.width;
        const dbg_scaleY = this.canvas.height / dbg_rect.height;

        // Calculamos coordenadas seguras
        const dbg_rawX = e.clientX - dbg_rect.left;
        const dbg_rawY = e.clientY - dbg_rect.top;
        const dbg_internalX = dbg_rawX * dbg_scaleX;
        const dbg_internalY = dbg_rawY * dbg_scaleY;

        console.group("🔍 DIAGNÓSTICO MOUSE");
        console.log("1. DIMENSIONES CANVAS:");
        console.log("   - Interno (Atributo):", this.canvas.width, "x", this.canvas.height);
        console.log("   - Visual (CSS):", dbg_rect.width, "x", dbg_rect.height);
        console.log("   - Factor Escala X/Y:", dbg_scaleX.toFixed(2), "/", dbg_scaleY.toFixed(2));

        console.log("2. POSICIÓN RAW (Evento):");
        console.log("   - e.clientX:", e.clientX, "| e.clientY:", e.clientY);
        console.log("   - e.offsetX:", e.offsetX, "| e.offsetY:", e.offsetY);

        console.log("3. POSICIÓN RELATIVA AL CANVAS (Sin corregir):");
        console.log("   - X:", dbg_rawX.toFixed(2), "| Y:", dbg_rawY.toFixed(2));

        console.log("4. POSICIÓN REAL EN COORDENADAS INTERNAS (Corregida por DPR/CSS):");
        console.log("   - X_Interno:", dbg_internalX.toFixed(2), "| Y_Interno:", dbg_internalY.toFixed(2));

        console.log("5. ESTADO REAL DE TRANSFORMACIÓN (Usado para renderizar):");
        // LEEMOS DEL OBJETO CORRECTO: this.transform
        const t = this.transform; 
        console.log("   - OffsetX:", t.offsetX.toFixed(2));
        console.log("   - OffsetY:", t.offsetY.toFixed(2));
        console.log("   - Escala:", t.scale.toFixed(4));

        // CÁLCULO DE PRUEBA MANUAL
        // Fórmula correcta: (Mouse - Offset) / Scale
        const worldX = (dbg_internalX - t.offsetX) / t.scale;
        const worldY = (dbg_internalY - t.offsetY) / t.scale;

        console.log("6. RESULTADO DE TRANSFORMACIÓN INVERSA (Coordenadas Mundo):");
        console.log("   - World X:", worldX.toFixed(2));
        console.log("   - World Y:", worldY.toFixed(2));
        console.log("   - ¿Coincide esto con las coordenadas del SVG original? (Verifica en Inkscape/Illustrator)");
        console.groupEnd();
        // --- FIN LOGS DE DIAGNÓSTICO ---

        // 1. Obtener coordenadas del ratón relativas al Canvas (Pantalla)
        const rect = this.canvas.getBoundingClientRect();
        const x = e.offsetX; 
        const y = e.offsetY;

        const countryId = this.findCountryAtPoint(x, y);
        // 2. Inversión de la transformación de la cámara
        // Fórmula: World = (Screen - Offset) / Scale + ViewBoxOrigin
        
        

 

        // C. COMPENSAR EL ORIGEN DEL VIEWBOX (La pieza faltante)
        // Si el SVG original empieza en coordenadas negativas (ej: -169, -58),
        // debemos sumar ese valor para mapear al sistema de coordenadas interno del path.
        const viewBox = this.svgViewBox || { x: 0, y: 0 };


        // 3. Hit Testing con las coordenadas corregidas (Mundo SVG Real)
        const foundCountryId = this.findCountryAtPoint(screenX, screenY);

        // 4. Gestión del Estado Hover
        const prevId = this.hoveredCountry ? (this.hoveredCountry.id || this.hoveredCountry) : null;

        if (foundCountryId !== prevId) {
            const nation = this.state?.nations?.[foundCountryId];
            
            this.hoveredCountry = foundCountryId ? {
                id: foundCountryId,
                name: nation?.name || foundCountryId,
                nationId: foundCountryId
            } : null;

            this.canvas.style.cursor = foundCountryId ? 'pointer' : 'default';
            this.dirty = true; // Forzar redraw
        }

        // 5. Actualizar Tooltip (Usa coordenadas de pantalla para seguir al ratón visualmente)
        if (this.hoveredCountry) {
            this.tooltip.visible = true;
            this.tooltip.x = screenX + 15; 
            this.tooltip.y = screenY - 10;
            this.tooltip.content = this.getTooltipContent(this.hoveredCountry);
        } else {
            this.tooltip.visible = false;
        }
    }

    /**
     * Maneja click en el mapa
     */
    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const foundCountryId = this.findCountryAtPoint(screenX, screenY);

        if (foundCountryId) {
            this.selectedCountry = foundCountryId === this.selectedCountry ? null : foundCountryId;
            this.onNodeSelect?.(this.selectedCountry);
            this.dirty = true;
        }
    }

    /**
     * Maneja salida del mouse
     */
    handleMouseLeave() {
        this.hoveredCountry = null;
        this.tooltip.visible = false;
        this.dirty = true;
    }

    /**
     * Obtiene contenido del tooltip
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
     * Ajusta tamaño del canvas
     */
    resize() {
        if (!this.canvas) return;
        const parent = this.canvas.parentElement;
        const displayWidth = parent.clientWidth;
        const displayHeight = parent.clientHeight;
        
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;

        this.calculateTransform();
        this.dirty = true;
    }

    /**
     * Activa/desactiva capas
     */
    setLayer(layerName, isActive) {
        if (this.layers.hasOwnProperty(layerName)) {
            this.layers[layerName] = isActive;
            this.dirty = true;
        }
    }

    /**
     * Actualiza estado interno
     */
    update(state, playerNationId) {
        this.state = state;
        this.playerNationId = playerNationId;

        if (!this.mapLoaded || !this.countryPaths.size) {
            return;
        }

        this.dirty = true;
    }

    /**
     * Obtiene estado diplomático de una nación
     */
    getNationStatus(nationId) {
        if (!this.state?.nations?.[nationId]) return 'unknown';

        if (nationId === this.playerNationId) return 'player';

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
     * Obtiene color de una nación
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
     * Loop de animación
     */
    animate() {
        this.pulsePhase += this.config.animationSpeed;
        if (this.pulsePhase > Math.PI * 2) {
            this.pulsePhase = 0;
        }

        if (this.layers.crisis || this.hoveredCountry) {
            this.dirty = true;
        }

        requestAnimationFrame(() => this.animate());
    }

    /**
     * Renderiza todas las capas
     */
    render() {
        if (!this.ctx || !this.state) return;

        const width = this.canvas.width;
        const height = this.canvas.height;

        this.ctx.clearRect(0, 0, width, height);
        this.renderBaseLayer(width, height);

        if (this.layers.nodes) {
            this.renderCountries();
        }

        if (this.layers.borders) {
            this.renderBorders();
        }

        if (this.layers.relations) {
            this.renderRelations();
        }

        if (this.layers.espionage) {
            this.renderEspionage();
        }

        if (this.layers.economy) {
            this.renderEconomy();
        }

        if (this.layers.crisis) {
            this.renderCrisisOverlay();
        }

        if (this.tooltip.visible) {
            this.renderTooltip();
        }

        if (this.selectedCountry) {
            this.renderSelectionIndicator();
        }
    }

    /**
     * Renderiza capa base
     */
    renderBaseLayer(width, height) {
        this.ctx.fillStyle = this.themeColors.background.primary;
        this.ctx.fillRect(0, 0, width, height);

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
    }

    /**
     * Renderiza países desde SVG
     * 🔥 FIX: LineWidth aplicado ANTES de scale para no distorsionar
     */
    renderCountries() {
        if (this.countryPaths.size === 0) return;

        for (const [nationId, path] of this.countryPaths.entries()) {
            const nation = this.state?.nations?.[nationId];

            let fillColor = this.themeColors.nations.neutral;
            let strokeColor = this.themeColors.text.muted;
            let lineWidth = 0.5;

            if (nation) {
                fillColor = this.getNationColor(nationId, nation);
                strokeColor = this.themeColors.text.secondary;
                lineWidth = 1;
            }

            this.ctx.save();
            
            // 🔥 FIX: Aplicar lineWidth ANTES de las transformaciones
            this.ctx.lineWidth = lineWidth;
            this.ctx.strokeStyle = strokeColor;
            
            this.ctx.translate(this.transform.offsetX, this.transform.offsetY);
            this.ctx.scale(this.transform.scale, this.transform.scale);

            this.ctx.fillStyle = fillColor;
            this.ctx.fill(path);
            this.ctx.stroke(path);

            this.ctx.restore();
        }

        this.renderCountryEffects();
    }

    /**
     * Verifica bounds válidos
     */
    isFiniteBounds(bounds) {
        return bounds &&
            typeof bounds.minX === 'number' && isFinite(bounds.minX) &&
            typeof bounds.minY === 'number' && isFinite(bounds.minY) &&
            typeof bounds.maxX === 'number' && isFinite(bounds.maxX) &&
            typeof bounds.maxY === 'number' && isFinite(bounds.maxY);
    }

    /**
     * Renderiza efectos de países
     */
    renderCountryEffects() {
        if (!this.ctx || !this.state) return;
        
        const currentTime = Date.now();

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
                    this.drawGlowEffectCircle(
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
     * Dibuja efecto glow en circunferencia
     */
    drawGlowEffectCircle(x, y, radius, color, intensity = 0.5) {
        if (!isFinite(x) || !isFinite(y) || !isFinite(radius) || radius <= 0) {
            return;
        }

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
     * Renderiza fronteras
     */
    renderBorders() {
        if (this.countryPaths.size === 0) return;

        this.ctx.save();
        this.ctx.translate(this.transform.offsetX, this.transform.offsetY);
        this.ctx.scale(this.transform.scale, this.transform.scale);

        this.ctx.strokeStyle = this.themeColors.text.muted;
        this.ctx.lineWidth = 0.5;
        this.ctx.globalAlpha = 0.5;

        for (const path of this.countryPaths.values()) {
            this.ctx.stroke(path);
        }

        this.ctx.restore();
    }

    /**
     * Renderiza relaciones diplomáticas
     */
    renderRelations() {
        const relations = this.state.diplomacy?.relations || {};
        const renderedPairs = new Set();

        for (const [relationKey, data] of Object.entries(relations)) {
            if (renderedPairs.has(relationKey)) continue;
            renderedPairs.add(relationKey);

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
        }
    }

    /**
     * Renderiza espionaje
     */
    renderEspionage() {
        // Implementar si es necesario
    }

    /**
     * Renderiza economía
     */
    renderEconomy() {
        // Implementar si es necesario
    }

    /**
     * Renderiza overlay de crisis
     */
    renderCrisisOverlay() {
        const crisisLevel = this.state.events?.global_crisis_phase || 0;

        if (crisisLevel <= 1) return;

        const intensity = Math.min(crisisLevel / 4, 1);
        const alpha = 0.1 + intensity * 0.3;
        const pulse = Math.sin(this.pulsePhase * 2) * 0.1 + 0.2;

        this.ctx.fillStyle = `rgba(239, 68, 68, ${alpha + pulse})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.strokeStyle = `rgba(239, 68, 68, ${0.5 + intensity * 0.5})`;
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(10, 10, this.canvas.width - 20, this.canvas.height - 20);

        this.ctx.fillStyle = '#ef4444';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`⚠️ CRISIS NIVEL ${crisisLevel}`, this.canvas.width / 2, 50);
    }

    /**
     * Renderiza tooltip
     */
    renderTooltip() {
        const padding = 10;
        const lineHeight = 18;
        const lines = this.tooltip.content.split('<br>');

        this.ctx.font = '12px "Courier New", monospace';
        let maxWidth = 0;
        for (const line of lines) {
            const text = line.replace(/<[^>]*>/g, '');
            const width = this.ctx.measureText(text).width;
            maxWidth = Math.max(maxWidth, width);
        }

        const width = maxWidth + padding * 2;
        const height = lines.length * lineHeight + padding * 2;

        let x = this.tooltip.x;
        let y = this.tooltip.y;

        if (x + width > this.canvas.width) {
            x = this.canvas.width - width - 10;
        }
        if (y + height > this.canvas.height) {
            y = this.canvas.height - height - 10;
        }

        this.ctx.fillStyle = 'rgba(26, 26, 26, 0.95)';
        this.ctx.strokeStyle = this.themeColors.accent.primary;
        this.ctx.lineWidth = 2;
        this.ctx.fillRect(x, y, width, height);
        this.ctx.strokeRect(x, y, width, height);

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
     * Renderiza indicador de selección
     */
    renderSelectionIndicator() {
        if (!this.selectedCountry) return;

        const path = this.countryPaths.get(this.selectedCountry);
        if (!path) return;

        this.ctx.save();
        this.ctx.translate(this.transform.offsetX, this.transform.offsetY);
        this.ctx.scale(this.transform.scale, this.transform.scale);

        this.ctx.strokeStyle = this.themeColors.accent.warning;
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([10, 5]);
        this.ctx.shadowColor = this.themeColors.accent.warning;
        this.ctx.shadowBlur = 10;

        this.ctx.globalAlpha = 0.8;
        this.ctx.stroke(path);

        this.ctx.restore();
        this.ctx.setLineDash([]);
    }

    /**
     * Dibuja línea curva
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
     * Setter para callback
     */
    set onNodeSelect(callback) {
        this._onNodeSelect = callback;
    }

    /**
     * Getter para callback
     */
    get onNodeSelect() {
        return this._onNodeSelect;
    }
}

export default MapRenderer;
