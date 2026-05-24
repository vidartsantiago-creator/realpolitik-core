/**
 * @file SyncClient.js
 * @description Cliente de sincronización: mantiene estado local sincronizado con el servidor
 *              vía WebSocket. Suscribe a eventos y notifica a la UI.
 *              REFACTORIZADO A CLASE PARA SOPORTAR EXPORTACIÓN CORRECTA.
 * @version 2.0.1
 * @author RealPolitik Core Team
 */

// Configuración
const WS_URL = `ws://${window.location.host}`;
const RECONNECT_DELAY = 3000; // 3 segundos

export class SyncClient {
    constructor(callbacks = {}) {
        // Estado interno
        this.localState = null;
        this.ws = null;
        this.connectionState = false;
        this.subscribers = [];

        // Callbacks de UI (mapeo de eventos)
        this.callbacks = {
            onStateUpdate: callbacks.onStateUpdate || (() => {}),
            onLog: callbacks.onLog || (() => {}),
            onIntelSignal: callbacks.onIntelSignal || (() => {}),
            onCustomEvent: callbacks.onCustomEvent || (() => {}),
            onConnected: callbacks.onConnected || (() => {}),
            onDisconnected: callbacks.onDisconnected || (() => {})
        };

        console.log('[SyncClient] Inicializando instancia...');
        this.connectWebSocket();

        // Hook para depuración global
        if (typeof window !== 'undefined') {
            window.lastKnownState = null;
            console.log('[SyncClient] 🕵️‍♂️ Modo Debug Activo: Guardando estados en window.lastKnownState');
            this.exposeGlobalFunctions();
        }
    }

    /**
     * Establece conexión WebSocket.
     */
    connectWebSocket() {
        console.log(`[SyncClient] Conectando a ${WS_URL}...`);

        try {
            this.ws = new WebSocket(WS_URL);

            this.ws.onopen = () => {
                console.log('[SyncClient] ✅ Conectado al servidor');
                this.connectionState = true;

                // Enviar handshake inmediatamente
                this.sendHandshake();

                this.notifySubscribers('connected', {});
                this.callbacks.onConnected();
            };

            this.ws.onmessage = (event) => {
                // console.log('[SyncClient] RAW message:', event.data); // Demasiado verbose
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('[SyncClient] Error parsing message:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('[SyncClient] ❌ Desconectado. Reconectando...');
                this.connectionState = false;
                this.notifySubscribers('disconnected', {});
                this.callbacks.onDisconnected();

                // Intentar reconectar
                setTimeout(() => this.connectWebSocket(), RECONNECT_DELAY);
            };

            this.ws.onerror = (error) => {
                console.error('[SyncClient] Error de WebSocket:', error);
                this.notifySubscribers('error', { error });
            };

        } catch (error) {
            console.error('[SyncClient] Error creando WebSocket:', error);
            setTimeout(() => this.connectWebSocket(), RECONNECT_DELAY);
        }
    }

    /**
     * Maneja mensajes entrantes del servidor.
     * @param {Object} message - Mensaje parseado del servidor
     */
    handleMessage(message) {
        const { type, state, tick, delta, command, success, error, path } = message;

        switch (type) {
            case 'handshake_ack':
                console.log('[SyncClient] ✅ Handshake confirmado:', message);
                this.notifySubscribers('handshake_ack', message);
                break;

            case 'init_state': // Nuevo tipo para estado inicial completo
            case 'init':
                // Estado inicial completo
                this.localState = state || {};
                window.lastKnownState = this.localState;
                console.log('[SyncClient] Estado inicial recibido.');
                this.callbacks.onStateUpdate(this.localState);
                this.notifySubscribers('state_update', { state: this.localState, tick });
                break;

            case 'state_update':
                // Actualización completa de estado
                if (state) {
                    this.localState = state;
                    window.lastKnownState = state;
                    this.callbacks.onStateUpdate(state);
                }
                this.notifySubscribers('state_update', { state: this.localState, tick });
                break;


            case 'delta':
                // Actualización delta (patch)
                if (delta && this.localState) {
                    this.applyDelta(delta);
                    // Opcional: llamar a onStateUpdate también con el estado actualizado
                    // this.callbacks.onStateUpdate(this.localState);
                }
                this.notifySubscribers('delta', { delta, tick });
                break;

            case 'tick':
                // Solo actualización de tick
                if (this.localState) {
                    this.localState.tick = tick;
                    // Actualizar UI ligera si es necesario
                }
                this.notifySubscribers('tick', { tick });
                break;

            case 'policy_decision':
                this.notifySubscribers('policy_decision', { decision: message.decision });
                break;

            case 'intel_update':
                this.notifySubscribers('intel_update', { items: message.items });
                break;

            case 'intel_signal':
                // Señal de inteligencia individual -> Callback específico UI
                if (message.signal) {
                    this.callbacks.onIntelSignal(message.signal);
                }
                this.notifySubscribers('intel_signal', { signal: message.signal });
                break;

            case 'advisor_suggestion':
                // Sugerencia del asesor IA
                if (message.suggestion) {
                    // Actualizar estado local con el mensaje del asesor si existe
                    if(this.localState) {
                        this.localState.advisorMessage = message.suggestion.title || message.suggestion;
                    }
                    this.callbacks.onStateUpdate(this.localState); // Forzar update UI
                }
                this.notifySubscribers('advisor_suggestion', { suggestion: message.suggestion });
                break;

            case 'command_response':
                // Respuesta a comando (save_game, load_game, etc.)
                this.notifySubscribers('command_response', {
                    command: message.command,
                    success: message.success,
                    error: message.error,
                    path: message.path,
                    tick: message.tick,
                    saves: message.saves
                });

                // Feedback directo al usuario para guardado/carga
                if (message.command === 'save_game' || message.command === 'load_game') {
                    const msg = message.success
                        ? `✅ ${message.command.replace('_', ' ').toUpperCase()} EXITOSO`
                        : `❌ ERROR: ${message.error || 'Desconocido'}`;
                    this.callbacks.onLog(msg);
                }
                break;

            // --- NUEVOS EVENTOS DE CRISIS Y DIPLOMACIA ---
            case 'crisis_started':
            case 'crisis_escalated':
            case 'crisis_resolved':
            case 'treaty_signed':
            case 'treaty_expired':
            case 'diplomacy_action_result':
            case 'nation_crisis_affected':
            case 'relations_detail':
                // Reenviar todos estos eventos personalizados al handler de la UI
                this.callbacks.onCustomEvent(message);
                break;

            case 'system_msg':
                if (message.payload) {
                    this.callbacks.onLog(message.payload);
                }
                break;

            default:
                // console.log('[SyncClient] Mensaje desconocido:', type);
                break;
        }
    }

    /**
     * Aplica un delta al estado local.
     * @param {Object} delta - Delta a aplicar
     */
    applyDelta(delta) {
        if (!this.localState) {
            this.localState = delta;
            return;
        }

        // Merge superficial (para MVP)
        for (const key in delta) {
            if (delta.hasOwnProperty(key)) {
                if (typeof delta[key] === 'object' && delta[key] !== null && !Array.isArray(delta[key])) {
                    if (!this.localState[key]) {
                        this.localState[key] = {};
                    }
                    for (const subKey in delta[key]) {
                        this.localState[key][subKey] = delta[key][subKey];
                    }
                } else {
                    this.localState[key] = delta[key];
                }
            }
        }
    }

    /**
     * Suscribe una función callback a eventos de sincronización internos.
     * @param {Function} callback - Función a llamar cuando ocurra un evento
     * @returns {Function} Función para cancelar suscripción
     */
    subscribe(callback) {
        this.subscribers.push(callback);
        return () => {
            this.subscribers = this.subscribers.filter(sub => sub !== callback);
        };
    }

    /**
     * Notifica a todos los suscriptores de un evento.
     * @param {string} eventType - Tipo de evento
     * @param {Object} data - Datos del evento
     */
    notifySubscribers(eventType, data) {
        this.subscribers.forEach(callback => {
            try {
                callback(eventType, data);
            } catch (error) {
                console.error('[SyncClient] Error en subscriber:', error);
            }
        });
    }

    /**
     * Envía un mensaje al servidor.
     * @param {string} type - Tipo de mensaje
     * @param {Object} data - Datos a enviar
     */
    send(type, data = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('[SyncClient] No se puede enviar: no conectado');
            return false;
        }

        const message = { type, ...data };
        this.ws.send(JSON.stringify(message));
        return true;
    }

