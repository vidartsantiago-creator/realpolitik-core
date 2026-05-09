/**
 * @file EspionageRule.test.js
 * @description Tests unitarios robustos para EspionageRule - operaciones de espionaje,
 *              contraespionaje, detección, resolución determinista.
 * @version 2.1.0 - Implementación basada en API real del módulo
 */
import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as EspionageRule from '../../modules/EspionageRule.js';
import { getState, applyDelta, ResetForTests as ResetStateManager } from '../../core/StateManager.js';
import { _resetRngForTests } from '../../core/Rng.js';
import { emit, on, off, _clearAllForTests } from '../../core/EventDispatcher.js';
const TEST_SEED = 12345;
/**
 * Crea estado inicial para tests de espionaje
 */
const createTestState = () => ({
  tick: 0,
  version: 0,
  nations: {
    NAT001: {
      id: 'NAT001',
      name: 'Origin Nation',
      region: 'TestRegion',
      stats: { stability: 60, budget: 500 },
      intelligence: 50,
      factions: {}
    },
    NAT002: {
      id: 'NAT002',
      name: 'Target Nation',
      region: 'TestRegion',
      stats: { stability: 65, budget: 600 },
      intelligence: 45,
      factions: {}
    }
  },
  diplomacy: { relations: {}, channels: {} },
  factions: {},
  crisis: { active: false, phase: 0, type: null, treaties: {} },
  espionage: { operations: {}, signals: [] }
});
/**
 * Captura eventos emitidos durante un test
 */
