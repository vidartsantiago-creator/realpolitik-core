/**
 * StrategyCabinetUI.js
 * Capa de presentación pura para el Gabinete de Estrategia.
 * Responsable de renderizar el estado recibido del servidor en la interfaz High-Tech.
 */

export class StrategyCabinetUI {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.currentState = null;
    this.onSelectObjective = null; // Callback para cuando el usuario elige

    // Template HTML inicial
    this.renderSkeleton();
  }

  /**
   * Renderiza la estructura base vacía
   */
  renderSkeleton() {
    this.container.innerHTML = `
            <div class="strategy-cabinet-root">
                <header class="sc-header">
                    <h2 class="sc-title">Gabinete de Estrategia Nacional</h2>
                    <div class="sc-status">● SISTEMA EN LÍNEA</div>
                </header>
                <main class="sc-grid" id="sc-objectives-grid">
                    <!-- Las tarjetas se inyectan aquí dinámicamente -->
                    <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding-top: 50px;">
                        <span class="sc-loading">ESPERANDO DATOS DEL NÚCLEO...</span>
                    </div>
                </main>
            </div>
            
            <!-- Modal de Selección (Oculto por defecto) -->
            <div class="sc-modal-overlay" id="sc-selection-modal">
                <div class="sc-modal">
                    <div class="sc-modal-header">
                        <h3 class="sc-modal-title">SELECCIONAR DIRECTIVA ESTRATÉGICA</h3>
                        <button class="sc-close-btn" id="sc-modal-close">&times;</button>
                    </div>
                    <div class="sc-modal-body">
                        <ul class="sc-option-list" id="sc-option-list">
                            <!-- Opciones inyectadas aquí -->
                        </ul>
                    </div>
                </div>
            </div>
        `;

    // Bindings básicos del modal
    const closeBtn = this.container.querySelector('#sc-modal-close');
    const overlay = this.container.querySelector('#sc-selection-modal');

    closeBtn.addEventListener('click', () => this.closeModal());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeModal();
    });
  }

  /**
   * Actualiza la UI con nuevos datos del estado
   * @param {Object} state - El estado completo del juego recibido del servidor
   * @param {Function} onSelectCallback - Función a llamar cuando se selecciona un objetivo
   */
  update(state, onSelectCallback) {
    this.currentState = state;
    this.onSelectObjective = onSelectCallback;

    const grid = this.container.querySelector('#sc-objectives-grid');
    if (!grid) return;

    // Limpiar solo si es la primera carga o si cambió la estructura drásticamente
    // En una implementación optimizada, aquí haríamos diffing, pero para MVP reconstruimos seguro
    grid.innerHTML = '';

    if (!state.objectives) {
      grid.innerHTML = '<div style="color:var(--alert-red)">ERROR: SIN DATOS DE OBJETIVOS</div>';
      return;
    }

    // Renderizar cada categoría o objetivo
    // Asumiendo que state.objectives es un array o mapa de objetivos activos/disponibles
    // Nota: Adaptar según la estructura real que venga en 'state'

    // Ejemplo de iteración sobre objetivos definidos en el sistema
    // Si el backend envía solo los activos, necesitamos una lista maestra local o pedirla.
    // Para este ejemplo, asumimos que 'state.objectives' trae la lista completa con estado.

    Object.values(state.objectives).forEach(obj => {
      const card = this.createObjectiveCard(obj);
      grid.appendChild(card);
    });
  }

  /**
   * Crea el elemento DOM para una tarjeta de objetivo
   */
  createObjectiveCard(objective) {
    const card = document.createElement('div');
    card.className = `sc-card ${objective.isActive ? 'active' : ''}`;

    // Determinar clase de riesgo si existe
    if (objective.riskLevel === 'high') card.classList.add('risk-high');

    const progressPercent = objective.progress ? Math.round((objective.current / objective.target) * 100) : 0;
    const isComplete = progressPercent >= 100;

    card.innerHTML = `
            <div class="sc-card-header">
                <span>ID: ${objective.id.toUpperCase()}</span>
                <span>${objective.category || 'GENERAL'}</span>
            </div>
            <div class="sc-card-title">${objective.name}</div>
            <div class="sc-card-desc">${objective.description}</div>
            
            ${objective.isActive ? `
                <div class="sc-progress-container">
                    <div class="sc-progress-bar" style="width: ${progressPercent}%"></div>
                </div>
                <div class="sc-progress-text">
                    <span>PROGRESO</span>
                    <span>${progressPercent}% ${isComplete ? '(COMPLETADO)' : ''}</span>
                </div>
            ` : `
                <button class="sc-assign-btn" onclick="document.dispatchEvent(new CustomEvent('open-strategy-modal', {detail: {categoryId: '${objective.category}'}}))">
                    + ASIGNAR DIRECTIVA
                </button>
            `}
        `;

    // Click en la tarjeta para ver detalles o re-asignar si está activa
    card.addEventListener('click', () => {
      if (!objective.isActive && this.onSelectObjective) {
        this.openModal(objective.category);
      }
    });

    return card;
  }

  /**
   * Abre el modal de selección
   */
  openModal(categoryFilter = null) {
    const modal = this.container.querySelector('#sc-selection-modal');
    const list = this.container.querySelector('#sc-option-list');
    list.innerHTML = '';

    // Filtrar objetivos disponibles (lógica simple: los que no están activos)
    // En producción, esto debería venir de una lista maestra de definiciones
    const available = Object.values(this.currentState.objectives).filter(o => !o.isActive);

    if (available.length === 0) {
      list.innerHTML = '<li style="padding:20px; color:var(--text-muted)">TODAS LAS DIRECTIVAS ESTÁN ACTUALMENTE EN EJECUCIÓN.</li>';
    } else {
      available.forEach(obj => {
        const li = document.createElement('li');
        li.className = 'sc-option-item';
        li.innerHTML = `
                    <div class="sc-option-info">
                        <h4>${obj.name}</h4>
                        <p>${obj.description}</p>
                    </div>
                    <div class="sc-select-icon">▶</div>
                `;
        li.addEventListener('click', () => {
          if (this.onSelectObjective) {
            this.onSelectObjective(obj.id);
            this.closeModal();
          }
        });
        list.appendChild(li);
      });
    }

    modal.classList.add('open');
  }

  closeModal() {
    const modal = this.container.querySelector('#sc-selection-modal');
    modal.classList.remove('open');
  }
}