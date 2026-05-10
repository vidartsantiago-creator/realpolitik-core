/**
 * InformationLayer.js
 * Capa de información y visibilidad en tiempo real
 * Implementa sistemas de inteligencia, filtrado de datos y señales veladas
 */
import { rng, rngInt } from '../core/Rng.js';
import { on, emit, off } from '../core/EventDispatcher.js';

export class InformationLayer {
  constructor() {
    this.visibilityCache = new Map();
    this.activeSources = new Map();
    this.intelOperations = new Map();
    this.veiledSignals = new Map();
    this.fogLevels = new Map();
    
    this.sourceTypes = {
      embassy: { baseCoverage: 0.30, cost: 2, detectionRisk: 0.05 },
      humint: { baseCoverage: 0.45, cost: 5, detectionRisk: 0.15 },
      sigint: { baseCoverage: 0.60, cost: 8, detectionRisk: 0.08 },
      imint: { baseCoverage: 0.40, cost: 6, detectionRisk: 0.02 },
      cybint: { baseCoverage: 0.70, cost: 10, detectionRisk: 0.20 }
    };

    this.FOG_LEVELS = {
      transparent: { min: 0.85, desc: 'Visión casi completa' },
      partial: { min: 0.50, desc: 'Información fragmentada' },
      dense: { min: 0.20, desc: 'Solo datos básicos' },
      blackout: { min: 0.00, desc: 'Sin inteligencia activa' }
    };

    this.veiledSignalTypes = [
      'actividad_inusual_frontera',
      'comunicaciones_interceptadas',
      'movimiento_capital_sospechoso',
      'reunion_alto_nivel_secreta',
      'suministros_medicos_acumulados',
      'ejercicios_militares_no_declarados',
      'ciberactividad_anomala',
      'flota_mercante_desviada',
      'diplomaticos_retirados_repentinamente',
      'medios_controlados_silencio',
      'satelite_bloqueado_region',
      'trafico_aereo_restringido'
    ];

    this.operationTypes = {
      recruit_asset: { duration: [10, 15], cost: 15, effect: 0.15, risk: 0.25 },
      cyber_intrusion: { duration: [5, 8], cost: 25, effect: 0.25, risk: 0.35 },
      satellite_focus: { duration: [3, 5], cost: 8, effect: 0.10, risk: 0.05 },
      diplomatic_pressure: { duration: [8, 12], cost: 5, effect: 0.08, risk: 0.10 },
      intercept_communications: { duration: [4, 6], cost: 18, effect: 0.20, risk: 0.20 }
    };
  }

  async init(config) {
    this.config = config;
    this.eventDispatcher = EventDispatcher.getInstance();
    
    // Suscribirse a eventos relevantes
    this.eventDispatcher.subscribe('tick_start', () => this.update());
    this.eventDispatcher.subscribe('alliance_formed', (data) => this.onAllianceFormed(data));
    this.eventDispatcher.subscribe('alliance_broken', (data) => this.onAllianceBroken(data));
    this.eventDispatcher.subscribe('espionage_operation_completed', (data) => this.onEspionageCompleted(data));
  }

  update() {
    const nations = this.getNationsList();
    
    for (const nationId of nations) {
      for (const observerId of nations) {
        if (nationId !== observerId) {
          this.updateVisibilityForObserver(nationId, observerId);
          this.generateVeiledSignals(nationId, observerId);
        }
      }
    }
  }

  updateVisibilityForObserver(nationId, observerId) {
    const visibilityScore = this.calculateVisibilityScore(nationId, observerId);
    const fogLevel = this.determineFogLevel(visibilityScore);
    const sourcesCount = this.getActiveSourcesCount(observerId);
    
    const cacheKey = `${nationId}_${observerId}`;
    this.visibilityCache.set(cacheKey, {
      score: visibilityScore,
      fogLevel: fogLevel,
      sourcesCount: sourcesCount,
      timestamp: Date.now()
    });

    this.eventDispatcher.publish('intel_updated', {
      nationId,
      observerId,
      visibilityScore,
      fogLevel,
      sourcesCount
    });
  }

