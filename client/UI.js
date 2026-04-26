/**
 * @file UI.js
 * @description Renderizador principal de la interfaz de usuario. Implementa las 5 zonas de pantalla
 *              según Diseño UI V1: Tablero de Mando, Mapa Geopolítico, Centro de Decisiones,
 *              Feed de Inteligencia y Panel Rápido.
 * @version 1.0.0
 * @author RealPolitik Core Team
 * @dependencies SyncClient
 * @changelog
 * - v1.0.0: Creación inicial. Implementa estructura básica de UI para MVP.
 */

import { getState } from './SyncClient.js';

// Referencias a elementos DOM
let elements = {};
let localState = null;

/**
 * Inicializa la interfaz de usuario.
 */
export function initUI() {
  console.log('[UI] Inicializando interfaz...');
  
  // Esperar a que el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupDOM);
  } else {
    setupDOM();
  }
}

/**
 * Configura referencias al DOM y renderiza estado inicial.
 */
function setupDOM() {
  console.log('[UI] DOM ready. Configurando elementos...');
  
  elements = {
    // Tablero de Mando (Izquierda)
    stabilityBar: document.getElementById('stability-bar'),
    stabilityValue: document.getElementById('stability-value'),
    budgetBar: document.getElementById('budget-bar'),
    budgetValue: document.getElementById('budget-value'),
    supportBar: document.getElementById('support-bar'),
    supportValue: document.getElementById('support-value'),
    militaryBar: document.getElementById('military-bar'),
    militaryValue: document.getElementById('military-value'),
    
    // Mapa Geopolítico (Centro)
    mapContainer: document.getElementById('map-container'),
    mapLayers: document.getElementById('map-layers'),
    
    // Centro de Decisiones (Derecha Superior)
    policyCard: document.getElementById('policy-card'),
    policyTitle: document.getElementById('policy-title'),
    policyDescription: document.getElementById('policy-description'),
    policyTimer: document.getElementById('policy-timer'),
    policyOptions: document.getElementById('policy-options'),
    
    // Feed de Inteligencia (Derecha Inferior)
    intelFeed: document.getElementById('intel-feed'),
    
    // Panel Rápido (Inferior)
    factionPanel: document.getElementById('faction-panel'),
    relationsPanel: document.getElementById('relations-panel'),
    
    // Estado general
    tickDisplay: document.getElementById('tick-display'),
    nationName: document.getElementById('nation-name')
  };
  
  // Suscribirse a actualizaciones del estado
  subscribeToUpdates();
  
  console.log('[UI] Interfaz inicializada correctamente.');
}

/**
 * Suscribe la UI a actualizaciones de estado desde SyncClient.
 */
function subscribeToUpdates() {
  // Se suscribirá a eventos cuando SyncClient esté implementado
  console.log('[UI] Esperando actualizaciones de estado...');
}

/**
 * Renderiza el Tablero de Mando con métricas vitales.
 * @param {Object} stats - Estadísticas de la nación
 */
export function renderDashboard(stats) {
  if (!stats || !elements.stabilityBar) return;
  
  // Estabilidad
  updateMetricBar(elements.stabilityBar, elements.stabilityValue, stats.stability, 0, 100);
  
  // Presupuesto
  const budgetPercent = Math.max(0, Math.min(100, (stats.budget / 5000) * 100));
  updateMetricBar(elements.budgetBar, elements.budgetValue, stats.budget, 0, 5000);
  
  // Apoyo
  updateMetricBar(elements.supportBar, elements.supportValue, stats.support, 0, 100);
  
  // Militar
  updateMetricBar(elements.militaryBar, elements.militaryValue, stats.military, 0, 100);
}

/**
 * Actualiza una barra de métrica con gradiente dinámico.
 * @param {HTMLElement} barElement - Elemento de la barra
 * @param {HTMLElement} valueElement - Elemento del valor numérico
 * @param {number} value - Valor actual
 * @param {number} min - Valor mínimo
 * @param {number} max - Valor máximo
 */
function updateMetricBar(barElement, valueElement, value, min, max) {
  if (!barElement || !valueElement) return;
  
  const percent = ((value - min) / (max - min)) * 100;
  const clampedPercent = Math.max(0, Math.min(100, percent));
  
  // Determinar color basado en nivel
  let colorClass = 'metric-low';
  if (percent > 60) colorClass = 'metric-high';
  else if (percent > 30) colorClass = 'metric-medium';
  
  barElement.style.width = `${clampedPercent}%`;
  barElement.className = `metric-fill ${colorClass}`;
  
  // Actualizar valor numérico
  valueElement.textContent = Math.round(value);
  
  // Indicador de tendencia (placeholder para futura implementación)
  const trendElement = valueElement.nextElementSibling;
  if (trendElement && trendElement.classList.contains('trend-indicator')) {
    trendElement.textContent = '─';
  }
}

/**
 * Renderiza el Mapa Geopolítico.
 * @param {Object} worldState - Estado mundial filtrado
 */
