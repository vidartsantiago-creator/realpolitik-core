/**
 * CountryDetailScreen.js
 * Pantalla de detalle de nación con mapa interactivo y capas de información.
 */

export class CountryDetailScreen {
  constructor(nationData, onStartGame) {
    this.nation = nationData;
    this.onStartGame = onStartGame;
    this.container = null;
    this.activeLayer = 'none'; // none, infrastructure, economy, resources, military
    this.mapSvg = null;
  }

  render() {
    this.container = document.createElement('div');
    this.container.id = 'country-detail-screen';
    this.container.className = 'screen active';

    // Layout Principal
    this.container.innerHTML = `
            <div class="detail-header">
                <div class="header-left">
                    <button class="btn-back" id="btn-back">&larr; VOLVER</button>
                    <h1>${this.nation.name} <span style="font-size:0.6em; color:${this.nation.color}">[${this.nation.code}]</span></h1>
                </div>
                <div class="header-actions">
                    <button class="btn btn-primary pulse" id="btn-start">INICIAR SIMULACIÓN</button>
                </div>
            </div>

            <div class="detail-content">
                <!-- Panel Izquierdo: Mapa -->
                <div class="map-panel">
                    <div class="map-controls">
                        <button class="layer-btn" data-layer="infrastructure">INFRAESTRUCTURA</button>
                        <button class="layer-btn" data-layer="economy">ECONOMÍA</button>
                        <button class="layer-btn" data-layer="resources">RECURSOS</button>
                        <button class="layer-btn" data-layer="military">MILITAR</button>
                    </div>
                    <div class="map-container" id="map-container">
                        <!-- El mapa se genera aquí -->
                    </div>
                    <div class="map-legend" id="map-legend"></div>
                </div>

                <!-- Panel Derecho: Datos -->
                <div class="info-panel">
                    <div class="info-section">
                        <h3>RELACIONES POLÍTICAS</h3>
                        <div class="relations-list" id="relations-list"></div>
                    </div>
                    
                    <div class="info-section">
                        <h3>FACCIONES INTERNAS</h3>
                        <div class="factions-list" id="factions-list"></div>
                    </div>

                    <div class="info-section stats-grid">
                        <div class="stat-box">
                            <span class="label">PIB</span>
                            <span class="value">${(this.nation.gdp / 1000000000).toFixed(1)}B</span>
                        </div>
                        <div class="stat-box">
                            <span class="label">POBLACIÓN</span>
                            <span class="value">${(this.nation.population / 1000000).toFixed(1)}M</span>
                        </div>
                        <div class="stat-box">
                            <span class="label">ESTABILIDAD</span>
                            <span class="value ${(this.nation.stability < 0.5 ? 'critical' : 'stable')}">${(this.nation.stability * 100).toFixed(0)}%</span>
                        </div>
                        <div class="stat-box">
                            <span class="label">DIFICULTAD</span>
                            <span class="value">${'★'.repeat(this.nation.difficulty_rating?.stars || 3)}</span>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h3>RESUMEN GEOPOLÍTICO</h3>
                        <p class="geo-summary">${this.nation.geopolitical_report?.global_position}</p>
                    </div>
                </div>
            </div>
        `;

    const app = document.getElementById('app') || document.body;
    app.appendChild(this.container);

    this.initMap();
    this.initRelations();
    this.initFactions();
    this.attachListeners();
  }

