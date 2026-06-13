/**
 * @file SyncClient.js
 * @description Cliente de sincronización robusto. 
 *              CORRECCIÓN: Ahora acepta el primer delta como estado inicial si es necesario.
 * @version 3.0.1
 */

const RECONNECT_DELAY = 1000;
const RECONNECT_BACKOFF_MULTIPLIER = 1.5;
const MAX_RECONNECT_DELAY = 10000;

export class SyncClient {
    constructor(wsUrl) {
        this.wsUrl = wsUrl || `ws://${window.location.host}`;
        this.ws = null;
        this.localState = null;
        this.isConnected = false;

        // Cola de mensajes para deltas recibidos antes del init_state
        this.messageQueue = [];

        // Reconexión
        this.reconnectAttempts = 0;
        this.reconnectTimeoutId = null;
        this.isReconnecting = false;

        // Referencias externas
        this.mapRenderer = null;
        this.onStateUpdate = null; // Callback para la UI

        // Bindings
        this.connect = this.connect.bind(this);
        // ---> INTEGRACIÓN DEL SPRINT 1: Control de estados para disparadores visuales
        this._lastRenderedTick = -1;
    }

    setMapRenderer(renderer) {
        this.mapRenderer = renderer;
    }

    connect() {
        if (this.isReconnecting) {
            console.log('[SyncClient] Reconexión en curso, ignorando llamada connect().');
            return;
        }

        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            return;
        }

