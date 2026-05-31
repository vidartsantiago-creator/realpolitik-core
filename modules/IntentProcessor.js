import { getState } from '../core/StateManager.js';
import { emit } from '../core/EventDispatcher.js';

/**
 * @file IntentProcessor.js
 * @description Orquestador central de lógica de negocio.
 *              Recibe una intención validada (schema OK) y ejecuta la lógica específica.
 *              Genera Deltas atómicos o retorna Errores de Negocio.
 * @version 1.0.1
 * @changelog
 * - v1.0.1: Corrección: consistencia en parámetros de handlers, exportación de processIntent
 */

// Registro de Handlers
const handlers = new Map();

/**
 * Inicializa el procesador registrando los handlers disponibles.
 */
export function init() {
    console.log('[IntentProcessor] Inicializando handlers de negocio...');
    
    // Registrar handlers explícitamente
    handlers.set('diplomacy', handleDiplomacy);
    handlers.set('build_unit', handleBuildUnit);
    handlers.set('move_unit', handleMoveUnit);

    handlers.set('nation_select', handleNationSelect);
    handlers.set('policy_propose', handlePolicyPropose);
    handlers.set('crisis_trigger', handleCrisisTrigger);
    handlers.set('intel_investigate', handleIntelInvestigate);
    
    console.log('[IntentProcessor] Handlers registrados:', Array.from(handlers.keys()));
}

/**
 * Procesa una intención ya validada por SchemaValidator.
 * @param {Object} intent - La intención completa (con playerId, nationId, etc.)
 * @param {Object} state - El estado global actual
 * @returns {Object} Resultado: { success: boolean, deltas: Array, error: String|null }
 */
export function processIntent(intent, state) {
    const handler = handlers.get(intent.actionType || intent.type);
    
    if (!handler) {
        return {
            success: false,
            deltas: [],
            error: `No hay lógica de negocio implementada para la acción: ${intent.actionType || intent.type}`
        };
    }

    try {
        const currentState = state || getState();
        // Ejecutar el handler específico pasando intención y estado (orden consistente)
        const result = handler(intent, currentState);
        
        if (result.success && result.deltas && result.deltas.length > 0) {
            // Emitir evento para que StateManager aplique los deltas
            result.deltas.forEach(delta => {
                // Opcional: Aplicar inmediatamente o delegar al EventDispatcher
                // Aquí delegamos la aplicación al flujo estándar
                emit('apply_delta', delta); 
            });
        }
        
        return result;
    } catch (err) {
        console.error(`[IntentProcessor] Error crítico en ${intent.actionType || intent.type}:`, err);
        return {
            success: false,
            deltas: [],
            error: 'Error interno del servidor procesando la acción.'
        };
    }
}

// ==========================================
// HANDLERS ESPECÍFICOS DE NEGOCIO
// ==========================================

/**
 * Handler: Diplomacia
 * Valida relaciones, existencia de naciones y calcula impacto.
 */
function handleDiplomacy(intent, state) {
    console.log('[DEBUG] Diplomacia - Intent:', intent);
    console.log('[DEBUG] Diplomacia - State nations:', Object.keys(state.nations));
    const { playerId, nationId, payload } = intent;

    const actionData = intent.payload?.payload || intent.payload || {};
    const { target, action } = actionData;

    if (!target || !action) {
        return { success: false, deltas: [], error: 'Datos de diplomacia incompletos (falta target o action).' };
    }

    // 1. Validaciones de existencia
    if (!state.nations[nationId]) {
        return { success: false, deltas: [], error: `Nación origen ${nationId} no existe.` };
    }
    if (!state.nations[target]) {
        return { success: false, deltas: [], error: `Nación objetivo ${target} no existe.` };
    }

    // 2. Lógica específica por acción
    let relationDeltaValue = 0;
    let reason = '';

    if (action === 'propose_alliance') {
        // Ejemplo: Proponer alianza cuesta 50 de oro y mejora relación base en +10
        const cost = 50;
        const currentGold = state.nations[nationId].resources?.gold || 0;

        if (currentGold < cost) {
            return { 
                success: false, 
                deltas: [], 
                error: `Fondos insuficientes para proponer alianza. Se requiere ${cost} oro.` 
            };
        }

        // Verificar si ya son aliados o enemigos mortales (lógica simplificada)
        const currentRelation = state.diplomacy?.relations?.[`${nationId}_${target}`] || 0;
        if (currentRelation < -80) {
             return { success: false, deltas: [], error: 'Relación demasiado hostil para proponer alianza.' };
        }

        relationDeltaValue = 10;
        reason = 'alliance_proposal';

        // Generar Deltas
        const deltas = [
            {
                type: 'resource_update',
                nationId: nationId,
                changes: { gold: -cost },
                reason: 'cost_alliance_proposal'
            },
            {
                type: 'relation_change',
                nationA: nationId,
                nationB: target,
                value: relationDeltaValue,
                reason: reason
            }
        ];

        return { success: true, deltas: deltas };
    }

    // Acciones no implementadas
    return { success: false, deltas: [], error: `Acción diplomática '${action}' no implementada aún.` };
}