  calculateVisibilityScore(nationId, observerId) {
    let baseCoverage = 0;
    const sources = this.getActiveSources(observerId) || [];
    
    for (const source of sources) {
      const sourceDef = this.sourceTypes[source.type];
      if (sourceDef) {
        baseCoverage += sourceDef.baseCoverage;
      }
    }

    // Bonificación por alianzas
    const allianceBonus = this.calculateAllianceBonus(nationId, observerId);
    
    // Bonificación por tecnología
    const techBonus = this.calculateTechnologyBonus(observerId);
    
    // Penalización por contraespionaje
    const counterIntelPenalty = this.calculateCounterIntelPenalty(nationId);

    let coverage = Math.min(baseCoverage + allianceBonus + techBonus - counterIntelPenalty, 1.0);
    
    // Asegurar mínimo para señales veladas
    return Math.max(coverage, 0.05);
  }

  calculateAllianceBonus(nationId, observerId) {
    const alliances = this.getAlliances();
    let bonus = 0;

    for (const alliance of alliances) {
      if (alliance.members.includes(observerId)) {
        if (alliance.members.includes(nationId)) {
          if (alliance.type === 'military') {
            bonus += 0.20;
          } else if (alliance.type === 'trade') {
            bonus += 0.10;
          } else if (alliance.type === 'intelligence') {
            bonus += 0.30;
          }
        }
      }
    }

    return Math.min(bonus, 0.5); // Máximo 50% de bonificación
  }

  calculateTechnologyBonus(observerId) {
    const policies = this.getNationPolicies(observerId);
    let bonus = 0;

    if (policies.includes('advanced_intelligence')) {
      bonus += 0.05;
    }
    if (policies.includes('signal_processing')) {
      bonus += 0.03;
    }
    if (policies.includes('satellite_network')) {
      bonus += 0.04;
    }

    return bonus;
  }

  calculateCounterIntelPenalty(targetNationId) {
    // Simular efecto de contraespionaje
    const counterIntelLevel = this.getCounterIntelLevel(targetNationId);
    return counterIntelLevel * 0.03; // Máximo 3% de penalización por nivel
  }

  determineFogLevel(visibilityScore) {
    if (visibilityScore >= this.FOG_LEVELS.transparent.min) return 'transparent';
    if (visibilityScore >= this.FOG_LEVELS.partial.min) return 'partial';
    if (visibilityScore >= this.FOG_LEVELS.dense.min) return 'dense';
    return 'blackout';
  }

  generateVeiledSignals(nationId, observerId) {
    const visibility = this.getVisibility(nationId, observerId);
    
    if (visibility < 0.3) {
      // Generar señales veladas cuando hay poca inteligencia directa
      const possibleSignals = this.veiledSignalTypes.filter(signal => 
        this.shouldGenerateSignal(nationId, signal)
      );
      
      if (possibleSignals.length > 0) {
        const randomSignal = possibleSignals[rngInt(0, possibleSignals.length)];
        const confidence = 0.3 + (visibility * 0.4); // Confianza baja cuando visibilidad es baja
        
        const veiledSignal = {
          id: `vs_${Date.now()}_${rngInt(1000, 9999)}`,
          nationId,
          observerId,
          type: randomSignal,
          confidence,
          timestamp: Date.now(),
          text: this.generateSignalText(randomSignal, nationId)
        };

        const signalKey = `${nationId}_${observerId}_${randomSignal}`;
        this.veiledSignals.set(signalKey, veiledSignal);

        this.eventDispatcher.publish('veiled_signal_detected', veiledSignal);
      }
    }
  }

