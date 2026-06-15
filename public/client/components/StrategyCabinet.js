/**
 * @file StrategyCabinet.js
 * @description Componente UI para la gestión de Objetivos Estratégicos.
 */

export class StrategyCabinet {
  constructor() {
    // --- Referencias al DOM (Se asignarán en init) ---
    this.modal = null;
    this.closeBtn = null;

    // --- Contenedores Críticos ---
    this.objectivesList = null;           // #active-objectives-list
    this.strategiesContainer = null;      // #strategy-management-area
    this.availableStrategiesList = null;  // #available-strategies-list
    this.adviceContainer = null;          // #ai-report-content

    // --- Botones de Acción ---
    this.btnSelectObjective = null;       // #btn-select-objective
    this.btnActivateStrategy = null;      // #btn-activate-strategy
    this.btnAiReport = null;              // #btn-ai-report-progress
    this.btnAiRecommend = null;           // #btn-ai-recommendation

    // --- Selectores ---
    this.objectiveSelector = null;        // #strategy-objective-select

    // --- Estado Interno ---
    this.currentFilter = 'all';
    this.availableObjectives = [];
    this.activePlayerObjectives = [];
    this.activeStrategies = [];
    this.playerNationId = null;
    this.objConfig = null;
    this.stratConfig = null;
    this.selectedObjectiveId = null;

    // --- Bindings (CRÍTICO: Solo métodos que EXISTEN en esta clase) ---
    this._handleClose = this._handleClose.bind(this);
    this._handleSelectObjectiveBtn = this._handleSelectObjectiveBtn.bind(this);
    this._handleObjectiveSelectorChange = this._handleObjectiveSelectorChange.bind(this);
    this._handleActivateStrategy = this._handleActivateStrategy.bind(this);

    // Handlers internos para eventos dinámicos
    this._onObjectiveCardClick = this._onObjectiveCardClick.bind(this);
    this._onAddNewObjectiveClick = this._onAddNewObjectiveClick.bind(this);
  }

  init() {
    console.log('[StrategyCabinet] Iniciando componente...');

    if (!document.getElementById('strategy-cabinet-modal')) {
      console.error('[StrategyCabinet] Modal no encontrado en el DOM.');
      return;
    }

    // 1. Asignar referencias DOM
    this.modal = document.getElementById('strategy-cabinet-modal');
    this.closeBtn = document.getElementById('btn-close-cabinet');

    // Contenedores
    this.objectivesList = document.getElementById('active-objectives-list');
    this.strategiesContainer = document.getElementById('strategy-management-area');
    this.availableStrategiesList = document.getElementById('available-strategies-list');
    this.adviceContainer = document.getElementById('ai-report-content');

    // Botones y Selectores
    this.btnSelectObjective = document.getElementById('btn-select-objective');
    this.btnActivateStrategy = document.getElementById('btn-activate-strategy');
    this.objectiveSelector = document.getElementById('strategy-objective-select');

    // 2. Adjuntar Listeners Estáticos

    // Cerrar modal
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', this._handleClose);
    }

    // Click fuera del modal
    window.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    // Listener para el botón "+ Asignar Nuevo Objetivo"
    if (this.btnSelectObjective) {
      this.btnSelectObjective.addEventListener('click', this._handleSelectObjectiveBtn);
      console.log('[StrategyCabinet] Listener asignado a btn-select-objective');
    } else {
      console.warn('[StrategyCabinet] No se encontró btn-select-objective');
    }

    // Listener para cambiar de objetivo en el dropdown
    if (this.objectiveSelector) {
      this.objectiveSelector.addEventListener('change', this._handleObjectiveSelectorChange);
    }

    // Listener para activar estrategia
    if (this.btnActivateStrategy) {
      this.btnActivateStrategy.addEventListener('click', this._handleActivateStrategy);
    }

