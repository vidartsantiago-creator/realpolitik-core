import * as EventDispatcher from '../../core/EventDispatcher.js';
import * as StateManager from '../../core/StateManager.js';
import * as TimeEngine from '../../core/TimeEngine.js';
import * as Rng from '../../core/Rng.js';

export class MockServer {
  constructor(config = {}) {
    this.config = {
      seed: config.seed || 42,
      tickRate: config.tickRate || 100,
      mode: config.mode || 'test',
      ...config
    };
    
    this.initialized = false;
    this._tickOffset = 0;
  }

  init() {
    EventDispatcher._clearAllForTests();
    StateManager.ResetForTests();
    TimeEngine.ResetForTests();
    Rng._resetRngForTests(this.config.seed);
    
    StateManager.setInitialState({
      tick: 0,
      version: 0,
      nations: {},
      diplomacy: { relations: {}, channels: {} },
      factions: {},
      crisis: { active: false, phase: 0, type: null, treaties: {} },
      espionage: { operations: {}, signals: [] }
    });
    
    this.initialized = true;
    return this;
  }

  setInitialState(state) {
    if (!this.initialized) this.init();
    StateManager.setInitialState(state);
    this._tickOffset = state.tick || 0;
    return this;
  }

  injectIntent(intent) {
    if (!this.initialized) throw new Error('MockServer not initialized');
    
    const processedIntent = {
      ...intent,
      timestamp: Date.now(),
      id: `${Date.now()}-${Math.random()}`
    };

    EventDispatcher.emit('intent_received', processedIntent);
    return this;
  }

  runTicks(count = 1) {
    if (!this.initialized) throw new Error('MockServer not initialized');
    
    for (let i = 0; i < count; i++) {
      TimeEngine.step();
    }
    return this;
  }

  getStateSnapshot() {
    if (!this.initialized) throw new Error('MockServer not initialized');
    const state = StateManager.getState();
    return JSON.parse(JSON.stringify(state));
  }

  getState() {
    if (!this.initialized) throw new Error('MockServer not initialized');
    return StateManager.getState();
  }

  getCurrentTick() {
    return TimeEngine.getCurrentTick();
  }

  getEventLog(filterType = null) {
    return [];
  }

  getDeltaHistory() {
    if (!this.initialized) return [];
    return StateManager.getDeltaHistory(0);
  }

  statesAreEqual(s1, s2) {
    try {
      return JSON.stringify(s1) === JSON.stringify(s2);
    } catch {
      return false;
    }
  }

  reset() {
    EventDispatcher._clearAllForTests();
    StateManager.ResetForTests();
    TimeEngine.ResetForTests();
    this.initialized = false;
    this._tickOffset = 0;
    return this;
  }

  applyDelta(delta, source = 'mock') {
    if (!this.initialized) throw new Error('MockServer not initialized');
    return StateManager.applyDelta(delta, source);
  }

  listen(event, handler) {
    if (!this.initialized) throw new Error('MockServer not initialized');
    EventDispatcher.on(event, handler);
    return this;
  }

  unlisten(event, handler) {
    if (!this.initialized) throw new Error('MockServer not initialized');
    EventDispatcher.off(event, handler);
    return this;
  }
}

export function createDefaultInitialState(nationIds = ['A', 'B']) {
  return {
    tick: 0,
    version: 0,
    players: {},
    nations: nationIds.reduce((acc, id) => ({
      ...acc,
      [id]: {
        id,
        name: `Nation ${id}`,
        stats: { stability: 50, budget: 0 },
        resources: { gold: 500, food: 300 },
        policies: [],
        factions: {}
      }
    }), {}),
    diplomacy: { relations: {}, channels: {} },
    factions: {},
    crisis: { active: false, phase: 0, type: null, treaties: {} },
    espionage: { operations: {}, signals: [] },
    events: []
  };
}

export function createPlayerIntent(playerId, nationId, actionType, payload) {
  return {
    playerId,
    nationId,
    type: actionType,
    payload,
    timestamp: Date.now()
  };
}