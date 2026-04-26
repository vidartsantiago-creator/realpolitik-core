/**
 * Modal Diplomático Flotante.
 * Maneja negociaciones con countdown basado en ticks del servidor.
 * @module DiplomaticModal
 */

import { TickConverter } from '../utils/TickConverter.js';

export class DiplomaticModal {
    constructor(overlayId) {
        this.overlay = document.getElementById(overlayId);
        this.isActive = false;
        this.currentTick = 0;
        this.expiresAtTick = 0;
        this.timerInterval = null;
        
        this.setupDrag();
    }

    setupDrag() {
        // Lógica básica de arrastre para el header del modal
        this.overlay.addEventListener('mousedown', (e) => {
            if (e.target.closest('.modal-header')) {
                const modal = e.target.closest('.modal-window');
                let shiftX = e.clientX - modal.getBoundingClientRect().left;
                let shiftY = e.clientY - modal.getBoundingClientRect().top;

                const moveAt = (pageX, pageY) => {
                    modal.style.left = pageX - shiftX + 'px';
                    modal.style.top = pageY - shiftY + 'px';
                };

                const onMouseMove = (event) => moveAt(event.pageX, event.pageY);

                document.addEventListener('mousemove', onMouseMove);
                
                modal.onmouseup = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    modal.onmouseup = null;
                };
            }
        });
    }

    /**
     * Abre el modal con datos de negociación
     * @param {Object} payload - { channelId, counterpart, proposal, expiresAtTick }
     * @param {number} currentTick - Tick actual del servidor
     */
    open(payload, currentTick) {
        this.isActive = true;
        this.currentTick = currentTick;
        this.expiresAtTick = payload.expiresAtTick;
        this.payload = payload;

        this.render();
        this.startTimer();
    }

    close() {
        this.isActive = false;
        this.overlay.innerHTML = '';
        if (this.timerInterval) clearInterval(this.timerInterval);
    }

    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            // Nota: En una app real, currentTick se actualiza con cada mensaje 'update' del WS.
            // Aquí asumimos que app.js actualiza 'this.currentTick' externamente o pasamos el tick fresco.
            // Para este ejemplo, dependemos de que app.js llame a updateTick()
        }, 1000);
    }

    updateTick(newTick) {
        if (!this.isActive) return;
        this.currentTick = newTick;
        this.updateCountdown();
        
        if (this.currentTick >= this.expiresAtTick) {
            this.close();
            alert("Tiempo de negociación agotado");
        }
    }

    updateCountdown() {
        const display = this.overlay.querySelector('.countdown');
        if (display) {
            display.textContent = TickConverter.getRemainingTime(this.expiresAtTick, this.currentTick);
        }
    }

    render() {
        const p = this.payload;
        this.overlay.innerHTML = `
            <div class="modal-window" style="top: 20%; left: 30%;">
                <div class="modal-header">
                    <span>Negociación con ${p.counterpart}</span>
                    <span class="countdown">--:--</span>
                </div>
                <div class="modal-body">
                    <p>Propuesta: ${p.proposal.description}</p>
                    <label>Volumen Energía:</label>
                    <input type="range" min="0" max="100" value="50" style="width:100%">
                    <br><br>
                    <div style="display:flex; gap:10px; justify-content:flex-end;">
                        <button id="btn-extend">Extender (+2m)</button>
                        <button id="btn-accept" style="background:var(--accent-green); color:white; border:none; padding:5px 10px;">Aceptar</button>
                        <button id="btn-break" style="background:var(--accent-red); color:white; border:none; padding:5px 10px;">Romper</button>
                    </div>
                </div>
            </div>
        `;

        this.overlay.querySelector('#btn-extend').onclick = () => this.emitAction('diplomatic_extension_request');
        this.overlay.querySelector('#btn-accept').onclick = () => this.emitAction('diplomatic_accept');
        this.overlay.querySelector('#btn-break').onclick = () => this.emitAction('diplomatic_break');
        
        this.updateCountdown();
    }

    emitAction(type) {
        if (this.onActionCallback) {
            this.onActionCallback(type, { channelId: this.payload.channelId });
        }
        this.close();
    }

    setActionCallback(callback) {
        this.onActionCallback = callback;
    }
}