export function renderMap(worldState) {
  if (!worldState || !elements.mapContainer) return;
  
  // Placeholder para implementación futura de MapRenderer
  console.log('[UI] Renderizando mapa (placeholder)...');
  
  if (elements.mapContainer) {
    elements.mapContainer.innerHTML = `
      <div class="map-placeholder">
        <h3>🌍 Mapa Geopolítico</h3>
        <p>Capas disponibles: Relaciones, Flujos Comerciales, Crisis</p>
        <div class="layer-toggles">
          <button class="layer-toggle active" data-layer="relations">📊 Relaciones</button>
          <button class="layer-toggle" data-layer="commercial">✈️ Comercial</button>
          <button class="layer-toggle" data-layer="crisis">⚠️ Crisis</button>
        </div>
      </div>
    `;
  }
}

/**
 * Renderiza el Centro de Decisiones con tarjeta de política activa.
 * @param {Object} policy - Política activa actual
 */
export function renderPolicyCenter(policy) {
  if (!elements.policyCard) return;
  
  if (!policy) {
    elements.policyCard.innerHTML = `
      <div class="policy-empty">
        <p>Esperando próxima decisión...</p>
      </div>
    `;
    return;
  }
  
  elements.policyTitle.textContent = policy.title || 'Decisión Pendiente';
  elements.policyDescription.textContent = policy.description || 'Seleccione una opción.';
  
  // Timer countdown (en ticks, convertido a tiempo visual)
  if (policy.ticksRemaining !== undefined) {
    const seconds = policy.ticksRemaining; // Asumiendo 1 tick = 1 segundo
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    elements.policyTimer.textContent = `⏱ ${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  // Opciones de política
  if (elements.policyOptions && policy.options && policy.options.length > 0) {
    elements.policyOptions.innerHTML = policy.options.map((opt, idx) => `
      <div class="policy-option ${idx === 0 ? 'conservative selected' : ''}" data-option="${idx}">
        <div class="option-label">${opt.label}</div>
        <div class="option-details">
          <span class="cost">Costo: ${opt.cost}</span>
          <span class="risk">Riesgo: ${opt.risk}</span>
          <span class="benefit">Beneficio: ${opt.benefit}</span>
        </div>
      </div>
    `).join('');
    
    // Agregar listeners para selección
    document.querySelectorAll('.policy-option').forEach(option => {
      option.addEventListener('click', () => handlePolicySelection(option.dataset.option));
    });
  }
}

/**
 * Maneja selección de opción de política.
 * @param {string} optionIndex - Índice de la opción seleccionada
 */
function handlePolicySelection(optionIndex) {
  console.log('[UI] Selección de política:', optionIndex);
  
  // Remover selección previa
  document.querySelectorAll('.policy-option').forEach(opt => opt.classList.remove('selected'));
  
  // Agregar selección actual
  const selectedOption = document.querySelector(`[data-option="${optionIndex}"]`);
  if (selectedOption) {
    selectedOption.classList.add('selected');
  }
  
  // Enviar intención al servidor (se implementará cuando NetworkOverlay esté activo)
  // sendPolicyDecision(optionIndex);
}

/**
 * Renderiza el Feed de Inteligencia.
 * @param {Array} intelItems - Lista de items de inteligencia
 */
export function renderIntelFeed(intelItems) {
  if (!elements.intelFeed) return;
  
  if (!intelItems || intelItems.length === 0) {
    elements.intelFeed.innerHTML = '<div class="feed-empty">Sin novedades de inteligencia</div>';
    return;
  }
  
  elements.intelFeed.innerHTML = intelItems.map(item => {
    const tagClass = item.type === 'interna' ? 'tag-internal' : 
                     item.type === 'externa' ? 'tag-external' : 'tag-public';
    
    return `
      <div class="feed-item">
        <span class="feed-tag ${tagClass}">${item.type.toUpperCase()}</span>
        <span class="feed-text">${item.message}</span>
        <span class="feed-confidence">Confianza: ${item.confidence}%</span>
      </div>
    `;
  }).join('');
}

/**
 * Renderiza el Panel Rápido de facciones y relaciones.
 * @param {Object} factions - Estado de facciones
 * @param {Object} relations - Relaciones bilaterales
 */
export function renderQuickPanel(factions, relations) {
  // Facciones
  if (elements.factionPanel && factions) {
    elements.factionPanel.innerHTML = Object.entries(factions).map(([name, data]) => `
      <div class="faction-bar">
        <span class="faction-name">${name}</span>
        <div class="faction-progress">
          <div class="faction-fill" style="width: ${data.loyaltyLevel}%"></div>
        </div>
        <span class="faction-value">${data.loyaltyLevel}%</span>
      </div>
    `).join('');
  }
  
  // Relaciones (placeholder)
  if (elements.relationsPanel && relations) {
    console.log('[UI] Renderizando panel de relaciones...');
  }
}

/**
 * Actualiza display de tick actual.
 * @param {number} tick - Número de tick actual
 */
export function updateTickDisplay(tick) {
  if (elements.tickDisplay) {
    elements.tickDisplay.textContent = `Tick: ${tick}`;
  }
}

/**
 * Actualiza nombre de la nación jugada.
 * @param {string} nationName - Nombre de la nación
 */
export function setNationName(nationName) {
  if (elements.nationName) {
    elements.nationName.textContent = nationName;
  }
}

// Exportar función de envío de decisiones (para futura implementación)
export function sendPolicyDecision(optionIndex) {
  console.log('[UI] Enviando decisión al servidor (pendiente de implementación):', optionIndex);
  // Se conectará con UIMessageHandler.js cuando esté implementado
}