        // Limpiar estado anterior
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.close();
            this.ws = null;
        }

        console.log(`[SyncClient] Conectando a ${this.wsUrl}...`);

        try {
            this.ws = new WebSocket(this.wsUrl);
        } catch (e) {
            console.error('[SyncClient] Error fatal al crear WebSocket:', e);
            this.scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            console.log('[SyncClient] ✅ Conectado correctamente.');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.isReconnecting = false;

            // OPCIONAL: Si el servidor REQUIERE explícitamente un 'get_init' para enviarlo, descomenta esto:
            // this.send('get_init', {}); 
        };

        this.ws.onclose = (event) => {
            console.warn(`[SyncClient] ❌ Desconectado (Code: ${event.code}). Programando reconexión...`);
            this.isConnected = false;
            this.ws = null;
            this.scheduleReconnect();
        };

        this.ws.onerror = (err) => {
            console.error('[SyncClient] Error de WebSocket:', err);
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (e) {
                console.error('[SyncClient] Error parseando JSON:', e, event.data);
            }
        };
    }

    scheduleReconnect() {
        if (this.isReconnecting) return;

        this.isReconnecting = true;
        this.reconnectAttempts++;

        const delay = Math.min(
            RECONNECT_DELAY * Math.pow(RECONNECT_BACKOFF_MULTIPLIER, this.reconnectAttempts),
            MAX_RECONNECT_DELAY
        );

        console.log(`[SyncClient] Reintento ${this.reconnectAttempts} en ${delay}ms`);

        this.reconnectTimeoutId = setTimeout(() => {
            this.reconnectTimeoutId = null;
            this.isReconnecting = false;
            this.connect();
        }, delay);
    }

    handleMessage(message) {
        if (!message.type) {
            console.warn('[SyncClient] Mensaje sin tipo recibido:', message);
            return;
        }

        const type = message.type;

        // CORRECCIÓN: Estructura de extracción adaptativa más flexible
        const payload = message.state || message.delta || message.payload || message.data || message;

        switch (type) {
            case 'connected':
                console.log('[SyncClient] ID de sesión:', message.clientId);
                break;

            case 'init_state':
                console.log('[SyncClient] 📥 Recibido estado inicial explícito.');
                this.localState = payload;
                this.processMessageQueue();
                this.notifyUpdate();
                break;

            case 'state_update':
            case 'delta':
            case 'tick':
                if (!this.localState) {
                    if (payload && payload.nations) {
                        console.log('[SyncClient] 🚀 Primer mensaje recibido tiene estructura completa. Usando como init_state.');
                        this.localState = JSON.parse(JSON.stringify(payload));
                        this.processMessageQueue();
                        this.notifyUpdate();
                        return;
                    } else {
                        console.warn('[SyncClient] Delta recibido antes de init_state. Encolando...');
                        if (this.messageQueue.length > 50) {
                            this.messageQueue.shift();
                        }
                        this.messageQueue.push(message);
                        return;
                    }
                }
                this.applyDelta(payload);
                this.notifyUpdate();
                break;

            case 'intent_accepted':
                console.log('[SyncClient] ⚡ Intención aceptada:', message.payload);
                if (this.mapRenderer && typeof this.mapRenderer.playSound === 'function') {
                    this.mapRenderer.playSound('success');
                }
                break;

            case 'intent_rejected':
                console.warn('[SyncClient] 🚫 Intención rechazada:', message.reason);
                if (this.mapRenderer && typeof this.mapRenderer.playSound === 'function') {
                    this.mapRenderer.playSound('error');
                }
                break;

            // ==================================================================
            // 🔓 NUEVOS CASOS: APERTURA DE COMPUERTAS PARA EVENTOS EN VIVO
            // ==================================================================
            case 'intel_signal':
            case 'advisor_suggestion':
            case 'relations_detail':
            case 'relations_data':
            case 'get_relations_detail_response':
            case 'crisis_started':
            case 'crisis_escalated':
            case 'crisis_resolved':
            case 'treaty_signed':
            case 'treaty_expired':
            case 'diplomacy_action_result':
                console.log(`[SyncClient] 📡 Redireccionando evento calificado a UI: ${type}`);

                // Ejecutamos tu función handleCustomEvent registrada en index.html
                if (typeof this.onCustomEvent === 'function') {
                    this.onCustomEvent(message);
                } else if (typeof window.handleCustomEvent === 'function') {
                    window.handleCustomEvent(message);
                }
                break;

            default:
                console.debug('[SyncClient] Mensaje desconocido:', type, message);

                // Si el mensaje desconocido tiene pinta de evento, lo dejamos pasar de forma dinámica
                if (typeof window.handleCustomEvent === 'function' || typeof this.onCustomEvent === 'function') {
                    console.log(`[SyncClient] Enrutando por fallback dinámico: ${type}`);
                    if (typeof this.onCustomEvent === 'function') this.onCustomEvent(message);
                    else window.handleCustomEvent(message);
                } else if (!this.localState && message.nations) {
                    console.log('[SyncClient] Fallback: Usando mensaje desconocido como estado inicial.');
                    this.localState = message;
                    this.notifyUpdate();
                }
        }
    }

    processMessageQueue() {
        if (this.messageQueue.length === 0) return;

        console.log(`[SyncClient] Procesando ${this.messageQueue.length} mensajes pendientes...`);

        while (this.messageQueue.length > 0) {
            const pendingMsg = this.messageQueue.shift();
            const payload = pendingMsg.state || pendingMsg.delta || pendingMsg.payload;
            if (payload) {
                this.applyDelta(payload);
            }
        }

        this.notifyUpdate();
    }

    applyDelta(delta) {
        if (!this.localState || !delta) return;

        // Fusión profunda simple
        const merge = (target, source) => {
            for (const key in source) {
                if (source.hasOwnProperty(key)) {
                    const srcVal = source[key];
                    const tgtVal = target[key];

                    if (srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal)) {
                        if (!tgtVal || typeof tgtVal !== 'object' || Array.isArray(tgtVal)) {
                            target[key] = {};
                        }
                        merge(target[key], srcVal);
                    } else {
                        target[key] = srcVal;
                    }
                }
            }
        };

        merge(this.localState, delta);
    }

    notifyUpdate() {
        if (!this.localState) return;

        // 1. Notificar a la UI general (si existe callback)
        if (this.onStateUpdate) {
            this.onStateUpdate(this.localState);
        }

        // 2. Notificar al Renderizador
        if (this.mapRenderer) {
            const playerId = this.localState.playerNationId || (this.localState.nations ? Object.keys(this.localState.nations)[0] : null);

            // Cargar geometría si es la primera vez y el renderer lo soporta
            if (this.mapRenderer.loadGeometry && (!this.mapRenderer.gameState || Object.keys(this.mapRenderer.gameState || {}).length === 0)) {
                if (this.localState.nations) {
                    this.mapRenderer.loadGeometry(this.localState.nations);
                }
            }

            // Actualizar renderer
            this.mapRenderer.update(this.localState, playerId);
        }

        // ---> INTEGRACIÓN DEL SPRINT 1: Lógica de Feedback Inmediato ("Fun Factor")
        // Verificamos si avanzamos de tick para no saturar con el mismo paquete repetido
        if (this.localState.tick !== undefined && this.localState.tick !== this._lastRenderedTick) {
            this._lastRenderedTick = this.localState.tick;

            // Disparador 1: Animación de la cuenta atrás (Tensión del turno)
            this._triggerTurnProgressBar();

            // Disparador 2: Escanear crisis/eventos para el feed narrativo
            this._triggerGeopoliticalFeed();
        }
    }

    send(type, payload = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('[SyncClient] Offline: No se puede enviar', type);
            return false;
        }
        this.ws.send(JSON.stringify({ type, ...payload }));
        return true;
    }

    sendIntent(actionType, parameters) {
        const intent = {
            type: actionType,
            actor: this.localState?.playerNationId || 'UNKNOWN',
            timestamp: Date.now(),
            parameters: parameters || {}
        };
        return this.send('intent', { payload: intent });
    }

    // ---> INTEGRACIÓN DEL SPRINT 1: Métodos auxiliares de UI del Cliente

    /**
     * Reinicia la barra de progreso de tiempo del turno para generar tensión visual.
     * Busca un elemento HTML con el ID 'turn-progress-bar'.
     */
    _triggerTurnProgressBar() {
        const bar = document.getElementById('turn-progress-bar');
        if (!bar) return;

        bar.style.transition = 'none'; // Desactivar la transición CSS para restablecer el ancho inmediatamente
        bar.style.width = '100%';       // Llevar la barra al máximo

        // Forzar un reflow en el motor de renderizado del navegador de Ubuntu (Chrome/Firefox V8)
        void bar.offsetWidth;

        bar.style.transition = 'width 1000s linear'; // Simulación visual continua (se ajusta dinámicamente con cada tick)
        bar.style.width = '0%';
    }

    /**
     * Revisa el estado de la simulación en busca de eventos críticos (como crisis activas)
     * e inyecta alertas legibles y dinámicas en el feed de noticias lateral.
     */
    _triggerGeopoliticalFeed() {
        const feedContainer = document.getElementById('geopolitical-feed');
        if (!feedContainer) return;

        // Extraer si hay crisis activa en este tick
        if (this.localState.crisis && this.localState.crisis.active) {
            const currentPhase = this.localState.crisis.phase || 0;
            const crisisType = this.localState.crisis.type || 'Inestabilidad Internacional';

            const message = `🚨 ALERTA GLOBAL (Tick ${this.localState.tick}): Crisis de tipo [${crisisType}] escalada a Fase ${currentPhase}.`;
            this._injectNewsItem(feedContainer, message);
        }
    }

    /**
     * Añade un nodo de texto animado al inicio de la lista del feed HTML.
     */
    _injectNewsItem(container, text) {
        const entry = document.createElement('div');
        entry.className = 'feed-entry alert-flash'; // 'alert-flash' se encarga del parpadeo CSS
        entry.style.padding = '8px';
        entry.style.borderBottom = '1px solid #333';
        entry.style.color = '#ff3333';
        entry.style.fontFamily = 'monospace';
        entry.innerText = `[${new Date().toLocaleTimeString()}] ${text}`;

        container.insertBefore(entry, container.firstChild);

        // Mantener el buffer del DOM limpio (máximo 5 elementos históricos visibles)
        while (container.children.length > 5) {
            container.removeChild(container.lastChild);
        }
    }

    disconnect() {
        if (this.reconnectTimeoutId) clearTimeout(this.reconnectTimeoutId);
        this.isReconnecting = false;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        console.log('[SyncClient] Desconectado manualmente.');
    }
}

export default SyncClient;