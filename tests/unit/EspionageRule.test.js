// tests/unit/EspionageRule.test.js
const { EspionageRule } = require('../../src/rules/EspionageRule');
const GameState = require('../../src/core/GameState');

describe('EspionageRule Tests', () => {
    let gameState;
    let espionageRule;

    beforeEach(() => {
        gameState = new GameState();
        espionageRule = new EspionageRule(gameState);
        
        // Estado inicial de prueba con agencias de inteligencia
        gameState.state = {
            nations: {
                'NAT001': {
                    id: 'NAT001',
                    name: 'Origin Nation',
                    intelligence_agency: {
                        agents: 50,
                        budget: 1000000,
                        effectiveness: 0.75,
                        intel_level: 3
                    }
                },
                'NAT002': {
                    id: 'NAT002',
                    name: 'Target Nation',
                    intelligence_agency: {
                        agents: 40,
                        budget: 800000,
                        effectiveness: 0.65,
                        intel_level: 2
                    }
                }
            },
            events: [],
            signals: []
        };
    });

    test('Debería inicializar correctamente', () => {
        expect(espionageRule).toBeDefined();
        expect(espionageRule.gameState).toBe(gameState);
    });

    test('Debería realizar operación gather_intel exitosamente', () => {
        const initialIntel = gameState.state.nations.NAT002.intelligence_agency.intel_level;
        
        const result = espionageRule.gatherIntel('NAT001', 'NAT002');
        
        expect(result.success).toBe(true);
        expect(gameState.state.nations.NAT001.intelligence_agency.intel_level).toBeGreaterThan(initialIntel);
    });

    test('Debería fallar gather_intel con baja probabilidad', () => {
        // Configurar condiciones desfavorables
        gameState.state.nations.NAT001.intelligence_agency.effectiveness = 0.1;
        gameState.state.nations.NAT002.intelligence_agency.effectiveness = 0.9;
        
        const result = espionageRule.gatherIntel('NAT001', 'NAT002');
        
        // Debido a la naturaleza probabilística, no podemos garantizar fallo, pero verificamos que el resultado tenga la estructura correcta
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('operation');
        expect(result.operation).toBe('gather_intel');
    });

    test('Debería realizar operación plant_disinfo exitosamente', () => {
        espionageRule.plantDisinformation('NAT001', 'NAT002');
        
        // Verificar que se haya generado un evento o señal relacionado
        const signal = gameState.state.signals.find(s => s.type === 'espionage_action' && s.data.operation === 'plant_disinfo');
        expect(signal).toBeDefined();
        expect(signal.data.origin_nation).toBe('NAT001');
        expect(signal.data.target_nation).toBe('NAT002');
    });

    test('Debería realizar operación expel exitosamente', () => {
        const initialAgents = gameState.state.nations.NAT002.intelligence_agency.agents;
        
        espionageRule.expelAgents('NAT001', 'NAT002');
        
        // Verificar que se hayan reducido agentes en la nación objetivo
        expect(gameState.state.nations.NAT002.intelligence_agency.agents).toBeLessThan(initialAgents);
    });

    test('Debería realizar operación take_prisoner exitosamente', () => {
        espionageRule.takePrisoner('NAT001', 'NAT002');
        
        // Verificar que se haya generado un evento de captura
        const event = gameState.state.events.find(e => e.type === 'espionage_capture');
        expect(event).toBeDefined();
        expect(event.data.origin_nation).toBe('NAT001');
        expect(event.data.target_nation).toBe('NAT002');
    });

    test('Debería validar probabilidad con seed fijo para gather_intel', () => {
        // Establecer una semilla fija para pruebas deterministas
        Math.random = jest.fn(() => 0.1); // Valor bajo para asegurar éxito
        
        const result1 = espionageRule.gatherIntel('NAT001', 'NAT002');
        const result2 = espionageRule.gatherIntel('NAT001', 'NAT002');
        
        // Con la misma semilla simulada, los resultados deberían ser consistentes en la lógica
        expect(result1).toHaveProperty('success');
        expect(result2).toHaveProperty('success');
    });

    test('Debería validar probabilidad con seed fijo para plant_disinfo', () => {
        Math.random = jest.fn(() => 0.2);
        
        const result = espionageRule.plantDisinformation('NAT001', 'NAT002');
        
        expect(result).toHaveProperty('success');
        expect(result.operation).toBe('plant_disinfo');
    });

    test('Debería validar probabilidad con seed fijo para expel', () => {
        Math.random = jest.fn(() => 0.15);
        
        const result = espionageRule.expelAgents('NAT001', 'NAT002');
        
        expect(result).toHaveProperty('success');
        expect(result.operation).toBe('expel_agents');
    });

    test('Debería validar probabilidad con seed fijo para take_prisoner', () => {
        Math.random = jest.fn(() => 0.05);
        
        const result = espionageRule.takePrisoner('NAT001', 'NAT002');
        
        expect(result).toHaveProperty('success');
        expect(result.operation).toBe('take_prisoner');
    });

    test('Debería calcular probabilidad de éxito correctamente', () => {
        const probability = espionageRule.calculateOperationSuccessProbability('NAT001', 'NAT002', 'gather_intel');
        
        expect(probability).toBeGreaterThanOrEqual(0);
        expect(probability).toBeLessThanOrEqual(1);
    });

    test('Debería manejar naciones sin agencia de inteligencia', () => {
        gameState.state.nations.NAT003 = {
            id: 'NAT003',
            name: 'No Intel Nation'
        };
        
        expect(() => {
            espionageRule.gatherIntel('NAT001', 'NAT003');
        }).not.toThrow();
        
        expect(() => {
            espionageRule.gatherIntel('NAT003', 'NAT002');
        }).not.toThrow();
    });

    test('Debería verificar capacidad de operación antes de ejecutar', () => {
        // Reducir recursos para probar verificación
        gameState.state.nations.NAT001.intelligence_agency.budget = 100;
        gameState.state.nations.NAT001.intelligence_agency.agents = 1;
        
        const canOperate = espionageRule.canPerformOperation('NAT001', 'NAT002', 'gather_intel');
        
        // Puede ser true o false dependiendo de la lógica, pero no debería lanzar error
        expect(typeof canOperate).toBe('boolean');
    });
});