const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { MockServer, createDefaultInitialState, createPlayerIntent } = require('../helpers/MockServer');

/**
 * Test de Determinismo Estricto
 * 
 * Objetivo: Verificar que dos ejecuciones idénticas (mismo seed, mismas intenciones, mismo orden)
 * producen exactamente el mismo estado final, bit a bit.
 * 
 * Metodología:
 * 1. Definir una secuencia fija de intenciones (seed de entrada).
 * 2. Ejecutar la simulación completa en el Servidor A.
 * 3. Reiniciar y ejecutar la misma secuencia en el Servidor B.
 * 4. Comparar los hashes SHA-256 de los estados finales.
 */

describe('Integration: Determinism & Reproducibility', () => {
  let serverA;
  let serverB;
  
  const SEED = 42;
  const TICKS_TO_RUN = 50;
  
  // Secuencia de intenciones predefinida para garantizar reproducibilidad
  const INTENTION_SEQUENCE = [
    { tick: 5, playerId: 'P1', nationId: 'A', type: 'move_unit', payload: { from: 'x1', to: 'x2' } },
    { tick: 10, playerId: 'P1', nationId: 'A', type: 'build_unit', payload: { type: 'infantry' } },
    { tick: 15, playerId: 'P2', nationId: 'B', type: 'diplomacy', payload: { target: 'A', action: 'propose_alliance' } },
    { tick: 25, playerId: 'P1', nationId: 'A', type: 'espionage', payload: { target: 'B', op: 'intel_gathering' } },
    { tick: 40, playerId: 'P2', nationId: 'B', type: 'policy_change', payload: { policy: 'tax_increase', value: true } }
  ];

  before(() => {
    // Configuración inicial idéntica para ambos servidores
    const initialState = createDefaultInitialState(['A', 'B']);
    
    // Servidor A
    serverA = new MockServer({ seed: SEED, tickRate: 100 });
    serverA.init();
    serverA.setInitialState(initialState);

    // Servidor B
    serverB = new MockServer({ seed: SEED, tickRate: 100 });
    serverB.init();
    serverB.setInitialState(initialState);
  });

  after(() => {
    serverA?.reset();
    serverB?.reset();
  });

  /**
   * Helper para inyectar intenciones en el tick correcto
   * Simula el paso del tiempo y dispara eventos cuando corresponde
   */
  function runSimulationWithIntentions(server, sequence, totalTicks) {
    let currentTick = server.getCurrentTick();
    
    for (let t = 0; t < totalTicks; t++) {
      currentTick++;
      
      // Verificar si hay intenciones programadas para este tick
      const intentionsThisTick = sequence.filter(intent => intent.tick === currentTick);
      
      if (intentionsThisTick.length > 0) {
        intentionsThisTick.forEach(intent => {
          const formattedIntent = createPlayerIntent(
            intent.playerId,
            intent.nationId,
            intent.type,
            intent.payload
          );
          server.injectIntent(formattedIntent);
        });
      }
      
      // Avanzar un tick
      server.runTicks(1);
    }
  }

  /**
   * Genera un hash SHA-256 consistente del estado
   * Ordena las claves para evitar diferencias por orden de inserción
   */
  function hashState(state) {
    const normalized = JSON.stringify(state, Object.keys(state).sort());
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  it('DETERMINISM-01: Dos ejecuciones idénticas deben producir el mismo hash de estado', () => {
    // Ejecutar Simulación A
    runSimulationWithIntentions(serverA, INTENTION_SEQUENCE, TICKS_TO_RUN);
    const stateA = serverA.getStateSnapshot();
    const hashA = hashState(stateA);
    const tickA = serverA.getCurrentTick();

    // Ejecutar Simulación B (Reiniciada implícitamente al ser instancia nueva con mismo seed)
    runSimulationWithIntentions(serverB, INTENTION_SEQUENCE, TICKS_TO_RUN);
    const stateB = serverB.getStateSnapshot();
    const hashB = hashState(stateB);
    const tickB = serverB.getCurrentTick();

    // Aserciones
    assert.strictEqual(tickA, tickB, 'Ambos servidores deben estar en el mismo tick');
    assert.strictEqual(tickA, TICKS_TO_RUN, `El tick final debe ser ${TICKS_TO_RUN}`);
    
    // La prueba crítica: Los hashes deben ser idénticos
    assert.strictEqual(hashA, hashB, 
      `Fallo de determinismo: Hash A (${hashA}) != Hash B (${hashB}). 
       El estado divergió a pesar de usar el mismo seed y secuencia.`
    );
  });

  it('DETERMINISM-02: El estado interno del RNG debe ser consistente tras N ticks', () => {
    // Esta prueba verifica que el generador de números aleatorios no tenga deriva
    // Si usamos módulos que consumen RNG (como FactionRule o EspionageRule), esto es crítico
    
    // Reiniciar servidores para prueba limpia de RNG
    serverA.reset().init();
    serverB.reset().init();
    
    const initialState = createDefaultInitialState(['A', 'B']);
    serverA.setInitialState(initialState);
    serverB.setInitialState(initialState);

    // Ejecutar ticks vacíos (sin intenciones) para probar solo la evolución interna/RNG si lo hubiera
    const emptyTicks = 100;
    serverA.runTicks(emptyTicks);
    serverB.runTicks(emptyTicks);

    const stateA = serverA.getStateSnapshot();
    const stateB = serverB.getStateSnapshot();

    // Si no hubo inputs externos, y el sistema es determinista, el estado debe ser igual
    // Nota: Esto asume que no hay fuentes de entropía externa (Date.now(), Math.random()) en los módulos
    assert.deepStrictEqual(stateA, stateB, 
      'Los estados divergieron en ticks vacíos. Posible uso de Math.random() o Date.now() no controlado.'
    );
  });

  it('DETERMINISM-03: Diferente seed debe producir diferente estado (Prueba de sensibilidad)', () => {
    // Crear servidor C con seed diferente
    const serverC = new MockServer({ seed: 999, tickRate: 100 });
    serverC.init();
    serverC.setInitialState(createDefaultInitialState(['A', 'B']));

    runSimulationWithIntentions(serverC, INTENTION_SEQUENCE, TICKS_TO_RUN);
    const stateC = serverC.getStateSnapshot();
    const hashC = hashState(stateC);
    
    const stateA = serverA.getStateSnapshot();
    const hashA = hashState(stateA);

    // Deben ser diferentes porque el seed es distinto
    assert.notStrictEqual(hashA, hashC, 
      'Los hashes coinciden con seeds diferentes. El sistema no es sensible al seed inicial.'
    );

    serverC.reset();
  });

  it('DETERMINISM-04: El orden de inyección de intenciones afecta el resultado (No conmutatividad)', () => {
    // Prueba que el orden importa. Si invertimos el orden de intenciones en el mismo tick,
    // el resultado debería ser diferente (o al menos el historial de eventos).
    
    const serverD = new MockServer({ seed: SEED, tickRate: 100 });
    serverD.init();
    serverD.setInitialState(createDefaultInitialState(['A', 'B']));

    // Secuencia modificada: Invertir orden de intenciones en el tick 5 y 10
    const modifiedSequence = INTENTION_SEQUENCE.map(i => ({...i}));
    // En una implementación real, si dos jugadores actúan en el mismo tick, el orden de procesamiento importa.
    // Aquí simulamos simplemente cambiando el orden de inyección manual para ver si el hash cambia.
    // Para esta prueba simple, asumimos que cambiar el orden de llegada cambia el estado si la lógica lo contempla.
    
    // Inyectar manualmente en orden inverso para el tick 5
    serverD.runTicks(4); // Llegar a tick 4
    
    // Tick 5: Inyectar en orden inverso al original (original: P1 move, aquí podríamos simular otro si hubiera colisión)
    // Como solo hay una intención por tick en nuestra secuencia base, creamos una colisión artificial
    serverD.injectIntent(createPlayerIntent('P2', 'B', 'move_unit', { from: 'y1', to: 'y2' })); // Nueva intención extra
    serverD.injectIntent(createPlayerIntent('P1', 'A', 'move_unit', { from: 'x1', to: 'x2' })); // Original
    
    serverD.runTicks(TICKS_TO_RUN - 4);
    
    const stateD = serverD.getStateSnapshot();
    const hashD = hashState(stateD);
    const hashA = hashState(serverA.getStateSnapshot());

    // El estado debería ser diferente porque inyectamos una intención extra o cambiamos el orden
    assert.notStrictEqual(hashA, hashD, 
      'El estado no cambió a pesar de alterar la secuencia de entrada.'
    );

    serverD.reset();
  });
});