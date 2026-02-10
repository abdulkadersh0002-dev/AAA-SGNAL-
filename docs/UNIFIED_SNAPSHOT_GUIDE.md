# Unified Snapshot System - Complete Guide

## نظام اللقطة الموحدة (Snapshot) - الدليل الكامل

## Overview / نظرة عامة

The Unified Snapshot System provides a **single source of truth** for all market data, analysis results, and trading signals. Both the dashboard and the execution engine read from the same snapshot, ensuring consistency and eliminating data duplication.

نظام اللقطة الموحدة يوفر **مصدر حقيقة واحد** لجميع بيانات السوق، نتائج التحليل، وإشارات التداول. كل من الداشبورد ومحرك التنفيذ يقرأون من نفس اللقطة، مما يضمن الاتساق ويلغي تكرار البيانات.

## Architecture / البنية

```
┌─────────────────────────────────────────────────────────┐
│                MT5 / EA Data Source                     │
│         (Quotes, Bars, News, Technical Data)            │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│           UnifiedSnapshotManager                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Snapshot for EURUSD                             │  │
│  │  ├─ quote: { bid, ask, spread, timestamp }       │  │
│  │  ├─ bars: { M15: [...], H1: [...], H4: [...] }  │  │
│  │  ├─ layers: [L1...L20] (20-layer results)       │  │
│  │  ├─ signal: { direction, confidence, R:R }      │  │
│  │  ├─ layer18Ready: true/false                    │  │
│  │  ├─ signalValid: true/false                     │  │
│  │  └─ metadata: { version, updatedAt, ... }       │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  Features:                                              │
│  • Single source of truth                              │
│  • Real-time updates with versioning                   │
│  • Automatic cleanup of old snapshots                  │
│  • Subscribe to changes for live updates               │
└────────┬───────────────────────────┬────────────────────┘
         │                           │
         ▼                           ▼
┌────────────────────┐    ┌────────────────────────┐
│   Dashboard UI     │    │  Execution Engine      │
│  (Real-time view)  │    │  (MT5 Trading)         │
└────────────────────┘    └────────────────────────┘
```

## Components / المكونات

### 1. UnifiedSnapshotManager

**Purpose**: Manages all snapshots with consistent structure and lifecycle.

**الغرض**: إدارة جميع اللقطات ببنية ودورة حياة متسقة.

**Key Features**:

- ✅ Single source of truth for all data
- ✅ Versioning for change tracking
- ✅ Real-time update notifications
- ✅ Automatic cleanup (limit: 200 snapshots)
- ✅ TTL-based staleness detection (default: 5s)
- ✅ Statistics and monitoring

### 2. LayerOrchestrator

**Purpose**: Ensures every signal passes through all 20 layers sequentially.

**الغرض**: يضمن مرور كل إشارة عبر جميع الطبقات الـ20 بالتسلسل.

**Key Features**:

- ✅ 20-layer sequential processing
- ✅ Stop-on-fail for required layers
- ✅ Detailed logging per layer
- ✅ Confluence score calculation
- ✅ Layer 18 readiness validation
- ✅ Comprehensive metrics

## Snapshot Structure / بنية اللقطة

