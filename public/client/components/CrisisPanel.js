/**
 * CrisisPanel.js - Panel de Visualización de Crisis Geopolíticas
 * @description Muestra información detallada de crisis activas con animaciones pulse,
 *              barras de intensidad y lista de naciones afectadas.
 * @version 1.0.0
 * @module CrisisPanel
 *
 * @features
 *   - Tema visual hi-tech console
 *   - Animación de pulso para crisis activa
 *   - Barra de intensidad con gradiente rojo
 *   - Lista de naciones afectadas con colores
 *   - Timeline de fases de crisis
 */

export class CrisisPanel {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.crisisData = null;
        this.isVisible = false;

        // ✅ NUEVO: Paleta de colores tema hi-tech
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
            events: {
                crisis: '#ff0000',
                warning: '#ffaa00',
                success: '#00ff00',
                info: '#00aaff'
            },
            nations: {
                player: '#00ff00',
                ally: '#00aaff',
                neutral: '#888888',
                hostile: '#ff3333'
            }
        };

        this.animationFrame = null;
        this.pulsePhase = 0;
    }

    /**
     * Actualiza datos de crisis y renderiza
     * @param {Object} crisisData - Datos de crisis del estado
     */
    update(crisisData) {
        this.crisisData = crisisData;
        this.isVisible = crisisData?.active ?? false;

        if (this.isVisible) {
            this.render();
            this.startAnimation();
        } else {
            this.stopAnimation();
            this.clear();
        }
    }

    /**
     * Inicia loop de animación para efectos pulse
     */
    startAnimation() {
        if (this.animationFrame) return;

        const animate = () => {
            this.pulsePhase += 0.05;
            if (this.pulsePhase > Math.PI * 2) {
                this.pulsePhase = 0;
            }

            // Actualizar elementos animados
            this.updatePulseElements();

            this.animationFrame = requestAnimationFrame(animate);
        };

        this.animationFrame = requestAnimationFrame(animate);
    }

    /**
     * Detiene animación
     */
    stopAnimation() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    /**
     * Actualiza elementos con animación pulse
     */
    updatePulseElements() {
        if (!this.container) return;

        const pulseIndicator = this.container.querySelector('.crisis-pulse-indicator');
        if (pulseIndicator && this.crisisData) {
            const intensity = this.crisisData.intensity || 0.5;
            const pulse = (Math.sin(this.pulsePhase) + 1) / 2;
            const scale = 1 + pulse * 0.1 * intensity;
            const opacity = 0.3 + pulse * 0.4 * intensity;

            pulseIndicator.style.transform = `scale(${scale})`;
            pulseIndicator.style.opacity = opacity.toString();
        }

        // Actualizar barra de intensidad
        const intensityBar = this.container.querySelector('.crisis-intensity-bar-fill');
        if (intensityBar && this.crisisData) {
            const intensity = this.crisisData.intensity || 0;
            const pulseWidth = intensity * 100 + Math.sin(this.pulsePhase * 2) * 2;
            intensityBar.style.width = `${Math.min(pulseWidth, 100)}%`;
        }
    }

    /**
     * Renderiza panel de crisis
     */
    render() {
        if (!this.container || !this.crisisData) return;

        const phase = this.crisisData.phase || 'DESCONOCIDA';
        const type = this.crisisData.type || 'Sin especificar';
        const epicenter = this.crisisData.epicenter || 'Desconocido';
        const intensity = this.crisisData.intensity || 0;
        const affectedNations = this.crisisData.affected_nations || [];
        const startTime = this.crisisData.start_time || Date.now();
        const duration = Date.now() - startTime;
        const durationMinutes = Math.floor(duration / 60000);

        // Determinar color según fase
        const phaseColors = {
            'LATENTE': this.themeColors.events.warning,
            'AGUDA': this.themeColors.events.crisis,
            'ESCALADA': '#ff3333',
            'RESOLUCIÓN': this.themeColors.events.info,
            'FINALIZADA': this.themeColors.text.muted
        };
        const phaseColor = phaseColors[phase] || this.themeColors.text.secondary;

        this.container.innerHTML = `
            <div class="crisis-panel" style="
                background: ${this.themeColors.background.secondary};
                border: 1px solid ${phaseColor};
                border-radius: 4px;
                padding: 12px;
                position: relative;
                overflow: hidden;
            ">
                <!-- Efecto de fondo pulse -->
                <div class="crisis-pulse-indicator" style="
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: radial-gradient(circle, ${phaseColor}22 0%, transparent 70%);
                    transform: scale(1);
                    opacity: 0.3;
                    pointer-events: none;
                    z-index: 0;
                "></div>

                <!-- Header -->
                <div style="position: relative; z-index: 1; margin-bottom: 12px;">
                    <div style="
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin-bottom: 8px;
                    ">
                        <span style="font-size: 20px;">⚠️</span>
                        <h3 style="
                            font-family: 'Courier New', monospace;
                            font-size: 14px;
                            font-weight: 700;
                            color: ${phaseColor};
                            text-transform: uppercase;
                            letter-spacing: 1px;
                        ">CRISIS ACTIVA</h3>
                    </div>

                    <!-- Badge de fase -->
                    <div style="
                        display: inline-block;
                        padding: 4px 8px;
                        background: ${phaseColor}22;
                        border: 1px solid ${phaseColor};
                        border-radius: 2px;
                        font-family: 'Courier New', monospace;
                        font-size: 11px;
                        font-weight: 700;
                        color: ${phaseColor};
                        text-transform: uppercase;
                    ">
                        FASE: ${phase}
                    </div>
                </div>

                <!-- Información principal -->
                <div style="position: relative; z-index: 1;">
                    <!-- Tipo de crisis -->
                    <div style="margin-bottom: 10px;">
                        <div style="
                            font-family: 'Courier New', monospace;
                            font-size: 10px;
                            color: ${this.themeColors.text.muted};
                            text-transform: uppercase;
                            margin-bottom: 4px;
                        ">Tipo de Crisis</div>
                        <div style="
                            font-family: 'Courier New', monospace;
                            font-size: 12px;
                            color: ${this.themeColors.text.primary};
                            font-weight: 700;
                        ">${type}</div>
                    </div>

                    <!-- Epicentro -->
                    <div style="margin-bottom: 10px;">
                        <div style="
                            font-family: 'Courier New', monospace;
                            font-size: 10px;
                            color: ${this.themeColors.text.muted};
                            text-transform: uppercase;
                            margin-bottom: 4px;
                        ">Epicentro</div>
                        <div style="
                            font-family: 'Courier New', monospace;
                            font-size: 12px;
                            color: ${this.themeColors.text.primary};
                        ">📍 ${epicenter}</div>
                    </div>

                    <!-- Duración -->
                    <div style="margin-bottom: 10px;">
                        <div style="
                            font-family: 'Courier New', monospace;
                            font-size: 10px;
                            color: ${this.themeColors.text.muted};
                            text-transform: uppercase;
                            margin-bottom: 4px;
                        ">Duración</div>
                        <div style="
                            font-family: 'Courier New', monospace;
                            font-size: 12px;
                            color: ${this.themeColors.text.primary};
                        ">⏱️ ${durationMinutes} min</div>
                    </div>

                    <!-- Barra de intensidad -->
                    <div style="margin-bottom: 12px;">
                        <div style="
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            margin-bottom: 4px;
                        ">
                            <span style="
                                font-family: 'Courier New', monospace;
                                font-size: 10px;
                                color: ${this.themeColors.text.muted};
                                text-transform: uppercase;
                            ">Intensidad</span>
                            <span style="
                                font-family: 'Courier New', monospace;
                                font-size: 10px;
                                color: ${phaseColor};
                                font-weight: 700;
                            ">${Math.round(intensity * 100)}%</span>
                        </div>

                        <!-- Contenedor barra -->
                        <div style="
                            width: 100%;
                            height: 8px;
                            background: ${this.themeColors.background.tertiary};
                            border-radius: 4px;
                            overflow: hidden;
                            border: 1px solid ${this.themeColors.border-subtle || '#333'};
                        ">
                            <!-- Relleno barra con gradiente -->
                            <div class="crisis-intensity-bar-fill" style="
                                width: ${intensity * 100}%;
                                height: 100%;
                                background: linear-gradient(90deg,
                                    ${this.themeColors.events.warning},
                                    ${phaseColor}
                                );
                                border-radius: 4px;
                                transition: width 0.3s ease;
                            "></div>
                        </div>
                    </div>

                    <!-- Naciones afectadas -->
                    ${affectedNations.length > 0 ? `
                        <div>
                            <div style="
                                font-family: 'Courier New', monospace;
                                font-size: 10px;
                                color: ${this.themeColors.text.muted};
                                text-transform: uppercase;
                                margin-bottom: 6px;
                            ">Naciones Afectadas (${affectedNations.length})</div>
                            <div style="
                                display: flex;
                                flex-wrap: wrap;
                                gap: 4px;
                            ">
                                ${affectedNations.map(nationId => `
                                    <span style="
                                        display: inline-block;
                                        padding: 2px 6px;
                                        background: ${this.themeColors.background.tertiary};
                                        border: 1px solid ${this.themeColors.nations.neutral};
                                        border-radius: 2px;
                                        font-family: 'Courier New', monospace;
                                        font-size: 9px;
                                        color: ${this.themeColors.text.primary};
                                    ">${nationId}</span>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Limpia el panel
     */
    clear() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    /**
     * Destruye el componente y libera recursos
     */
    destroy() {
        this.stopAnimation();
        this.clear();
        this.container = null;
        this.crisisData = null;
    }
}