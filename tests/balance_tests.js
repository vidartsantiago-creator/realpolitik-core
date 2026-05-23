/**
 * Test de Balanceo - Golpe de Estado y Sanciones
 * @description Verifica que los requisitos y efectos sean viables para gameplay inmediato
 */

import { ACTION_REGISTRY, getAction } from '../config/actions.registry.js';

// Configuración inicial típica del mundo (world.json)
const TYPICAL_NATIONS = {
  ARG: { budget: 100, stability: 50 },
  BRA: { budget: 150, stability: 60 },
  USA: { budget: 500, stability: 70 }
};

console.log('=== TEST DE BALANCEO: RealPolitik Core ===\n');

let passCount = 0;
let failCount = 0;

function test(name, condition, details = '') {
  if (condition) {
    console.log(`✅ PASS: ${name}`);
    if (details) console.log(`   ${details}`);
    passCount++;
  } else {
    console.log(`❌ FAIL: ${name}`);
    if (details) console.log(`   ${details}`);
    failCount++;
  }
}

// --- TEST 1: Golpe de Estado Viable ---
console.log('\n--- Test 1: Golpe de Estado (covert_coup) ---');
const coup = getAction('covert_coup');

test(
  'Costo accesible para nación mediana',
  coup.cost.gold <= 200 && coup.cost.influence <= 50,
  `Costo: $${coup.cost.gold}k, ${coup.cost.influence} influencia`
);

test(
  'Requisito de relación alcanzable',
  coup.requirements.minRelation >= -50,
  `Relación mínima: ${coup.requirements.minRelation}`
);

test(
  'Requisito de presupuesto razonable',
  coup.requirements.minBudget <= 150,
  `Presupuesto mínimo: $${coup.requirements.minBudget}k`
);

test(
  'Estabilidad objetivo permite golpes en naciones inestables',
  coup.requirements.targetStabilityMax >= 60,
  `Estabilidad máx. objetivo: ${coup.requirements.targetStabilityMax}`
);

test(
  'Chance de éxito base razonable',
  coup.effects.successChanceBase >= 0.25 && coup.effects.successChanceBase <= 0.5,
  `Chance base: ${(coup.effects.successChanceBase * 100).toFixed(0)}%`
);

// Simulación: ¿Puede ARG hacer golpe a BRA?
const argCanCoupBra =
  TYPICAL_NATIONS.ARG.budget >= coup.requirements.minBudget &&
  TYPICAL_NATIONS.BRA.stability <= coup.requirements.targetStabilityMax;

test(
  'Escenario realista: ARG puede hacer golpe a BRA',
  argCanCoupBra,
  `ARG budget: ${TYPICAL_NATIONS.ARG.budget} >= ${coup.requirements.minBudget}, BRA stability: ${TYPICAL_NATIONS.BRA.stability} <= ${coup.requirements.targetStabilityMax}`
);

// --- TEST 2: Sanciones Económicas Efectivas ---
console.log('\n--- Test 2: Sanciones Económicas ---');
const sanctionsEcon = getAction('sanctions_economic');

test(
  'Costo de sanciones económicas accesible',
  sanctionsEcon.cost.gold <= 100,
  `Costo: $${sanctionsEcon.cost.gold}k`
);

test(
  'Duración suficiente para impacto',
  sanctionsEcon.effects.duration >= 15,
  `Duración: ${sanctionsEcon.effects.duration} ticks`
);

test(
  'Tiene efecto de costo de mantenimiento para el actor',
  sanctionsEcon.effects.actorEffect?.passiveGoldIncome !== undefined,
  `Costo mantenimiento: ${sanctionsEcon.effects.actorEffect?.passiveGoldIncome}/tick`
);

// --- TEST 3: Sanciones Financieras con Impacto ---
console.log('\n--- Test 3: Sanciones Financieras ---');
const sanctionsFin = getAction('sanctions_financial');

test(
  'Drenaje de presupuesto significativo por tick',
  sanctionsFin.effects.targetEffect?.budgetDecayPerTick >= 1,
  `Drenaje: $${sanctionsFin.effects.targetEffect?.budgetDecayPerTick}k/tick`
);

test(
  'Duración adecuada para drenar presupuesto',
  sanctionsFin.effects.duration >= 10,
  `Duración: ${sanctionsFin.effects.duration} ticks (drenaje total potencial: $${sanctionsFin.effects.targetEffect?.budgetDecayPerTick * sanctionsFin.effects.duration}k)`
);

// --- TEST 4: Inversiones con Retorno Pasivo ---
console.log('\n--- Test 4: Inversiones con Retorno ---');
const investment = getAction('investment_infrastructure');

test(
  'Retorno de inversión pasivo definido',
  investment.effects.actorEffect?.passiveGoldIncome > 0,
  `Retorno: $${investment.effects.actorEffect?.passiveGoldIncome}k/tick`
);

test(
  'ROI positivo en duración del tratado',
  (investment.effects.actorEffect?.passiveGoldIncome || 0) * investment.effects.duration > investment.cost.gold,
  `Inversión: $${investment.cost.gold}k, Retorno total: $${(investment.effects.actorEffect?.passiveGoldIncome || 0) * investment.effects.duration}k`
);

// --- RESUMEN ---
console.log('\n=== RESUMEN ===');
console.log(`Tests aprobados: ${passCount}`);
console.log(`Tests fallidos: ${failCount}`);
console.log(`Total: ${passCount + failCount}`);

if (failCount === 0) {
  console.log('\n🎉 ¡Todos los tests de balanceo pasaron! El juego es viable para gameplay inmediato.');
  process.exit(0);
} else {
  console.log('\n⚠️ Algunos tests fallaron. Revisar ajustes de balanceo.');
  process.exit(1);
}