  initMap() {
    const container = document.getElementById('map-container');
    const mapData = this.nation.map_data;

    // Crear SVG simulado del mapa
    // En producción, esto usaría Leaflet o D3 con GeoJSON real
    const width = 800;
    const height = 600;

    let svgContent = `
            <svg viewBox="0 0 ${width} ${height}" class="nation-map">
                <!-- Fondo -->
                <rect width="100%" height="100%" fill="#0f172a" />
                
                <!-- Forma abstracta del país (placeholder) -->
                <path d="M100,100 Q400,50 700,150 T900,500 Q500,600 200,400 T100,100" 
                      fill="${this.nation.color}22" 
                      stroke="${this.nation.color}" 
                      stroke-width="2" 
                      class="country-shape" />
                
                <!-- Puntos de Interés -->
        `;

    if (mapData && mapData.points_of_interest) {
      mapData.points_of_interest.forEach(poi => {
        // Convertir lat/lon aproximado a coordenadas SVG (simplificado)
        const x = 200 + (poi.lon + 70) * 5;
        const y = 300 - (poi.lat - 30) * 5;

        let iconColor = '#fff';
        if (poi.type === 'capital') iconColor = '#fbbf24';
        if (poi.type === 'military') iconColor = '#ef4444';
        if (poi.type === 'resource') iconColor = '#10b981';

        svgContent += `
                    <g class="poi-marker" data-type="${poi.type}" transform="translate(${x}, ${y})">
                        <circle r="8" fill="${iconColor}" class="pulse-ring" />
                        <circle r="4" fill="#fff" />
                        <text y="-15" text-anchor="middle" fill="#fff" font-size="12" class="poi-label">${poi.name}</text>
                    </g>
                `;
      });
    }

    svgContent += `</svg>`;
    container.innerHTML = svgContent;

    // Leyenda inicial
    this.updateLegend('none');
  }

  initRelations() {
    const list = document.getElementById('relations-list');
    const diplomacy = this.nation.diplomacy_detail;

    if (!diplomacy) {
      list.innerHTML = '<p>Datos diplomáticos no disponibles.</p>';
      return;
    }

    let html = '';

    // Aliados
    if (diplomacy.allies && diplomacy.allies.length > 0) {
      html += `<h4 class="relation-type ally">ALIADOS</h4>`;
      diplomacy.allies.forEach(rel => {
        html += `
                    <div class="relation-item">
                        <span class="flag" style="background:${this.getColorForNation(rel.nation_id)}"></span>
                        <span class="name">${rel.nation_id}</span>
                        <div class="bar-container"><div class="bar fill" style="width:${rel.strength * 100}%"></div></div>
                        <span class="treaty">${rel.treaty}</span>
                    </div>
                `;
      });
    }

    // Enemigos
    if (diplomacy.enemies && diplomacy.enemies.length > 0) {
      html += `<h4 class="relation-type enemy">RIVALES / ENEMIGOS</h4>`;
      diplomacy.enemies.forEach(rel => {
        html += `
                    <div class="relation-item">
                        <span class="flag" style="background:#ef4444"></span>
                        <span class="name">${rel.nation_id}</span>
                        <div class="bar-container"><div class="bar fill danger" style="width:${rel.strength * 100}%"></div></div>
                        <span class="treaty">${rel.reason}</span>
                    </div>
                `;
      });
    }

    // Neutrales
    if (diplomacy.neutrals && diplomacy.neutrals.length > 0) {
      html += `<h4 class="relation-type neutral">NEUTRALES</h4>`;
      diplomacy.neutrals.forEach(rel => {
        html += `
                    <div class="relation-item">
                        <span class="flag" style="background:#94a3b8"></span>
                        <span class="name">${rel.nation_id}</span>
                        <span class="status">${rel.status}</span>
                    </div>
                `;
      });
    }

    list.innerHTML = html;
  }

  initFactions() {
    const list = document.getElementById('factions-list');
    const factions = this.nation.factions_detail || this.nation.factions;

    if (!factions) {
      list.innerHTML = '<p>Datos de facciones no disponibles.</p>';
      return;
    }

    let html = '';
    factions.forEach(faction => {
      const loyaltyClass = faction.loyalty > 0.7 ? 'loyal' : (faction.loyalty < 0.4 ? 'hostile' : 'neutral');
      const threatClass = faction.threat_level ? faction.threat_level.toLowerCase() : 'low';

      // Usar nombre si es objeto detallado, sino ID
      const name = faction.name || faction.id;
      const ideology = faction.ideology || 'Desconocida';
      const support = faction.support_base_percent || (faction.power * 100);

      html += `
                <div class="faction-item">
                    <div class="faction-header">
                        <span class="faction-name">${name}</span>
                        <span class="faction-ideology">${ideology}</span>
                    </div>
                    <div class="faction-stats">
                        <span class="support">Apoyo: ${support.toFixed(0)}%</span>
                        <span class="threat threat-${threatClass}">Amenaza: ${faction.threat_level || 'Normal'}</span>
                    </div>
                    <div class="bar-container">
                        <div class="bar fill ${loyaltyClass}" style="width:${(faction.loyalty || 0.5) * 100}%"></div>
                    </div>
                    ${faction.demands ? `<div class="demands">Demandas: ${faction.demands.join(', ')}</div>` : ''}
                </div>
            `;
    });

    list.innerHTML = html;
  }

