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
    this.selectorModal = null;
    this.selectorCatalog = null;
    this.selectorScope = 'all';

    // --- Bindings (CRÍTICO: Solo métodos que EXISTEN en esta clase) ---
    this._handleClose = this._handleClose.bind(this);
    this._handleSelectObjectiveBtn = this._handleSelectObjectiveBtn.bind(this);
    this._handleObjectiveSelectorChange = this._handleObjectiveSelectorChange.bind(this);
    this._handleActivateStrategy = this._handleActivateStrategy.bind(this);
    this._handleCloseSelector = this._handleCloseSelector.bind(this);
    this._handleScopeTabClick = this._handleScopeTabClick.bind(this);

    // Handlers internos para eventos dinámicos
    this._onObjectiveCardClick = this._onObjectiveCardClick.bind(this);
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

    this.selectorModal = document.getElementById('objective-selector-modal');
    this.selectorCatalog = document.getElementById('objective-catalog');
    const btnCloseSelector = document.getElementById('btn-close-selector');
    if (btnCloseSelector) {
      btnCloseSelector.addEventListener('click', this._handleCloseSelector);
    }
    document.querySelectorAll('#objective-selector-modal .scope-tabs .tab-btn').forEach((btn) => {
      btn.addEventListener('click', this._handleScopeTabClick);
    });
    if (this.selectorModal) {
      this.selectorModal.addEventListener('click', (e) => {
        if (e.target === this.selectorModal) this._closeObjectiveSelector();
      });
    }

    console.log('[StrategyCabinet] ✅ Inicialización completada y listeners activos.');
  }

  update(state) {
    if (!state || !state.nations) return;

    this.playerNationId = state.playerNationId || 'ARG';

    // Cargar catálogo antes de validar nación (evita botón bloqueado permanentemente)
    if (state.objectiveManagerConfig) {
      this.objConfig = state.objectiveManagerConfig;
      this.stratConfig = state.objectiveManagerConfig.strategies || state.strategyConfig || null;

      if (this.objConfig?.categories) {
        this.availableObjectives = this._flattenObjectives(this.objConfig.categories);
      }

      if (Array.isArray(this.objConfig?.playerObjectives)) {
        this.activePlayerObjectives = this.objConfig.playerObjectives
          .filter(([, data]) => data?.active !== false)
          .map(([id, data]) => ({
            id,
            configId: data.configId || id,
            progress: data.progress || 0,
            ...data
          }));
      }
    }

    const nation = state.nations[this.playerNationId];
    if (nation) {
      if (Array.isArray(nation.objectives) && nation.objectives.length > 0) {
        this.activePlayerObjectives = nation.objectives;
      }
      this.activeStrategies = nation.activeStrategies || [];
    }

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
   * Abre el modal de selección de objetivos disponibles.
   */
  _openObjectiveSelector() {
    const activeIds = new Set(this.activePlayerObjectives.map(o => o.configId || o.id));
    const available = this.availableObjectives.filter(o => !activeIds.has(o.id));

    if (available.length === 0) {
      this._notify('No hay más objetivos disponibles para asignar.', 'warning');
      return;
    }

    if (!this.selectorModal || !this.selectorCatalog) {
      this._notify('Selector de objetivos no disponible en la interfaz.', 'error');
      return;
    }

    this._renderObjectiveCatalog(available);
    this.selectorModal.classList.remove('hidden');
    this.selectorModal.style.display = 'flex';
  }

  _closeObjectiveSelector() {
    if (!this.selectorModal) return;
    this.selectorModal.classList.add('hidden');
    this.selectorModal.style.display = 'none';
  }

  _renderObjectiveCatalog(objectives) {
    if (!this.selectorCatalog) return;

    const filtered = this.selectorScope === 'all'
      ? objectives
      : objectives.filter((obj) => (obj.scope || obj.category) === this.selectorScope);

    if (filtered.length === 0) {
      this.selectorCatalog.innerHTML = '<div style="padding:16px;color:#888;">No hay objetivos en este ámbito.</div>';
      return;
    }

    this.selectorCatalog.innerHTML = filtered.map((obj) => `
      <button type="button" class="objective-card" data-objective-id="${obj.id}" style="text-align:left;">
        <div class="card-header" style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <h4 style="margin:0;color:#fff;">${obj.name}</h4>
          <span class="badge" style="background:#555;padding:2px 6px;font-size:0.8em;">${obj.difficulty || 'Normal'}</span>
        </div>
        <p style="font-size:0.85em;color:#aaa;margin:0;">${obj.description || 'Sin descripción.'}</p>
      </button>
    `).join('');

    this.selectorCatalog.querySelectorAll('[data-objective-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const objectiveId = card.dataset.objectiveId;
        this._assignObjective(objectiveId);
      });
    });
  }

  _assignObjective(objectiveId) {
    const config = this.availableObjectives.find((o) => o.id === objectiveId);
    if (!config) return;

    this._sendIntent('player_set_objective', { objectiveId });
    this._closeObjectiveSelector();
    this._notify(`Solicitando objetivo: ${config.name}`, 'info');
  }

  _handleCloseSelector() {
    this._closeObjectiveSelector();
  }

  _handleScopeTabClick(event) {
    const btn = event.currentTarget;
    const scope = btn.dataset.scope || 'all';
    this.selectorScope = scope;

    document.querySelectorAll('#objective-selector-modal .scope-tabs .tab-btn').forEach((tab) => {
      tab.classList.toggle('active', tab === btn);
    });

    const activeIds = new Set(this.activePlayerObjectives.map(o => o.configId || o.id));
    const available = this.availableObjectives.filter(o => !activeIds.has(o.id));
    this._renderObjectiveCatalog(available);
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
    console.log(`[StrategyCabinet] Enviando intención: ${type}`, payload);

    if (window.app?.syncClient?.sendIntent) {
      window.app.syncClient.sendIntent(type, payload);
      return;
    }

    if (typeof window.sendGameIntent === 'function') {
      window.sendGameIntent(type, payload);
      return;
    }

    if (typeof window.sendIntent === 'function') {
      window.sendIntent(type, payload);
      return;
    }

    console.error('[StrategyCabinet] ERROR: No hay canal disponible para enviar intenciones.');
    this._notify('No se pudo enviar la orden al servidor.', 'error');
  }

  _notify(message, type = 'info') {
    if (typeof window.showNotification === 'function') {
      window.showNotification(message, type);
    } else {
      alert(message);
    }
  }
}