
---

## 📄 Documento 4: Actualización de `SYNC_PROTOCOL.md` → `v2`
**Objetivo:** Incorporar los nuevos eventos detectados en la auditoría (DD-02) y clarificar el comportamiento de reconexión.

### Cambios a Insertar:

#### A. Nuevos Eventos de Servidor a Cliente
Agregar a la tabla de contratos:

| Evento | Payload Ejemplo | Descripción |
|--------|-----------------|-------------|
| `strategy_tick_progress` | `{ id: "eco_1", progress: 0.45, efficiency: 1.2 }` | Actualización parcial de progreso dentro del turno. |
| `strategy_risk_event` | `{ id: "mil_2", type: "scandal", loss: 500 }` | Notificación de que una estrategia sufrió un contratiempo. |
| `objective_accepted` | `{ id: "obj_5", slot: 1 }` | Confirmación de que el servidor aceptó la intención del jugador. |
| `strategy_cancelled_no_resources` | `{ id: "eco_1", reason: "treasury_empty" }` | Terminación forzosa por falta de fondos. |

#### B. Clarificación de Handshake y Reconexión
Añadir sección **3.4 Resiliencia de Conexión**:

> "El cliente (`SyncClient`) implementa un mecanismo de tolerancia a fallos en el handshake inicial. Si el primer mensaje recibido tras la conexión no es explícitamente `init_state`, pero contiene un snapshot completo del estado (`turn`, `objectives`, `resources`), el cliente lo promoverá a estado inicial automáticamente.
>
> Esto permite reconexiones rápidas sin necesidad de un protocolo de 'saludo' estricto, siempre que el servidor envíe el estado completo inmediatamente tras aceptar la conexión WebSocket."

---

# 🚀 Plan de Ejecución de la Actualización

Para implementar esta actualización documental sin interrumpir el desarrollo activo:

1.  **Fase 1 (Inmediata - Día 1):**
    *   Crear `01_ARQUITECTURA_DETERMINISTA.md`.
    *   Emitir alerta al equipo de desarrollo: "Prohibido Math.random()".
    *   Aplicar el parche de código en `ObjectiveManager.js` (líneas 270, 275) para usar `rng()`.

2.  **Fase 2 (Configuración - Día 2):**
    *   Crear `03_CONFIGURACION_MATEMATICA_JUEGO.md`.
    *   Refactorizar `config/strategies.json` agregando los campos `budget_range`, `efficiency_curve` y `risk_profile` a todas las estrategias existentes basándose en la nueva docs.

3.  **Fase 3 (Consolidación - Día 3):**
    *   Crear `02_ESPECIFICACION_GABINETE_ESTATEGIA.md` y actualizar `SYNC_PROTOCOL.md`.
    *   Revisar que los comentarios en el código (`JSDoc`) apunten a estos nuevos documentos.

4.  **Fase 4 (Validación):**
    *   Ejecutar test de determinismo: Iniciar dos servidores con el mismo seed, enviar los mismos inputs, verificar que los logs de eventos de riesgo sean idénticos byte a byte.

Esta actualización documental transformará la "Deuda de Diseño" detectada en una **Arquitectura Documentada Robusta**, alineando finalmente la visión con la implementación.