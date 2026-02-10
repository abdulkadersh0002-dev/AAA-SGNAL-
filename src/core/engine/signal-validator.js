/**
 * Unified Signal Validator
 * Consolidates all signal validation logic into a single, powerful pipeline
 * Replaces 3 separate validation gates with one unified approach
 */

import logger from '../../infrastructure/services/logging/logger.js';

class SignalValidator {
  constructor(options = {}) {
    this.logger = options.logger || logger;
    this.marketRules = options.marketRules;
    this.intelligentTradeManager = options.intelligentTradeManager;
    this.tradingPolicy = options.tradingPolicy;

    // Validation metrics
    this.metrics = {
      validated: 0,
      rejected: 0,
      byReason: new Map(),
    };
  }

  /**
   * Validate a signal through all gates
   * Returns detailed validation result with reasons for any rejection
   */
  async validate(signal, context = {}) {
    const validationResult = {
      valid: true,
      signal,
      checks: [],
      rejectionReasons: [],
      warnings: [],
    };

    try {
      // Gate 1: Basic Structure Validation
      const structureCheck = this.validateStructure(signal);
      validationResult.checks.push(structureCheck);

      if (!structureCheck.passed) {
        validationResult.valid = false;
        validationResult.rejectionReasons.push(...structureCheck.reasons);
        this.recordRejection('STRUCTURE_INVALID');
        return validationResult;
      }

      // Gate 2: Market Rules Validation
      const marketRulesCheck = await this.validateMarketRules(signal, context);
      validationResult.checks.push(marketRulesCheck);

      if (!marketRulesCheck.passed) {
        validationResult.valid = false;
        validationResult.rejectionReasons.push(...marketRulesCheck.reasons);
        this.recordRejection('MARKET_RULES_VIOLATION');
        return validationResult;
      }

      // Gate 3: Layer 18 Readiness (20-layer system validation)
      const layer18Check = this.validateLayer18(signal);
      validationResult.checks.push(layer18Check);

      if (!layer18Check.passed) {
        validationResult.valid = false;
        validationResult.rejectionReasons.push(...layer18Check.reasons);
        this.recordRejection('LAYER18_NOT_READY');
        return validationResult;
      }

      // Gate 4: Intelligent Trade Manager Evaluation
      if (this.intelligentTradeManager) {
        const intelligentCheck = await this.validateWithIntelligentManager(signal, context);
        validationResult.checks.push(intelligentCheck);

        if (!intelligentCheck.passed) {
          validationResult.valid = false;
          validationResult.rejectionReasons.push(...intelligentCheck.reasons);
          this.recordRejection('INTELLIGENT_MANAGER_REJECTED');
          return validationResult;
        }

        // Add warnings if present
        if (intelligentCheck.warnings && intelligentCheck.warnings.length > 0) {
          validationResult.warnings.push(...intelligentCheck.warnings);
        }
      }

      // Gate 5: Risk Parameters Validation
      const riskCheck = this.validateRiskParameters(signal);
      validationResult.checks.push(riskCheck);

      if (!riskCheck.passed) {
        validationResult.valid = false;
        validationResult.rejectionReasons.push(...riskCheck.reasons);
        this.recordRejection('RISK_PARAMETERS_INVALID');
        return validationResult;
      }

      // Gate 6: Trading Policy Compliance
      if (this.tradingPolicy) {
        const policyCheck = await this.validateTradingPolicy(signal, context);
        validationResult.checks.push(policyCheck);

        if (!policyCheck.passed) {
          validationResult.valid = false;
          validationResult.rejectionReasons.push(...policyCheck.reasons);
          this.recordRejection('POLICY_VIOLATION');
          return validationResult;
        }
      }

      // All checks passed
      this.metrics.validated += 1;
      return validationResult;
    } catch (error) {
      this.logger?.error?.({ err: error, signal }, 'Signal validation error');
      validationResult.valid = false;
      validationResult.rejectionReasons.push(`Validation error: ${error.message}`);
      this.recordRejection('VALIDATION_ERROR');
      return validationResult;
    }
  }

