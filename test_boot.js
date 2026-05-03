/**
 * @file test_boot.js
 * @description Script de prueba que inicializa el servidor, corre 100 ticks y verifica sincronización.
 */

import { initRng, rng, rngInt } from './core/Rng.js';
import { getState, applyDelta } from './core/StateManager.js';
import { on, emit } from './core/EventDispatcher.js';
import { init as initStewardship } from './ai/StewardshipEngine.js';
import { init as initDiplomacy } from './modules/DiplomacyRule.js';
import { init as initEspionage } from './modules/EspionageRule.js';

const TEST_CONFIG = {
  seed: 42,
  ticksToRun: 100,
  nations: ['USA', 'RUS', 'CHN', 'EU']
};

let errors = [];
let warnings = [];
let tickCount = 0;

function log(msg) {
  console.log(`[TEST] ${msg}`);
}

function error(msg) {
  errors.push(msg);
  console.error(`[TEST ERROR] ${msg}`);
}

function warn(msg) {
  warnings.push(msg);
  console.warn(`[TEST WARN] ${msg}`);
}

function setup() {
  log('Inicializando sistemas...');

  try {
    initRng(TEST_CONFIG.seed);

    const initialState = {
      tick: 0,
      nations: {}
    };

    for (const id of TEST_CONFIG.nations) {
      initialState.nations[id] = {
        resources: { treasury: 500, materials: 300, manpower: 200 },
        stats: { stability: 50, technology: 10, territory: 100 }
      };
    }

    applyDelta(initialState, 'init');

    const stewardshipResult = initStewardship({
      mandate: { checkInterval: 10 },
      absence: { inactivityTicks: 50 }
    });

    if (!stewardshipResult.success) {
      error('Fallo al inicializar StewardshipEngine');
    }

    const diplomacyResult = initDiplomacy({});
    if (!diplomacyResult.success) {
      error('Fallo al inicializar DiplomacyRule');
    }

    const espionageResult = initEspionage({});
    if (!espionageResult.success) {
      error('Fallo al inicializar EspionageRule');
    }

    log('Sistemas inicializados correctamente');
    return true;
  } catch (e) {
    error(`Error en setup: ${e.message}`);
    return false;
  }
}

function simulateTick(tickNumber) {
  try {
    emit('tick_start', { tick: tickNumber });

    if (tickNumber % 20 === 0) {
      for (const nationId of TEST_CONFIG.nations) {
        const delta = {
          nations: {
            [nationId]: {
              resources: { treasury: 5, materials: 3, manpower: 2 },
              stats: { stability: 1 }
            }
          },
          tick: tickNumber
        };
        applyDelta(delta, 'income');
      }
    }

    if (tickNumber === 30) {
      emit('player_action', { playerId: 'USA', actionType: 'expand', tick: tickNumber });
      emit('nation_expansion', {
        nationId: 'USA',
        expansionAmount: 10,
        previousSize: 100,
        tick: tickNumber
      });
    }

    if (tickNumber === 50) {
      emit('diplomatic_request', {
        fromNationId: 'USA',
        toNationId: 'EU',
        requestType: 'direct_channel',
        terms: { secret: true }
      });
    }

    if (tickNumber === 70) {
      emit('espionage_order', {
        operatingNationId: 'RUS',
        targetNationId: 'USA',
        operationType: 'techTheft'
      });
    }

    tickCount++;
    return true;
  } catch (e) {
    error(`Error en tick ${tickNumber}: ${e.message}`);
    return false;
  }
}

function runTest() {
  log(`Iniciando prueba: ${TEST_CONFIG.ticksToRun} ticks`);

  const setupOk = setup();
  if (!setupOk) {
    log('SETUP FALLIDO');
    return false;
  }

  log('Ejecutando ticks...');

  for (let i = 1; i <= TEST_CONFIG.ticksToRun; i++) {
    const ok = simulateTick(i);

    if (!ok) {
      warn(`Tick ${i} falló pero continuamos`);
    }

    if (i % 25 === 0) {
      log(`Tick ${i}/${TEST_CONFIG.ticksToRun} completado`);
    }
  }

  log('Verificando estado final...');

  const state = getState();

  if (!state.tick || state.tick !== TEST_CONFIG.ticksToRun) {
    error(`Estado inconsistente: tick=${state.tick}, esperado=${TEST_CONFIG.ticksToRun}`);
  }

  if (!state.nations || Object.keys(state.nations).length !== TEST_CONFIG.nations.length) {
    error('Naciones faltantes en estado final');
  }

  for (const nationId of TEST_CONFIG.nations) {
    const nation = state.nations?.[nationId];
    if (!nation) {
      error(`Nación ${nationId} no existe en estado final`);
      continue;
    }

    if (!nation.resources || typeof nation.resources.treasury !== 'number') {
      error(`Nación ${nationId} tiene recursos inválidos`);
    }
  }

  return errors.length === 0;
}

function main() {
  console.log('='.repeat(50));
  console.log('RealPolitik Core - Test Boot Script');
  console.log('='.repeat(50));

  const startTime = Date.now();

  const success = runTest();

  const duration = Date.now() - startTime;

  console.log('='.repeat(50));
  console.log('RESULTADOS:');
  console.log(`  Ticks ejecutados: ${tickCount}/${TEST_CONFIG.ticksToRun}`);
  console.log(`  Duración: ${duration}ms`);
  console.log(`  Errores: ${errors.length}`);
  console.log(`  Advertencias: ${warnings.length}`);

  if (success) {
    console.log('\n✓ PRUEBA EXITOSA - Sin errores críticos');
  } else {
    console.log('\n✗ PRUEBA FALLIDA - Errores encontrados:');
    for (const err of errors) {
      console.log(`  - ${err}`);
    }
  }

  console.log('='.repeat(50));

  process.exit(success ? 0 : 1);
}

main();