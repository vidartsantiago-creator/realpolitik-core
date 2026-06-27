/**
 * GeopoliticalReportGenerator.js
 * Genera contenido HTML narrativo para los informes de país.
 * Transforma datos crudos de world.json en texto legible y estructurado.
 */

export class GeopoliticalReportGenerator {

  /**
   * Genera el informe completo en formato HTML
   * @param {Object} nation - Objeto de nación completo
   * @returns {string} HTML string
   */
  generateFullReportHTML(nation) {
    if (!nation || !nation.geopolitical_report) {
      return '<p class="error">Informe no disponible.</p>';
    }

    const report = nation.geopolitical_report;
    const difficulty = nation.difficulty_rating || {};
    const stats = this.generateStatsTable(nation);

    return `
            <div class="report-container">
                <section class="report-section">
                    <h3>POSICIÓN GLOBAL</h3>
                    <p>${report.global_position}</p>
                </section>

                <section class="report-section grid-2">
                    <div class="col">
                        <h3>FORTALEZAS INTERNAS</h3>
                        <ul>
                            ${this.formatList(report.internal_strengths)}
                        </ul>
                    </div>
                    <div class="col">
                        <h3>DEBILIDADES INTERNAS</h3>
                        <ul>
                            ${this.formatList(report.internal_weaknesses)}
                        </ul>
                    </div>
                </section>

                <section class="report-section grid-2">
                    <div class="col">
                        <h3>VENTAJAS EXTERNAS</h3>
                        <ul>
                            ${this.formatList(report.external_strengths)}
                        </ul>
                    </div>
                    <div class="col">
                        <h3>VULNERABILIDADES EXTERNAS</h3>
                        <ul>
                            ${this.formatList(report.external_weaknesses)}
                        </ul>
                    </div>
                </section>

                <section class="report-section">
                    <h3>HISTORIA RECIENTE</h3>
                    <div class="history-timeline">
                        <p><strong class="highlight">Fase 1:</strong> ${report.recent_history_p1}</p>
                        <p><strong class="highlight">Fase 2:</strong> ${report.recent_history_p2}</p>
                        <p><strong class="highlight">Situación Actual:</strong> ${report.recent_history_p3}</p>
                    </div>
                </section>

                <section class="report-section stats-summary">
                    <h3>EVALUACIÓN DE INTELIGENCIA</h3>
                    ${stats}
                    <div class="difficulty-warning ${this.getDifficultyClass(difficulty.stars)}">
                        <strong>Nivel de Desafío:</strong> ${this.getDifficultyText(difficulty.stars)}<br>
                        <em>${difficulty.recommended_playstyle || 'Se requiere gestión cuidadosa.'}</em>
                    </div>
                </section>
            </div>
        `;
  }

  /**
   * Convierte texto separado por comas o puntos en lista HTML
   */
  formatList(text) {
    if (!text) return '<li>Sin datos</li>';

    // Intentar separar por comas o puntos
    const items = text.split(/[,.]/).filter(s => s.trim().length > 0);

    if (items.length <= 1) {
      return `<li>${text}</li>`;
    }

    return items.map(item => `<li>${item.trim()}</li>`).join('');
  }

  /**
   * Genera tabla resumen de estadísticas clave
   */
  generateStatsTable(nation) {
    const popM = (nation.population / 1000000).toFixed(1);
    const gdpB = (nation.gdp / 1000000000).toFixed(0);
    const stab = (nation.stability * 100).toFixed(0);

    // Calcular poder militar aproximado
    const mil = nation.military_detail;
    const milScore = mil ? (mil.personnel_active / 1000) + (mil.equipment.tanks / 10) : 0;

    return `
            <table class="stats-table">
                <tr>
                    <td>Población</td>
                    <td class="val">${popM} M</td>
                    <td>Capacidad Militar</td>
                    <td class="val ${milScore > 500 ? 'high' : 'normal'}">${milScore.toFixed(0)} pts</td>
                </tr>
                <tr>
                    <td>PIB Nominal</td>
                    <td class="val">${gdpB} B USD</td>
                    <td>Estabilidad Política</td>
                    <td class="val ${nation.stability < 0.5 ? 'crit' : 'good'}">${stab}%</td>
                </tr>
            </table>
        `;
  }

  getDifficultyClass(stars) {
    if (stars >= 5) return 'diff-expert';
    if (stars >= 4) return 'diff-hard';
    if (stars >= 3) return 'diff-medium';
    return 'diff-easy';
  }

  getDifficultyText(stars) {
    if (stars >= 5) return 'EXPERTO (Extremo)';
    if (stars >= 4) return 'AVANZADO (Difícil)';
    if (stars >= 3) return 'INTERMEDIO (Balanceado)';
    return 'PRINCIPIANTE (Fácil)';
  }
}