// tests/helpers/MockServer.js
const { EventDispatcher } = require('../../core/EventDispatcher');
const { StateManager } = require('../../core/StateManager');
const { TimeEngine } = require('../../core/TimeEngine');
const { Rng } = require('../../core/Rng');

class MockServer {
  constructor(config = {}) {
    this.config = {
      seed: config.seed || Date.now(),
      tickRate: config.tickRate || 100,
      mode: config.mode || 'test',
      ...config
    };
    
    this.eventDispatcher = null;
    this.stateManager = null;
    this.timeEngine = null;
    this.rng = null;
    this.initialized = false;
  }

  init() {
    this.eventDispatcher = new EventDispatcher();
    this.stateManager = new StateManager(this.eventDispatcher);
    this.timeEngine = new TimeEngine(
      this.eventDispatcher,
      this.stateManager,
      this.config.tickRate
    );
    this.rng = new Rng(this.config.seed);
    
    this.initialized = true;
    return this;
  }

  setInitialState(state) {
    if (!this.initialized) this.init();
    this.stateManager.setState(state);
    return this;
  }

  injectIntent(intent) {
    if (!this.initialized) throw new Error('MockServer not initialized');
    
    const processedIntent = {
      ...intent,
      timestamp: Date.now(),
      id: `${Date.now()}-${Math.random()}`
    };

    this.eventDispatcher.emit('intent_received', processedIntent);
    return this;
  }

  runTicks(count = 1) {
    if (!this.initialized) throw new Error('MockServer not initialized');
    
    for (let i = 0; i < count; i++) {
      this.timeEngine.tick(Date.now());
    }
    return this;
  }

  getStateSnapshot() {
    if (!this.initialized) throw new Error('MockServer not initialized');
    return JSON.parse(JSON.stringify(this.stateManager.getState()));
  }

  getState() {
    if (!this.initialized) throw new Error('MockServer not initialized');
    return this.stateManager.getState();
  }

  getCurrentTick() {
    if (!this.timeEngine) return 0;
    return this.timeEngine.getCurrentTick();
  }

  getEventLog(filterType = null) {
    if (!this.eventDispatcher) return [];
    return this.eventDispatcher.getHistory().filter(e => 
      !filterType || e.type === filterType
    );
  }

  getDeltaHistory() {
    if (!this.stateManager) return [];
    return this.stateManager.getDeltaHistory();
  }

  statesAreEqual(s1, s2) {
    try {
      return JSON.stringify(s1) === JSON.stringify(s2);
    } catch {
      return false;
    }
  }

  reset() {
    this.eventDispatcher = null;
    this.stateManager = null;
    this.timeEngine = null;
    this.rng = null;
    this.initialized = false;
    return this;
  }

  applyDelta(delta, source = 'mock') {
    if (!this.initialized) throw new Error('MockServer not initialized');
    this.stateManager.applyDelta(delta, source);
    return this;
  }

  listen(event, handler) {
    if (!this.eventDispatcher) throw new Error('MockServer not initialized');
    this.eventDispatcher.on(event, handler);
    return this;
  }

  unlisten(event, handler) {
    if (!this.eventDispatcher) throw new Error('MockServer not initialized');
    this.eventDispatcher.off(event, handler);
    return this;
  }
}

const createDefaultInitialState = (nationIds = ['A', 'B']) => ({
  players: {},
  nations: nationIds.reduce((acc, id) => ({
    ...acc,
    [id]: {
      id,
      name: `Nation ${id}`,
      resources: { gold: 500, food: 300 },
      units: [],
      policies: {}
    }
  }), {}),
  game: {
    tick: 0,
    phase: 'setup',
    map: { width: 100, height: 100 }
  },
  events: []
});

const createPlayerIntent = (playerId, nationId, actionType, payload) => ({
  playerId,
  nationId,
  type: actionType,
  payload,
  timestamp: Date.now()
});

module.exports = {
  MockServer,
  createDefaultInitialState,
  createPlayerIntent
};