/**
 * Handler: Construcción de Unidades
 * Verifica recursos y genera deltas de resta de oro y creación de unidad.
 */
function handleBuildUnit(intent, state) {
    console.log('[DEBUG] Intent recibido:', JSON.stringify(intent, null, 2));
    console.log('[DEBUG] Nación USA en estado:', state.nations['USA']);
    
    // CORRECCIÓN: Acceder al payload interno correctamente
    const { playerId, nationId, payload } = intent;
    const actionData = intent.payload && typeof intent.payload === 'object' ? intent.payload : intent;
    const { unitType } = actionData;
    const finalUnitType = unitType || (intent.payload?.payload?.unitType);
    

    if (!finalUnitType) {
        return { success: false, deltas: [], error: 'Tipo de unidad no especificado.' };
    }

    // Verificar existencia de la nación
    if (!state.nations[nationId]) {
        return { success: false, deltas: [], error: `Nación ${nationId} no existe.` };
    }

    const nation = state.nations[nationId];
    
    // Definición de costos (puede moverse a una config)
    const UNIT_COSTS = {
        infantry: { gold: 50, food: 10 },
        tank: { gold: 200, food: 50 },
        ship: { gold: 300, food: 100 }
    };

    const cost = UNIT_COSTS[finalUnitType];
    if (!cost) {
        return { success: false, deltas: [], error: `Tipo de unidad desconocido: ${finalUnitType}` };
    }

    // Verificar recursos
    const currentGold = nation.resources?.gold || 0;
    const currentFood = nation.resources?.food || 0;

    if (currentGold < cost.gold || currentFood < cost.food) {
        return { 
            success: false, 
            deltas: [],
            error: `Fondos insuficientes. Costo: ${cost.gold} oro, ${cost.food} comida. Disponible: ${currentGold} oro, ${currentFood} comida.` 
        };
    }

    // Generar nueva unidad
    const newUnit = { 
        type: finalUnitType, 
        createdAt: Date.now(),
        id: `${nationId}_${finalUnitType}_${Date.now()}` // ID único
    };

    const deltas = [
        {
            type: 'resource_update',
            nations: {
                [nationId]: {
                    resources: {
                        gold: -cost.gold,
                        food: -cost.food
                    }
                }
            },
            reason: `Construcción de ${finalUnitType}`
        },
        {
            type: 'unit_created',
            nations: {
                [nationId]: {
                    units: [newUnit] // Asegurar que sea un array con un objeto dentro
                }
            },
            reason: `Unidad ${finalUnitType} creada`
        }
    ];
    
    console.log(`[IntentProcessor] Deltas generados para build_unit:`, JSON.stringify(deltas, null, 2));
    return { success: true, deltas };
}

/**
 * Handler: Movimiento de Unidades (Placeholder básico)
 * ✅ CORRECCIÓN: Parámetros en orden consistente (intent, state)
 */
