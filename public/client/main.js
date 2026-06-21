/**
 * @file public/client/main.js
 * @description Punto de entrada del lado del cliente. Inicializa la UI y la conexión WS.
 */

import { SyncClient } from './SyncClient.js';
import { StrategyCabinet } from './components/StrategyCabinet.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Client] Iniciando aplicación...');

  // 1. Inicializar Cliente de Sincronización
  const syncClient = new SyncClient();

  // Exponer globalmente para depuración o acceso desde otros scripts legacy
  window.app = window.app || {};
  window.app.syncClient = syncClient;

  // 2. Inicializar Componente de Gabinete de Estrategia
  const strategyCabinet = new StrategyCabinet();
  strategyCabinet.init();
  window.app.strategyCabinet = strategyCabinet;

  // 3. Conectar Lógica: Cuando llega estado del servidor -> Actualizar UI
  syncClient.onStateUpdate = (state) => {
    strategyCabinet.update(state);
    // Aquí podrías actualizar otros componentes UI si los tienes
  };

  // 4. Conectar WebSocket
  syncClient.connect();

  console.log('[Client] ✅ Aplicación lista. Esperando datos del servidor...');
});