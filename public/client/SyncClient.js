/**
 * @file SyncClient.js
 * @description Cliente de sincronización robusto para RealPolitik Core.
 *              Maneja WebSocket, reconexión con backoff exponencial y fusión profunda de estados.
 * @version 2.1.0 (Corregido)
 * @author RealPolitik Core Team
 */

// Configuración de Reconexión
const RECONNECT_DELAY_BASE = 1000; // 1 segundo inicial
const RECONNECT_BACKOFF_MULTIPLIER = 1.5; // Crecimiento suave
const RECONNECT_MAX_DELAY = 10000; // Máximo 10 segundos
const MAX_RECONNECT_ATTEMPTS = 10; // Intentos infinitos virtualmente (o pon un límite alto)

export class SyncClient {
    /**
     * @param {string} [wsUrl] - URL opcional del WebSocket. Si no se pasa, usa la del navegador.
     */
    constructor(wsUrl) {
        // Usar la URL proporcionada o deducirla del entorno actual
        this.wsUrl = wsUrl || `ws://${window.location.host}`;
        this.ws = null;
        this.localState = null;
        this.connectionState = false;
        this.clientId = null;
        
        // Referencias externas
        this.mapRenderer = null; 
        
        // Sistema de Audio
        this.audioCtx = null;

        // Estado de Reconexión
        this.reconnectAttempts = 0;
        this.reconnectTimeoutId = null;
        this.isReconnecting = false;

        // Callbacks opcionales para UI antigua (si existen)
        this.onStateUpdate = null;
        this.onLog = null;
        this.onIntelSignal = null;
        this.onCustomEvent = null;
    }

    /**
     * Establece referencia al renderizador para notificar cambios
     */
    setMapRenderer(renderer) {
        this.mapRenderer = renderer;
    }

    /**
     * Inicia la conexión WebSocket
     */
    connect() {
        // Prevenir múltiples conexiones simultáneas
        if (this.isReconnecting) {
            console.log('[SyncClient] Reconexión en progreso, omitiendo connect()');
            return;
        }

        // Si ya está abierto, no hacer nada
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        // Limpiar estado previo si existe
        if (this.ws) {
            this.ws.onclose = null; // Evitar disparar reconexión al cerrar manualmente
            this.ws.close();
        }

        console.log(`[SyncClient] 🔄 Conectando a ${this.wsUrl}...`);
        
        try {
            this.ws = new WebSocket(this.wsUrl);
        } catch (e) {
            console.error('[SyncClient] Error fatal creando WebSocket:', e);
            this._scheduleReconnect();
            return;
        }

        this.ws.onopen = () => {
            console.log('[SyncClient] ✅ Conectado correctamente');
            this.connectionState = true;
            this.isReconnecting = false;
            this.reconnectAttempts = 0;
            
            // Solicitar estado inicial si es necesario (depende del protocolo del servidor)
            // this.send('request_init', { clientId: this.clientId });
        };

        this.ws.onclose = (event) => {
            console.warn(`[SyncClient] ❌ Desconectado (Code: ${event.code}). Iniciando protocolo de reconexión...`);
            this.connectionState = false;
            this._scheduleReconnect();
        };

        this.ws.onerror = (err) => {
            console.error('[SyncClient] Error de red:', err);
            // No cerramos aquí, onclose se encargará
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

    /**
     * Programa un reintento con backoff exponencial
     */
    _scheduleReconnect() {
        if (this.isReconnecting) {
            return; // Ya hay un timer activo
        }

        if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.error('[SyncClient] ⚠️ Máximo de reintentos alcanzado. Deteniendo reconexión.');
            // Opcional: Disparar evento de "fallo crítico" a la UI
            return;
        }

        this.isReconnecting = true;
        this.reconnectAttempts++;

        // Calcular delay: Base * (Multiplier ^ Intentos) con tope máximo
        const delay = Math.min(
            RECONNECT_DELAY_BASE * Math.pow(RECONNECT_BACKOFF_MULTIPLIER, this.reconnectAttempts),
            RECONNECT_MAX_DELAY
        );

        console.log(`[SyncClient] ⏳ Reintento ${this.reconnectAttempts} en ${Math.round(delay)}ms`);

        this.reconnectTimeoutId = setTimeout(() => {
            this.reconnectTimeoutId = null;
            this.isReconnecting = false;
            this.connect(); // Intentar conectar de nuevo
        }, delay);
    }

    /**
     * Envía un mensaje al servidor
     * @param {string} type - Tipo de mensaje
     * @param {object} payload - Datos a enviar
     */
    send(type, payload = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('[SyncClient] Offline: No se puede enviar', type);
            return Promise.reject(new Error('Sin conexión WebSocket'));
        }

        const message = { type, ...payload };
        try {
            this.ws.send(JSON.stringify(message));
            return Promise.resolve();
        } catch (e) {
            console.error('[SyncClient] Error enviando mensaje:', e);
            return Promise.reject(e);
        }
    }