function handleMoveUnit(intent, state) {
    const { nationId, payload } = intent;
    const { from, to } = payload;

    // Validación básica de coordenadas (ejemplo)
    if (!from || !to) {
        return { success: false, deltas: [], error: 'Coordenadas de movimiento inválidas.' };
    }

    // En una implementación real, verificaría si la unidad existe en 'from' y si 'to' es accesible.
    
    const deltas = [
        {
            type: 'unit_moved',
            nationId: nationId,
            from: from,
            to: to,
            reason: 'move_order'
        }
    ];

    return { success: true, deltas: deltas };
}

/**
 * Handler: Selección de Nación
 * Asigna un jugador a una nación y actualiza el estado
 */
function handleNationSelect(intent, state) {
    const { playerId, nationId } = intent;
    
    console.log(`[IntentProcessor] ${playerId} seleccionando nación ${nationId}`);
    
    // Validar que la nación existe
    if (!state.nations[nationId]) {
        return { 
            success: false, 
            deltas: [], 
            error: `Nación ${nationId} no existe en el mapa.` 
        };
    }
    
    // Validar que la nación no esté ya ocupada por otro jugador
    // (Esto requeriría un tracking de jugadores activos, simplificado aquí)
    
    // Generar delta para registrar la selección
    const deltas = [{
        type: 'nation_selected',
        playerId: playerId,
        nationId: nationId,
        reason: 'player_choice'
    }];
    
    console.log(`[IntentProcessor] ✅ Nación ${nationId} asignada a ${playerId}`);
    
    return { success: true, deltas };
}

/**
 * Handler: Propuesta de Políticas
 * Valida recursos y aplica efectos de políticas internas
 */
function handlePolicyPropose(intent, state) {
    const { playerId, nationId, payload } = intent;
    const policyData = payload?.payload || payload || {};
    const { policyId } = policyData;
    
    console.log(`[IntentProcessor] ${playerId} proponiendo política ${policyId} para ${nationId}`);
    
    if (!policyId) {
        return { success: false, deltas: [], error: 'ID de política no especificado.' };
    }
    
    if (!state.nations[nationId]) {
        return { success: false, deltas: [], error: `Nación ${nationId} no existe.` };
    }
    
    // Definición de políticas (puede moverse a config)
    const POLICIES = {
        'pol_econ_stimulus': { cost: 50, effects: { economy: 5 } },
        'pol_mil_draft': { cost: 30, effects: { stability: -5, influence: 2 } },
        'pol_dip_soft': { cost: 40, effects: { influence: 10 } }
    };
    
    const policy = POLICIES[policyId];
    if (!policy) {
        return { success: false, deltas: [], error: `Política ${policyId} no reconocida.` };
    }
    
    // Verificar recursos
    const currentGold = state.nations[nationId].resources?.gold || 0;
    if (currentGold < policy.cost) {
        return { 
            success: false, 
            deltas: [], 
            error: `Fondos insuficientes. Se requiere ${policy.cost} oro.` 
        };
    }
    
    // Generar deltas
    const deltas = [{
        type: 'resource_update',
        nations: {
            [nationId]: {
                resources: { gold: -policy.cost }
            }
        },
        reason: `Implementación de ${policyId}`
    }];
    
    // Aplicar efectos de la política (simplificado: aplicar directamente al estado)
    // En producción, esto debería ser otro delta específico
    Object.entries(policy.effects).forEach(([stat, value]) => {
        deltas.push({
            type: 'stat_change',
            nations: {
                [nationId]: {
                    [stat]: value
                }
            },
            reason: `Efecto de ${policyId}`
        });
    });
    
    console.log(`[IntentProcessor] ✅ Política ${policyId} propuesta con éxito`);
    
    return { success: true, deltas };
}

/**
 * Handler: Activación de Crisis
 * Inicia una crisis geopolítica con naciones involucradas
 */
