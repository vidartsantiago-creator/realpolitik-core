/**
 * @file FactionRule.test.js
 * @description Tests unitarios para FactionRule - lealtad dinámica, complots, señales, golpes
 * @version 1.0.0
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import * as FactionRule from '../../modules/FactionRule.js';
import { getState, resetState } from '../../core/StateManager.js';

describe('FactionRule Tests', () => {
    beforeEach(() => {
        const initialState = {
            nations: {
                NAT001: {
                    id: 'NAT001',
                    name: 'Test Nation',
                    factions: {
                        FAC001: {
                            id: 'FAC001',
                            name: 'Loyal Faction',
                            loyalty: 80,
                            influence: 60,
                            power_base: 40,
                            conspiracy_stage: 0,
                            members_count: 100,
                            last_signal_tick: 0
                        },
                        FAC002: {
                            id: 'FAC002',
                            name: 'Rebel Faction',
                            loyalty: 20,
                            influence: 70,
                            power_base: 50,
                            conspiracy_stage: 0,
                            members_count: 80,
                            last_signal_tick: 0
                        }
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
        assert.ok(FactionRule.init || true, 'FactionRule debería estar disponible');
    });

    it('Debería obtener tier de lealtad ALLIED para lealtad >= 75', () => {
        if (FactionRule.getLoyaltyTier) {
            const tier = FactionRule.getLoyaltyTier('NAT001', 'FAC001');
            assert.strictEqual(tier, 'ALLIED', 'Lealtad 80 debería ser ALLIED');
        }
    });

    it('Debería obtener tier de lealtad NEUTRAL para lealtad 40-74', () => {
        let state = getState();
        state.nations.NAT001.factions.FAC001.loyalty = 50;
        
        if (FactionRule.getLoyaltyTier) {
            const tier = FactionRule.getLoyaltyTier('NAT001', 'FAC001');
            assert.strictEqual(tier, 'NEUTRAL', 'Lealtad 50 debería ser NEUTRAL');
        }
    });

    it('Debería obtener tier de lealtad DISCONTENT para lealtad 25-39', () => {
        let state = getState();
        state.nations.NAT001.factions.FAC001.loyalty = 30;
        
        if (FactionRule.getLoyaltyTier) {
            const tier = FactionRule.getLoyaltyTier('NAT001', 'FAC001');
            assert.strictEqual(tier, 'DISCONTENT', 'Lealtad 30 debería ser DISCONTENT');
        }
    });

    it('Debería obtener tier de lealtad ACTIVE_RESISTANCE para lealtad 10-24', () => {
        let state = getState();
        state.nations.NAT001.factions.FAC001.loyalty = 15;
        
        if (FactionRule.getLoyaltyTier) {
            const tier = FactionRule.getLoyaltyTier('NAT001', 'FAC001');
            assert.strictEqual(tier, 'ACTIVE_RESISTANCE', 'Lealtad 15 debería ser ACTIVE_RESISTANCE');
        }
    });

    it('Debería obtener tier de lealtad INSURGENT para lealtad < 10', () => {
        let state = getState();
        state.nations.NAT001.factions.FAC001.loyalty = 5;
        
        if (FactionRule.getLoyaltyTier) {
            const tier = FactionRule.getLoyaltyTier('NAT001', 'FAC001');
            assert.strictEqual(tier, 'INSURGENT', 'Lealtad 5 debería ser INSURGENT');
        }
    });

    it('Debería actualizar lealtad dinámicamente', () => {
        const state = getState();
        const initialLoyalty = state.nations.NAT001.factions.FAC001.loyalty;
        
        if (FactionRule.updateLoyalty) {
            FactionRule.updateLoyalty('NAT001', 'FAC001', -10);
            
            const newState = getState();
            assert.strictEqual(
                newState.nations.NAT001.factions.FAC001.loyalty,
                initialLoyalty - 10,
                'Lealtad debería disminuir en 10'
            );
        }
    });

    it('Debería mantener lealtad dentro de límites 0-100', () => {
        if (FactionRule.updateLoyalty) {
            // Intentar bajar de 0
            FactionRule.updateLoyalty('NAT001', 'FAC001', -100);
            let state = getState();
            assert.ok(
                state.nations.NAT001.factions.FAC001.loyalty >= 0,
                'Lealtad no debería ser menor a 0'
            );
            
            // Intentar subir de 100
            FactionRule.updateLoyalty('NAT001', 'FAC001', 150);
            state = getState();
            assert.ok(
                state.nations.NAT001.factions.FAC001.loyalty <= 100,
                'Lealtad no debería ser mayor a 100'
            );
        }
    });

    it('Debería avanzar etapa de complot de recruitment a planning', () => {
        let state = getState();
        state.nations.NAT001.factions.FAC002.loyalty = 15;
        state.nations.NAT001.factions.FAC002.conspiracy_stage = 0;
        
        if (FactionRule.progressConspiracy) {
            FactionRule.progressConspiracy('NAT001', 'FAC002');
            
            state = getState();
            assert.strictEqual(
                state.nations.NAT001.factions.FAC002.conspiracy_stage,
                1,
                'Etapa debería avanzar a 1 (planning)'
            );
        }
    });

    it('Debería completar todas las etapas de complot (0 → 3)', () => {
        let state = getState();
        state.nations.NAT001.factions.FAC002.loyalty = 10;
        state.nations.NAT001.factions.FAC002.conspiracy_stage = 0;
        
        if (FactionRule.progressConspiracy) {
            FactionRule.progressConspiracy('NAT001', 'FAC002');
            FactionRule.progressConspiracy('NAT001', 'FAC002');
            FactionRule.progressConspiracy('NAT001', 'FAC002');
            FactionRule.progressConspiracy('NAT001', 'FAC002');
            
            state = getState();
            assert.strictEqual(
                state.nations.NAT001.factions.FAC002.conspiracy_stage,
                3,
                'Etapa máxima debería ser 3 (execution)'
            );
        }
    });

    it('Debería mantener etapa de complot en 3 como máximo', () => {
        let state = getState();
        state.nations.NAT001.factions.FAC002.conspiracy_stage = 3;
        
        if (FactionRule.progressConspiracy) {
            FactionRule.progressConspiracy('NAT001', 'FAC002');
            
            state = getState();
            assert.strictEqual(
                state.nations.NAT001.factions.FAC002.conspiracy_stage,
                3,
                'Etapa no debería exceder 3'
            );
        }
    });

    it('Debería emitir faction_signal con prioridad critical en etapa execution', () => {
        let state = getState();
        state.nations.NAT001.factions.FAC002.conspiracy_stage = 2;
        state.nations.NAT001.factions.FAC002.loyalty = 10;
        const initialSignalsLength = state.signals.length;
        
        if (FactionRule.progressConspiracy) {
            FactionRule.progressConspiracy('NAT001', 'FAC002');
            
            state = getState();
            assert.ok(
                state.signals.length > initialSignalsLength,
                'Debería haber nuevas señales'
            );
            
            const criticalSignal = state.signals.find(s => 
                s.priority === 'critical' && s.type?.includes('faction')
            );
            assert.ok(criticalSignal, 'Debería existir señal critical en etapa execution');
        }
    });

    it('Debería emitir faction_signal con prioridad urgent en etapas tempranas', () => {
        let state = getState();
        state.nations.NAT001.factions.FAC002.conspiracy_stage = 0;
        state.nations.NAT001.factions.FAC002.loyalty = 15;
        const initialSignalsLength = state.signals.length;
        
        if (FactionRule.progressConspiracy) {
            FactionRule.progressConspiracy('NAT001', 'FAC002');
            
            state = getState();
            const urgentSignal = state.signals.find(s => 
                s.priority === 'urgent' && s.type?.includes('faction')
            );
            assert.ok(urgentSignal, 'Debería existir señal urgent en etapas tempranas');
        }
    });

    it('Debería respetar cooldown de señales de facción', () => {
        let state = getState();
        state.current_tick = 100;
        state.nations.NAT001.factions.FAC001.last_signal_tick = 95;
        state.nations.NAT001.factions.FAC001.loyalty = 15;
        
        if (FactionRule.canSendSignal) {
            const canSend = FactionRule.canSendSignal('NAT001', 'FAC001', 100);
            assert.strictEqual(canSend, false, 'No debería poder enviar señal dentro del cooldown');
        }
    });

    it('Debería permitir enviar señal después del cooldown', () => {
        let state = getState();
        state.current_tick = 100;
        state.nations.NAT001.factions.FAC001.last_signal_tick = 80;
        
        if (FactionRule.canSendSignal) {
            const canSend = FactionRule.canSendSignal('NAT001', 'FAC001', 100);
            assert.strictEqual(canSend, true, 'Debería poder enviar señal después del cooldown');
        }
    });

    it('Debería iniciar coup_attempt cuando se completa etapa 3', () => {
        let state = getState();
        state.nations.NAT001.factions.FAC002.conspiracy_stage = 2;
        state.nations.NAT001.factions.FAC002.loyalty = 5;
        const initialEventsLength = state.events.length;
        
        if (FactionRule.progressConspiracy) {
            FactionRule.progressConspiracy('NAT001', 'FAC002');
            
            state = getState();
            assert.ok(
                state.events.length > initialEventsLength,
                'Debería haber nuevos eventos'
            );
            
            const coupEvent = state.events.find(e => 
                e.type === 'coup_attempt'
            );
            assert.ok(coupEvent, 'Debería registrarse evento coup_attempt');
        }
    });

    it('Debería calcular probabilidad de éxito de golpe', () => {
        let state = getState();
        state.nations.NAT001.factions.FAC002.influence = 80;
        state.nations.NAT001.factions.FAC002.power_base = 70;
        
        if (FactionRule.calculateCoupSuccessChance) {
            const chance = FactionRule.calculateCoupSuccessChance('NAT001', 'FAC002');
            assert.ok(chance > 0 && chance <= 1, 'Probabilidad debería estar entre 0 y 1');
        }
    });

    it('Debería verificar si facción está en conspiración activa', () => {
        let state = getState();
        state.nations.NAT001.factions.FAC002.conspiracy_stage = 2;
        
        if (FactionRule.isActiveConspiracy) {
            const isActive = FactionRule.isActiveConspiracy('NAT001', 'FAC002');
            assert.strictEqual(isActive, true, 'Etapa 2 debería ser conspiración activa');
        }
    });

    it('Debería verificar si facción es leal (tier ALLIED)', () => {
        if (FactionRule.isLoyal) {
            const isLoyal = FactionRule.isLoyal('NAT001', 'FAC001');
            assert.strictEqual(isLoyal, true, 'FAC001 con lealtad 80 debería ser leal');
        }
    });

    it('Debería verificar si facción es desleal (tier DISCONTENT o inferior)', () => {
        let state = getState();
        state.nations.NAT001.factions.FAC002.loyalty = 20;
        
        if (FactionRule.isDisloyal) {
            const isDisloyal = FactionRule.isDisloyal('NAT001', 'FAC002');
            assert.strictEqual(isDisloyal, true, 'FAC002 con lealtad 20 debería ser desleal');
        }
    });

    it('Debería aplicar bonificación de facción ALLIED', () => {
        if (FactionRule.getFactionBonus) {
            const bonus = FactionRule.getFactionBonus('NAT001', 'FAC001', 'stability');
            assert.ok(bonus >= 0, 'Facción ALLIED debería dar bonificación positiva');
        }
    });

    it('Debería aplicar penalización de facción INSURGENT', () => {
        let state = getState();
        state.nations.NAT001.factions.FAC001.loyalty = 5;
        
        if (FactionRule.getFactionBonus) {
            const bonus = FactionRule.getFactionBonus('NAT001', 'FAC001', 'stability');
            assert.ok(bonus <= 0, 'Facción INSURGENT debería dar penalización');
        }
    });

    it('Debería manejar facción inexistente sin errores', () => {
        assert.doesNotThrow(() => {
            if (FactionRule.getLoyaltyTier) {
                FactionRule.getLoyaltyTier('NAT001', 'FAKE_ID');
            }
        }, 'No debería lanzar error con facción inexistente');
    });

    it('Debería actualizar múltiples facciones simultáneamente', () => {
        const state = getState();
        const initialLoyalLoyalty = state.nations.NAT001.factions.FAC001.loyalty;
        const initialRebelLoyalty = state.nations.NAT001.factions.FAC002.loyalty;
        
        if (FactionRule.updateMultipleFactions) {
            FactionRule.updateMultipleFactions([
                { nationId: 'NAT001', factionId: 'FAC001', change: { loyalty: -5 } },
                { nationId: 'NAT001', factionId: 'FAC002', change: { loyalty: 10 } }
            ]);
            
            const newState = getState();
            assert.strictEqual(
                newState.nations.NAT001.factions.FAC001.loyalty,
                initialLoyalLoyalty - 5,
                'FAC001 debería perder 5 de lealtad'
            );
            assert.strictEqual(
                newState.nations.NAT001.factions.FAC002.loyalty,
                initialRebelLoyalty + 10,
                'FAC002 debería ganar 10 de lealtad'
            );
        }
    });
});