    /**
     * Procesa los mensajes entrantes
     */
    handleMessage(message) {
        switch (message.type) {
            case 'connected':
                this.clientId = message.clientId;
                console.log(`[SyncClient] 🆔 ID de cliente asignado: ${this.clientId}`);
                break;

            case 'init_state':
                // Estado inicial completo
                console.log('[SyncClient] 📦 Recibido estado inicial');
                this.localState = structuredClone 
                    ? structuredClone(message.state) 
                    : JSON.parse(JSON.stringify(message.state));
                
                this._notifyStateUpdate(this.localState);
                break;

            case 'state_update':
            case 'delta':
                // Actualización diferencial
                if (!this.localState) {
                    console.warn('[SyncClient] Recibido delta sin estado base. Solicitando init...');
                    this.send('request_init');
                    return;
                }
                this.applyDelta(message.delta || message.state);
                this._notifyStateUpdate(this.localState);
                break;

            case 'intent_accepted':
                console.log('[SyncClient] ✅ Acción aceptada:', message.payload);
                this.playSound('success');
                this._triggerVisualFeedback(message.payload);
                break;

            case 'intent_rejected':
                console.warn('[SyncClient] ❌ Acción rechazada:', message.reason);
                this.playSound('error');
                break;
                
            case 'log':
                if (this.onLog) this.onLog(message.message);
                break;

            case 'intel_signal':
                if (this.onIntelSignal) this.onIntelSignal(message.signal);
                break;

            case 'custom_event':
                if (this.onCustomEvent) this.onCustomEvent(message.event);
                break;

            default:
                // console.debug('[SyncClient] Mensaje desconocido:', message.type);
                break;
        }
    }

    /**
     * Notifica a los suscriptores (UI/Renderer) sobre cambios de estado
     */
    _notifyStateUpdate(newState) {
        // 1. Notificar al Renderizador (si existe y tiene markDirty)
        if (this.mapRenderer) {
            if (typeof this.mapRenderer.markDirty === 'function') {
                this.mapRenderer.markDirty();
            } else {
                // Fallback antiguo: llamar a update directamente si existe
                if (typeof this.mapRenderer.update === 'function' && this.clientId) {
                    // Necesitamos el playerNationId, intentamos obtenerlo del estado
                    const pId = newState.playerNationId || this.clientId; 
                    this.mapRenderer.update(newState, pId);
                }
            }
        }

        // 2. Notificar callback global de UI (patrón legacy de index.html)
        if (typeof this.onStateUpdate === 'function') {
            try {
                this.onStateUpdate(newState);
            } catch (e) {
                console.error('[SyncClient] Error en callback onStateUpdate:', e);
            }
        }

        // 3. Actualizar variable global si existe (para debug/consola)
        if (typeof window !== 'undefined') {
            window.gameState = newState;
        }
    }

    /**
     * Aplica un delta al estado local usando fusión profunda recursiva.
     */
    applyDelta(delta) {
        if (!this.localState) {
            this.localState = structuredClone ? structuredClone(delta) : JSON.parse(JSON.stringify(delta));
            return;
        }

        const deepMerge = (target, source) => {
            for (const key in source) {
                if (!source.hasOwnProperty(key)) continue;

                const sourceVal = source[key];
                const targetVal = target[key];

                // Si es objeto puro (no null, no array), mergear recursivamente
                if (typeof sourceVal === 'object' && sourceVal !== null && !Array.isArray(sourceVal)) {
                    if (typeof targetVal !== 'object' || targetVal === null || Array.isArray(targetVal)) {
                        target[key] = {};
                    }
                    deepMerge(target[key], sourceVal);
                } 
                // Si es array, reemplazar completo (más seguro para listas de entidades)
                else if (Array.isArray(sourceVal)) {
                    target[key] = [...sourceVal];
                } 
                // Primitivos: asignar directo
                else {
                    target[key] = sourceVal;
                }
            }
        };

        deepMerge(this.localState, delta);
    }

    /**
     * Dispara efectos visuales basados en eventos del servidor
     */
    _triggerVisualFeedback(payload) {
        if (!this.mapRenderer || typeof this.mapRenderer.spawnFeedback !== 'function') return;

        if (payload?.action === 'declare_war') {
            this.mapRenderer.spawnFeedback(
                window.innerWidth / 2, 
                window.innerHeight / 2, 
                'war'
            );
        }
    }

    /**
     * Sistema de audio procedural
     */
    playSound(type) {
        if (typeof window === 'undefined') return;
        if (!window.AudioContext && !window.webkitAudioContext) return;

        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
        }

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        const now = this.audioCtx.currentTime;

        try {
            switch (type) {
                case 'success':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(523.25, now);
                    osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.1);
                    gain.gain.setValueAtTime(0.1, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                    osc.start(now);
                    osc.stop(now + 0.3);
                    break;
                case 'error':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(150, now);
                    osc.frequency.linearRampToValueAtTime(100, now + 0.2);
                    gain.gain.setValueAtTime(0.1, now);
                    gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
                    osc.start(now);
                    osc.stop(now + 0.2);
                    break;
                case 'war':
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(100, now);
                    osc.frequency.exponentialRampToValueAtTime(50, now + 0.5);
                    gain.gain.setValueAtTime(0.2, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
                    osc.start(now);
                    osc.stop(now + 0.5);
                    break;
                default:
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(440, now);
                    gain.gain.setValueAtTime(0.05, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                    osc.start(now);
                    osc.stop(now + 0.1);
            }
        } catch (e) {
            // Silenciar errores de audio para no molestar
        }
    }

    /**
     * Cierra la conexión limpiamente
     */
    disconnect() {
        this.isReconnecting = false; // Detener reconexiones
        if (this.reconnectTimeoutId) {
            clearTimeout(this.reconnectTimeoutId);
            this.reconnectTimeoutId = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connectionState = false;
        console.log('[SyncClient] 🔌 Desconectado manualmente');
    }
    
    /**
     * Verifica si está conectado
     */
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }
    
    /**
     * Obtiene el estado local actual
     */
    getState() {
        return this.localState;
    }
}

export default SyncClient;