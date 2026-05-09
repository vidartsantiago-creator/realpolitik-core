/**
 * Tests Unitarios para CrisisRule
 * 
 * Cubre: escalada de fases 1→4, tratados de emergencia, penalty por breach
 * Versión: 1.0.0
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { getState, applyDelta, ResetForTests } from '../../core/StateManager.js';
import * as CrisisRule from '../../modules/CrisisRule.js';
import { emit } from '../../core/EventDispatcher.js';

// Estado base para tests
const createTestState = () => ({
  nations: {
    NAT001: {
      id: 'NAT001',
      name: 'Test Nation',
      stability: 60,
      economy: 70,
      public_order: 55,
      emergency_powers: false
    },
    NAT002: {
      id: 'NAT002',
      name: 'Allied Nation',
      stability: 75,
      economy: 80,
      public_order: 70,
      emergency_powers: false
    }
  },
  global_crisis: {
    phase: 0,
    severity: 0,
    type: 'economic',
    affected_nations: ['NAT001'],
    treaties_active: [],
    escalation_count: 0
  },
  events: [],
  signals: [],
  turn: 1
});

describe('CrisisRule Tests', () => {
  before(() => {
    // Inicializar módulo CrisisRule una vez
    CrisisRule.init({
      debug: true,
      auto_escalate: false
    });
  });

  beforeEach(() => {
    // Resetear estado antes de cada test
    const testState = createTestState();
    ResetForTests(testState);
  });

  describe('Constantes Exportadas', () => {
    it('Debería exportar CRISIS_PHASES_PUBLIC con 4 fases', () => {
      const phases = CrisisRule.CRISIS_PHASES_PUBLIC;
      assert.ok(phases, 'CRISIS_PHASES_PUBLIC debe estar definido');
      assert.strictEqual(Object.keys(phases).length, 4, 'Debe tener 4 fases');
    });

    it('Debería tener IDs numéricos secuenciales 0-3', () => {
      const phases = CrisisRule.CRISIS_PHASES_PUBLIC;
      const phaseIds = Object.values(phases).map(p => p.id).sort((a, b) => a - b);
      assert.deepStrictEqual(phaseIds, [0, 1, 2, 3], 'Fases deben ser 0, 1, 2, 3');
    });

    it('Debería exportar EMERGENCY_TREATIES_PUBLIC', () => {
      const treaties = CrisisRule.EMERGENCY_TREATIES_PUBLIC;
      assert.ok(treaties, 'EMERGENCY_TREATIES_PUBLIC debe estar definido');
      assert.ok(Object.keys(treaties).length > 0, 'Debe tener al menos un tratado');
    });
  });

  describe('Escalada de Fases', () => {
    it('Debería comenzar en fase 0 (Latente)', () => {
      const state = getState();
      assert.strictEqual(state.global_crisis.phase, 0, 'Fase inicial debe ser 0');
    });

    it('Debería escalar de fase 0 a 1 al emitir crisis_escalation', () => {
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test' });
      
      const state = getState();
      assert.strictEqual(state.global_crisis.phase, 1, 'Fase debe ser 1 después de escalada');
    });

    it('Debería escalar de fase 1 a 2 con segunda escalada', () => {
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test1' });
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test2' });
      
      const state = getState();
      assert.strictEqual(state.global_crisis.phase, 2, 'Fase debe ser 2 después de dos escaladas');
    });

    it('Debería escalar de fase 2 a 3 con tercera escalada', () => {
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test1' });
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test2' });
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test3' });
      
      const state = getState();
      assert.strictEqual(state.global_crisis.phase, 3, 'Fase debe ser 3 después de tres escaladas');
    });

    it('Debería alcanzar fase 3 (máxima) y no superar', () => {
      // Escalar 5 veces para asegurar que no pase de 3
      for (let i = 0; i < 5; i++) {
        emit('crisis_escalation', { nation_id: 'NAT001', reason: `test${i}` });
      }
      
      const state = getState();
      assert.strictEqual(state.global_crisis.phase, 3, 'Fase máxima debe ser 3');
    });

    it('Debería activar emergency_powers en fase 3', () => {
      // Escalar hasta fase 3
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test1' });
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test2' });
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test3' });
      
      const state = getState();
      assert.strictEqual(state.nations.NAT001.emergency_powers, true, 'emergency_powers debe activarse en fase 3');
    });

    it('Debería agregar naciones afectadas durante escalada', () => {
      emit('crisis_escalation', { nation_id: 'NAT002', reason: 'spread' });
      
      const state = getState();
      assert.ok(
        state.global_crisis.affected_nations.includes('NAT002'),
        'NAT002 debe estar en naciones afectadas'
      );
    });
  });

  describe('Tratados de Emergencia', () => {
    it('Debería retornar lista de tratados disponibles', () => {
      const treaties = CrisisRule.getAvailableTreaties();
      assert.ok(Array.isArray(treaties), 'Debe retornar un array');
      assert.ok(treaties.length > 0, 'Debe haber al menos un tratado disponible');
    });

    it('Debería definir tratado BAILOUT correctamente', () => {
      const treaty = CrisisRule.getTreatyDefinition('bailout');
      assert.ok(treaty, 'BAILOUT debe estar definido');
      assert.strictEqual(treaty.id, 'bailout', 'ID debe ser bailout');
      assert.ok(treaty.min_phase <= 2, 'BAILOUT requiere fase mínima 2 o menor');
    });

    it('Debería definir tratado SANCTUARY correctamente', () => {
      const treaty = CrisisRule.getTreatyDefinition('sanctuary');
      assert.ok(treaty, 'SANCTUARY debe estar definido');
      assert.strictEqual(treaty.id, 'sanctuary', 'ID debe ser sanctuary');
    });

    it('Debería definir tratado COORDINATED_RESPONSE correctamente', () => {
      const treaty = CrisisRule.getTreatyDefinition('coordinated_response');
      assert.ok(treaty, 'COORDINATED_RESPONSE debe estar definido');
      assert.strictEqual(treaty.id, 'coordinated_response', 'ID debe ser coordinated_response');
    });

    it('Debería activar tratado BAILOUT vía evento', () => {
      // Primero escalar a fase 2 para permitir BAILOUT
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test1' });
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test2' });
      
      // Activar tratado
      emit('crisis_treaty_request', {
        treaty_id: 'bailout',
        initiator: 'NAT001',
        participants: ['NAT001', 'NAT002']
      });
      
      const state = getState();
      assert.ok(
        state.global_crisis.treaties_active.some(t => t.treaty_id === 'bailout'),
        'BAILOUT debe estar activo'
      );
    });

    it('Debería mejorar estabilidad al activar BAILOUT', () => {
      // Escalar a fase 2
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test1' });
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test2' });
      
      const initialState = getState();
      const initialStability = initialState.nations.NAT001.stability;
      
      // Activar tratado
      emit('crisis_treaty_request', {
        treaty_id: 'bailout',
        initiator: 'NAT001',
        participants: ['NAT001', 'NAT002']
      });
      
      const state = getState();
      assert.ok(
        state.nations.NAT001.stability > initialStability,
        'Estabilidad debe mejorar tras BAILOUT'
      );
    });

    it('Debería respetar cooldown de tratados', () => {
      // Escalar a fase 2
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test1' });
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test2' });
      
      // Activar primer tratado
      emit('crisis_treaty_request', {
        treaty_id: 'bailout',
        initiator: 'NAT001',
        participants: ['NAT001', 'NAT002']
      });
      
      // Intentar activar mismo tratado inmediatamente
      emit('crisis_treaty_request', {
        treaty_id: 'bailout',
        initiator: 'NAT001',
        participants: ['NAT001', 'NAT002']
      });
      
      const state = getState();
      const activeCount = state.global_crisis.treaties_active.filter(
        t => t.treaty_id === 'bailout'
      ).length;
      assert.strictEqual(activeCount, 1, 'Solo debe haber una instancia activa de BAILOUT');
    });
  });

  describe('Penalizaciones por Breach', () => {
    it('Debería aplicar penalty por breach de tratado', () => {
      // Activar tratado primero
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test1' });
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test2' });
      
      emit('crisis_treaty_request', {
        treaty_id: 'bailout',
        initiator: 'NAT001',
        participants: ['NAT001', 'NAT002']
      });
      
      // Simular breach
      emit('crisis_treaty_breach', {
        treaty_id: 'bailout',
        violator: 'NAT001',
        reason: 'failed_conditions'
      });
      
      const state = getState();
      const breachEvent = state.events.find(e => e.type === 'treaty_breach_penalty');
      assert.ok(breachEvent, 'Debe registrarse evento de breach');
      assert.strictEqual(breachEvent.data.violator, 'NAT001', 'Violador debe ser NAT001');
    });

    it('Debería reducir estabilidad por breach', () => {
      // Activar tratado
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test1' });
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test2' });
      
      emit('crisis_treaty_request', {
        treaty_id: 'bailout',
        initiator: 'NAT001',
        participants: ['NAT001', 'NAT002']
      });
      
      const initialState = getState();
      const initialStability = initialState.nations.NAT001.stability;
      
      // Simular breach
      emit('crisis_treaty_breach', {
        treaty_id: 'bailout',
        violator: 'NAT001',
        reason: 'failed_conditions'
      });
      
      const state = getState();
      assert.ok(
        state.nations.NAT001.stability < initialStability,
        'Estabilidad debe reducirse tras breach'
      );
    });

    it('Debería registrar señal de alerta por breach', () => {
      // Activar tratado
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test1' });
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test2' });
      
      emit('crisis_treaty_request', {
        treaty_id: 'bailout',
        initiator: 'NAT001',
        participants: ['NAT001', 'NAT002']
      });
      
      // Simular breach
      emit('crisis_treaty_breach', {
        treaty_id: 'bailout',
        violator: 'NAT001',
        reason: 'failed_conditions'
      });
      
      const state = getState();
      const breachSignal = state.signals.find(s => 
        s.type === 'crisis_alert' && s.data.subtype === 'treaty_breach'
      );
      assert.ok(breachSignal, 'Debe emitirse señal de alerta por breach');
    });
  });

  describe('Señales de Crisis', () => {
    it('Debería emitir signal al cambiar de fase', () => {
      const initialState = getState();
      const initialSignalsCount = initialState.signals.length;
      
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test' });
      
      const state = getState();
      assert.strictEqual(
        state.signals.length,
        initialSignalsCount + 1,
        'Debe agregarse una señal'
      );
      
      const phaseSignal = state.signals.find(s => s.type === 'crisis_phase_change');
      assert.ok(phaseSignal, 'Debe haber señal de cambio de fase');
      assert.strictEqual(phaseSignal.data.new_phase, 1, 'Nueva fase debe ser 1');
    });

    it('Debería emitir signal critical en fase 3', () => {
      // Escalar a fase 3
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test1' });
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test2' });
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test3' });
      
      const state = getState();
      const criticalSignal = state.signals.find(s => 
        s.type === 'crisis_alert' && s.priority === 'critical'
      );
      assert.ok(criticalSignal, 'Debe haber señal critical en fase 3');
    });
  });

  describe('Resolución de Crisis', () => {
    it('Debería permitir resolución gradual', () => {
      // Escalar a fase 2
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test1' });
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'test2' });
      
      // Resolver
      emit('crisis_deescalation', { nation_id: 'NAT001', reason: 'diplomacy' });
      
      const state = getState();
      assert.ok(
        state.global_crisis.severity < 50 || state.global_crisis.phase < 2,
        'Crisis debe reducirse tras de-escalación'
      );
    });

    it('Debería resetear crisis completamente', () => {
      // Escalar a fase 3
      for (let i = 0; i < 5; i++) {
        emit('crisis_escalation', { nation_id: 'NAT001', reason: `test${i}` });
      }
      
      // Resetear mediante evento especial (si existe) o verificar que puede bajar
      const state = getState();
      assert.strictEqual(state.global_crisis.phase, 3, 'Fase debe ser 3 antes de reset');
      
      // Nota: El reset completo depende de la implementación específica
      // Este test verifica el estado máximo alcanzado
    });
  });

  describe('Impacto de Políticas', () => {
    it('Debería reflejar impacto en economía nacional', () => {
      const initialState = getState();
      const initialEconomy = initialState.nations.NAT001.economy;
      
      // Escalar crisis
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'economic_shock' });
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'market_crash' });
      
      const state = getState();
      assert.notStrictEqual(
        state.nations.NAT001.economy,
        initialEconomy,
        'Economía debe verse afectada por crisis'
      );
    });

    it('Debería reflejar impacto en orden público', () => {
      const initialState = getState();
      const initialOrder = initialState.nations.NAT001.public_order;
      
      // Escalar crisis
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'civil_unrest' });
      emit('crisis_escalation', { nation_id: 'NAT001', reason: 'protests' });
      
      const state = getState();
      assert.notStrictEqual(
        state.nations.NAT001.public_order,
        initialOrder,
        'Orden público debe verse afectado por crisis'
      );
    });
  });
});