```javascript
{
  // Metadata
  broker: 'mt5',
  symbol: 'EURUSD',
  version: 5,
  createdAt: 1707573600000,
  updatedAt: 1707573605000,

  // Market data
  quote: {
    bid: 1.0892,
    ask: 1.0894,
    mid: 1.0893,
    spreadPoints: 2,
    timestamp: 1707573605000,
    receivedAt: 1707573605100
  },

  // Bars for multiple timeframes
  bars: {
    M15: [{ time, open, high, low, close, volume }, ...],
    H1: [{ time, open, high, low, close, volume }, ...],
    H4: [{ time, open, high, low, close, volume }, ...],
    D1: [{ time, open, high, low, close, volume }, ...]
  },

  // Technical snapshot from EA
  technicalSnapshot: {
    rsi: { M15: 65, H1: 70, H4: 75 },
    macd: { M15: 0.001, H1: 0.002, H4: 0.003 },
    // ... other indicators
  },

  // 20-layer analysis results
  layers: [
    {
      layer: 1,
      key: 'L1',
      name: 'Market Data Quality',
      status: 'PASS',
      score: 100,
      confidence: 95,
      metrics: { ageMs: 500 },
      reason: 'Quote data is fresh and valid',
      processingTimeMs: 2
    },
    // ... L2 to L20
  ],

  // Aggregated analysis
  layeredAnalysis: {
    layers: [...],  // Same as above
    summary: {
      total: 20,
      passed: 18,
      failed: 0,
      errors: 0,
      skipped: 2,
      allRequiredPassed: true,
      confluenceScore: 90
    },
    layer18Ready: true,
    processingTimeMs: 245
  },

  // Trading signal
  signal: {
    symbol: 'EURUSD',
    signal: 'BUY',
    confidence: 85,
    entryPrice: 1.0893,
    stopLoss: 1.0850,
    takeProfit: 1.0980,
    riskRewardRatio: 2.0
  },

  // Validation status
  signalValid: true,
  layer18Ready: true,

  // Validation result
  validationResult: {
    valid: true,
    checks: [...],
    rejectionReasons: [],
    warnings: []
  },

  // Execution status
  executionStatus: 'PENDING',  // PENDING, EXECUTING, EXECUTED, FAILED
  executionResult: null,

  // News and events
  news: [
    { id, title, impact, time, currency },
    // ...
  ],

  // Market conditions
  marketPhase: 'EXPANSION',
  volatility: 45,

  // Metadata
  source: 'snapshot-manager',
  metadata: {
    // Custom metadata
  }
}
```

## API Reference / مرجع API

### UnifiedSnapshotManager

#### Create/Update Snapshot

```javascript
const snapshot = snapshotManager.createSnapshot({
  broker: 'mt5',
  symbol: 'EURUSD',
  data: {
    quote: { bid: 1.0892, ask: 1.0894, ... },
    bars: { M15: [...], H1: [...] },
    layers: [/* 20 layers */],
    signal: { signal: 'BUY', confidence: 85, ... },
    signalValid: true,
    layer18Ready: true
  }
});
```

#### Get Snapshot

```javascript
const snapshot = snapshotManager.getSnapshot('mt5', 'EURUSD');
if (snapshot) {
  console.log(`Version: ${snapshot.version}`);
  console.log(`Signal: ${snapshot.signal?.signal}`);
  console.log(`Layer 18 Ready: ${snapshot.layer18Ready}`);
}
```

#### Partial Update

```javascript
// Update just the quote
snapshotManager.updateQuote({
  broker: 'mt5',
  symbol: 'EURUSD',
  quote: { bid: 1.0895, ask: 1.0897, ... }
});

// Update bars for a timeframe
snapshotManager.updateBars({
  broker: 'mt5',
  symbol: 'EURUSD',
  timeframe: 'H1',
  bars: [...]
});

// Update layers
snapshotManager.updateLayers({
  broker: 'mt5',
  symbol: 'EURUSD',
  layers: [/* 20 layers */]
});

// Update signal
snapshotManager.updateSignal({
  broker: 'mt5',
  symbol: 'EURUSD',
  signal: { ... },
  signalValid: true,
  layer18Ready: true
});
```

#### Get Ready Snapshots

```javascript
// Get all snapshots that passed all layers
const readySnapshots = snapshotManager.getReadySnapshots('mt5');

readySnapshots.forEach((snapshot) => {
  console.log(`${snapshot.symbol}: Ready for execution`);
});
```

#### Subscribe to Changes

