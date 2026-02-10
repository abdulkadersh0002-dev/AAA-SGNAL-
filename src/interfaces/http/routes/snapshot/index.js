import { Router } from 'express';
import { ok, badRequest, notFound, serverError } from '../../../../utils/http-response.js';

/**
 * Snapshot API Routes
 * Provides access to unified snapshot data for dashboard and monitoring
 */
export default function snapshotRoutes({ eaBridgeService, logger, requireBasicRead }) {
  const router = Router();

  /**
   * GET /api/snapshot/:broker/:symbol
   * Get snapshot for a specific symbol
   */
  router.get('/snapshot/:broker/:symbol', requireBasicRead, (req, res) => {
    try {
      const { broker, symbol } = req.params;

      if (!broker || !symbol) {
        return badRequest(res, 'Missing broker or symbol parameter');
      }

      const snapshotManager = eaBridgeService?.getSnapshotManager?.();
      if (!snapshotManager) {
        return serverError(res, 'Snapshot manager not available');
      }

      const snapshot = snapshotManager.getSnapshot(broker, symbol);

      if (!snapshot) {
        return notFound(res, `No snapshot found for ${broker}:${symbol}`);
      }

      // Calculate age
      const age = Date.now() - snapshot.updatedAt;
      const isStale = age > 5000; // 5 seconds

      return ok(res, {
        snapshot: {
          broker: snapshot.broker,
          symbol: snapshot.symbol,
          version: snapshot.version,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
          age,
          isStale,

          // Market data
          quote: snapshot.quote,
          bars: snapshot.bars,
          technicalSnapshot: snapshot.technicalSnapshot,

          // Analysis
          layers: snapshot.layers,
          layeredAnalysis: snapshot.layeredAnalysis,

          // Signal
          signal: snapshot.signal,
          signalValid: snapshot.signalValid,
          layer18Ready: snapshot.layer18Ready,

          // Validation
          validationResult: snapshot.validationResult,

          // Execution
          executionStatus: snapshot.executionStatus,
          executionResult: snapshot.executionResult,

          // Context
          news: snapshot.news,
          marketPhase: snapshot.marketPhase,
          volatility: snapshot.volatility,

          // Metadata
          source: snapshot.source,
          metadata: snapshot.metadata,
        },
      });
    } catch (error) {
      logger?.error?.({ err: error }, 'Failed to retrieve snapshot');
      return serverError(res, error);
    }
  });

  /**
   * GET /api/snapshot/ready
   * Get all snapshots that are ready for execution (layer18Ready = true)
   */
  router.get('/snapshot/ready', requireBasicRead, (req, res) => {
    try {
      const broker = req.query.broker || null;

      const snapshotManager = eaBridgeService?.getSnapshotManager?.();
      if (!snapshotManager) {
        return serverError(res, 'Snapshot manager not available');
      }

      const readySnapshots = snapshotManager.getReadySnapshots(broker);

      // Map to simplified format
      const snapshots = readySnapshots.map((snapshot) => ({
        broker: snapshot.broker,
        symbol: snapshot.symbol,
        version: snapshot.version,
        updatedAt: snapshot.updatedAt,
        age: Date.now() - snapshot.updatedAt,
        signal: snapshot.signal
          ? {
              signal: snapshot.signal.signal,
              confidence: snapshot.signal.confidence,
              entryPrice: snapshot.signal.entryPrice,
              stopLoss: snapshot.signal.stopLoss,
              takeProfit: snapshot.signal.takeProfit,
              riskRewardRatio: snapshot.signal.riskRewardRatio,
            }
          : null,
        confluenceScore: snapshot.layeredAnalysis?.summary?.confluenceScore || null,
        passedLayers: snapshot.layeredAnalysis?.summary?.passed || 0,
        totalLayers: snapshot.layeredAnalysis?.summary?.total || 20,
        layer18Ready: snapshot.layer18Ready,
        signalValid: snapshot.signalValid,
        executionStatus: snapshot.executionStatus,
      }));

      return ok(res, {
        total: snapshots.length,
        broker: broker || 'all',
        snapshots,
      });
    } catch (error) {
      logger?.error?.({ err: error }, 'Failed to retrieve ready snapshots');
      return serverError(res, error);
    }
  });

  /**
   * GET /api/snapshot/all
   * Get all snapshots with optional filtering
   */
  router.get('/snapshot/all', requireBasicRead, (req, res) => {
    try {
      const broker = req.query.broker || null;
      const signalValid =
        req.query.signalValid === 'true'
          ? true
          : req.query.signalValid === 'false'
            ? false
            : undefined;
      const layer18Ready =
        req.query.layer18Ready === 'true'
          ? true
          : req.query.layer18Ready === 'false'
            ? false
            : undefined;

      const snapshotManager = eaBridgeService?.getSnapshotManager?.();
      if (!snapshotManager) {
        return serverError(res, 'Snapshot manager not available');
      }

      const filter = {};
      if (broker) {
        filter.broker = broker;
      }
      if (signalValid !== undefined) {
        filter.signalValid = signalValid;
      }
      if (layer18Ready !== undefined) {
        filter.layer18Ready = layer18Ready;
      }

      const allSnapshots = snapshotManager.getAllSnapshots(filter);

      // Map to simplified format
      const snapshots = allSnapshots.map((snapshot) => ({
        broker: snapshot.broker,
        symbol: snapshot.symbol,
        version: snapshot.version,
        updatedAt: snapshot.updatedAt,
        age: Date.now() - snapshot.updatedAt,
        isStale: Date.now() - snapshot.updatedAt > 5000,
        hasSignal: !!snapshot.signal,
        signal: snapshot.signal?.signal || null,
        confidence: snapshot.signal?.confidence || null,
        layer18Ready: snapshot.layer18Ready,
        signalValid: snapshot.signalValid,
        executionStatus: snapshot.executionStatus,
        confluenceScore: snapshot.layeredAnalysis?.summary?.confluenceScore || null,
      }));

      return ok(res, {
        total: snapshots.length,
        filters: filter,
        snapshots,
      });
    } catch (error) {
      logger?.error?.({ err: error }, 'Failed to retrieve all snapshots');
      return serverError(res, error);
    }
  });

  /**
   * GET /api/snapshot/stats
   * Get snapshot manager statistics
   */
  router.get('/snapshot/stats', requireBasicRead, (req, res) => {
    try {
      const snapshotManager = eaBridgeService?.getSnapshotManager?.();
      if (!snapshotManager) {
        return serverError(res, 'Snapshot manager not available');
      }

      const stats = snapshotManager.getStatistics();

      return ok(res, {
        stats,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger?.error?.({ err: error }, 'Failed to retrieve snapshot statistics');
      return serverError(res, error);
    }
  });

  /**
   * GET /api/snapshot/layers/:broker/:symbol
   * Get detailed layer-by-layer analysis for a specific symbol
   */
  router.get('/snapshot/layers/:broker/:symbol', requireBasicRead, (req, res) => {
    try {
      const { broker, symbol } = req.params;

      if (!broker || !symbol) {
        return badRequest(res, 'Missing broker or symbol parameter');
      }

      const snapshotManager = eaBridgeService?.getSnapshotManager?.();
      if (!snapshotManager) {
        return serverError(res, 'Snapshot manager not available');
      }

      const snapshot = snapshotManager.getSnapshot(broker, symbol);

      if (!snapshot) {
        return notFound(res, `No snapshot found for ${broker}:${symbol}`);
      }

      if (!snapshot.layers || !Array.isArray(snapshot.layers)) {
        return ok(res, {
          broker,
          symbol,
          layers: [],
          message: 'No layer analysis available',
        });
      }

      return ok(res, {
        broker,
        symbol,
        version: snapshot.version,
        updatedAt: snapshot.updatedAt,
        layers: snapshot.layers.map((layer) => ({
          layer: layer.layer,
          key: layer.key,
          name: layer.name,
          description: layer.description,
          status: layer.status,
          score: layer.score,
          confidence: layer.confidence,
          metrics: layer.metrics,
          reason: layer.reason,
          processingTimeMs: layer.processingTimeMs,
        })),
        summary: snapshot.layeredAnalysis?.summary || null,
        layer18Ready: snapshot.layer18Ready,
      });
    } catch (error) {
      logger?.error?.({ err: error }, 'Failed to retrieve layer details');
      return serverError(res, error);
    }
  });

  return router;
}
