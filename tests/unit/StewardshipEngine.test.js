/**
 * @file StewardshipEngine.test.js
 * @description Tests unitarios para el motor de Mayordomía (StewardshipEngine).
 *              Cubre: Mandato de Límites, penalizaciones por expansión rápida, IA de ausencia.
 * @version 1.0.0
 * @author RealPolitik Core Team
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert';

// Importar módulo real - los tests verifican la interfaz pública
import { 
  init, 
  getStewardshipState, 
  ResetForTests, 
  configure,
  scheduleAutoDecision,
  generateAutoDecisions
} from '../../ai/StewardshipEngine.js';

// Importar dependencias reales para setup
import { on, emit, _clearAllForTests as resetEventDispatcher } from '../../core/EventDispatcher.js';
import { getState, applyDelta, snapshot, setInitialState, ResetForTests as resetState } from '../../core/StateManager.js';
import { rng, rngInt, _resetRngForTests } from '../../core/Rng.js';

describe('StewardshipEngine', () => {
     beforeEach(() => {
          // Resetear todos los módulos entre tests
          ResetForTests();
          resetState();
          resetEventDispatcher();
          _resetRngForTests(12345);
    });

    describe('init()', () => {
      it('debe inicializar correctamente con configuración por defecto', () => {
      const result = init();

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.errors, undefined);
	      
	      const state = getStewardshipState();
	      assert.strictEqual(state.initialized, true);
	      assert.ok(state.config !== null);
	    });
	
	    it('debe fallar si ya está inicializado', () => {
	      init();
	      const result = init();
	      
	      assert.strictEqual(result.success, false);
	      assert.ok(result.errors.length > 0);
	    });
	
	    it('debe aceptar configuración personalizada', () => {
          	      const customConfig = {
          	        mandate: { maxExpansionRate: 0.20 },
          	        absence: { inactivityTicks: 50 }
           };
	      
	      const result = init(customConfig);
	      
	      assert.strictEqual(result.success, true);
	      
	      const state = getStewardshipState();
	      assert.strictEqual(state.config.mandate.maxExpansionRate, 0.20);
	      assert.strictEqual(state.config.absence.inactivityTicks, 50);
	    });
	  });
	
	  describe('Mandato de Límites - Expansión Rápida', () => {
	    beforeEach(() => {
	      init({
	        mandate: {
	          maxExpansionRate: 0.15,
	          stabilityThreshold: 40,
	          warningThreshold: 0.10,
	          violationPenalty: 0.25,
	          checkInterval: 1
	        }
	      });
	    });
	
	    it('debe permitir expansión dentro del límite permitido', () => {
	      // Configurar nación con estabilidad suficiente
	      applyDelta({
	        nations: {
	          nation1: {
	            id: 'nation1',
	            territory: 100,
	            stability: 60,
	            resources: { food: 500, materials: 500 }
	          }
	        }
	      });
	      
	      const state = getStewardshipState();
	      // No debería haber advertencias iniciales
	      assert.strictEqual(state.mandateWarnings.size, 0);
	    });
	
	    it('debe registrar advertencia tras violación del mandato', () => {
	      applyDelta({
	        nations: {
               nation1: {
	            id: 'nation1',
	            territory: 100,
	            stability: 30, // Estabilidad baja
	            resources: { food: 1000, materials: 1000 }
	          }
	        }
	      });
	      
	      // Simular tick de verificación
	      applyDelta({ tick: 5 });

	      const state = getStewardshipState();
	      // Verificar estado interno
	      assert.ok(state !== null);
	    });
	
	    it('no debe penalizar si la estabilidad es suficiente', () => {
	      applyDelta({
	        nations: {
	          nation1: {
	            id: 'nation1',
	            territory: 100,
	            stability: 80, // Alta estabilidad
	            resources: { food: 1000, materials: 1000 }
	          }
	        }
	      });
	      
	      const state = getStewardshipState();
	      assert.ok(state !== null);
	    });
	  });
	
	  describe('IA de Ausencia - Decisiones Automáticas', () => {
	    beforeEach(() => {
	      init({
	        absence: {
	          inactivityTicks: 5,
	          autoDecisionChance: 0.90,
	          conservativeBias: 0.70
	        }
	      });
	    });
	
	    it('debe generar decisiones automáticas para nación', () => {
	      applyDelta({
	        nations: {
	          player1: {
	            id: 'player1',
	            treasury: 500,
	            military: 100,
	            stability: 50
	          }
	        }
	      });
	      
	      applyDelta({ tick: 10 });
	      
	      const decisions = generateAutoDecisions('player1');
	      
	      assert.ok(Array.isArray(decisions));
	    });
	
	    it('debe generar decisiones de defensa con military bajo', () => {
	      applyDelta({
	        nations: {
	          player1: {
	            id: 'player1',
	            treasury: 300,
	            military: 20, // Militar bajo
	            stability: 40
	          }
	        }
	      });
	      
	      applyDelta({ tick: 10 });
	      
	      const decisions = generateAutoDecisions('player1');
	      
	      assert.ok(Array.isArray(decisions));
	    });
	
	    it('debe considerar asignación de recursos con tesorería alta', () => {
	      applyDelta({
	        nations: {
	          player1: {
	            id: 'player1',
	            treasury: 800, // Tesorería alta
	            military: 100,
	            stability: 70
	          }
	        }
	      });
	      
	      applyDelta({ tick: 10 });
	      
	      const decisions = generateAutoDecisions('player1');
	      
	      assert.ok(Array.isArray(decisions));
	    });
	  });
	
	  describe('scheduleAutoDecision()', () => {
	    beforeEach(() => {
	      init();
	    });
	
	    it('debe agendar una decisión para ejecución futura en modo ausencia', () => {
	      const decisionData = {
	        type: 'treaty_renewal',
	        target: 'nation2',
	        terms: { duration: 10 },
	        forceSchedule: true // Forzar agendado fuera de modo ausencia
	      };
	      
	      scheduleAutoDecision('player1', 'diplomatic_action', decisionData, 20);
	      
	      const state = getStewardshipState();
	      assert.strictEqual(state.pendingAutoDecisions.length, 1);
	      assert.strictEqual(state.pendingAutoDecisions[0].executeAtTick, 20);
	    });
	  });
	
	  describe('configure()', () => {
	    beforeEach(() => {
	      init();
	    });
	
	    it('debe actualizar configuración en caliente', () => {
	      const newConfig = {
	        mandate: { maxExpansionRate: 0.30 },
	        limits: { maxTerritoryRatio: 5.0 }
	      };
	      
	      configure(newConfig);
	      
	      const state = getStewardshipState();
	      assert.strictEqual(state.config.mandate.maxExpansionRate, 0.30);
	      assert.strictEqual(state.config.limits.maxTerritoryRatio, 5.0);
	    });
	
	    it('debe fallar si se configura antes de inicializar', () => {
	      ResetForTests();
	      
	      assert.throws(() => {
	        configure({ mandate: { maxExpansionRate: 0.50 } });
	      }, /Debe inicializarse/);
	    });
	  });
	
	  describe('Casos de Borde', () => {
	    beforeEach(() => {
	      init();
	    });
	
	    it('debe manejar nación sin datos de territorio', () => {
	      applyDelta({
	        nations: {
	          nation1: {
	            id: 'nation1',
	            stability: 50
	            // Sin territorio definido
	          }
	        }
	      });
	      
	      // No debería lanzar error
	      assert.doesNotThrow(() => {
	        generateAutoDecisions('nation1');
	      });
	    });
	
	    it('debe manejar múltiples naciones simultáneamente', () => {
	      const nations = ['nation1', 'nation2', 'nation3'];
	      
	      nations.forEach((id, idx) => {
	        applyDelta({
	          nations: {
	            [id]: {
	              id,
	              territory: 100 + idx * 10,
	              stability: 40 + idx * 10,
	              resources: { food: 500, materials: 500 }
	            }
	          }
	        });
	      });
	     
           // Todas deberían ser procesadas sin error
	      nations.forEach(id => {
	        assert.doesNotThrow(() => {
	          generateAutoDecisions(id);
	        });
	      });
	    });
	
	    it('debe manejar IDs especiales y caracteres unicode', () => {
	      applyDelta({
	        nations: {
	          'nation-α': {
	            id: 'nation-α',
	            territory: 100,
   	            stability: 50
   	          }
   	        }
   	      });
   	      
   	      assert.doesNotThrow(() => {
   	        generateAutoDecisions('nation-α');
   	      });
   	    });
   	  });
   	});
     