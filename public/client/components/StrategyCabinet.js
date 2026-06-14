/**
 * @file StrategyCabinet.js
 * @description Componente UI para la gestión de Objetivos Estratégicos y Estrategias Activas.
 *              Permite al jugador seleccionar objetivos, activar estrategias, asignar recursos
 *              y recibir asesoría de IA. Se comunica con el backend vía IntentDispatcher.
 * 
 * @version 1.0.0
 * @dependencies UI.js (para inyección), app.js (para envío de intents)
 */

export class StrategyCabinet {
  constructor() {
    // Referencias al DOM
    this.modal = document.getElementById('strategy-cabinet-modal');
    this.closeBtn = document.getElementById('cabinet-close-btn');

    // Contenedores principales
    this.objectivesListContainer = document.getElementById('cabinet-objectives-list');
    this.activeStrategiesContainer = document.getElementById('cabinet-active-strategies');
    this.aiAdviceContainer = document.getElementById('cabinet-ai-advice');

    // Pestañas de filtrado
    this.filterTabs = document.querySelectorAll('.cabinet-filter-tab');

    // Estado interno local (para evitar re-renderizados innecesarios)
    this.currentFilter = 'all';
    this.availableObjectives = [];
    this.activePlayerObjectives = [];
    this.activeStrategies = [];
    this.playerNationId = null;

    // Bindings
    this._handleTabClick = this._handleTabClick.bind(this);
    this._handleObjectiveSelect = this._handleObjectiveSelect.bind(this);
    this._handleStrategyActivate = this._handleStrategyActivate.bind(this);
    this._handleResourceChange = this._handleResourceChange.bind(this);
    this._handleClose = this._handleClose.bind(this);
  }

  /**
   * Inicializa listeners internos y configura el componente.
   * Se llama una vez al cargar la aplicación.
   */
  init() {
    if (!this.modal) {
      console.error('[StrategyCabinet] Modal no encontrado en el DOM.');
      return;
    }

    // Listener botón cerrar
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', this._handleClose);
    }

    // Listeners pestañas de filtro
    this.filterTabs.forEach(tab => {
      tab.addEventListener('click', this._handleTabClick);
    });