    console.log('[StrategyCabinet] ✅ Inicialización completada y listeners activos.');
  }

  update(state) {
    if (!state || !state.nations) return;

    this.playerNationId = state.playerNationId;
    const nation = state.nations[this.playerNationId];
    if (!nation) return;

    // Guardar configuración si llega
    if (state.objectiveManagerConfig) {
      this.objConfig = state.objectiveManagerConfig;
      this.stratConfig = state.strategyConfig || null;

      if (this.objConfig && this.objConfig.categories) {
        this.availableObjectives = this._flattenObjectives(this.objConfig.categories);
      }
    }

    // Sincronizar activos
    this.activePlayerObjectives = nation.objectives || [];
    this.activeStrategies = nation.activeStrategies || [];

    // Renderizar
    this._renderObjectivesList();
    this._updateObjectiveSelector();
    this._updateAIAdvice(nation, state);

    // Debug visual del contador
    const countSpan = document.getElementById('obj-count');
    if (countSpan) countSpan.textContent = this.activePlayerObjectives.length;
  }

  open() {
    if (this.modal) {
      this.modal.style.display = 'flex';
      this.modal.classList.remove('hidden');
      console.log('[StrategyCabinet] Modal abierto.');
    }
  }

  close() {
    if (this.modal) {
      this.modal.style.display = 'none';
      this.modal.classList.add('hidden');
    }
  }

  // --- Renderizado ---

  _renderObjectivesList() {
    if (!this.objectivesList) {
      console.warn('[StrategyCabinet] objectivesList no encontrado en el DOM.');
      return;
    }

    const maxObjectives = 2;
    const currentCount = this.activePlayerObjectives.length;
    const canAddMore = currentCount < maxObjectives;

    // 1. Renderizar las tarjetas de objetivos activos
    if (currentCount === 0) {
      this.objectivesList.innerHTML = '<div style="color:#888; padding:15px; text-align:center;">No hay objetivos activos asignados.</div>';
    } else {
      this.objectivesList.innerHTML = this.activePlayerObjectives.map(obj => {
        const config = this.availableObjectives.find(o => o.id === (obj.configId || obj.id)) || {};
        const objId = config.id || obj.configId || obj.id;

        return `
          <div class="objective-card active" data-id="${objId}" style="cursor:pointer; border:1px solid #444; padding:10px; margin-bottom:10px; background:#222;">
            <div class="card-header" style="display:flex; justify-content:space-between; margin-bottom:5px;">
              <h4 style="margin:0; color:#fff;">${config.name || 'Objetivo Desconocido'}</h4>
              <span class="badge" style="background:#555; padding:2px 6px; font-size:0.8em;">${config.difficulty || 'Normal'}</span>
            </div>
            <p style="font-size:0.85em; color:#aaa; margin:5px 0;">${config.description || 'Sin descripción disponible.'}</p>
            <div class="progress-container" style="background:#333; height:6px; width:100%; margin-top:8px;">
              <div style="width:${obj.progress || 0}%; background:#4caf50; height:100%; transition:width 0.3s;"></div>
            </div>
            <div style="text-align:right; font-size:0.75em; color:#888; margin-top:4px;">Progreso: ${obj.progress || 0}%</div>
          </div>
        `;
      }).join('');
    }

    // 2. Gestionar el botón "+ Asignar Nuevo Objetivo"
    // CORRECCIÓN: Usar this.btnSelectObjective (nombre correcto del constructor)
    if (this.btnSelectObjective) {
      if (canAddMore && this.availableObjectives.length > 0) {
        this.btnSelectObjective.disabled = false;
        this.btnSelectObjective.textContent = '+ Asignar Nuevo Objetivo';
        this.btnSelectObjective.style.opacity = '1';
        this.btnSelectObjective.style.cursor = 'pointer';
      } else if (!canAddMore) {
        this.btnSelectObjective.disabled = true;
        this.btnSelectObjective.textContent = 'Máximo de objetivos alcanzado (2/2)';
        this.btnSelectObjective.style.opacity = '0.5';
        this.btnSelectObjective.style.cursor = 'not-allowed';
      } else {
        this.btnSelectObjective.disabled = true;
        this.btnSelectObjective.textContent = 'No hay objetivos disponibles';
        this.btnSelectObjective.style.opacity = '0.5';
      }
    }

    // 3. Re-asignar Event Listeners (CRUCIAL: Se pierden al usar innerHTML)

    // Listener para seleccionar un objetivo activo
    this.objectivesList.querySelectorAll('.objective-card.active').forEach(card => {
      // Remover listener previo si existe (opcional, pero buena práctica)
      card.removeEventListener('click', this._onObjectiveCardClick);
      card.addEventListener('click', this._onObjectiveCardClick);
    });

    // Listener para el botón de añadir nuevo
    if (this.btnSelectObjective && !this.btnSelectObjective.disabled) {
      this.btnSelectObjective.removeEventListener('click', this._onAddNewObjectiveClick);
      this.btnSelectObjective.addEventListener('click', this._onAddNewObjectiveClick);
    }
  }

  /**
   * Handler interno para click en tarjeta de objetivo
   */
  _onObjectiveCardClick(e) {
    const card = e.currentTarget;
    const id = card.dataset.id;
    console.log(`[StrategyCabinet] Tarjeta clickeada: ${id}`);
    this._onObjectiveSelected(id);
  }

  /**
   * Handler interno para click en botón "Asignar Nuevo"
   */
  _onAddNewObjectiveClick() {
    console.log('[StrategyCabinet] Click directo en botón Asignar Nuevo');
    this._openObjectiveSelector();
  }

  /**
   * Maneja la lógica cuando se selecciona un objetivo activo de la lista.
   */
  _onObjectiveSelected(objectiveId) {
    console.log(`[StrategyCabinet] Preparando gestión para objetivo: ${objectiveId}`);
    this.selectedObjectiveId = objectiveId;

    // Visualmente marcar como seleccionado
    this.objectivesList.querySelectorAll('.objective-card').forEach(c => c.style.border = '1px solid #444');
    const selectedCard = this.objectivesList.querySelector(`.objective-card[data-id="${objectiveId}"]`);
    if (selectedCard) selectedCard.style.border = '1px solid #4caf50';

    // CORRECCIÓN: Usar this.strategiesContainer (nombre correcto)
    if (this.strategiesContainer) {
      this.strategiesContainer.classList.remove('hidden');
      this.strategiesContainer.style.display = 'block';

      // Actualizar el selector dropdown
      if (this.objectiveSelector) {
        this.objectiveSelector.value = objectiveId;
        // Disparar cambio manualmente para cargar estrategias
        this.objectiveSelector.dispatchEvent(new Event('change'));
      }
    }
  }

  /**
   * Abre un modal o lógica para elegir un nuevo objetivo de la lista disponible.
   */
  _openObjectiveSelector() {
    const activeIds = new Set(this.activePlayerObjectives.map(o => o.configId || o.id));
    const available = this.availableObjectives.filter(o => !activeIds.has(o.id));

    if (available.length === 0) {
      alert("No hay más objetivos disponibles para asignar.");
      return;
    }

    const firstAvailable = available[0];
    if (confirm(`¿Deseas asignar el objetivo: "${firstAvailable.name}"?`)) {
      this._sendIntent('player_set_objective', { objectiveId: firstAvailable.id });
    }
  }

  _updateObjectiveSelector() {
    if (!this.objectiveSelector) return;

    const currentVal = this.objectiveSelector.value;
    let options = '<option value="" disabled selected>Seleccione un objetivo activo...</option>';

    this.activePlayerObjectives.forEach(obj => {
      const config = this.availableObjectives.find(o => o.id === obj.configId || o.id === obj.id) || obj;
      const isSelected = (obj.id === currentVal || obj.configId === currentVal) ? 'selected' : '';
      options += `<option value="${config.id}" ${isSelected}>${config.name}</option>`;
    });

    this.objectiveSelector.innerHTML = options;

    if (currentVal && this.activePlayerObjectives.some(o => o.id === currentVal || o.configId === currentVal)) {
      this._renderStrategiesFor(currentVal);
    } else {
      if (this.strategiesContainer) this.strategiesContainer.classList.add('hidden');
    }
  }

  _renderStrategiesFor(objectiveId) {
    if (!this.strategiesContainer || !this.availableStrategiesList) return;

    this.strategiesContainer.classList.remove('hidden');

    // Simulación de estrategias disponibles
    const relevantStrategies = this.stratConfig || [];

    if (relevantStrategies.length === 0) {
      this.availableStrategiesList.innerHTML = '<div style="padding:10px; color:#888;">Cargando estrategias o ninguna disponible para este objetivo.</div>';
      return;
    }

    this.availableStrategiesList.innerHTML = relevantStrategies.map(strat => `
      <div class="strategy-card" style="background:#2a2a2a; padding:10px; margin-bottom:5px; border:1px solid #444;">
        <h4>${strat.name || strat.id}</h4>
        <p style="font-size:0.85em; color:#aaa;">${strat.description || 'Estrategia táctica'}</p>
        <div style="margin-top:5px; font-size:0.8em; color:#ff9800;">Costo: ${strat.cost || 'Medio'} | Riesgo: ${strat.risk || 'Bajo'}</div>
        <button class="btn-sm" style="margin-top:5px;" onclick="console.log('Activar ${strat.id}')">Activar</button>
      </div>
    `).join('');
  }

  _updateAIAdvice(nation, state) {
    if (!this.adviceContainer) return;
    const stability = nation.stability || 50;
    const msg = stability < 40
      ? "⚠️ ALERTA: Estabilidad crítica. Priorice bienestar social."
      : "La situación es estable. Considere expandir influencia económica.";

    this.adviceContainer.innerHTML = `<p>${msg}</p><small>Tick: ${state.meta?.tick || 0}</small>`;
  }

  _flattenObjectives(categories) {
    let all = [];
    for (const cat of Object.values(categories)) {
      if (cat.objectives) {
        all = [...all, ...cat.objectives.map(o => ({ ...o, category: cat.id }))];
      }
    }
    return all;
  }

  // --- Handlers ---

  _handleSelectObjectiveBtn() {
    console.log('[StrategyCabinet] Click en "Asignar Nuevo Objetivo" (Handler Principal)');
    this._openObjectiveSelector();
  }

  _handleObjectiveSelectorChange(e) {
    const objId = e.target.value;
    if (objId) {
      this._renderStrategiesFor(objId);
    }
  }

  _handleActivateStrategy() {
    console.log('[StrategyCabinet] Activar estrategia clicked');
    alert("Funcionalidad de activación específica pendiente de conectar con backend.");
  }

  _handleClose() {
    this.close();
  }

  _sendIntent(type, payload) {
    if (typeof window.sendGameIntent === 'function') {
      console.log(`[StrategyCabinet] Enviando intención: ${type}`, payload);
      window.sendGameIntent(type, payload);
    } else {
      console.error('[StrategyCabinet] ERROR: window.sendGameIntent no está disponible.');
    }
  }
}