// tests/unit/FactionRule.test.js
const { FactionRule } = require('../../src/rules/FactionRule');
const GameState = require('../../src/core/GameState');

describe('FactionRule Tests', () => {
    let gameState;
    let factionRule;

    beforeEach(() => {
        gameState = new GameState();
        factionRule = new FactionRule(gameState);
        
        // Estado inicial de prueba
        gameState.state = {
            nations: {
                'NAT001': {
                    id: 'NAT001',
                    name: 'Test Nation',
                    factions: {
                        'FAC001': {
                            id: 'FAC001',
                            name: 'Loyal Faction',
                            loyalty: 80,
                            influence: 60,
                            power_base: 40,
                            conspiracy_stage: 0,
                            members_count: 100
                        },
                        'FAC002': {
                            id: 'FAC002',
                            name: 'Rebel Faction',
                            loyalty: 20,
                            influence: 70,
                            power_base: 50,
                            conspiracy_stage: 0,
                            members_count: 80
                        }
                    }
                }
            },
            events: [],
            signals: []
        };
    });

    test('Debería inicializar correctamente', () => {
        expect(factionRule).toBeDefined();
        expect(factionRule.gameState).toBe(gameState);
    });

    test('Debería actualizar la lealtad dinámicamente', () => {
        const initialLoyalty = gameState.state.nations.NAT001.factions.FAC001.loyalty;
        
        factionRule.updateFactionLoyalty('NAT001', 'FAC001', -10);
        
        expect(gameState.state.nations.NAT001.factions.FAC001.loyalty).toBe(70);
    });

    test('Debería mantener la lealtad dentro de límites válidos', () => {
        factionRule.updateFactionLoyalty('NAT001', 'FAC001', -100);
        expect(gameState.state.nations.NAT001.factions.FAC001.loyalty).toBe(0);
        
        factionRule.updateFactionLoyalty('NAT001', 'FAC001', 150);
        expect(gameState.state.nations.NAT001.factions.FAC001.loyalty).toBe(100);
    });

    test('Debería avanzar en las etapas de complot', () => {
        const faction = gameState.state.nations.NAT001.factions.FAC002;
        faction.conspiracy_stage = 0;
        faction.loyalty = 10;
        
        factionRule.progressConspiracyStage('NAT001', 'FAC002');
        
        expect(gameState.state.nations.NAT001.factions.FAC002.conspiracy_stage).toBe(1);
    });

    test('Debería completar todas las etapas de complot', () => {
        const faction = gameState.state.nations.NAT001.factions.FAC002;
        faction.conspiracy_stage = 2;
        
        factionRule.progressConspiracyStage('NAT001', 'FAC002');
        factionRule.progressConspiracyStage('NAT001', 'FAC002');
        factionRule.progressConspiracyStage('NAT001', 'FAC002');
        
        expect(gameState.state.nations.NAT001.factions.FAC002.conspiracy_stage).toBe(4);
    });

    test('Debería mantener la etapa de complot en 4 como máximo', () => {
        const faction = gameState.state.nations.NAT001.factions.FAC002;
        faction.conspiracy_stage = 4;
        
        factionRule.progressConspiracyStage('NAT001', 'FAC002');
        
        expect(gameState.state.nations.NAT001.factions.FAC002.conspiracy_stage).toBe(4);
    });

    test('Debería emitir faction_signal cuando cambia la lealtad significativamente', () => {
        const initialSignalsLength = gameState.state.signals.length;
        
        factionRule.updateFactionLoyalty('NAT001', 'FAC001', -25); // Cambio significativo
        
        expect(gameState.state.signals.length).toBeGreaterThan(initialSignalsLength);
        const signal = gameState.state.signals[gameState.state.signals.length - 1];
        expect(signal.type).toBe('faction_signal');
        expect(signal.data.faction_id).toBe('FAC001');
    });

    test('Debería emitir faction_signal durante etapas de complot', () => {
        const initialSignalsLength = gameState.state.signals.length;
        
        factionRule.progressConspiracyStage('NAT001', 'FAC002');
        
        expect(gameState.state.signals.length).toBeGreaterThan(initialSignalsLength);
        const signal = gameState.state.signals[gameState.state.signals.length - 1];
        expect(signal.type).toBe('faction_signal');
        expect(signal.data.stage).toBe(1);
    });

    test('Debería iniciar un golpe cuando se completa la etapa 4 de complot', () => {
        gameState.state.nations.NAT001.factions.FAC002.conspiracy_stage = 3;
        
        factionRule.progressConspiracyStage('NAT001', 'FAC002');
        
        const signal = gameState.state.signals.find(s => s.type === 'faction_signal' && s.data.action === 'coup_attempt');
        expect(signal).toBeDefined();
    });

    test('Debería registrar intento de golpe en eventos', () => {
        gameState.state.nations.NAT001.factions.FAC002.conspiracy_stage = 3;
        
        factionRule.progressConspiracyStage('NAT001', 'FAC002');
        
        const event = gameState.state.events.find(e => e.type === 'coup_attempt');
        expect(event).toBeDefined();
        expect(event.data.faction_id).toBe('FAC002');
    });

    test('Debería calcular correctamente la probabilidad de éxito del golpe', () => {
        gameState.state.nations.NAT001.factions.FAC002.influence = 80;
        gameState.state.nations.NAT001.factions.FAC002.power_base = 70;
        
        const successProbability = factionRule.calculateCoupSuccessProbability('NAT001', 'FAC002');
        
        expect(successProbability).toBeGreaterThan(0);
        expect(successProbability).toBeLessThanOrEqual(1);
    });

    test('Debería actualizar múltiples facciones simultáneamente', () => {
        const initialLoyalLoyalty = gameState.state.nations.NAT001.factions.FAC001.loyalty;
        const initialRebelLoyalty = gameState.state.nations.NAT001.factions.FAC002.loyalty;
        
        factionRule.updateMultipleFactions([
            { nationId: 'NAT001', factionId: 'FAC001', change: { loyalty: -5 } },
            { nationId: 'NAT001', factionId: 'FAC002', change: { loyalty: 10 } }
        ]);
        
        expect(gameState.state.nations.NAT001.factions.FAC001.loyalty).toBe(initialLoyalLoyalty - 5);
        expect(gameState.state.nations.NAT001.factions.FAC002.loyalty).toBe(initialRebelLoyalty + 10);
    });

    test('Debería manejar facciones inexistentes correctamente', () => {
        expect(() => {
            factionRule.updateFactionLoyalty('NAT001', 'FAKE_ID', 10);
        }).not.toThrow();
    });

    test('Debería verificar si una facción está en estado de conspiración activa', () => {
        gameState.state.nations.NAT001.factions.FAC002.conspiracy_stage = 2;
        
        const isActive = factionRule.isFactionInActiveConspiracy('NAT001', 'FAC002');
        
        expect(isActive).toBe(true);
    });

    test('Debería identificar correctamente facciones leales', () => {
        const loyal = factionRule.isFactionLoyal('NAT001', 'FAC001');  // 80% de lealtad
        const disloyal = factionRule.isFactionLoyal('NAT001', 'FAC002');  // 20% de lealtad
        
        expect(loyal).toBe(true);
        expect(disloyal).toBe(false);
    });
});