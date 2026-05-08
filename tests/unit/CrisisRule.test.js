// tests/unit/CrisisRule.test.js
const { CrisisRule } = require('../../src/rules/CrisisRule');
const GameState = require('../../src/core/GameState');

describe('CrisisRule Tests', () => {
    let gameState;
    let crisisRule;

    beforeEach(() => {
        gameState = new GameState();
        crisisRule = new CrisisRule(gameState);
        
        // Estado inicial de prueba con crisis
        gameState.state = {
            nations: {
                'NAT001': {
                    id: 'NAT001',
                    name: 'Crisis Nation',
                    stability: 60,
                    economy: 70,
                    public_order: 50,
                    crisis_level: 0,
                    emergency_powers: false
                }
            },
            global_crisis: {
                phase: 0,
                severity: 0,
                affected_nations: ['NAT001']
            },
            events: [],
            signals: []
        };
    });

    test('Debería inicializar correctamente', () => {
        expect(crisisRule).toBeDefined();
        expect(crisisRule.gameState).toBe(gameState);
    });

    test('Debería escalar fase de crisis de 0 a 1', () => {
        crisisRule.incrementCrisisPhase();
        
        expect(gameState.state.global_crisis.phase).toBe(1);
    });

    test('Debería escalar fase de crisis de 1 a 2', () => {
        gameState.state.global_crisis.phase = 1;
        
        crisisRule.incrementCrisisPhase();
        
        expect(gameState.state.global_crisis.phase).toBe(2);
    });

    test('Debería escalar fase de crisis de 2 a 3', () => {
        gameState.state.global_crisis.phase = 2;
        
        crisisRule.incrementCrisisPhase();
        
        expect(gameState.state.global_crisis.phase).toBe(3);
    });

    test('Debería escalar fase de crisis de 3 a 4', () => {
        gameState.state.global_crisis.phase = 3;
        
        crisisRule.incrementCrisisPhase();
        
        expect(gameState.state.global_crisis.phase).toBe(4);
    });

    test('Debería mantener la fase en 4 como máximo', () => {
        gameState.state.global_crisis.phase = 4;
        
        crisisRule.incrementCrisisPhase();
        
        expect(gameState.state.global_crisis.phase).toBe(4);
    });

    test('Debería activar poderes de emergencia en fase 3', () => {
        gameState.state.global_crisis.phase = 2;
        crisisRule.incrementCrisisPhase(); // Lleva a fase 3
        
        expect(gameState.state.nations.NAT001.emergency_powers).toBe(true);
    });

    test('Debería emitir señal de crisis al cambiar de fase', () => {
        const initialSignalsLength = gameState.state.signals.length;
        
        crisisRule.incrementCrisisPhase();
        
        expect(gameState.state.signals.length).toBe(initialSignalsLength + 1);
        const signal = gameState.state.signals[gameState.state.signals.length - 1];
        expect(signal.type).toBe('crisis_phase_change');
        expect(signal.data.new_phase).toBe(1);
    });

    test('Debería emitir evento de crisis al incrementar severidad', () => {
        const initialEventsLength = gameState.state.events.length;
        
        crisisRule.increaseCrisisSeverity(10);
        
        expect(gameState.state.events.length).toBe(initialEventsLength + 1);
        const event = gameState.state.events[gameState.state.events.length - 1];
        expect(event.type).toBe('crisis_severity_increase');
        expect(event.data.amount).toBe(10);
    });

    test('Debería aplicar tratado de emergencia correctamente', () => {
        crisisRule.activateEmergencyTreaty('NAT001');
        
        const nation = gameState.state.nations.NAT001;
        expect(nation.stability).toBeGreaterThan(60); // Mejora la estabilidad
        expect(nation.public_order).toBeGreaterThan(50); // Mejora el orden público
    });

    test('Debería aplicar penalización por incumplimiento de tratado', () => {
        const initialStability = gameState.state.nations.NAT001.stability;
        
        crisisRule.applyBreachPenalty('NAT001');
        
        expect(gameState.state.nations.NAT001.stability).toBeLessThan(initialStability);
    });

    test('Debería registrar evento de incumplimiento', () => {
        crisisRule.applyBreachPenalty('NAT001');
        
        const breachEvent = gameState.state.events.find(e => e.type === 'treaty_breach_penalty');
        expect(breachEvent).toBeDefined();
        expect(breachEvent.data.nation_id).toBe('NAT001');
    });

    test('Debería reiniciar crisis a fase 0', () => {
        gameState.state.global_crisis.phase = 3;
        gameState.state.nations.NAT001.emergency_powers = true;
        
        crisisRule.resetCrisis();
        
        expect(gameState.state.global_crisis.phase).toBe(0);
        expect(gameState.state.nations.NAT001.emergency_powers).toBe(false);
    });

    test('Debería calcular impacto de crisis en nación', () => {
        gameState.state.global_crisis.severity = 75;
        
        const impact = crisisRule.calculateCrisisImpactOnNation('NAT001');
        
        expect(impact).toHaveProperty('stability_impact');
        expect(impact).toHaveProperty('economy_impact');
        expect(impact).toHaveProperty('public_order_impact');
    });

    test('Debería verificar si crisis está en fase crítica', () => {
        gameState.state.global_crisis.phase = 4;
        
        const isCritical = crisisRule.isCrisisCritical();
        
        expect(isCritical).toBe(true);
    });

    test('Debería verificar si crisis está en fase normal', () => {
        gameState.state.global_crisis.phase = 0;
        
        const isNormal = crisisRule.isCrisisNormal();
        
        expect(isNormal).toBe(true);
    });
});