    // Listener clic fuera del modal para cerrar (opcional)
    window.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    console.log('[StrategyCabinet] Inicializado correctamente.');
  }

  /**
   * Actualiza el estado del componente con los datos frescos del servidor.
   * Se llama desde UI.js en cada tick o cuando llega un evento relevante.
   * @param {Object} state - Estado global del juego.
   */
  update(state) {
    if (!state || !state.nations) return;

    const prevNationId = this.playerNationId;
    this.playerNationId = state.playerNationId;
    const nation = state.nations[this.playerNationId];

    if (!nation) return;

    // 1. Actualizar datos internos si cambió la nación o es la primera vez
    if (prevNationId !== this.playerNationId) {
      this._syncLocalState(nation, state.objectiveManagerConfig);
    }

    // 2. Renderizar lista de objetivos disponibles (si está vacía o cambió)
    // Optimización: Solo re-renderizar si hay cambios reales en la lista disponible
    this._renderObjectivesList(nation);

    // 3. Renderizar estrategias activas y progreso
    this._renderActiveStrategies(nation);

    // 4. Actualizar panel de IA (consejos dinámicos)
    this._updateAIAdvice(nation, state);
  }

  /**
   * Abre el modal.
   */
  open() {
    if (this.modal) {
      this.modal.style.display = 'flex';
      // Forzar actualización inmediata al abrir
      // UI.js debería llamar a update() justo después
      console.log('[StrategyCabinet] Modal abierto.');
    }
  }

  /**
   * Cierra el modal.
   */
  close() {
    if (this.modal) {
      this.modal.style.display = 'none';
      console.log('[StrategyCabinet] Modal cerrado.');
    }
  }

  // ==========================================================================
  // Lógica Interna de Renderizado
  // ==========================================================================

  _syncLocalState(nation, config) {
    // Sincronizar datos locales desde el estado de la nación
    // Asumimos que el estado tiene campos como: nation.objectives, nation.strategies
    this.activePlayerObjectives = nation.objectives || [];
    this.activeStrategies = nation.activeStrategies || [];

    // Cargar configuración completa de objetivos disponibles desde el estado global o config estático
    // Nota: El backend debería enviar la lista completa de definiciones en el primer payload o en un evento 'config_loaded'
    if (config && config.categories) {
      this.availableObjectives = this._flattenObjectives(config.categories);
    }
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

  _renderObjectivesList(nation) {
    if (!this.objectivesListContainer) return;

    // Filtrar objetivos ya activos
    const activeIds = new Set(this.activePlayerObjectives.map(o => o.id || o.configId));
    let filtered = this.availableObjectives.filter(o => !activeIds.has(o.id));

    // Aplicar filtro de pestaña
    if (this.currentFilter !== 'all') {
      // Mapeo simple de filtros: 'global', 'regional', 'local' vs categorías del JSON ('economic', 'military'...)
      // Aquí asumimos que el filtro UI coincide con la categoría o añadimos lógica de mapeo
      if (['economic', 'military', 'diplomatic', 'influence'].includes(this.currentFilter)) {
        filtered = filtered.filter(o => o.category === this.currentFilter);
      }
    }

    if (filtered.length === 0) {
      this.objectivesListContainer.innerHTML = '<div class="empty-state">No hay objetivos disponibles en esta categoría.</div>';
      return;
    }

    this.objectivesListContainer.innerHTML = filtered.map(obj => `
      <div class="objective-card" data-id="${obj.id}">
        <div class="card-header">
          <h4>${obj.name}</h4>
          <span class="badge ${obj.difficulty}">${obj.difficulty}</span>
        </div>
        <p class="desc">${obj.description}</p>
        <div class="requirements">
          ${this._renderRequirements(obj.requirements)}
        </div>
        <div class="card-actions">
          <button class="btn-select" data-action="select" data-id="${obj.id}">Seleccionar</button>
        </div>
      </div>
    `).join('');

    // Re-asignar listeners a los nuevos botones
    this.objectivesListContainer.querySelectorAll('[data-action="select"]').forEach(btn => {
      btn.addEventListener('click', this._handleObjectiveSelect);
    });
  }

  _renderRequirements(reqs) {
    if (!reqs) return '';
    return Object.entries(reqs).map(([key, val]) => {
      // Formateo simple de claves snake_case a texto legible
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      return `<span class="req-tag">${label}: ${val}</span>`;
    }).join('');
  }

  _renderActiveStrategies(nation) {
    if (!this.activeStrategiesContainer) return;

    if (!this.activeStrategies || this.activeStrategies.length === 0) {
      this.activeStrategiesContainer.innerHTML = '<div class="empty-state">No hay estrategias activas.</div>';
      return;
    }

    // Necesitamos la configuración de las estrategias para mostrar nombres y detalles
    // Asumimos que tenemos acceso a strategiesConfig globalmente o lo pasamos en update
    // Para este ejemplo, buscamos en un global hipotético window.gameConfig.strategies
    const strategiesDefs = window.gameConfig?.strategies || [];

    this.activeStrategiesContainer.innerHTML = this.activeStrategies.map(strat => {
      const def = strategiesDefs.find(s => s.id === strat.id) || {};
      const progress = this._calculateStrategyProgress(strat, nation); // Lógica ficticia de progreso

      return `
        <div class="strategy-slot active">
          <div class="slot-header">
            <h4>${def.name || strat.id}</h4>
            <span class="timer">⏳ ${strat.endTick - (nation.tick || 0)} ticks</span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${progress}%"></div>
          </div>
          <div class="resource-allocation">
            <label>Asignación de Recursos:</label>
            <div class="slider-group">
              <span>Budget</span>
              <input type="range" min="0" max="100" value="50" disabled title="Requiere implementación backend para ajuste en tiempo real">
            </div>
          </div>
          <div class="slot-actions">
             <button class="btn-cancel" data-action="cancel-strategy" data-id="${strat.id}">Cancelar</button>
          </div>
        </div>
      `;
    }).join('');

    // Listener cancelar estrategia
    this.activeStrategiesContainer.querySelectorAll('[data-action="cancel-strategy"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.dataset.id;
        this._sendIntent('player_cancel_strategy', { strategyId: id });
      });
    });
  }

  _calculateStrategyProgress(strat, nation) {
    // Simulación visual. El cálculo real debería venir del backend en el estado.
    const total = strat.endTick - strat.startTick;
    const current = (nation.tick || 0) - strat.startTick;
    return Math.min(100, Math.max(0, (current / total) * 100));
  }

  _updateAIAdvice(nation, state) {
    if (!this.aiAdviceContainer) return;

    // Aquí se renderizarían los consejos recibidos por evento 'advisor_suggestion'
    // O se generarían estáticos basados en el estado actual si no hay evento reciente

    // Ejemplo estático temporal:
    const stability = nation.stability || 50;
    let advice = "La situación es estable. Considere expandir su influencia económica.";

    if (stability < 40) {
      advice = "⚠️ ALERTA: La estabilidad interna es crítica. Priorice estrategias de bienestar social antes de expandirse.";
    } else if ((nation.budget || 0) < 50) {
      advice = "💰 Sus reservas son bajas. Evite estrategias costosas como el rearme militar.";
    }

    this.aiAdviceContainer.innerHTML = `
      <div class="ai-avatar">🤖</div>
      <div class="ai-text">${advice}</div>
      <div class="ai-meta">Análisis basado en tick ${state.meta?.tick || 0}</div>
    `;
  }

  // ==========================================================================
  // Manejadores de Eventos Internos
  // ==========================================================================

  _handleTabClick(e) {
    const filter = e.target.dataset.filter;
    this.currentFilter = filter;

    // Actualizar clase activa en tabs
    this.filterTabs.forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');

    // Re-renderizar lista
    const nation = window.gameClient?.lastState?.nations?.[this.playerNationId];
    if (nation) this._renderObjectivesList(nation);
  }

  _handleObjectiveSelect(e) {
    const objId = e.target.dataset.id;
    if (!objId) return;

    // Confirmación simple (podría ser un modal nativo o custom)
    if (confirm(`¿Confirmar selección del objetivo estratégico?`)) {
      this._sendIntent('player_set_objective', { objectiveId: objId });
    }
  }

  _handleStrategyActivate(e) {
    // Este manejador se usaría si hubiera un selector de estrategias dentro de la tarjeta de objetivo
    const stratId = e.target.dataset.stratId;
    if (stratId) {
      this._sendIntent('player_activate_strategy', { strategyId: stratId });
    }
  }

  _handleResourceChange(e) {
    // Para sliders de asignación de recursos en tiempo real
    // Requiere debounce y envío de intent específico
    console.log('Cambio de recurso detectado (pendiente implementación backend)', e.target.value);
  }

  _handleClose() {
    this.close();
  }

  // ==========================================================================
  // Comunicación con Backend
  // ==========================================================================

  /**
   * Envía una intención al servidor usando el canal estándar del cliente.
   * @param {string} type - Tipo de evento (ej: 'player_set_objective')
   * @param {Object} payload - Datos de la acción
   */
  _sendIntent(type, payload) {
    if (window.gameClient && typeof window.gameClient.sendIntent === 'function') {
      window.gameClient.sendIntent(type, payload);
      console.log(`[StrategyCabinet] Intent enviado: ${type}`, payload);
    } else {
      console.warn('[StrategyCabinet] gameClient.sendIntent no disponible.');
      // Fallback para debug si no está conectado
      // window.dispatchEvent(new CustomEvent('intent_debug', { detail: { type, payload } }));
    }
  }
}

// Exportar instancia única o la clase según convención del proyecto
// En app.js se haría: const cabinet = new StrategyCabinet(); cabinet.init();
