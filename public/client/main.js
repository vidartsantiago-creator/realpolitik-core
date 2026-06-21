/**
 * @file public/client/main.js
 * @description Punto de entrada del lado del cliente. Inicializa la UI, el Renderer del Mapa y la conexión WS.
 */

import { SyncClient } from './SyncClient.js';
import { MapRenderer } from './MapRenderer.js';
import { StrategyCabinet } from './components/StrategyCabinet.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Client] Iniciando aplicación...');

  // 1. Inicializar Cliente de Sincronización
  const syncClient = new SyncClient();

  // 2. Inicializar Renderizador del Mapa
  const canvas = document.getElementById('game-map');
  const mapRenderer = new MapRenderer(canvas);

  // 3. Conectar Cliente con Renderer
  syncClient.setMapRenderer(mapRenderer);

  // Exponer globalmente para depuración o acceso desde otros scripts legacy
  window.app = window.app || {};
  window.app.syncClient = syncClient;
  window.app.mapRenderer = mapRenderer;
  window.client = syncClient;
  window.mapRenderer = mapRenderer;
  window.SyncClient = SyncClient;
  window.MapRenderer = MapRenderer;

  // 4. Inicializar Componente de Gabinete de Estrategia
  const strategyCabinet = new StrategyCabinet();
  strategyCabinet.init();
  window.app.strategyCabinet = strategyCabinet;

  // Listener para abrir el gabinete desde el botón lateral
  const btnOpenCabinet = document.getElementById('btn-open-cabinet');
  if (btnOpenCabinet) {
    btnOpenCabinet.addEventListener('click', () => {
      strategyCabinet.open();
    });
    console.log('[Client] ✅ Listener de apertura del gabinete asignado.');
  } else {
    console.warn('[Client] ⚠️ No se encontró btn-open-cabinet en el DOM.');
  }

  // 5. Conectar Lógica: Cuando llega estado del servidor -> Actualizar UI
  syncClient.onStateUpdate = (state) => {
    strategyCabinet.update(state);

    // Actualizar métricas UI si existe la función global
    if (typeof window.updateMetricsUI === 'function') {
      const playerId = state.playerNationId || (state.nations ? Object.keys(state.nations)[0] : null);
      window.updateMetricsUI(state, playerId);
    }

    // Agregar log si existe la función global
    if (typeof window.addLogEntry === 'function' && state.lastAction) {
      window.addLogEntry(`Tick ${state.tick}: ${state.lastAction}`, 'info');
    }
  };

  // 6. Conectar WebSocket
  syncClient.connect();

  console.log('[Client] ✅ Aplicación lista. Esperando datos del servidor...');
});