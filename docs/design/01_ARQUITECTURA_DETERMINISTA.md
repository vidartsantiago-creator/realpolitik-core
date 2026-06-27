# Arquitectura Determinista y Gestión de Aleatoriedad

## 1. Principio Fundamental
RealPolitik Core opera bajo un modelo **Server-Authoritative Determinista**. Esto implica que dado un estado inicial $S_0$ y una secuencia de inputs $I$, el estado final $S_n$ debe ser idéntico en cualquier ejecución, independientemente del hardware o momento temporal.

## 2. Prohibición de `Math.random()`
Queda **estrictamente prohibido** el uso de `Math.random()`, `Date.now()` o cualquier fuente de entropía no controlada en los módulos del servidor (`modules/`, `core/`).

### Violación Crítica
El uso de fuentes de aleatoriedad nativas rompe:
1. La reproducibilidad de partidas (debugging imposible).
2. La sincronización en tiempo real (desincronización cliente-servidor).
3. La validez de las simulaciones históricas.

## 3. Implementación Correcta: Módulo `Rng.js`
Todo evento estocástico (riesgos, críticas, eventos geopolíticos) DEBE usar el generador centralizado.

**Ubicación:** `core/Rng.js`
**Método de Acceso:**
```javascript
import { rng } from '../core/Rng.js';

// CORRECTO:
const chance = rng(); // Retorna float [0, 1) basado en seed global
const eventIndex = Math.floor(rng() * events.length);

// INCORRECTO (Causa de Desincronización):
const chance = Math.random(); 