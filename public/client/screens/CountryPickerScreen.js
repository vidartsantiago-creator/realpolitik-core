/**
 * CountryPickerScreen.js
 * Pantalla de selección de nación con informes geopolíticos dinámicos.
 * Dependencias: GeopoliticalReportGenerator, DOM helpers.
 */

import { GeopoliticalReportGenerator } from '../utils/GeopoliticalReportGenerator.js';

export class CountryPickerScreen {
  constructor(onCountrySelect) {
    this.onCountrySelect = onCountrySelect;
    this.container = null;
    this.modal = null;
    this.nationsData = [];
    this.generator = new GeopoliticalReportGenerator();
  }

  /**
   * Inicializa la pantalla cargando datos desde config/world.json
   */
  async init() {
    try {
      const response = await fetch('/config/world.json');
      if (!response.ok) throw new Error('Failed to load world config');
      const data = await response.json();
      this.nationsData = data.nations || [];
      this.render();
    } catch (error) {
      console.error('Error loading nations:', error);
      this.showError();
    }
  }

  render() {
    // Crear contenedor principal
    this.container = document.createElement('div');
    this.container.id = 'country-picker-screen';
    this.container.className = 'screen active';

    // Header
    const header = document.createElement('div');
    header.className = 'screen-header';
    header.innerHTML = `
            <h1 class="glitch" data-text="REALPOLITIK CORE">REALPOLITIK CORE</h1>
            <p class="subtitle">SELECCIONE UNA NACIÓN PARA ASUMIR EL MANDO</p>
        `;

    // Grid de países
    const grid = document.createElement('div');
    grid.className = 'nation-grid';

    if (this.nationsData.length === 0) {
      grid.innerHTML = '<div class="error-msg">No hay naciones disponibles en la configuración.</div>';
    } else {
      this.nationsData.forEach(nation => {
        const card = this.createNationCard(nation);
        grid.appendChild(card);
      });
    }

    this.container.appendChild(header);
    this.container.appendChild(grid);

    // Crear modal oculto
    this.createModal();

    // Append al DOM principal (asumiendo que existe un #app o body)
    const app = document.getElementById('app') || document.body;
    app.appendChild(this.container);
  }

  createNationCard(nation) {
    const card = document.createElement('div');
    card.className = 'nation-card';
    card.style.borderColor = nation.color;

    // Badge de dificultad
    const stars = '★'.repeat(nation.difficulty_rating?.stars || 3);

    card.innerHTML = `
            <div class="card-header" style="background: linear-gradient(135deg, ${nation.color}22, ${nation.color}05)">
                <span class="nation-code">${nation.code}</span>
                <span class="difficulty-badge" title="Dificultad: ${nation.difficulty_rating?.stars || 3}/5">${stars}</span>
            </div>
            <div class="card-body">
                <h3 class="nation-name">${nation.name}</h3>
                <div class="nation-stats-preview">
                    <span class="stat"><i class="icon-pop"></i> ${(nation.population / 1000000).toFixed(1)}M</span>
                    <span class="stat"><i class="icon-gdp"></i> ${(nation.gdp / 1000000000).toFixed(0)}B</span>
                    <span class="stat"><i class="icon-stab"></i> ${(nation.stability * 100).toFixed(0)}%</span>
                </div>
                <p class="nation-desc-short">
                    ${nation.geopolitical_report?.global_position.substring(0, 80)}...
                </p>
            </div>
            <div class="card-footer">
                <button class="btn btn-outline" data-action="info">INFORME</button>
                <button class="btn btn-primary" data-action="select">SELECCIONAR</button>
            </div>
        `;

    // Event Listeners
    const [btnInfo, btnSelect] = card.querySelectorAll('button');

    btnInfo.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openModal(nation);
    });

    btnSelect.addEventListener('click', () => {
      this.selectNation(nation);
    });

    // Click en toda la tarjeta abre modal (opcional)
    card.addEventListener('dblclick', () => this.selectNation(nation));

    return card;
  }

  createModal() {
    this.modal = document.createElement('div');
    this.modal.id = 'nation-info-modal';
    this.modal.className = 'modal-overlay hidden';
    this.modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="modal-title">Nombre Nación</h2>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="modal-body" id="modal-body">
                    <!-- Contenido dinámico -->
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" id="modal-select-btn">CONFIRMAR SELECCIÓN</button>
                </div>
            </div>
        `;

    // Cerrar modal
    this.modal.querySelector('.close-btn').addEventListener('click', () => this.closeModal());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });

    // Botón seleccionar desde modal
    this.modal.querySelector('#modal-select-btn').addEventListener('click', () => {
      if (this.currentNation) {
        this.closeModal();
        this.selectNation(this.currentNation);
      }
    });

    document.body.appendChild(this.modal);
  }

  openModal(nation) {
    this.currentNation = nation;
    const title = this.modal.querySelector('#modal-title');
    const body = this.modal.querySelector('#modal-body');

    title.textContent = nation.name;
    title.style.color = nation.color;

    // Generar informe HTML usando el utilitario
    const reportHtml = this.generator.generateFullReportHTML(nation);
    body.innerHTML = reportHtml;

    this.modal.classList.remove('hidden');
    // Pequeña animación de entrada
    setTimeout(() => this.modal.classList.add('visible'), 10);
  }

  closeModal() {
    this.modal.classList.remove('visible');
    setTimeout(() => this.modal.classList.add('hidden'), 300); // Esperar transición CSS
    this.currentNation = null;
  }

  selectNation(nation) {
    // Feedback visual antes de cambiar
    if (this.container) {
      this.container.classList.add('fading-out');
    }

    // Llamar callback para pasar a siguiente pantalla
    setTimeout(() => {
      this.onCountrySelect(nation);
    }, 500);
  }

  showError() {
    if (this.container) {
      this.container.innerHTML = `
                <div class="error-container">
                    <h2>Error Crítico</h2>
                    <p>No se pudo cargar la configuración del mundo.</p>
                    <button class="btn btn-primary" onclick="location.reload()">REINTENTAR</button>
                </div>
            `;
    }
  }

  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    if (this.modal && this.modal.parentNode) {
      this.modal.parentNode.removeChild(this.modal);
    }
  }
}