  attachListeners() {
    // Botón Volver
    document.getElementById('btn-back').addEventListener('click', () => {
      this.destroy();
      // Disparar evento o callback para volver al picker (depende de la arquitectura global)
      window.location.reload(); // Simplificación para este ejemplo
    });

    // Botón Iniciar
    document.getElementById('btn-start').addEventListener('click', () => {
      if (confirm(`¿Confirmar inicio de simulación para ${this.nation.name}?`)) {
        this.onStartGame(this.nation);
      }
    });

    // Botones de Capas
    document.querySelectorAll('.layer-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Remover active de todos
        document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
        // Activar actual
        e.target.classList.add('active');

        const layer = e.target.dataset.layer;
        this.activeLayer = layer;
        this.updateLegend(layer);
        this.highlightMapLayer(layer);
      });
    });
  }

  updateLegend(layer) {
    const legend = document.getElementById('map-legend');
    let content = '';

    switch (layer) {
      case 'infrastructure':
        content = `
                    <span class="legend-item"><span class="dot" style="background:#3b82f6"></span> Carreteras/Ferroviario</span>
                    <span class="legend-item"><span class="dot" style="background:#fbbf24"></span> Energía/Red</span>
                `;
        break;
      case 'economy':
        content = `
                    <span class="legend-item"><span class="dot" style="background:#10b981"></span> Zonas Industriales</span>
                    <span class="legend-item"><span class="dot" style="background:#3b82f6"></span> Puertos/Comercio</span>
                `;
        break;
      case 'resources':
        content = `
                    <span class="legend-item"><span class="dot" style="background:#f59e0b"></span> Petróleo/Gas</span>
                    <span class="legend-item"><span class="dot" style="background:#84cc16"></span> Agricultura</span>
                    <span class="legend-item"><span class="dot" style="background:#6366f1"></span> Minerales</span>
                `;
        break;
      case 'military':
        content = `
                    <span class="legend-item"><span class="dot" style="background:#ef4444"></span> Bases/Misiles</span>
                    <span class="legend-item"><span class="dot" style="background:#f43f5e"></span> Fronteras Calientes</span>
                `;
        break;
      default:
        content = '<span class="legend-item">Vista General Geopolítica</span>';
    }

    legend.innerHTML = content;
  }

  highlightMapLayer(layer) {
    // Lógica visual para resaltar elementos del SVG según la capa
    // En una implementación real con IDs en los elementos SVG, aquí se cambiarían clases CSS
    const markers = document.querySelectorAll('.poi-marker');
    markers.forEach(m => {
      const type = m.dataset.type;
      if (layer === 'none') {
        m.style.opacity = '0.5';
      } else if (
        (layer === 'resources' && type === 'resource') ||
        (layer === 'military' && type === 'military') ||
        (layer === 'infrastructure' && (type === 'capital' || type === 'resource'))
      ) {
        m.style.opacity = '1';
        m.style.filter = 'drop-shadow(0 0 5px #fff)';
      } else {
        m.style.opacity = '0.2';
        m.style.filter = 'none';
      }
    });
  }

  getColorForNation(nationId) {
    // Mapeo simple de ID a color (debería venir de un lookup global)
    if (nationId.includes('nation_1')) return '#3b82f6';
    if (nationId.includes('nation_2')) return '#10b981';
    if (nationId.includes('nation_3')) return '#ef4444';
    return '#94a3b8';
  }

  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}