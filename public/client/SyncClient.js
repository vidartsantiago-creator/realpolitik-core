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
    constructor() {
        this.wsUrl = `ws://${window.location.hostname}:8080`;
        this.ws = null;
        this.localState = null;
        this.connectionState = false;
        this.clientId = null;
        
        // Referencias a componentes UI para feedback
        this.mapRenderer = null; 
        this.audioCtx = null;

        // Cola de reintentos
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    setMapRenderer(renderer) {
        this.mapRenderer = renderer;
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

        console.log(`[SyncClient] Conectando a ${this.wsUrl}...`);
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
            console.log('[SyncClient] ✅ Conectado');
            this.connectionState = true;
            this.reconnectAttempts = 0;
        };

        this.ws.onclose = () => {
            console.warn('[SyncClient] ❌ Desconectado. Intentando reconectar...');
            this.connectionState = false;
            this._attemptReconnect();
        };

        this.ws.onerror = (err) => {
            console.error('[SyncClient] Error de WebSocket:', err);
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (e) {
                console.error('[SyncClient] Error parseando mensaje:', e);
            }
        };
    }

    _attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[SyncClient] Máximo número de reintentos alcanzado.');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
        console.log(`[SyncClient] Reintento ${this.reconnectAttempts} en ${delay}ms`);
        
        setTimeout(() => this.connect(), delay);
    }

    send(type, payload = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('[SyncClient] Offline: No se puede enviar', type);
            // Aquí podrías encolar el mensaje para enviarlo luego
            return Promise.reject(new Error('Sin conexión'));
        }

        const message = { type, ...payload };
        this.ws.send(JSON.stringify(message));
        return Promise.resolve(); // En una implementación real, devolvería una Promise que se resuelve con la respuesta
    }

    handleMessage(message) {
        switch (message.type) {
            case 'connected':
                this.clientId = message.clientId;
                console.log(`[SyncClient] ID asignado: ${this.clientId}`);
                // Solicitar registro o estado inicial aquí si es necesario
                break;

            case 'init_state':
            case 'state_update':
                if (!this.localState || message.type === 'init_state') {
                    this.localState = message.state || message.delta;
                } else {
                    // ✅ CRÍTICO: Usar Merge Profundo en lugar de asignación superficial
                    this.applyDelta(message.delta);
                }
                
                // Notificar al renderizador que hay cambios
                if (this.mapRenderer) {
                    this.mapRenderer.markDirty();
                }
                break;

            case 'intent_accepted':
                console.log('[SyncClient] Acción aceptada:', message.payload);
                this.playSound('success');
                
                // Feedback visual si es acción importante
                if (this.mapRenderer && message.payload?.action === 'declare_war') {
                    this.mapRenderer.spawnFeedback(
                        window.innerWidth / 2, 
                        window.innerHeight / 2, 
                        'war'
                    );
                }
                break;

            case 'intent_rejected':
                console.warn('[SyncClient] Acción rechazada:', message.reason);
                this.playSound('error');
                // Mostrar toast de error en UI
                break;
                
            case 'pong':
                // Lógica de latencia opcional
                break;
        }
    }

    /**
     * Aplica un delta al estado local usando fusión profunda recursiva.
     * Evita que se pierdan ramas del árbol de estado cuando llegan actualizaciones parciales.
     */
    applyDelta(delta) {
        if (!this.localState) {
            this.localState = structuredClone ? structuredClone(delta) : JSON.parse(JSON.stringify(delta));
            return;
        }

        const deepMerge = (target, source) => {
            for (const key in source) {
                if (source.hasOwnProperty(key)) {
                    const sourceVal = source[key];
                    const targetVal = target[key];

                    // Si es objeto puro (no null, no array), mergear recursivamente
                    if (typeof sourceVal === 'object' && sourceVal !== null && !Array.isArray(sourceVal)) {
                        if (typeof targetVal !== 'object' || targetVal === null || Array.isArray(targetVal)) {
                            target[key] = {};
                        }
                        deepMerge(target[key], sourceVal);
                    } 
                    // Si es array, reemplazar completo para evitar inconsistencias de orden/longitud
                    else if (Array.isArray(sourceVal)) {
                        target[key] = [...sourceVal];
                    } 
                    // Primitivos: asignar directo
                    else {
                        target[key] = sourceVal;
                    }
                }
            }
        };

        deepMerge(this.localState, delta);
    }

    /**
     * Sistema de audio procedural (Web Audio API).
     * Genera sonidos sintéticos sin necesidad de cargar archivos externos.
     */
    playSound(type) {
        if (typeof window === 'undefined' || !window.AudioContext && !window.webkitAudioContext) return;

        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Reanudar contexto si está suspendido (política de navegadores)
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        const now = this.audioCtx.currentTime;

        switch (type) {
            case 'success':
                // Sonido agradable ascendente (Ding!)
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523.25, now); // C5
                osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.1); // C6
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;

            case 'error':
                // Sonido grave de error (Buzz)
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.linearRampToValueAtTime(100, now + 0.2);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
                break;

            case 'war':
                // Sonido dramático de guerra
                osc.type = 'square';
                osc.frequency.setValueAtTime(100, now);
                osc.frequency.exponentialRampToValueAtTime(50, now + 0.5);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
                osc.start(now);
                osc.stop(now + 0.5);
                break;
                
            default:
                // Beep genérico
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(440, now);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
        }
    }
}

// Exportación por defecto para compatibilidad
export default SyncClient;