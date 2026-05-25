/**
 * Entry Point de la Aplicación Cliente.
 * Gestiona conexión WS, sincronización de estado y enrutamiento de eventos a componentes.
 * @module App
 */

import { MapRenderer } from './MapRenderer.js';
import { IntelFeed } from '../../client/components/IntelFeed.js';
import { DiplomaticModal } from '../../client/components/DiplomaticModal.js';
import { CrisisPanel } from '../../client/components/CrisisPanel.js';
import { StateMapper } from '../../client/utils/StateMapper.js';

// Configuración
const WS_URL = `ws://${window.location.hostname}:8080`;
const PLAYER_NATION_ID = 'nation_001'; // Debería venir de auth/login en futuro

// Estado Global Local
let currentTick = 0;
let gameState = {};

// ✅ NUEVO: Inicialización de Componentes (FASE 2)
const mapRenderer = new MapRenderer('world-canvas');
const intelFeed = new IntelFeed('intel-feed');
const diplomaticModal = new DiplomaticModal('modal-overlay');
const crisisPanel = new CrisisPanel('crisis-panel-container'); // Nuevo componente

// Callbacks de acción hacia el servidor
intelFeed.setActionCallback((type, payload) => sendWS(type, payload));
diplomaticModal.setActionCallback((type, payload) => sendWS(type, payload));

// Conexión WebSocket
let ws;

function connect() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        console.log('Conectado al servidor RealPolitik');
        // Solicitar estado inicial si es necesario
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        routeMessage(message);
    };

    ws.onclose = () => {
        console.log('Desconectado. Reintentando en 3s...');
        setTimeout(connect, 3000);
    };
}

function sendWS(type, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, payload, nationId: PLAYER_NATION_ID }));
    } else {
        console.warn('No hay conexión WS para enviar:', type);
    }
}

/**
 * Router de Mensajes entrantes
 * @param {Object} message
 */
function routeMessage(message) {
    switch (message.type) {
        case 'init':
            gameState = message.state;
            currentTick = message.tick || 0;
            updateUI();
            break;

        case 'update':
            gameState = message.state;
            currentTick = message.tick;
            updateUI();
            // Actualizar timers de modales activos
            diplomaticModal.updateTick(currentTick);
            break;

        case 'intel_signal':
            intelFeed.addSignal(message.payload);
            break;

        case 'diplomatic_channel_open':
            diplomaticModal.open(message.payload, currentTick);
            break;

        case 'advisor_suggestion':
            updateAdvisor(message.payload);
            break;

        // ✅ NUEVO: Manejo de eventos de crisis (FASE 2)
        case 'crisis_start':
        case 'crisis_update':
        case 'crisis_end':
            // Actualizar panel de crisis con datos del estado
            const crisisData = gameState.crisis || { active: false };
            crisisPanel.update(crisisData);
            break;

        default:
            console.log('Evento no manejado:', message.type);
    }
}

function updateUI() {
    // Dashboard
    const metrics = StateMapper.mapDashboardMetrics(gameState, PLAYER_NATION_ID);
    if (metrics) {
        document.getElementById('nation-name').textContent = metrics.name;
        document.getElementById('metric-gdp').textContent = `$${metrics.gdp.toLocaleString()}M`;
        document.getElementById('metric-budget').textContent = `$${metrics.budget.toLocaleString()}M`;
        document.getElementById('metric-stability').textContent = `${metrics.stability}%`;
        document.getElementById('metric-tick').textContent = currentTick;
    }

    // Mapa
    mapRenderer.update(gameState, PLAYER_NATION_ID);

    // ✅ NUEVO: Actualizar panel de crisis (FASE 2)
    const crisisData = gameState.crisis || { active: false };
    crisisPanel.update(crisisData);
}

function updateAdvisor(payload) {
    const container = document.getElementById('advisor-content');
    container.innerHTML = `<p><strong>Sugerencia:</strong> ${payload.text}</p>`;
}

// Control de Capas del Mapa
document.querySelectorAll('#layer-controls button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const layer = e.target.dataset.layer;
        e.target.classList.toggle('active');
        mapRenderer.setLayer(layer, e.target.classList.contains('active'));
    });
});

// Iniciar
connect();