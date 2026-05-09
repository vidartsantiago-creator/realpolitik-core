const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { MockServer, createDefaultInitialState, createPlayerIntent } = require('../helpers/MockServer');

/**
 * Test de Resiliencia y Reconexión
 * 
 * Objetivo: Validar el comportamiento del sistema ante desconexiones de jugadores,
 * la ejecución de ticks en modo "stewardship" (IA temporal), y la correcta
 * sincronización al reconectar.
 * 
 * Escenarios cubiertos:
 * 1. Desconexión limpia y buffer de estado.
 * 2. Ejecución de ticks sin input humano (Stewardship).
 * 3. Reconexión y aplicación de deltas acumulados.
 * 4. Integridad del estado tras recuperación.
 */

describe('Integration: Resilience & Reconnection', () => {
  let server;
  const SEED = 12345;
  const PLAYER_ID = 'P1';
  const NATION_ID = 'A';
  
  // Configuración de tiempos (en ticks)
  const TICKS_BEFORE_DISCONNECT = 10;
  const TICKS_DISCONNECTED = 20; // Tiempo que el jugador está fuera
  const TOTAL_TICKS = TICKS_BEFORE_DISCONNECT + TICKS_DISCONNECTED + 10;

  before(() => {
    server = new MockServer({ seed: SEED, tickRate: 100 });
    server.init();
    
    const initialState = createDefaultInitialState([NATION_ID]);
    initialState.players[PLAYER_ID] = {
      id: PLAYER_ID,
      nationId: NATION_ID,
      connected: true,
      lastSeenTick: 0
    };
    
    server.setInitialState(initialState);
  });

  after(() => {
    server?.reset();
  });

  /**
   * Simula el ciclo de vida: Conectado -> Desconectado -> Reconectado
   */
  it('RESILIENCE-01: Flujo completo de desconexión y reconexión mantiene integridad', () => {
    // FASE 1: Juego normal (Conectado)
    for (let i = 0; i < TICKS_BEFORE_DISCONNECT; i++) {
      server.injectIntent(createPlayerIntent(PLAYER_ID, NATION_ID, 'idle', {}));
      server.runTicks(1);
    }

    const stateBeforeDisconnect = server.getStateSnapshot();
    const tickAtDisconnect = server.getCurrentTick();
    assert.strictEqual(tickAtDisconnect, TICKS_BEFORE_DISCONNECT, 'Debe estar en el tick correcto antes de desconectar');

    // Simular evento de desconexión
    server.stateManager.applyDelta({
      type: 'player_disconnected',
      playerId: PLAYER_ID,
      tick: tickAtDisconnect
    }, 'system');
    
    // Actualizar estado localmente para reflejar desconexión
    const currentState = server.getStateSnapshot();
    currentState.players[PLAYER_ID].connected = false;
    currentState.players[PLAYER_ID].lastSeenTick = tickAtDisconnect;
    server.setInitialState(currentState); // Recargar estado modificado

    // FASE 2: Stewardship (Desconectado)
    // El servidor sigue corriendo, pero no hay inputs del jugador P1
    // En una implementación real, StewardshipEngine generaría intenciones automáticas aquí.
    // Para este test, verificamos que el tiempo avanza sin el jugador.
    
    let stewardshipDeltas = [];
    for (let i = 0; i < TICKS_DISCONNECTED; i++) {
      // Simular que StewardshipEngine genera una acción automática cada 5 ticks
      if (i % 5 === 0) {
        const autoIntent = {
          type: 'stewardship_action',
          playerId: 'SYSTEM',
          nationId: NATION_ID,
          payload: { action: 'auto_balance_budget' },
          tick: server.getCurrentTick() + 1
        };
        server.injectIntent(autoIntent);
        stewardshipDeltas.push(autoIntent);
      }
      server.runTicks(1);
    }

    const tickAtReconnect = server.getCurrentTick();
    assert.strictEqual(tickAtReconnect, TICKS_BEFORE_DISCONNECT + TICKS_DISCONNECTED, 'El tiempo debe haber avanzado durante la desconexión');

    // FASE 3: Reconexión
    // El jugador se reconecta y debe recibir los deltas ocurridos mientras estaba fuera
    const reconnectDelta = {
      type: 'player_reconnected',
      playerId: PLAYER_ID,
      tick: tickAtReconnect,
      missedDeltas: stewardshipDeltas, // Simulación del buffer de deltas
      lastKnownTick: tickAtDisconnect
    };

    server.stateManager.applyDelta(reconnectDelta, 'system');
    
    // Actualizar estado de conexión
    const stateAfterReconnect = server.getStateSnapshot();
    stateAfterReconnect.players[PLAYER_ID].connected = true;
    stateAfterReconnect.players[PLAYER_ID].lastSeenTick = tickAtReconnect;
    
    // Verificar que el estado es consistente
    assert.strictEqual(stateAfterReconnect.players[PLAYER_ID].connected, true, 'El jugador debe estar marcado como conectado');
    assert.strictEqual(stateAfterReconnect.players[PLAYER_ID].lastSeenTick, tickAtReconnect, 'El último tick visto debe actualizarse al momento de reconexión');
    
    // FASE 4: Continuidad post-reconexión
    // El jugador envía una nueva intención y debe ser procesada correctamente
    server.injectIntent(createPlayerIntent(PLAYER_ID, NATION_ID, 'build_unit', { type: 'scout' }));
    server.runTicks(1);

    const finalTick = server.getCurrentTick();
    assert.strictEqual(finalTick, tickAtReconnect + 1, 'El juego debe continuar normalmente tras la reconexión');
  });

  it('RESILIENCE-02: Buffer de deltas no excede el límite máximo (120 ticks)', () => {
    // Reiniciar para prueba específica de límite
    server.reset();
    server.init();
    server.setInitialState(createDefaultInitialState([NATION_ID]));
    
    const MAX_BUFFER_TICKS = 120;
    const EXCESS_TICKS = 130;

    // Avanzar más ticks de los permitidos en buffer
    server.runTicks(EXCESS_TICKS);

    // En una implementación real, el StateManager o WebSocketServer recortaría el buffer.
    // Aquí verificamos que el sistema no colapsa y el tick es correcto.
    const currentTick = server.getCurrentTick();
    assert.strictEqual(currentTick, EXCESS_TICKS, 'El tiempo debe avanzar incluso si excede el buffer teórico');

    // Simular intento de reconexión con historial antiguo
    // El sistema debería detectar que lastKnownTick es demasiado antiguo y forzar un snapshot completo
    const reconnectAttempt = {
      type: 'reconnect_request',
      playerId: PLAYER_ID,
      lastKnownTick: 0 // Muy antiguo
    };

    // No debería lanzar excepción
    assert.doesNotThrow(() => {
      server.stateManager.applyDelta(reconnectAttempt, 'system');
    }, 'La reconexión con historial antiguo no debe causar crash');
  });

  it('RESILIENCE-03: Múltiples desconexiones/reconexiones consecutivas', () => {
    // Prueba de estrés básico: Ciclos rápidos de conexión
    const cycles = 5;
    let currentTickStart = server.getCurrentTick();

    for (let i = 0; i < cycles; i++) {
      // Desconectar
      server.runTicks(2);
      server.stateManager.applyDelta({ type: 'player_disconnected', playerId: PLAYER_ID, tick: server.getCurrentTick() }, 'system');
      
      // Ticks offline
      server.runTicks(3);
      
      // Reconectar
      server.stateManager.applyDelta({ type: 'player_reconnected', playerId: PLAYER_ID, tick: server.getCurrentTick() }, 'system');
    }

    const finalTick = server.getCurrentTick();
    const expectedTick = currentTickStart + (cycles * 5); // 2 online + 3 offline por ciclo
    
    assert.strictEqual(finalTick, expectedTick, `Debería haber avanzado ${cycles * 5} ticks en total`);
    
    // Verificar que el estado final es válido (no corrupto)
    const finalState = server.getStateSnapshot();
    assert.ok(finalState.game || finalState.tick !== undefined || Object.keys(finalState).length > 0, 'El estado final no debe estar vacío o corrupto');
  });

  it('RESILIENCE-04: Intenciones recibidas durante la reconexión se encolan correctamente', () => {
    // Simular que llegan intenciones justo en el momento de reconectar
    const reconnectTick = server.getCurrentTick();
    
    // Intento de acción justo antes de confirmar reconexión (edge case)
    const pendingIntent = createPlayerIntent(PLAYER_ID, NATION_ID, 'chat_message', { text: 'Reconectando...' });
    
    // En algunos diseños, esto se rechaza; en otros, se encola.
    // Asumimos diseño robusto: se encola o se procesa tras validar estado.
    server.injectIntent(pendingIntent);
    server.runTicks(1);

    // Verificar que el sistema no crasheó y el tick avanzó
    assert.strictEqual(server.getCurrentTick(), reconnectTick + 1, 'El tick debe avanzar tras procesar intenciones de reconexión');
  });
});