  shouldGenerateSignal(nationId, signalType) {
    // Simular probabilidad de generar una señal basada en actividad real
    const activityFactors = this.getActivityFactors(nationId);
    
    switch (signalType) {
      case 'actividad_inusual_frontera':
        return activityFactors.borderActivity > 0.6;
      case 'ciberactividad_anomala':
        return activityFactors.cyberActivity > 0.5;
      case 'movimiento_capital_sospechoso':
        return activityFactors.economicAnomalies > 0.4;
      default:
        return rng() > 0.7; // 30% de probabilidad para otras señales
    }
  }

  generateSignalText(signalType, nationId) {
    const leaderName = this.getLeaderName(nationId);
    const region = this.getRandomRegion(nationId);
    
    const signalTexts = {
      'actividad_inusual_frontera': `Reportes no confirmados sugieren movimiento de tropas en la región fronteriza de ${region}`,
      'comunicaciones_interceptadas': `Intercepción de comunicaciones anómalas provenientes de ${nationId}`,
      'movimiento_capital_sospechoso': `Flujos financieros inusuales detectados en ${nationId}, posiblemente relacionados con actividades encubiertas`,
      'reunion_alto_nivel_secreta': `Indicadores sugieren reunión de alto nivel no declarada en ${nationId}`,
      'suministros_medicos_acumulados': `Acumulación inusual de suministros médicos en ${region}, posiblemente preparación para contingencia`,
      'ejercicios_militares_no_declarados': `Actividad militar inusual detectada en ${region} sin aviso previo`,
      'ciberactividad_anomala': `Patrones de ciberactividad atípicos originados desde ${nationId}`,
      'flota_mercante_desviada': `Desvío inesperado de rutas comerciales detectado para flota de ${nationId}`,
      'diplomaticos_retirados_repentinamente': `Retiro súbito de personal diplomático de ${nationId}`,
      'medios_controlados_silencio': `Silencio inusual en medios controlados de ${nationId}`,
      'satelite_bloqueado_region': `Acceso limitado a imágenes satelitales de ${region}`,
      'trafico_aereo_restringido': `Restricciones inusuales en tráfico aéreo sobre ${region}`
    };

    return signalTexts[signalType] || `Indicadores anómalos detectados en ${nationId}`;
  }

  filterDataByVisibility(nationId, observerId, originalData, dataType) {
    const visibility = this.getVisibility(nationId, observerId);
    const fogLevel = this.getFogLevel(nationId, observerId);
    
    if (visibility < 0.1) {
      // Mínima información disponible
      return this.getMinimalData(originalData, dataType);
    }

    const filteredData = {};
    
    for (const [key, value] of Object.entries(originalData)) {
      if (this.isFieldVisible(key, visibility, dataType)) {
        filteredData[key] = value;
      } else {
        filteredData[key] = null; // Campo oculto
      }
    }

    return filteredData;
  }

  isFieldVisible(fieldName, visibility, dataType) {
    // Reglas de visibilidad por campo y tipo de datos
    if (visibility >= 0.85) return true; // Todo visible en transparencia
    
    if (dataType === 'economic') {
      // Campos macroeconómicos visibles desde bajo nivel
      if (['gdp_growth', 'inflation', 'population'].includes(fieldName)) {
        return visibility >= 0.3;
      }
      // Campos presupuestarios requieren más visibilidad
      if (['budget_deficit', 'debt_to_gdp', 'spending_breakdown'].includes(fieldName)) {
        return visibility >= 0.5;
      }
      // Información sensible (militar, interno)
      if (['military_spending', 'internal_policies', 'secret_projects'].includes(fieldName)) {
        return visibility >= 0.7;
      }
    } else if (dataType === 'military') {
      if (['troop_count', 'equipment_status'].includes(fieldName)) {
        return visibility >= 0.4;
      }
      if (['deployment_locations', 'operation_plans', 'nuclear_status'].includes(fieldName)) {
        return visibility >= 0.75;
      }
    } else if (dataType === 'political') {
      if (['election_dates', 'government_type'].includes(fieldName)) {
        return visibility >= 0.2;
      }
      if (['leader_health', 'internal_conflicts', 'coup_plots'].includes(fieldName)) {
        return visibility >= 0.7;
      }
    }

    // Por defecto, si no hay regla específica
    return visibility >= 0.5;
  }