    /**
     * Envía handshake al servidor para autenticar la sesión.
     */
    sendHandshake() {
        const playerId = 'player_' + Math.random().toString(36).substr(2, 9);
        const nationId = 'USA'; // Nación por defecto

        console.log('[SyncClient] Enviando handshake:', { playerId, nationId });

        this.send('handshake', {
            playerId,
            nationId,
            clientVersion: '2.0.1'
        });
    }

    // ==========================================
    // MÉTODOS PÚBLICOS DE ACCIÓN (API DEL CLIENTE)
    // ==========================================

    /**
     * Solicita guardar el estado actual del juego.
     */
    saveGame() {
        console.log('[SyncClient] Solicitando guardado...');
        this.send('save_game');
    }

    /**
     * Solicita cargar una partida guardada.
     */
    loadGame(file) {
        console.log('[SyncClient] Solicitando carga:', file ? file.name : 'última automática');
        // Nota: Para cargar un archivo real del cliente, se requiere leerlo con FileReader
        // y enviarlo como binary/blob. Aquí simulamos la petición de carga al server.
        const filename = file ? file.name : 'auto_save.dat';
        this.send('load_game', { filename });
    }

    /**
     * Investiga una señal de inteligencia.
     */
    investigateSignal(signalId) {
        console.log('[SyncClient] Investigando señal:', signalId);
        this.send('investigate_signal', { signalId });
    }

    /**
     * Ejecuta una acción diplomática.
     */
    performAction(actorId, targetId, actionId, params = {}) {
        console.log('[SyncClient] Ejecutando acción diplomática:', actionId);
        this.send('perform_action', { actorId, targetId, actionId, params });
    }

    /**
     * Consulta al asesor IA.
     */
    queryAdvisor(type, params) {
        console.log('[SyncClient] Consultando advisor:', type);
        this.send('advisor_query', { type, ...params });
    }

    /**
     * Verifica si está conectado.
     */
    isConnected() {
        return this.connectionState;
    }

    /**
     * Obtiene el estado local actual.
     */
    getState() {
        return this.localState;
    }

    /**
     * Expone funciones globales para debugging en consola del navegador.
     */
    exposeGlobalFunctions() {
        if (typeof window === 'undefined') return;

        const self = this;

        window.sendMessage = (type, data) => self.send(type, data);
        window.getState = () => self.getState();
        window.isConnected = () => self.isConnected();
        window.saveGame = () => self.saveGame();
        window.loadGame = (file) => self.loadGame(file);
        window.investigateSignal = (id) => self.investigateSignal(id);

        // Referencia directa a la instancia
        window.syncClientInstance = self;

        console.log('[SyncClient] ✅ Funciones expuestas globalmente para debugging.');
    }
}

// Exportación por defecto para compatibilidad
export default SyncClient;