import { getState } from '../core/StateManager.js';
import { emit } from '../core/EventDispatcher.js';

/**
 * @file IntentProcessor.js
 * @description Orquestador central de lógica de negocio.
 *              Recibe una intención validada (schema OK) y ejecuta la lógica específica.
 *              Genera Deltas atómicos o retorna Errores de Negocio.
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
    handlers.set('move_unit', handleMoveUnit); // Placeholder básico
    
    console.log('[IntentProcessor] Handlers registrados:', Array.from(handlers.keys()));
}

/**
 * Procesa una intención ya validada por SchemaValidator.
 * @param {Object} intent - La intención completa (con playerId, nationId, etc.)
 * @returns {Object} Resultado: { success: boolean, deltas: Array, error: String|null }
 */
export function processIntent(intent, state) {
    const handler = handlers.get(intent.type);
    
    if (!handler) {
        return {
            success: false,
            deltas: [],
            error: `No hay lógica de negocio implementada para la acción: ${intent.type}`
        };
    }

    try {
        const currentState = getState();
        // Ejecutar el handler específico pasando estado e intención
        const result = handler(intent, currentState);
        
        if (result.success && result.deltas.length > 0) {
            // Emitir evento para que StateManager aplique los deltas
            // O aplicar directamente aquí si se prefiere centralizado
            result.deltas.forEach(delta => {
                // Opcional: Aplicar inmediatamente o delegar al EventDispatcher
                // Aquí delegamos la aplicación al flujo estándar
                emit('apply_delta', delta); 
            });
        }
        
        return result;
    } catch (err) {
        console.error(`[IntentProcessor] Error crítico en ${intent.type}:`, err);
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
        return { success: false, error: 'Datos de diplomacia incompletos (falta target o action).' };
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
        return { success: false, error: 'Tipo de unidad no especificado.' };
    }

    // Verificar existencia de la naciónindex.html
    if (!state.nations[nationId]) {
        return { success: false, error: `Nación ${nationId} no existe.` };
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
        return { success: false, error: `Tipo de unidad desconocido: ${finalUnitType}` };
    }

    // Verificar recursos
    const currentGold = nation.resources?.gold || 0;
    const currentFood = nation.resources?.food || 0;

    if (currentGold < cost.gold || currentFood < cost.food) {
        return { 
        success: false, 
        error: `Fondos insuficientes. Costo: ${cost.gold} oro, ${cost.food} comida. Disponible: ${currentGold} oro, ${currentFood} comida.` 
        };
    }

    // Generar deltas atómicos
    // Generar deltas atómicos
const newUnit = { 
    type: finalUnitType, 
    createdAt: Date.now(),
    id: `${nationId}_${finalUnitType}_${Date.now()}` // ID único opcional
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
    console.log(`[IntentProcessor] Deltas generados para build_unit:`, JSON.stringify(deltas, null, 2)); // <--- LOG CLAVE
    return { success: true, deltas };
    }

/**
 * Handler: Movimiento de Unidades (Placeholder básico)
 */
function handleMoveUnit(state, intent) {
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

// Exportar default para compatibilidad con imports anteriores si los hubiera
export default { init, process };