  /**
   * Validate signal structure and required fields
   */
  validateStructure(signal) {
    const check = {
      gate: 'STRUCTURE',
      passed: true,
      reasons: [],
    };

    if (!signal || typeof signal !== 'object') {
      check.passed = false;
      check.reasons.push('Signal is null or not an object');
      return check;
    }

    // Required fields
    const required = ['symbol', 'signal', 'confidence', 'entryPrice'];
    for (const field of required) {
      if (signal[field] == null) {
        check.passed = false;
        check.reasons.push(`Missing required field: ${field}`);
      }
    }

    // Validate signal direction
    const validDirections = ['BUY', 'SELL'];
    if (!validDirections.includes(signal.signal)) {
      check.passed = false;
      check.reasons.push(`Invalid signal direction: ${signal.signal}`);
    }

    // Validate confidence range
    if (typeof signal.confidence !== 'number' || signal.confidence < 0 || signal.confidence > 100) {
      check.passed = false;
      check.reasons.push('Confidence must be between 0-100');
    }

    // Validate prices are positive
    if (signal.entryPrice != null && signal.entryPrice <= 0) {
      check.passed = false;
      check.reasons.push('Entry price must be positive');
    }

    if (signal.stopLoss != null && signal.stopLoss <= 0) {
      check.passed = false;
      check.reasons.push('Stop loss must be positive');
    }

    if (signal.takeProfit != null && signal.takeProfit <= 0) {
      check.passed = false;
      check.reasons.push('Take profit must be positive');
    }

    return check;
  }

  /**
   * Validate against market rules
   */
  async validateMarketRules(signal, context) {
    const check = {
      gate: 'MARKET_RULES',
      passed: true,
      reasons: [],
    };

    if (!this.marketRules) {
      return check; // Skip if not configured
    }

    try {
      const order = {
        symbol: signal.symbol,
        side: signal.signal.toLowerCase(),
        volume: signal.volume || context.volume || 0.01,
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
      };

      const marketValidation = await this.marketRules.validateOrder(order);

      if (!marketValidation || !marketValidation.valid) {
        check.passed = false;
        check.reasons.push(marketValidation?.message || 'Market rules validation failed');
      }
    } catch (error) {
      this.logger?.warn?.({ err: error, signal }, 'Market rules validation error');
      check.passed = false;
      check.reasons.push('Market rules check failed');
    }

    return check;
  }

  /**
   * Validate Layer 18 readiness (20-layer system validation gate)
   */
  validateLayer18(signal) {
    const check = {
      gate: 'LAYER_18',
      passed: true,
      reasons: [],
    };

    // Check if layer18Ready flag is set
    if (signal.layer18Ready === false) {
      check.passed = false;
      check.reasons.push('Layer 18 readiness flag is false');
      return check;
    }

    // Check layered analysis exists
    if (!signal.layeredAnalysis || !signal.layeredAnalysis.layers) {
      check.passed = false;
      check.reasons.push('Missing layered analysis data');
      return check;
    }

    // Check confluence score
    const confluenceScore = signal.layeredAnalysis.confluenceScore || 0;
    if (confluenceScore < 60) {
      check.passed = false;
      check.reasons.push(`Confluence score too low: ${confluenceScore} (minimum: 60)`);
    }

    // Check critical layers are present
    const criticalLayers = [1, 6, 11, 16, 18];
    const presentLayers = new Set(signal.layeredAnalysis.layers.map((l) => l.layer));

    for (const layerNum of criticalLayers) {
      if (!presentLayers.has(layerNum)) {
        check.passed = false;
        check.reasons.push(`Missing critical layer: ${layerNum}`);
      }
    }

    return check;
  }