```javascript
// Subscribe to real-time updates
const unsubscribe = snapshotManager.subscribe((event, data) => {
  if (event === 'update') {
    console.log(`Snapshot updated: ${data.snapshot.symbol}`);
    // Update dashboard UI
  } else if (event === 'remove') {
    console.log(`Snapshot removed: ${data.snapshot.symbol}`);
  }
});

// Unsubscribe when done
unsubscribe();
```

#### Get Statistics

```javascript
const stats = snapshotManager.getStatistics();
console.log(`Total snapshots: ${stats.total}`);
console.log(`Ready: ${stats.byStatus.ready}`);
console.log(`Pending: ${stats.byStatus.pending}`);
console.log(`Fresh: ${stats.byFreshness.fresh}`);
console.log(`Stale: ${stats.byFreshness.stale}`);
```

### LayerOrchestrator

#### Process Signal Through 20 Layers

```javascript
const analysis = await orchestrator.processSignal({
  broker: 'mt5',
  symbol: 'EURUSD',
  snapshot: snapshot, // Current snapshot
  signal: signal, // Signal to validate
});

console.log(`Passed layers: ${analysis.summary.passed}/20`);
console.log(`Confluence score: ${analysis.summary.confluenceScore}%`);
console.log(`Layer 18 ready: ${analysis.layer18Ready}`);

// Check individual layers
analysis.layers.forEach((layer) => {
  console.log(`L${layer.layer} (${layer.name}): ${layer.status}`);
  if (layer.status === 'FAIL') {
    console.log(`  Reason: ${layer.reason}`);
  }
});
```

#### Get Metrics

```javascript
const metrics = orchestrator.getMetrics();
console.log(`Total processed: ${metrics.overall.processed}`);
console.log(`Pass rate: ${metrics.overall.passRate}`);

// Per-layer metrics
metrics.byLayer.forEach((layer) => {
  console.log(`${layer.layer}: ${layer.passRate} pass rate`);
});
```

## Integration Examples / أمثلة التكامل

### 1. EA Bridge Service Integration

```javascript
import UnifiedSnapshotManager from './unified-snapshot-manager.js';

class EaBridgeService {
  constructor(options) {
    this.snapshotManager = new UnifiedSnapshotManager({
      logger: options.logger,
      cacheCoordinator: options.cacheCoordinator,
    });
  }

  recordQuote(payload) {
    // ... process quote

    // Update snapshot
    this.snapshotManager.updateQuote({
      broker: payload.broker,
      symbol: payload.symbol,
      quote: processedQuote,
    });
  }

  recordBars(payload) {
    // ... process bars

    // Update snapshot
    this.snapshotManager.updateBars({
      broker: payload.broker,
      symbol: payload.symbol,
      timeframe: payload.timeframe,
      bars: processedBars,
    });
  }
}
```

### 2. Signal Factory Integration

```javascript
import LayerOrchestrator from './layer-orchestrator.js';

class SignalFactory {
  constructor(options) {
    this.snapshotManager = options.snapshotManager;
    this.orchestrator = new LayerOrchestrator({
      logger: options.logger,
      snapshotManager: this.snapshotManager,
    });
  }

  async generateSignal({ broker, symbol }) {
    // Get current snapshot
    const snapshot = this.snapshotManager.getSnapshot(broker, symbol);

    if (!snapshot) {
      return { success: false, error: 'No snapshot available' };
    }

    // Generate initial signal
    const signal = await this.generateInitialSignal(snapshot);

    // Process through 20 layers
    const analysis = await this.orchestrator.processSignal({
      broker,
      symbol,
      snapshot,
      signal,
    });

    // Update snapshot with layer results
    this.snapshotManager.updateSnapshot({
      broker,
      symbol,
      updates: {
        layers: analysis.layers,
        layeredAnalysis: analysis,
        signal,
        signalValid: analysis.layer18Ready,
        layer18Ready: analysis.layer18Ready,
      },
    });

    return {
      success: true,
      signal,
      analysis,
      layer18Ready: analysis.layer18Ready,
    };
  }
}
```

