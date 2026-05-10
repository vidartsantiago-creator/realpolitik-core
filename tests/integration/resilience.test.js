import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { MockServer, createDefaultInitialState, createPlayerIntent } from '../helpers/MockServer.js';

describe('Integration: Resilience & Reconnection', () => {
  let server;
  const SEED = 12345;
  const PLAYER_ID = 'P1';
  const NATION_ID = 'A';
  
  const TICKS_BEFORE_DISCONNECT = 10;
  const TICKS_DISCONNECTED = 20;

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
    if (server) server.reset();
  });

  it('RESILIENCE-01: Flujo completo de desconexión y reconexión', () => {
    // Fase 1: Conectado
    for (let i = 0; i < TICKS_BEFORE_DISCONNECT; i++) {
      server.injectIntent(createPlayerIntent(PLAYER_ID, NATION_ID, 'idle', {}));
      server.runTicks(1);
    }

    const tickAtDisconnect = server.getCurrentTick();
    assert.strictEqual(tickAtDisconnect, TICKS_BEFORE_DISCONNECT, 'Tick correcto antes de desconectar');

    // Simular desconexión
    server.applyDelta({
      type: 'player_disconnected',
      playerId: PLAYER_ID,
      tick: tickAtDisconnect
    }, 'system');
    
    let currentState = server.getStateSnapshot();
    currentState.players[PLAYER_ID].connected = false;
    currentState.players[PLAYER_ID].lastSeenTick = tickAtDisconnect;
    server.setInitialState(currentState); 

    // Fase 2: Stewardship (Desconectado)
    let stewardshipDeltas = [];
    for (let i = 0; i < TICKS_DISCONNECTED; i++) {
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
    assert.strictEqual(tickAtReconnect, TICKS_BEFORE_DISCONNECT + TICKS_DISCONNECTED, 'El tiempo avanzó durante desconexión');

    // Fase 3: Reconexión
    server.applyDelta({
      type: 'player_reconnected',
      playerId: PLAYER_ID,
      tick: tickAtReconnect,
      missedDeltas: stewardshipDeltas,
      lastKnownTick: tickAtDisconnect
    }, 'system');
    
    const stateAfterReconnect = server.getStateSnapshot();
    stateAfterReconnect.players[PLAYER_ID].connected = true;
    stateAfterReconnect.players[PLAYER_ID].lastSeenTick = tickAtReconnect;
    
    assert.strictEqual(stateAfterReconnect.players[PLAYER_ID].connected, true, 'Jugador conectado');
    assert.strictEqual(stateAfterReconnect.players[PLAYER_ID].lastSeenTick, tickAtReconnect, 'Tick actualizado');
    
    // Fase 4: Continuidad
    server.injectIntent(createPlayerIntent(PLAYER_ID, NATION_ID, 'build_unit', { type: 'scout' }));
    server.runTicks(1);

    assert.strictEqual(server.getCurrentTick(), tickAtReconnect + 1, 'Juego continúa normalmente');
  });

  it('RESILIENCE-02: Buffer de deltas no colapsa con historial antiguo', () => {
    server.reset();
    server.init();
    server.setInitialState(createDefaultInitialState([NATION_ID]));
    
    const EXCESS_TICKS = 130;
    server.runTicks(EXCESS_TICKS);

    const currentTick = server.getCurrentTick();
    assert.strictEqual(currentTick, EXCESS_TICKS, 'El tiempo avanza correctamente');

    const reconnectAttempt = {
      type: 'reconnect_request',
      playerId: PLAYER_ID,
      lastKnownTick: 0 
    };

    assert.doesNotThrow(() => {
      server.applyDelta(reconnectAttempt, 'system');
    }, 'Reconexión con historial antiguo no debe crashear');
  });

  it('RESILIENCE-03: Múltiples ciclos de conexión/desconexión', () => {
    const cycles = 5;
    const startTick = server.getCurrentTick();

    for (let i = 0; i < cycles; i++) {
      server.runTicks(2);
      server.applyDelta({ type: 'player_disconnected', playerId: PLAYER_ID, tick: server.getCurrentTick() }, 'system');
      
      server.runTicks(3);
      
      server.applyDelta({ type: 'player_reconnected', playerId: PLAYER_ID, tick: server.getCurrentTick() }, 'system');
    }

    const finalTick = server.getCurrentTick();
    const expectedTick = startTick + (cycles * 5);
    
    assert.strictEqual(finalTick, expectedTick, `Avance correcto de ${cycles * 5} ticks`);
    
    const finalState = server.getStateSnapshot();
    assert.ok(Object.keys(finalState).length > 0, 'Estado final válido');
  });

  it('RESILIENCE-04: Intenciones durante reconexión se procesan', () => {
    const reconnectTick = server.getCurrentTick();
    
    const pendingIntent = createPlayerIntent(PLAYER_ID, NATION_ID, 'chat_message', { text: 'Reconectando...' });
    
    server.injectIntent(pendingIntent);
    server.runTicks(1);

    assert.strictEqual(server.getCurrentTick(), reconnectTick + 1, 'Tick avanza tras intención de reconexión');
  });
});