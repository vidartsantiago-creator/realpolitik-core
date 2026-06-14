/**
 * @file StrategyCabinet.js
 * @description Controlador UI para el Gabinete de Estrategia.
 *              Sigue estrictamente el modelo Server-Authoritative.
 *              - Escucha: 'state_update', 'objective_accepted', 'strategy_activated', etc.
 *              - Emite: 'player_set_objective', 'player_activate_strategy', 'request_ai_advice'.
 * @dependencies EventDispatcher (Client-side)
 */

import { on, emit } from '../core/EventDispatcher.js'; // Asumiendo ruta correcta en cliente

// Estado local UI (solo para renderizado, no lógica de juego)
let _uiState = {
  isOpen: false,
  playerNationId: null,
  activeObjectives: [], // Recibido del server
  availableStrategies: [], // Cache local de config o recibido
  selectedObjectiveId: null,
  selectedStrategyId: null
};

// Elementos DOM cacheados
const DOM = {};

export function init() {
  cacheDOM();
  attachListeners();
  subscribeToEvents();
  console.log('[StrategyCabinet] Inicializado.');
}

function cacheDOM() {
  DOM.modal = document.getElementById('strategy-cabinet-modal');
  DOM.selectorModal = document.getElementById('objective-selector-modal');
  DOM.btnClose = document.getElementById('btn-close-cabinet');
  DOM.btnCloseSelector = document.getElementById('btn-close-selector');
  DOM.btnSelectObj = document.getElementById('btn-select-objective');
  DOM.objCount = document.getElementById('obj-count');
  DOM.objList = document.getElementById('active-objectives-list');
  DOM.strategySelect = document.getElementById('strategy-objective-select');
  DOM.strategyArea = document.getElementById('strategy-management-area');
  DOM.availableStratList = document.getElementById('available-strategies-list');
  DOM.btnActivate = document.getElementById('btn-activate-strategy');
  DOM.aiReportBox = document.getElementById('ai-report-content');
  DOM.btnAiProgress = document.getElementById('btn-ai-report-progress');
  DOM.btnAiRec = document.getElementById('btn-ai-recommendation');

  // Tabs selector
  DOM.scopeTabs = document.querySelectorAll('.scope-tabs .tab-btn');
  DOM.objCatalog = document.getElementById('objective-catalog');
}

function attachListeners() {
  // Abrir/Cerrar Modal Principal
  // Nota: Necesitas un botón en la UI principal para abrirlo. Ej: document.getElementById('btn-open-cabinet').
  // Aquí asumimos que se llama a openCabinet() desde fuera o se agrega listener global.

  DOM.btnClose.addEventListener('click', closeCabinet);
  DOM.btnCloseSelector.addEventListener('click', () => DOM.selectorModal.classList.add('hidden'));

  DOM.btnSelectObj.addEventListener('click', () => {
    if (_uiState.activeObjectives.length < 2) {
      openObjectiveSelector();
    }
  });

  // Selector de objetivo para gestionar estrategias
  DOM.strategySelect.addEventListener('change', (e) => {
    _uiState.selectedObjectiveId = e.target.value;
    renderStrategyManagement(_uiState.selectedObjectiveId);
  });

  // Activar Estrategia
  DOM.btnActivate.addEventListener('click', () => {
    if (_uiState.selectedStrategyId) {
      emit('player_activate_strategy', {
        objectiveId: _uiState.selectedObjectiveId,
        strategyId: _uiState.selectedStrategyId
        // Los recursos asignados se enviarían aquí si hubiera sliders implementados
      });
    }
  });

  // IA Buttons
  DOM.btnAiProgress.addEventListener('click', () => {
    emit('request_ai_report', { type: 'progress', objectiveId: _uiState.selectedObjectiveId });
  });

  DOM.btnAiRec.addEventListener('click', () => {
    emit('request_ai_report', { type: 'recommendation', objectiveId: _uiState.selectedObjectiveId });
  });

  // Tabs de ámbitos
  DOM.scopeTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      DOM.scopeTabs.forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      filterObjectiveCatalog(e.target.dataset.scope);
    });
  });
}

function subscribeToEvents() {
  // Actualización de Estado General (Tick)
  on('state_update', (payload) => {
    if (!_uiState.isOpen) return; // Solo actualizar si está visible

    const nation = payload.state.nations[payload.state.playerNationId];
    if (nation && nation.objectives) {
      _uiState.activeObjectives = nation.objectives.filter(o => o.active);
      renderActiveObjectives();
      updateStrategyDropdown();
    }
  });

  // Confirmación de Objetivo Aceptado
  on('objective_accepted', ({ objectiveId, name }) => {
    alert(`✅ Objetivo aceptado: ${name}`);
    DOM.selectorModal.classList.add('hidden');
    // El state_update siguiente refrescará la lista
  });

  // Error al intentar activar estrategia
  on('ui_error', ({ message }) => {
    alert(`⚠️ ${message}`);
  });

  // Respuesta de IA
  on('ai_advisor_response', ({ text, type }) => {
    DOM.aiReportBox.innerHTML = `<p>${text}</p>`;
  });
}

