	/**
     	 * @file flow.test.js
     	 * @description Test de flujo End-to-End que valida el recorrido completo de una intención
     	 *              desde el input del jugador hasta la generación del delta y actualización del estado.
     	 * @version 1.0.0
     	 * @author Realpolitik Core Team
     	 * @dependencies MockServer, node:test
     	 */
     	
    	import { describe, it, before, after } from 'node:test';
    	import assert from 'node:assert';
    	import { MockServer, createDefaultInitialState, createPlayerIntent } from '../helpers/MockServer.js';
    	
    	describe('Flow End-to-End', () => {
    	  /** @type {MockServer} */
    	  let mockServer;
    	
    	  before(() => {
    	    // Setup inicial limpio
    	    mockServer = new MockServer({ seed: 42, tickRate: 1000, mode: 'continuous' });
    	    mockServer.init();
    	  });
    	
    	  after(() => {
    	    // Limpieza post-tests
    	    if (mockServer) {
    	      mockServer.reset();
    	    }
    	  });
    	
    	  describe('Flujo básico de intención', () => {
    	    it('debe procesar una intención y generar un delta válido', () => {
    	      // Arrange: Crear estado inicial con naciones
    	      const initialState = createDefaultInitialState(['USA', 'CHN']);
    	      mockServer.setInitialState(initialState);
    	
    	      // Act: Inyectar intención de jugador
    	      const intent = createPlayerIntent('player1', 'USA', 'invest_healthcare', {
    	        amount: 50
    	      });
    	      
    	      mockServer.injectIntent(intent);
    	      
    	      // Ejecutar un tick para procesar la intención
    	      const tickResult = mockServer.runTicks(1);
    	
    	      // Assert: Verificar que el tick se ejecutó correctamente
    	      assert.strictEqual(tickResult.success, true, 'El tick debe ejecutarse exitosamente');
    	      assert.strictEqual(tickResult.tick, 1, 'El tick debe incrementarse a 1');
    	
    	      // Verificar que se registró el evento de intención
    	      const intentEvents = mockServer.getEventLog('player_intent');
    	      assert.strictEqual(intentEvents.length, 1, 'Debe haber un evento de player_intent registrado');
    	      assert.strictEqual(intentEvents[0].payload.action, 'invest_healthcare', 'La acción debe coincidir');
    	
    	      // Verificar que el estado cambió (al menos el tick)
    	      const currentState = mockServer.getStateSnapshot();
    	      assert.strictEqual(currentState.state.tick, 1, 'El tick del estado debe ser 1');
    	    });
    	
    	    it('debe mantener el estado consistente después de múltiples ticks', () => {
    	      // Arrange
    	      const initialState = createDefaultInitialState(['USA', 'CHN', 'RUS']);
    	      mockServer.setInitialState(initialState);
    	
    	      // Act: Ejecutar 5 ticks consecutivos
    	      const results = [];
    	      for (let i = 0; i < 5; i++) {
    	        results.push(mockServer.runTicks(1));
    	      }
    	
    	      // Assert
    	      const finalState = mockServer.getStateSnapshot();
    	      assert.strictEqual(finalState.state.tick, 5, 'El tick debe ser 5 después de 5 iteraciones');
    	      
    	      // Verificar secuencia de ticks
    	      results.forEach((result, index) => {
    	        assert.strictEqual(result.tick, index + 1, `El tick ${index + 1} debe tener número correcto`);
    	        assert.strictEqual(result.success, true, `El tick ${index + 1} debe ser exitoso`);
    	      });
    	
    	      // Verificar historial de deltas
    	      const deltaHistory = mockServer.getDeltaHistory();
    	      assert.strictEqual(deltaHistory.length, 5, 'Debe haber 5 deltas en el historial');
    	    });
    	
    	    it('debe procesar intenciones en batch antes del tick', () => {
    	      // Arrange
    	      const initialState = createDefaultInitialState(['USA']);
    	      mockServer.setInitialState(initialState);
    	
    	      // Act: Inyectar múltiples intenciones antes del tick
    	      const intents = [
    	        createPlayerIntent('player1', 'USA', 'invest_healthcare', { amount: 30 }),
    	        createPlayerIntent('player1', 'USA', 'invest_education', { amount: 20 }),
    	        createPlayerIntent('player1', 'USA', 'build_infrastructure', { amount: 50 })
    	      ];
    	
    	      intents.forEach(intent => mockServer.injectIntent(intent));
   	      
   	      // Ejecutar tick (debe procesar todas las intenciones en batch)
   	      mockServer.runTicks(1);
   	
   	      // Assert
   	      const batchEvents = mockServer.getEventLog('batch_intents');
   	      assert.strictEqual(batchEvents.length, 1, 'Debe haber un evento batch_intents');
   	      assert.strictEqual(batchEvents[0].payload.intents.length, 3, 'El batch debe contener 3 intenciones');
   	
   	      const finalState = mockServer.getStateSnapshot();
   	      assert.strictEqual(finalState.state.tick, 1, 'El tick debe ser 1');
   	    });
   	  });
   	
   	  describe('Validación de eventos del sistema', () => {
   	    it('debe emitir eventos tick_start y tick_end en cada tick', () => {
   	      // Arrange
   	      const initialState = createDefaultInitialState(['USA']);
   	      mockServer.setInitialState(initialState);
   	
   	      // Act
   	      mockServer.runTicks(3);
   	
   	      // Assert
   	      const tickStartEvents = mockServer.getEventLog('tick_start');
   	      const tickEndEvents = mockServer.getEventLog('tick_end');
   	
   	      assert.strictEqual(tickStartEvents.length, 3, 'Debe haber 3 eventos tick_start');
   	      assert.strictEqual(tickEndEvents.length, 3, 'Debe haber 3 eventos tick_end');
   	
   	      // Verificar secuencia correcta
   	      for (let i = 0; i < 3; i++) {
   	        assert.strictEqual(tickStartEvents[i].tick, i + 1, `tick_start[${i}] debe tener tick ${i + 1}`);
   	        assert.strictEqual(tickEndEvents[i].tick, i + 1, `tick_end[${i}] debe tener tick ${i + 1}`);
   	      }
   	    });
   	
   	    it('debe registrar eventos state_updated cuando el estado cambia', () => {
   	      // Arrange
   	      const initialState = createDefaultInitialState(['USA']);
   	      mockServer.setInitialState(initialState);
   	
   	      // Act
   	      mockServer.runTicks(2);
   	
   	      // Assert
   	      const stateUpdateEvents = mockServer.getEventLog('state_updated');
   	      assert.ok(stateUpdateEvents.length >= 2, 'Debe haber al menos 2 eventos de actualización de estado');
   	    });
   	  });
   	
   	  describe('Manejo de errores y validaciones', () => {
   	    it('debe lanzar error si se inyecta intención antes de init()', () => {
   	      // Arrange
   	      const freshServer = new MockServer({ seed: 42 });
   	      // No llamar a init()
   	
   	      // Act & Assert
   	      assert.throws(
   	        () => freshServer.injectIntent(createPlayerIntent('p1', 'USA', 'test')),
   	        /Debe llamar init\(\) antes de injectIntent\(\)/,
   	        'Debe lanzar error específico'
   	      );
   	
   	      freshServer.reset();
   	    });
   	
   	    it('debe lanzar error si se ejecutan ticks antes de init()', () => {
   	      // Arrange
   	      const freshServer = new MockServer({ seed: 42 });
   	      // No llamar a init()
   	
   	      // Act & Assert
   	      assert.throws(
   	        () => freshServer.runTicks(1),
   	        /Debe llamar init\(\) antes de runTicks\(\)/,
   	        'Debe lanzar error específico'
   	      );
   	
   	      freshServer.reset();
   	    });
   	
   	    it('debe lanzar error si se obtiene snapshot antes de init()', () => {
   	      // Arrange
   	      const freshServer = new MockServer({ seed: 42 });
   	      // No llamar a init()
   	
   	      // Act & Assert
   	      assert.throws(
   	        () => freshServer.getStateSnapshot(),
   	        /Debe llamar init\(\) antes de getStateSnapshot\(\)/,
   	        'Debe lanzar error específico'
   	      );
   	
   	      freshServer.reset();
   	    });
   	  });
   	
   	  describe('Integración con módulos existentes', () => {
   	    it('debe permitir aplicar deltas directamente para setup de tests', () => {
   	      // Arrange
   	      const initialState = createDefaultInitialState(['USA']);
   	      mockServer.setInitialState(initialState);
   	
   	      // Act: Aplicar delta manualmente
   	      const testDelta = {
   	        type: 'resource_change',
   	        payload: {
   	          nationId: 'USA',
   	          resource: 'gold',
   	          amount: 100
   	        }
   	      };
   	
   	      const result = mockServer.applyDelta(testDelta, 'test');
   	
   	      // Assert
   	      assert.strictEqual(result.success, true, 'El delta debe aplicarse exitosamente');
   	      assert.ok(result.version > 0, 'La versión debe incrementarse');
   	    });
   	
   	    it('debe permitir escuchar eventos personalizados durante tests', async () => {
   	      // Arrange
   	      const initialState = createDefaultInitialState(['USA']);
   	      mockServer.setInitialState(initialState);
   	      
   	      let customEventCaptured = false;
   	      let capturedPayload = null;
   	
   	      const handler = (payload) => {
   	        customEventCaptured = true;
   	        capturedPayload = payload;
   	      };
   	
   	      // Act: Suscribirse a evento personalizado
   	      mockServer.listen('custom_test_event', handler);
   	      
   	      // Simular emisión de evento (en producción lo haría un módulo)
   	      const EventDispatcher = await import('../../core/EventDispatcher.js');
   	      EventDispatcher.emit('custom_test_event', { testData: 'hello' });
   	      
   	      mockServer.runTicks(1);
   	
   	      // Assert
   	      assert.strictEqual(customEventCaptured, true, 'El evento personalizado debe capturarse');
   	      assert.strictEqual(capturedPayload?.testData, 'hello', 'El payload debe coincidir');
   	
   	      // Cleanup
   	      mockServer.unlisten('custom_test_event', handler);
   	    });
   	  });
   	
      describe('Comparación de estados', () => {
   	    it('debe identificar estados iguales correctamente', () => {
   	      // Arrange
   	      const state1 = { tick: 5, nations: { USA: { gold: 100 } } };
   	      const state2 = { tick: 5, nations: { USA: { gold: 100 } } };
   	      const state3 = { tick: 6, nations: { USA: { gold: 100 } } };
   	
   	      // Act & Assert
   	      assert.strictEqual(
   	        mockServer.statesAreEqual(state1, state2),
   	        true,
   	        'Estados idénticos deben ser iguales'
   	      );
   	      assert.strictEqual(
   	        mockServer.statesAreEqual(state1, state3),
   	        false,
   	        'Estados diferentes no deben ser iguales'
   	      );
   	    });
   	
   	    it('debe manejar objetos complejos en comparación', () => {
   	      // Arrange
   	      const complexState1 = {
   	        tick: 10,
   	        nations: {
   	          USA: { resources: { oil: 100, gas: 200 }, policies: ['policy1'] },
   	          CHN: { resources: { oil: 150, gas: 180 }, policies: ['policy2'] }
   	        },
   	        crisis: { active: false, phase: 0 }
   	      };
   	
          const complexState2 = {
   	        tick: 10,
   	        nations: {
   	          USA: { resources: { oil: 100, gas: 200 }, policies: ['policy1'] },
   	          CHN: { resources: { oil: 150, gas: 180 }, policies: ['policy2'] }
   	        },
   	        crisis: { active: false, phase: 0 }
   	      };
   	
   	      // Act & Assert
   	      assert.strictEqual(
   	        mockServer.statesAreEqual(complexState1, complexState2),
   	        true,
   	        'Estados complejos idénticos deben ser iguales'
   	      );
   	    });
   	  });
   	});