function handleCrisisTrigger(intent, state) {
    const { playerId, nationId, payload } = intent;
    const crisisData = payload?.payload || payload || {};
    const { crisisType, severity, involvedNations } = crisisData;
    
    console.log(`[IntentProcessor] Crisis activada: ${crisisType} (${severity})`);
    
    if (!crisisType || !severity) {
        return { success: false, deltas: [], error: 'Datos de crisis incompletos.' };
    }
    
    // Validar naciones involucradas
    if (!involvedNations || involvedNations.length === 0) {
        return { success: false, deltas: [], error: 'Debe especificar naciones involucradas.' };
    }
    
    for (const natId of involvedNations) {
        if (!state.nations[natId]) {
            return { success: false, deltas: [], error: `Nación ${natId} no existe.` };
        }
    }
    
    // Generar delta para activar crisis
    const deltas = [{
        type: 'crisis_activation',
        crisisType: crisisType,
        severity: severity,
        involvedNations: involvedNations,
        triggeredBy: playerId,
        reason: 'crisis_trigger'
    }];
    
    console.log(`[IntentProcessor] ✅ Crisis ${crisisType} activada`);
    
    return { success: true, deltas };
}

/**
 * Handler: Investigar Señal de Inteligencia
 * Descuenta $100k y revela información detallada con 100% de confianza
 */
function handleIntelInvestigate(intent, state) {
    const { playerId, nationId, payload } = intent;
    const intelData = payload?.payload || payload || {};
    const { signalId } = intelData;

    console.log(`[IntentProcessor] ${playerId} investigando señal ${signalId}`);

    if (!signalId) {
        return { success: false, deltas: [], error: 'ID de señal no especificado.' };
    }

    if (!state.nations[nationId]) {
        return { success: false, deltas: [], error: `Nación ${nationId} no existe.` };
    }

    const nation = state.nations[nationId];
    const currentBudget = nation.stats?.budget || 0;
    const investigationCost = 0.1; // $100k

    if (currentBudget < investigationCost) {
        return {
            success: false,
            deltas: [],
            error: `Fondos insuficientes. Costo: $${investigationCost}M. Disponible: $${currentBudget}M.`
        };
    }

    // Generar información detallada simulada
    const detailedInfo = generateDetailedIntel(signalId, state);

    // Generar deltas
    const deltas = [
        {
            type: 'resource_update',
            nationId: nationId,
            changes: { 
                budget: -0.1  // $100k = 0.1M
            },
            reason: 'investigacion_inteligencia'
        },
        {
            type: 'intel_updated',
            signalId: signalId,
            confidenceLevel: 100,
            isInvestigated: true,
            detailedInfo: detailedInfo,
            reason: 'investigacion_completada'
        }
    ];

    console.log(`[IntentProcessor] ✅ Señal ${signalId} investigada. Costo: $${investigationCost}M`);
    console.log(`[IntentProcessor] Presupuesto antes: ${currentBudget}M`);
    console.log(`[IntentProcessor] Costo investigación: 0.1M ($100k)`);
    console.log(`[IntentProcessor] Deltas a emitir:`, JSON.stringify(deltas, null, 2));

    return { success: true, deltas };
}

/**
 * Genera información detallada para una señal investigada
 * @param {string} signalId - ID de la señal
 * @param {Object} state - Estado actual del juego
 * @returns {Object} Información detallada
 */
function generateDetailedIntel(signalId, state) {
    // En producción, esto buscaría en una base de datos de señales
    // Aquí generamos información contextual basada en el estado
    
    const nationIds = Object.keys(state.nations);
    const randomNation = nationIds[Math.floor(Math.random() * nationIds.length)];
    const nation = state.nations[randomNation];

    return {
        originalSignal: 'Señal interceptada y verificada',
        verifiedData: {
            nationInvolved: nation?.name || 'Desconocida',
            troopMovement: Math.floor(Math.random() * 10000) + 1000,
            equipmentType: ['Blindados', 'Infantería', 'Aéreo', 'Naval'][Math.floor(Math.random() * 4)],
            strategicIntent: ['Defensivo', 'Ofensivo', 'Disuasión', 'Ejercicios'][Math.floor(Math.random() * 4)],
            timeFrame: 'Próximas 48-72 horas',
            reliability: 'Confirmada por múltiples fuentes'
        },
        analysis: 'Análisis completado. La inteligencia ha sido verificada cruzando datos de satélite, interceptaciones y fuentes humanas.',
        recommendations: [
            'Monitorear movimientos en las próximas 24h',
            'Considerar despliegue preventivo',
            'Iniciar canales diplomáticos de emergencia'
        ]
    };
}