// --- Funciones de Renderizado (Puras visuales) ---

function renderActiveObjectives() {
  DOM.objList.innerHTML = '';
  DOM.objCount.textContent = _uiState.activeObjectives.length;

  // Habilitar/Deshabilitar botón de añadir
  DOM.btnSelectObj.disabled = _uiState.activeObjectives.length >= 2;

  if (_uiState.activeObjectives.length === 0) {
    DOM.objList.innerHTML = '<p class="placeholder">No hay objetivos activos. Asigne uno para comenzar.</p>';
    return;
  }

  _uiState.activeObjectives.forEach(obj => {
    const card = document.createElement('div');
    card.className = `objective-card ${obj.progress < 30 ? 'critical' : 'locked'}`;

    // Determinar estado visual (Inalcanzable?)
    const isUnreachable = obj.progress < 20 && obj.timeRemaining < 10; // Lógica visual simple

    card.innerHTML = `
      <div class="card-header">
        <strong>${obj.name}</strong>
        <span class="badge ${obj.scope}">${obj.scope}</span>
      </div>
      <div class="progress-container">
        <small>Progreso: ${obj.progress}%</small>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill ${isUnreachable ? 'critical' : 'success'}" style="width: ${obj.progress}%"></div>
        </div>
        ${isUnreachable ? '<small style="color:red">⚠️ Riesgo de fracaso</small>' : ''}
      </div>
      <div class="card-footer">
        <small>Vence en tick: ${obj.deadline}</small>
      </div>
    `;
    DOM.objList.appendChild(card);
  });
}

function updateStrategyDropdown() {
  DOM.strategySelect.innerHTML = '<option value="" disabled selected>Seleccione un objetivo activo...</option>';
  _uiState.activeObjectives.forEach(obj => {
    const opt = document.createElement('option');
    opt.value = obj.id;
    opt.textContent = `${obj.name} (${obj.scope})`;
    DOM.strategySelect.appendChild(opt);
  });

  if (_uiState.activeObjectives.length > 0 && !_uiState.selectedObjectiveId) {
    _uiState.selectedObjectiveId = _uiState.activeObjectives[0].id;
    DOM.strategySelect.value = _uiState.selectedObjectiveId;
    renderStrategyManagement(_uiState.selectedObjectiveId);
  }
}

function renderStrategyManagement(objId) {
  if (!objId) {
    DOM.strategyArea.classList.add('hidden');
    return;
  }

  DOM.strategyArea.classList.remove('hidden');
  DOM.availableStratList.innerHTML = '<p>Cargando estrategias compatibles...</p>';

  // Aquí se podría emitir un evento para pedir estrategias específicas si no están en cache
  // emit('request_strategies_for_objective', { objectiveId: objId });

  // Simulación de renderizado (se reemplazará con datos reales)
  setTimeout(() => {
    DOM.availableStratList.innerHTML = `
      <div class="strategy-item" onclick="window.StrategyCabinet.selectStrategy('econ_local_1')">
        <span>🏭 Industria Extractiva Local</span>
        <small>Costo: $$</small>
      </div>
      <div class="strategy-item" onclick="window.StrategyCabinet.selectStrategy('intel_reg_1')">
        <span>🕵️ Análisis Facciones Vecinas</span>
        <small>Costo: Intel</small>
      </div>
    `;
  }, 200);
}

// Expuesto globalmente para los onclick inline del ejemplo (mejor usar addEventListener en prod)
window.StrategyCabinet = {
  selectStrategy: (stratId) => {
    _uiState.selectedStrategyId = stratId;
    document.querySelectorAll('.strategy-item').forEach(el => el.classList.remove('selected'));
    // Highlight visual logic here...
    console.log(`Estrategia seleccionada: ${stratId}`);
  }
};

function openObjectiveSelector() {
  DOM.selectorModal.classList.remove('hidden');
  filterObjectiveCatalog('global'); // Default
}

function filterObjectiveCatalog(scope) {
  // Lógica para filtrar y mostrar tarjetas de objetivos disponibles
  // Debería leer de una config cargada al inicio o pedirla al server
  DOM.objCatalog.innerHTML = `<p>Mostrando objetivos ${scope}...</p>`;
}

// --- Control de Flujo Modal ---
export function openCabinet() {
  _uiState.isOpen = true;
  DOM.modal.classList.remove('hidden');
  // Forzar refresh inmediato
  emit('request_full_state_sync');
}

function closeCabinet() {
  _uiState.isOpen = false;
  DOM.modal.classList.add('hidden');
}