### 3. Dashboard Integration

```javascript
// Subscribe to snapshot updates
snapshotManager.subscribe((event, data) => {
  if (event === 'update') {
    const { snapshot } = data;

    // Update dashboard UI
    updateSignalTable(snapshot);
    updateLayerStatus(snapshot.layers);

    // Highlight ready signals
    if (snapshot.layer18Ready && snapshot.signalValid) {
      highlightReadySignal(snapshot.symbol);
    }
  }
});

// WebSocket broadcast to clients
function broadcastSnapshot(snapshot) {
  const message = {
    type: 'snapshot_update',
    data: {
      symbol: snapshot.symbol,
      signal: snapshot.signal,
      layers: snapshot.layers,
      layer18Ready: snapshot.layer18Ready,
      signalValid: snapshot.signalValid,
      version: snapshot.version,
    },
  };

  broadcast(message);
}
```

### 4. Execution Engine Integration

```javascript
class ExecutionEngine {
  constructor(options) {
    this.snapshotManager = options.snapshotManager;

    // Subscribe to ready snapshots
    this.snapshotManager.subscribe((event, data) => {
      if (event === 'update') {
        const { snapshot } = data;

        // Check if ready for execution
        if (snapshot.layer18Ready && snapshot.signalValid) {
          this.executeSignal(snapshot);
        }
      }
    });
  }

  async executeSignal(snapshot) {
    // Update execution status
    this.snapshotManager.updateSnapshot({
      broker: snapshot.broker,
      symbol: snapshot.symbol,
      updates: {
        executionStatus: 'EXECUTING',
      },
    });

    try {
      // Execute on MT5
      const result = await this.mt5Connector.placeOrder({
        symbol: snapshot.signal.symbol,
        side: snapshot.signal.signal.toLowerCase(),
        entryPrice: snapshot.signal.entryPrice,
        stopLoss: snapshot.signal.stopLoss,
        takeProfit: snapshot.signal.takeProfit,
      });

      // Update snapshot with result
      this.snapshotManager.updateSnapshot({
        broker: snapshot.broker,
        symbol: snapshot.symbol,
        updates: {
          executionStatus: result.success ? 'EXECUTED' : 'FAILED',
          executionResult: result,
        },
      });
    } catch (error) {
      // Update snapshot with error
      this.snapshotManager.updateSnapshot({
        broker: snapshot.broker,
        symbol: snapshot.symbol,
        updates: {
          executionStatus: 'FAILED',
          executionResult: { error: error.message },
        },
      });
    }
  }
}
```

## Benefits / الفوائد

### Before / قبل

- ❌ Multiple scattered data sources
- ❌ Dashboard and execution use different data
- ❌ Inconsistent signal states
- ❌ Duplicate calculations
- ❌ No single source of truth

### After / بعد

- ✅ **Single source of truth**: One snapshot for all
- ✅ **Consistency**: Dashboard and execution see the same data
- ✅ **Real-time updates**: Changes propagate immediately
- ✅ **No duplication**: Calculate once, use everywhere
- ✅ **Versioning**: Track changes over time
- ✅ **Clean architecture**: Clear data flow

## Configuration / الإعدادات

```javascript
const snapshotManager = new UnifiedSnapshotManager({
  logger: logger,
  cacheCoordinator: cacheCoordinator,

  // Configuration
  snapshotTTL: 5000, // 5 seconds TTL
  maxSnapshots: 200, // Max snapshots to keep
  enableVersioning: true, // Enable version tracking
});

const orchestrator = new LayerOrchestrator({
  logger: logger,
  snapshotManager: snapshotManager,
  // Layer processors are built-in
});
```

## Monitoring / المراقبة

### Snapshot Statistics

```javascript
// Get snapshot statistics
const stats = snapshotManager.getStatistics();

{
  total: 45,
  version: 1234,
  byStatus: {
    ready: 12,    // Passed all layers
    pending: 33   // Not ready
  },
  byFreshness: {
    fresh: 40,    // Updated within TTL
    stale: 5      // Older than TTL
  },
  listeners: 3
}
```