  /**
   * Validate with intelligent trade manager
   */
  async validateWithIntelligentManager(signal, context) {
    const check = {
      gate: 'INTELLIGENT_MANAGER',
      passed: true,
      reasons: [],
      warnings: [],
    };

    try {
      const symbol = signal.symbol;
      const marketData = context.marketData || {};

      // Evaluate trade entry with intelligent manager
      const evaluation = await this.intelligentTradeManager.evaluateTradeEntryWithScoring({
        signal,
        symbol,
        marketData,
      });

      if (!evaluation || !evaluation.shouldOpen) {
        check.passed = false;
        check.reasons.push(evaluation?.blocked || 'Intelligent manager rejected');

        if (evaluation?.insights && evaluation.insights.length > 0) {
          check.reasons.push(...evaluation.insights);
        }
      } else {
        // Add insights as warnings for awareness
        if (evaluation.insights && evaluation.insights.length > 0) {
          check.warnings.push(...evaluation.insights);
        }
      }
    } catch (error) {
      this.logger?.warn?.({ err: error, signal }, 'Intelligent manager evaluation error');
      // Don't fail validation on error, just log warning
      check.warnings.push('Intelligent manager evaluation error');
    }

    return check;
  }

  /**
   * Validate risk parameters
   */
  validateRiskParameters(signal) {
    const check = {
      gate: 'RISK_PARAMETERS',
      passed: true,
      reasons: [],
    };

    // Risk/reward ratio check
    if (signal.riskRewardRatio != null) {
      if (signal.riskRewardRatio < 1.5) {
        check.passed = false;
        check.reasons.push(`Risk/reward ratio too low: ${signal.riskRewardRatio} (minimum: 1.5)`);
      }
    }

    // Stop loss distance check
    if (signal.entryPrice && signal.stopLoss) {
      const stopDistance = Math.abs(signal.entryPrice - signal.stopLoss);
      const stopDistancePct = (stopDistance / signal.entryPrice) * 100;

      // Max stop loss distance: 5%
      if (stopDistancePct > 5) {
        check.passed = false;
        check.reasons.push(`Stop loss too far: ${stopDistancePct.toFixed(2)}% (maximum: 5%)`);
      }

      // Min stop loss distance: 0.1%
      if (stopDistancePct < 0.1) {
        check.passed = false;
        check.reasons.push(`Stop loss too close: ${stopDistancePct.toFixed(2)}% (minimum: 0.1%)`);
      }
    }

    // Volume/position size check (if available)
    if (signal.volume != null) {
      if (signal.volume <= 0) {
        check.passed = false;
        check.reasons.push('Volume must be positive');
      }

      if (signal.volume > 10) {
        check.passed = false;
        check.reasons.push(`Volume too large: ${signal.volume} (maximum: 10)`);
      }
    }

    return check;
  }

  /**
   * Validate against trading policy
   */
  async validateTradingPolicy(signal, context) {
    const check = {
      gate: 'TRADING_POLICY',
      passed: true,
      reasons: [],
    };

    // This would integrate with your trading policy module
    // For now, basic checks

    // Confidence threshold
    const minConfidence = context.minConfidence || 65;
    if (signal.confidence < minConfidence) {
      check.passed = false;
      check.reasons.push(`Confidence too low: ${signal.confidence} (minimum: ${minConfidence})`);
    }

    return check;
  }

  /**
   * Record rejection reason for metrics
   */
  recordRejection(reason) {
    this.metrics.rejected += 1;
    const count = this.metrics.byReason.get(reason) || 0;
    this.metrics.byReason.set(reason, count + 1);
  }

  /**
   * Get validation metrics
   */
  getMetrics() {
    const total = this.metrics.validated + this.metrics.rejected;
    const rejectionReasons = Array.from(this.metrics.byReason.entries())
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: total > 0 ? `${((count / total) * 100).toFixed(2)}%` : '0%',
      }))
      .sort((a, b) => b.count - a.count);

    return {
      total,
      validated: this.metrics.validated,
      rejected: this.metrics.rejected,
      validationRate: total > 0 ? `${((this.metrics.validated / total) * 100).toFixed(2)}%` : '0%',
      rejectionRate: total > 0 ? `${((this.metrics.rejected / total) * 100).toFixed(2)}%` : '0%',
      rejectionReasons,
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      validated: 0,
      rejected: 0,
      byReason: new Map(),
    };
  }
}

export default SignalValidator;