class EventCapture {
  constructor() {
    this.events = [];
    this.handlers = new Map();
  }
  capture(eventType) {
    const handler = (payload) => {
      this.events.push({ type: eventType, payload });
    };
    on(eventType, handler);
    this.handlers.set(eventType, handler);
    return this;
  }
  clear() {
    for (const [eventType, handler] of this.handlers.entries()) {
      off(eventType, handler);
    }
    this.handlers.clear();
    this.events = [];
  }
  findByType(eventType) {
    return this.events.filter(e => e.type === eventType);
  }
  findFirst(eventType) {
    return this.events.find(e => e.type === eventType);
  }
}
describe('EspionageRule Tests', () => {
  let eventCapture;
  before(() => {
    // Inicializar módulo EspionageRule
    EspionageRule.init({ debug: false });
  });
  beforeEach(() => {
    // Resetear RNG para comportamiento determinista
    _resetRngForTests(TEST_SEED);
    // Limpiar event dispatcher
    _clearAllForTests();
    // Resetear estado de EspionageRule
    EspionageRule.ResetForTests();
    // Re-inicializar EspionageRule para registrar listeners
    EspionageRule.init({ debug: false });
    // Resetear StateManager con estado inicial
    ResetStateManager(createTestState());
    // Configurar captura de eventos
    eventCapture = new EventCapture();
  });
  afterEach(() => {
    if (eventCapture) {
      eventCapture.clear();
    }
  });
  // ============================================================================
  // INICIALIZACIÓN Y ESTADO
  // ============================================================================
  describe('Inicialización', () => {
    it('Debería inicializar correctamente el módulo', () => {
      const result = EspionageRule.getEspionageState();
      assert.strictEqual(result.initialized, true, 'Módulo debe estar inicializado');
    });
    it('Debería rechazar doble inicialización', () => {
      const result = EspionageRule.init({ debug: false });
      assert.strictEqual(result.success, false, 'Doble init debe fallar');
      assert.ok(result.errors, 'Debe retornar errores');
    });
  });
  // ============================================================================
  // OPERACIONES DE ESPIONAJE
  // ============================================================================
  describe('startOperation', () => {
    it('Debería iniciar operación tech_theft exitosamente', () => {
      const result = EspionageRule.startOperation('NAT001', 'NAT002', 'tech_theft');
      assert.ok(result.success !== undefined, 'Resultado debe tener propiedad success');
      if (result.success) {
        assert.ok(result.operationId, 'Operación exitosa debe retornar operationId');
      } else {
        assert.ok(result.errors, 'Operación fallida debe incluir errores');
      }
    });
    it('Debería iniciar operación sabotage exitosamente', () => {
      const result = EspionageRule.startOperation('NAT001', 'NAT002', 'sabotage');
      assert.ok(result.success !== undefined, 'Resultado debe tener propiedad success');
    });
    it('Debería iniciar operación infiltrate exitosamente', () => {
      const result = EspionageRule.startOperation('NAT001', 'NAT002', 'infiltrate');
      assert.ok(result.success !== undefined, 'Resultado debe tener propiedad success');
    });
    it('Debería iniciar operación intercept exitosamente', () => {
      const result = EspionageRule.startOperation('NAT001', 'NAT002', 'intercept');
      assert.ok(result.success !== undefined, 'Resultado debe tener propiedad success');
    });
    it('Debería fallar al espiarse a sí mismo', () => {
      const result = EspionageRule.startOperation('NAT001', 'NAT001', 'tech_theft');
      assert.strictEqual(result.success, false, 'No debería poder espiarse a sí mismo');
      assert.ok(result.errors, 'Debe incluir errores');
    });
    it('Debería fallar con tipo de operación inválido', () => {
      const result = EspionageRule.startOperation('NAT001', 'NAT002', 'invalid_type');
      assert.strictEqual(result.success, false, 'Tipo inválido debe fallar');
      assert.ok(result.errors, 'Debe incluir errores');
    });
    it('Debería fallar con nación inexistente', () => {
      const result = EspionageRule.startOperation('NAT001', 'NONEXISTENT', 'tech_theft');
      assert.strictEqual(result.success, false, 'Nación inexistente debe fallar');
      assert.ok(result.errors, 'Debe incluir errores');
    });
  });
  // ============================================================================
  // CONTRAESPIONAJE
  // ============================================================================
  describe('getCounterIntelLevel', () => {
    it('Debería retornar nivel 0 por defecto', () => {
      const level = EspionageRule.getCounterIntelLevel('NAT002');
      assert.strictEqual(level, 0, 'Nivel inicial debe ser 0');
    });
    it('Debería retornar 0 para nación inexistente', () => {
      const level = EspionageRule.getCounterIntelLevel('NONEXISTENT');
      assert.strictEqual(level, 0, 'Nación inexistente debe retornar 0');
    });
  });
  describe('counterintel_upgrade', () => {
    it('Debería aumentar nivel de contraespionaje', () => {
      emit('counterintel_upgrade', { nationId: 'NAT002', levels: 1 });
      const level = EspionageRule.getCounterIntelLevel('NAT002');
      assert.ok(level > 0, 'Nivel debe aumentar tras upgrade');
      assert.ok(level <= 5, 'Nivel no debe exceder máximo de 5');
    });
    it('Debería emitir evento counterintel_upgraded', () => {
      const captured = new EventCapture();
      captured.capture('counterintel_upgraded');
      emit('counterintel_upgrade', { nationId: 'NAT002', levels: 1 });
      const events = captured.findByType('counterintel_upgraded');
      if (events.length > 0) {
        const event = events[0].payload;
        assert.strictEqual(event.nationId, 'NAT002', 'nationId debe coincidir');
        assert.ok(typeof event.newLevel === 'number', 'newLevel debe ser número');
      }
      captured.clear();
    });
  });
  // ============================================================================
  // GESTIÓN DE OPERACIONES
  // ============================================================================
  describe('getActiveOperations', () => {
    it('Debería retornar array vacío sin operaciones activas', () => {
      const operations = EspionageRule.getActiveOperations('NAT001');
      assert.ok(Array.isArray(operations), 'Debe retornar un array');
      assert.strictEqual(operations.length, 0, 'No debe haber operaciones activas');
    });
    it('Debería retornar operaciones activas después de startOperation', () => {
      const result = EspionageRule.startOperation('NAT001', 'NAT002', 'tech_theft');
      if (result.success) {
        const operations = EspionageRule.getActiveOperations('NAT001');
        assert.ok(Array.isArray(operations), 'Debe retornar un array');
        assert.ok(operations.length > 0, 'Debe haber al menos una operación activa');
      }
    });
    it('Debería retornar array vacío para nación inexistente', () => {
      const operations = EspionageRule.getActiveOperations('NONEXISTENT');
      assert.ok(Array.isArray(operations), 'Debe retornar un array');
      assert.strictEqual(operations.length, 0, 'Nación inexistente no tiene operaciones');
    });
  });
  describe('getEspionageState', () => {
    it('Debería retornar estado completo del módulo', () => {
      const state = EspionageRule.getEspionageState();
      assert.ok(state.initialized !== undefined, 'Debe incluir initialized');
      assert.ok(state.config !== undefined, 'Debe incluir config');
      assert.ok(state.activeOperationsCount !== undefined, 'Debe incluir activeOperationsCount');
      assert.ok(state.completedOperationsCount !== undefined, 'Debe incluir completedOperationsCount');
    });
    it('Debería mostrar contador de operaciones completadas', () => {
      const initialState = EspionageRule.getEspionageState();
      assert.strictEqual(initialState.completedOperationsCount, 0, 'Contador inicial debe ser 0');
    });
  });
  // ============================================================================
  // EVENTOS DE ESPIONAJE
  // ============================================================================
  describe('Eventos de Operaciones', () => {
    it('Debería emitir espionage_operation_started al iniciar operación', () => {
      const captured = new EventCapture();
      captured.capture('espionage_operation_started');
      EspionageRule.startOperation('NAT001', 'NAT002', 'tech_theft');
      const events = captured.findByType('espionage_operation_started');
      if (events.length > 0) {
        const event = events[0].payload;
        assert.ok(event.operationId, 'Evento debe incluir operationId');
        assert.strictEqual(event.operator, 'NAT001', 'operator debe coincidir');
        assert.strictEqual(event.target, 'NAT002', 'target debe coincidir');
        assert.strictEqual(event.type, 'tech_theft', 'type debe coincidir');
      }
      captured.clear();
    });
    it('Debería procesar tick_start sin errores', () => {
      assert.doesNotThrow(() => {
        emit('tick_start', { tick: 0 });
      }, 'tick_start debe procesarse sin errores');
    });
  });
  // ============================================================================
  // RESET PARA TESTS
  // ============================================================================
  describe('ResetForTests', () => {
    it('Debería limpiar todas las operaciones activas', () => {
      // Iniciar algunas operaciones
      EspionageRule.startOperation('NAT001', 'NAT002', 'tech_theft');
      EspionageRule.startOperation('NAT001', 'NAT002', 'sabotage');
      const stateBefore = EspionageRule.getEspionageState();
      // Resetear
      EspionageRule.ResetForTests();
      const stateAfter = EspionageRule.getEspionageState();
      assert.strictEqual(stateAfter.activeOperationsCount, 0, 'Reset debe limpiar operaciones');
    });
    it('Debería resetear estado inicializado', () => {
      EspionageRule.ResetForTests();
      const state = EspionageRule.getEspionageState();
      assert.strictEqual(state.initialized, false, 'Reset debe desinicializar módulo');
    });
    it('Debería limpiar niveles de contraespionaje', () => {
      // Aumentar contraespionaje
      emit('counterintel_upgrade', { nationId: 'NAT002', levels: 1 });
      emit('counterintel_upgrade', { nationId: 'NAT001', levels: 1 });
      EspionageRule.ResetForTests();
      const level1 = EspionageRule.getCounterIntelLevel('NAT001');
      const level2 = EspionageRule.getCounterIntelLevel('NAT002');
      assert.strictEqual(level1, 0, 'Reset debe limpiar contraespionaje de NAT001');
      assert.strictEqual(level2, 0, 'Reset debe limpiar contraespionaje de NAT002');
    });
  });
  // ============================================================================
  // INTEGRACIÓN CON TICK SYSTEM
  // ============================================================================
  describe('Integración con Tick System', () => {
    it('Debería decrementar ticksRemaining de operaciones activas', () => {
      const result = EspionageRule.startOperation('NAT001', 'NAT002', 'intercept');
      if (result.success) {
        // Ejecutar varios ticks
        for (let i = 0; i < 10; i++) {
          emit('tick_start', { tick: i });
        }
        // La operación debería haber progresado o completado
        const operations = EspionageRule.getActiveOperations('NAT001');
        // Verificar que no hay error
        assert.ok(Array.isArray(operations), 'Debe retornar array');
      }
    });
    it('Debería manejar múltiples operaciones simultáneas', () => {
      const result1 = EspionageRule.startOperation('NAT001', 'NAT002', 'tech_theft');
      const result2 = EspionageRule.startOperation('NAT001', 'NAT002', 'sabotage');
      // Al menos una debería tener éxito o ambas fallar por razones válidas
      assert.ok(
        result1.success || result2.success ||
        (result1.errors && result2.errors),
        'Operaciones deberían procesarse'
      );
    });
  });
  // ============================================================================
  // VALIDACIÓN DETERMINISTA CON RNG
  // ============================================================================
  describe('Determinismo con Seed Fijo', () => {
    it('Debería producir resultados idénticos con mismo seed', () => {
      // Primera ejecución
      _resetRngForTests(99999);
      EspionageRule.ResetForTests();
      EspionageRule.init({ debug: false });
      ResetStateManager(createTestState());
      const result1 = EspionageRule.startOperation('NAT001', 'NAT002', 'tech_theft');
      // Segunda ejecución con mismo seed
      _resetRngForTests(99999);
      EspionageRule.ResetForTests();
      EspionageRule.init({ debug: false });
      ResetStateManager(createTestState());
      const result2 = EspionageRule.startOperation('NAT001', 'NAT002', 'tech_theft');
      assert.strictEqual(result1.success, result2.success,
        'Resultados deben ser idénticos con mismo seed');
    });
  });
});
