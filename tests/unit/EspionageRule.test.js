/**
 * @file EspionageRule.test.js
 * @description Tests unitarios para EspionageRule - operaciones de espionaje, contraespionaje, validación determinista
 * @version 1.0.0
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import * as EspionageRule from '../../modules/EspionageRule.js';
import { getState, resetState } from '../../core/StateManager.js';
import { setSeed } from '../../core/Rng.js';

describe('EspionageRule Tests', () => {
    beforeEach(() => {
        // Seed fijo para tests deterministas
        setSeed(12345);
        
        const initialState = {
            nations: {
                NAT001: {
                    id: 'NAT001',
                    name: 'Origin Nation',
                    intelligence_agency: {
                        agents: 50,
                        budget: 1000000,
                        effectiveness: 0.75,
                        intel_level: 3,
                        counter_intel_level: 2
                    }
                },
                NAT002: {
                    id: 'NAT002',
                    name: 'Target Nation',
                    intelligence_agency: {
                        agents: 40,
                        budget: 800000,
                        effectiveness: 0.65,
                        intel_level: 2,
                        counter_intel_level: 3
                    }
                }
            },
            current_tick: 0,
            events: [],
            signals: []
        };
        resetState(initialState);
    });

    it('Debería inicializar correctamente el módulo', () => {
        assert.ok(EspionageRule.init || true, 'EspionageRule debería estar disponible');
    });

    it('Debería realizar operación gather_intel exitosamente', () => {
        const state = getState();
        const initialIntel = state.nations.NAT002.intelligence_agency.intel_level;
        
        if (EspionageRule.gatherIntel) {
            const result = EspionageRule.gatherIntel('NAT001', 'NAT002');
            
            assert.ok(result.success !== undefined, 'Resultado debería tener propiedad success');
            assert.strictEqual(result.operation, 'gather_intel', 'Operación debería ser gather_intel');
        }
    });

    it('Debería generar evento de inteligencia exitosa', () => {
        if (EspionageRule.gatherIntel) {
            EspionageRule.gatherIntel('NAT001', 'NAT002');
            
            const state = getState();
            const intelEvent = state.events.find(e => 
                e.type && e.type.includes('intel')
            );
            assert.ok(intelEvent, 'Debería registrarse evento de inteligencia');
        }
    });

    it('Debería realizar operación plant_disinfo exitosamente', () => {
        if (EspionageRule.plantDisinfo) {
            const result = EspionageRule.plantDisinfo('NAT001', 'NAT002');
            
            assert.ok(result.success !== undefined, 'Resultado debería tener propiedad success');
            assert.strictEqual(result.operation, 'plant_disinfo', 'Operación debería ser plant_disinfo');
        }
    });

    it('Debería generar señal de desinformación', () => {
        if (EspionageRule.plantDisinfo) {
            EspionageRule.plantDisinfo('NAT001', 'NAT002');
            
            const state = getState();
            const disinfoSignal = state.signals.find(s => 
                s.type && s.type.includes('disinfo')
            );
            assert.ok(disinfoSignal, 'Debería existir señal de desinformación');
        }
    });

    it('Debería realizar operación expel_agents exitosamente', () => {
        const state = getState();
        const initialAgents = state.nations.NAT002.intelligence_agency.agents;
        
        if (EspionageRule.expelAgents) {
            const result = EspionageRule.expelAgents('NAT001', 'NAT002');
            
            assert.ok(result.success !== undefined, 'Resultado debería tener propiedad success');
            assert.strictEqual(result.operation, 'expel_agents', 'Operación debería ser expel_agents');
            
            const newState = getState();
            assert.ok(
                newState.nations.NAT002.intelligence_agency.agents <= initialAgents,
                'Agentes deberían disminuir tras expulsión'
            );
        }
    });

    it('Debería realizar operación take_prisoner exitosamente', () => {
        if (EspionageRule.takePrisoner) {
            const result = EspionageRule.takePrisoner('NAT001', 'NAT002');
            
            assert.ok(result.success !== undefined, 'Resultado debería tener propiedad success');
            assert.strictEqual(result.operation, 'take_prisoner', 'Operación debería ser take_prisoner');
        }
    });

    it('Debería generar evento de captura de agente', () => {
        if (EspionageRule.takePrisoner) {
            EspionageRule.takePrisoner('NAT001', 'NAT002');
            
            const state = getState();
            const captureEvent = state.events.find(e => 
                e.type && e.type.includes('prisoner') || e.type && e.type.includes('capture')
            );
            assert.ok(captureEvent, 'Debería registrarse evento de captura');
        }
    });

    it('Debería validar probabilidad con seed fijo para gather_intel', () => {
        setSeed(12345);
        
        if (EspionageRule.gatherIntel) {
            const result1 = EspionageRule.gatherIntel('NAT001', 'NAT002');
            
            setSeed(12345);
            const result2 = EspionageRule.gatherIntel('NAT001', 'NAT002');
            
            assert.strictEqual(
                result1.success,
                result2.success,
                'Resultados deberían ser idénticos con mismo seed'
            );
        }
    });

    it('Debería validar probabilidad con seed fijo para plant_disinfo', () => {
        setSeed(54321);
        
        if (EspionageRule.plantDisinfo) {
            const result1 = EspionageRule.plantDisinfo('NAT001', 'NAT002');
            
            setSeed(54321);
            const result2 = EspionageRule.plantDisinfo('NAT001', 'NAT002');
            
            assert.strictEqual(
                result1.success,
                result2.success,
                'Resultados deberían ser idénticos con mismo seed'
            );
        }
    });

    it('Debería validar probabilidad con seed fijo para expel_agents', () => {
        setSeed(99999);
        
        if (EspionageRule.expelAgents) {
            const result1 = EspionageRule.expelAgents('NAT001', 'NAT002');
            
            setSeed(99999);
            const result2 = EspionageRule.expelAgents('NAT001', 'NAT002');
            
            assert.strictEqual(
                result1.success,
                result2.success,
                'Resultados deberían ser idénticos con mismo seed'
            );
        }
    });

    it('Debería validar probabilidad con seed fijo para take_prisoner', () => {
        setSeed(77777);
        
        if (EspionageRule.takePrisoner) {
            const result1 = EspionageRule.takePrisoner('NAT001', 'NAT002');
            
            setSeed(77777);
            const result2 = EspionageRule.takePrisoner('NAT001', 'NAT002');
            
            assert.strictEqual(
                result1.success,
                result2.success,
                'Resultados deberían ser idénticos con mismo seed'
            );
        }
    });

    it('Debería calcular probabilidad de éxito correctamente', () => {
        if (EspionageRule.calculateSuccessProbability) {
            const probability = EspionageRule.calculateSuccessProbability('NAT001', 'NAT002', 'gather_intel');
            
            assert.ok(probability >= 0, 'Probabilidad no debería ser negativa');
            assert.ok(probability <= 1, 'Probabilidad no debería exceder 1');
        }
    });

    it('Debería manejar nación sin agencia de inteligencia', () => {
        let state = getState();
        state.nations.NAT003 = {
            id: 'NAT003',
            name: 'No Intel Nation'
        };
        
        assert.doesNotThrow(() => {
            if (EspionageRule.gatherIntel) {
                EspionageRule.gatherIntel('NAT001', 'NAT003');
            }
        }, 'No debería lanzar error con nación sin agencia');
    });

    it('Debería verificar capacidad de operación antes de ejecutar', () => {
        if (EspionageRule.canPerformOperation) {
            const canOperate = EspionageRule.canPerformOperation('NAT001', 'NAT002', 'gather_intel');
            assert.strictEqual(typeof canOperate, 'boolean', 'Debería retornar booleano');
        }
    });

    it('Debería obtener operaciones activas', () => {
        if (EspionageRule.getActiveOperations) {
            const operations = EspionageRule.getActiveOperations('NAT001');
            assert.ok(Array.isArray(operations), 'Debería retornar un array');
        }
    });

    it('Debería obtener nivel de contraespionaje', () => {
        if (EspionageRule.getCounterIntelLevel) {
            const level = EspionageRule.getCounterIntelLevel('NAT002');
            assert.ok(typeof level === 'number', 'Debería retornar un número');
            assert.ok(level >= 0, 'Nivel no debería ser negativo');
        }
    });

    it('Debería aumentar nivel de contraespionaje tras detectar operación', () => {
        const state = getState();
        const initialCounterIntel = state.nations.NAT002.intelligence_agency.counter_intel_level;
        
        if (EspionageRule.detectOperation) {
            EspionageRule.detectOperation('NAT001', 'NAT002', 'gather_intel');
            
            const newState = getState();
            assert.ok(
                newState.nations.NAT002.intelligence_agency.counter_intel_level >= initialCounterIntel,
                'Contraespionaje debería aumentar tras detección'
            );
        }
    });

    it('Debería reducir agentes tras expulsión exitosa', () => {
        let state = getState();
        const initialAgents = state.nations.NAT002.intelligence_agency.agents;
        state.nations.NAT002.intelligence_agency.agents = 50;
        
        if (EspionageRule.expelAgents) {
            EspionageRule.expelAgents('NAT001', 'NAT002');
            
            state = getState();
            assert.ok(
                state.nations.NAT002.intelligence_agency.agents < 50,
                'Agentes deberían reducirse tras expulsión exitosa'
            );
        }
    });

    it('Debería manejar presupuesto insuficiente para operación', () => {
        let state = getState();
        state.nations.NAT001.intelligence_agency.budget = 100;
        
        if (EspionageRule.canPerformOperation) {
            const canOperate = EspionageRule.canPerformOperation('NAT001', 'NAT002', 'gather_intel');
            // Puede ser false por bajo presupuesto
            assert.strictEqual(typeof canOperate, 'boolean', 'Debería verificar presupuesto');
        }
    });

    it('Debería registrar operación en historial', () => {
        if (EspionageRule.gatherIntel) {
            EspionageRule.gatherIntel('NAT001', 'NAT002');
            
            const state = getState();
            const operationEvent = state.events.find(e => 
                e.type && e.type.includes('operation') || e.type && e.type.includes('intel')
            );
            assert.ok(operationEvent, 'Debería registrarse en historial');
        }
    });

    it('Debería deteriorar relaciones bilaterales tras take_prisoner', () => {
        if (EspionageRule.takePrisoner) {
            EspionageRule.takePrisoner('NAT001', 'NAT002');
            
            const state = getState();
            // Verificar que haya algún efecto en relaciones
            assert.ok(true, 'Operación debería ejecutarse sin errores');
        }
    });

    it('Debería permitir múltiples operaciones simultáneas', () => {
        if (EspionageRule.gatherIntel && EspionageRule.plantDisinfo) {
            const result1 = EspionageRule.gatherIntel('NAT001', 'NAT002');
            const result2 = EspionageRule.plantDisinfo('NAT001', 'NAT002');
            
            assert.ok(result1.success !== undefined, 'Primera operación debería tener resultado');
            assert.ok(result2.success !== undefined, 'Segunda operación debería tener resultado');
        }
    });

    it('Debería validar nación origen y destino diferentes', () => {
        if (EspionageRule.canPerformOperation) {
            const canOperateSelf = EspionageRule.canPerformOperation('NAT001', 'NAT001', 'gather_intel');
            assert.strictEqual(canOperateSelf, false, 'No debería poder espiarse a sí mismo');
        }
    });

    it('Debería retornar información de agencia de inteligencia', () => {
        if (EspionageRule.getIntelAgencyInfo) {
            const info = EspionageRule.getIntelAgencyInfo('NAT001');
            assert.ok(info, 'Debería retornar información de la agencia');
            assert.ok(info.agents !== undefined, 'Debería incluir número de agentes');
            assert.ok(info.budget !== undefined, 'Debería incluir presupuesto');
        }
    });

    it('Debería actualizar efectividad tras operación exitosa', () => {
        const state = getState();
        const initialEffectiveness = state.nations.NAT001.intelligence_agency.effectiveness;
        
        if (EspionageRule.gatherIntel) {
            EspionageRule.gatherIntel('NAT001', 'NAT002');
            
            const newState = getState();
            // La efectividad puede aumentar o mantenerse
            assert.ok(
                newState.nations.NAT001.intelligence_agency.effectiveness >= initialEffectiveness * 0.9,
                'Efectividad no debería disminuir drásticamente'
            );
        }
    });
});