  getMinimalData(originalData, dataType) {
    // Devolver solo información mínima disponible en blackout
    const minimal = {};
    
    if (dataType === 'economic') {
      minimal.gdp_growth = originalData.gdp_growth || null;
      minimal.inflation = originalData.inflation || null;
      minimal.population = originalData.population || null;
    } else if (dataType === 'military') {
      minimal.troop_count = originalData.troop_count || null;
    } else if (dataType === 'political') {
      minimal.government_type = originalData.government_type || null;
      minimal.leader_name = originalData.leader_name || null;
    }
    
    return minimal;
  }

  // Métodos públicos
  getVisibility(nationId, observerId) {
    if (nationId === observerId) return 1.0; // Auto-visibilidad completa
    
    const cacheKey = `${nationId}_${observerId}`;
    const cached = this.visibilityCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 5000) { // Cache de 5 segundos
      return cached.score;
    }
    
    return this.calculateVisibilityScore(nationId, observerId);
  }

  getFogLevel(nationId, observerId) {
    if (nationId === observerId) return 'transparent';
    
    const cacheKey = `${nationId}_${observerId}`;
    const cached = this.visibilityCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 5000) {
      return cached.fogLevel;
    }
    
    const visibility = this.getVisibility(nationId, observerId);
    return this.determineFogLevel(visibility);
  }

  getKnownData(nationId, observerId) {
    // Este método sería llamado por otros módulos para obtener datos filtrados
    // Debería integrarse con StateManager para obtener datos reales
    const allData = this.getNationState(nationId);
    return this.filterDataByVisibility(nationId, observerId, allData, 'general');
  }

  getVeiledSignals(nationId, observerId) {
    const signals = [];
    for (const [key, signal] of this.veiledSignals) {
      if (signal.nationId === nationId && signal.observerId === observerId) {
        signals.push(signal);
      }
    }
    return signals;
  }

  getSourceTypes() {
    return { ...this.sourceTypes };
  }

  activateSource(nationId, type, observerId) {
    if (!this.sourceTypes[type]) {
      throw new Error(`Tipo de fuente desconocido: ${type}`);
    }

    const sourceId = `src_${Date.now()}_${rngInt(1000, 9999)}`;
    const source = {
      id: sourceId,
      nationId,
      type,
      observerId,
      active: true,
      activationTime: Date.now(),
      costPerTick: this.sourceTypes[type].cost
    };

    if (!this.activeSources.has(observerId)) {
      this.activeSources.set(observerId, []);
    }
    this.activeSources.get(observerId).push(source);

    this.eventDispatcher.publish('intel_source_activated', {
      sourceId,
      nationId,
      type,
      observerId
    });

    return sourceId;
  }

  deactivateSource(sourceId, observerId) {
    const sources = this.activeSources.get(observerId) || [];
    const index = sources.findIndex(s => s.id === sourceId);
    
    if (index !== -1) {
      sources[index].active = false;
      sources.splice(index, 1);
      
      this.eventDispatcher.publish('intel_source_deactivated', {
        sourceId,
        observerId
      });
      
      return true;
    }
    
    return false;
  }

  getActiveSources(observerId) {
    return this.activeSources.get(observerId) || [];
  }

  getActiveSourcesCount(observerId) {
    const sources = this.getActiveSources(observerId);
    return sources.filter(s => s.active).length;
  }

  startIntelOperation(operationType, targetNation, observerNation) {
    if (!this.operationTypes[operationType]) {
      throw new Error(`Operación desconocida: ${operationType}`);
    }

    const operation = {
      id: `op_${Date.now()}_${rngInt(1000, 9999)}`,
      type: operationType,
      targetNation,
      observerNation,
      status: 'pending',
      startTime: Date.now(),
      duration: rngInt(
        this.operationTypes[operationType].duration[0],
        this.operationTypes[operationType].duration[1]
      ),
      cost: this.operationTypes[operationType].cost,
      effect: this.operationTypes[operationType].effect,
      risk: this.operationTypes[operationType].risk
    };

    this.intelOperations.set(operation.id, operation);
    
    this.eventDispatcher.publish('intel_operation_started', operation);
    
    // Simular éxito/fallo basado en riesgo
    setTimeout(() => {
      this.completeOperation(operation.id);
    }, operation.duration * 1000); // Duración en ticks simulados

    return operation.id;
  }

  completeOperation(operationId) {
    const operation = this.intelOperations.get(operationId);
    if (!operation) return;

    // Determinar éxito o fracaso
    const success = rng() > operation.risk;
    
    if (success) {
      operation.status = 'completed';
      
      // Aplicar efecto de la operación
      const boostKey = `${operation.targetNation}_${operation.observerNation}`;
      let currentBoost = this.visibilityCache.get(boostKey) || { score: 0 };
      currentBoost.score = Math.min(currentBoost.score + operation.effect, 1.0);
      this.visibilityCache.set(boostKey, currentBoost);
      
      this.eventDispatcher.publish('intel_operation_completed', {
        ...operation,
        success: true,
        visibilityBoost: operation.effect
      });
    } else {
      operation.status = 'failed';
      
      this.eventDispatcher.publish('intel_operation_failed', {
        ...operation,
        success: false,
        detected: true
      });
      
      // Posible contramedida si fue detectado
      if (rng() > 0.5) {
        this.eventDispatcher.publish('counter_intelligence_detected', {
          targetNation: operation.observerNation,
          sourceNation: operation.targetNation,
          operationType: operation.type
        });
      }
    }
  }

  cancelOperation(operationId) {
    const operation = this.intelOperations.get(operationId);
    if (operation && operation.status === 'pending') {
      operation.status = 'cancelled';
      
      this.eventDispatcher.publish('intel_operation_cancelled', operation);
      return true;
    }
    
    return false;
  }

  getOperationStatus(operationId) {
    return this.intelOperations.get(operationId) || null;
  }

  runCounterIntelligence(targetNation, observerNation) {
    // Simular operación de contraespionaje
    const effectiveness = 0.10 + (rng() * 0.05); // 10-15% de reducción
    
    const boostKey = `${targetNation}_${observerNation}`;
    let currentBoost = this.visibilityCache.get(boostKey);
    if (currentBoost) {
      currentBoost.score = Math.max(currentBoost.score - effectiveness, 0);
      this.visibilityCache.set(boostKey, currentBoost);
    }

    this.eventDispatcher.publish('counter_intelligence_success', {
      targetNation,
      observerNation,
      effectiveness,
      newVisibility: currentBoost?.score || 0
    });

    return effectiveness;
  }

  plantDisinformation(targetNation, falseData, observerNation) {
    // Simular plantado de información falsa
    const success = rng() > 0.3; // 70% de éxito
    
    if (success) {
      // Registrar la desinformación plantada
      const disinfoId = `dis_${Date.now()}_${rngInt(1000, 9999)}`;
      
      this.eventDispatcher.publish('disinformation_planted', {
        id: disinfoId,
        targetNation,
        observerNation,
        falseData,
        timestamp: Date.now()
      });
    }

    return success;
  }

  calculateSharedIntelligence(allianceMembers, targetNation) {
    let sharedVisibility = 0;
    
    for (const member of allianceMembers) {
      if (member !== targetNation) {
        const individualVisibility = this.getVisibility(targetNation, member);
        sharedVisibility = Math.max(sharedVisibility, individualVisibility * 0.3); // 30% de lo mejor
      }
    }
    
    return sharedVisibility;
  }

  getIntelHistory(nationId, ticks = 50) {
    // Simular historial de inteligencia (en implementación real, usaría almacenamiento persistente)
    const history = [];
    for (let i = 0; i < ticks; i++) {
      history.push({
        tick: ticks - i,
        visibility: this.getVisibility(nationId, 'PLAYER'), // Suponiendo jugador observador
        fogLevel: this.getFogLevel(nationId, 'PLAYER'),
        sourcesCount: this.getActiveSourcesCount('PLAYER'),
        timestamp: Date.now() - (i * 1000) // Simular ticks anteriores
      });
    }
    return history;
  }

  reset() {
    this.visibilityCache.clear();
    this.activeSources.clear();
    this.intelOperations.clear();
    this.veiledSignals.clear();
    this.fogLevels.clear();
  }

  // Métodos auxiliares para integración con el core
  getNationsList() {
    // Este método debería integrarse con StateManager
    return ['USA', 'RUS', 'CHN', 'EU', 'UK', 'GER', 'JPN', 'FRA']; // Ejemplo
  }

  getAlliances() {
    // Este método debería integrarse con DiplomacyRule
    return [
      { id: 'nato', members: ['USA', 'UK', 'GER', 'FRA'], type: 'military' },
      { id: 'eu_alliance', members: ['GER', 'FRA', 'UK'], type: 'trade' }
    ]; // Ejemplo
  }

  getNationPolicies(nationId) {
    // Este método debería integrarse con StateManager
    return ['open_society', 'advanced_intelligence']; // Ejemplo
  }

  getActivityFactors(nationId) {
    // Simular factores de actividad para generación de señales
    return {
      borderActivity: rng(),
      cyberActivity: rng(),
      economicAnomalies: rng(),
      politicalInstability: rng()
    };
  }

  getLeaderName(nationId) {
    const leaders = {
      USA: 'President Johnson',
      RUS: 'President Volkov',
      CHN: 'Chairman Liu',
      EU: 'Chancellor Mueller'
    };
    return leaders[nationId] || 'Unknown Leader';
  }

  getRandomRegion(nationId) {
    const regions = {
      USA: ['West Coast', 'East Coast', 'Central Plains', 'Alaska'],
      RUS: ['Moscow Region', 'Far East', 'Caucasus', 'Siberia'],
      CHN: ['Beijing Area', 'South China', 'Xinjiang', 'Tibet'],
      EU: ['Western Europe', 'Eastern Europe', 'Mediterranean', 'Scandinavia']
    };
    
    const nationRegions = regions[nationId] || ['Northern Region', 'Southern Region'];
    return nationRegions[rngInt(0, nationRegions.length)];
  }

  getNationState(nationId) {
    // Simular estado de nación para filtrado
    return {
      gdp_growth: (rng() * 4) + 1, // 1-5%
      inflation: (rng() * 8) + 1, // 1-9%
      population: 10000000 + Math.floor(rng() * 90000000),
      troop_count: 100000 + Math.floor(rng() * 900000),
      government_type: 'democracy',
      leader_name: this.getLeaderName(nationId),
      military_spending: 50000000000 + Math.floor(rng() * 100000000000),
      internal_policies: ['tax_reform', 'healthcare_initiative'],
      deployment_locations: ['border_north', 'coastal_regions'],
      election_dates: Date.now() + 365 * 24 * 60 * 60 * 1000
    };
  }

  getCounterIntelLevel(nationId) {
    // Simular nivel de contraespionaje (0-5)
    return Math.floor(rng() * 6);
  }

  onAllianceFormed(data) {
    // Recalcular visibilidad compartida
    this.update();
  }

  onAllianceBroken(data) {
    // Recalcular visibilidad compartida
    this.update();
  }

  onEspionageCompleted(data) {
    // Integrar resultados de operaciones de espionaje
    if (data.success) {
      const boostKey = `${data.targetNation}_${data.agentNation}`;
      let currentBoost = this.visibilityCache.get(boostKey) || { score: 0 };
      currentBoost.score = Math.min(currentBoost.score + 0.1, 1.0);
      this.visibilityCache.set(boostKey, currentBoost);
    }
  }
}