### Layer Processing Metrics

```javascript
// Get layer processing metrics
const metrics = orchestrator.getMetrics();

{
  overall: {
    processed: 1000,
    passed: 850,
    failed: 150,
    passRate: '85.0%'
  },
  byLayer: [
    {
      layer: 'L1',
      pass: 980,
      fail: 15,
      error: 5,
      total: 1000,
      passRate: '98.0%'
    },
    // ... L2 to L20
  ]
}
```

## Best Practices / أفضل الممارسات

### 1. Always Use Snapshot

✅ **DO**:

```javascript
const snapshot = snapshotManager.getSnapshot('mt5', 'EURUSD');
if (snapshot && snapshot.layer18Ready) {
  executeSignal(snapshot.signal);
}
```

❌ **DON'T**:

```javascript
// Don't bypass snapshot
const quote = eaBridge.getQuote('EURUSD');
const signal = calculateSignal(quote); // Scattered calculation
executeSignal(signal);
```

### 2. Subscribe for Real-time Updates

✅ **DO**:

```javascript
snapshotManager.subscribe((event, data) => {
  if (event === 'update') {
    updateDashboard(data.snapshot);
  }
});
```

❌ **DON'T**:

```javascript
// Don't poll
setInterval(() => {
  const snapshot = snapshotManager.getSnapshot('mt5', 'EURUSD');
  updateDashboard(snapshot);
}, 1000);
```

### 3. Check Layer 18 Readiness

✅ **DO**:

```javascript
if (snapshot.layer18Ready && snapshot.signalValid) {
  // Signal passed all required layers
  executeSignal(snapshot);
}
```

❌ **DON'T**:

```javascript
// Don't skip validation
if (snapshot.signal) {
  executeSignal(snapshot); // Might not be ready!
}
```

### 4. Update Snapshots Incrementally

✅ **DO**:

```javascript
// Update only what changed
snapshotManager.updateQuote({ broker, symbol, quote });
snapshotManager.updateBars({ broker, symbol, timeframe, bars });
```

❌ **DON'T**:

```javascript
// Don't recreate entire snapshot
snapshotManager.createSnapshot({ broker, symbol, data: { ... } });
```

## Troubleshooting / استكشاف الأخطاء

### Issue: Snapshot is stale

**Check**:

```javascript
const snapshot = snapshotManager.getSnapshot('mt5', 'EURUSD');
const age = Date.now() - snapshot.updatedAt;
console.log(`Snapshot age: ${age}ms`);
```

**Solution**: Ensure EA is sending updates regularly.

### Issue: Layer 18 never ready

**Check**:

```javascript
const snapshot = snapshotManager.getSnapshot('mt5', 'EURUSD');
snapshot.layers.forEach((layer) => {
  if (layer.status === 'FAIL') {
    console.log(`L${layer.layer} failed: ${layer.reason}`);
  }
});
```

**Solution**: Fix the failing layers.

### Issue: Too many snapshots

**Check**:

```javascript
const stats = snapshotManager.getStatistics();
console.log(`Total snapshots: ${stats.total}`);
```

**Solution**: Increase `maxSnapshots` or reduce symbols being tracked.

## Summary / الخلاصة

The Unified Snapshot System provides:

- ✅ **Single source of truth** for all data
- ✅ **20-layer sequential processing** for every signal
- ✅ **Consistent state** across dashboard and execution
- ✅ **Real-time updates** via subscription
- ✅ **Clean architecture** with clear data flow
- ✅ **Comprehensive monitoring** and metrics

**All signals now pass through the same unified pipeline, ensuring consistency and reliability!**

**جميع الإشارات الآن تمر عبر نفس الخط الموحد، مما يضمن الاتساق والموثوقية!**
