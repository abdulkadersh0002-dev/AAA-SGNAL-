/**
 * Event Utilities
 * 
 * Provides utilities for parsing and handling market events,
 * economic calendar data, and news impact analysis.
 * 
 * Consolidates duplicate event parsing logic found throughout the codebase.
 */

import { toNumber } from './number-utils.js';

/**
 * Parse event time to milliseconds
 * Handles various input formats consistently
 * 
 * @param {any} eventTime - Event time (string, number, Date)
 * @returns {number|null} Time in milliseconds or null
 */
export function parseEventTimeMs(eventTime) {
  if (!eventTime) return null;

  // Already a number (timestamp)
  if (typeof eventTime === 'number') {
    return eventTime;
  }

  // Date object
  if (eventTime instanceof Date) {
    return eventTime.getTime();
  }

  // String - try to parse
  if (typeof eventTime === 'string') {
    const parsed = Date.parse(eventTime);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * Calculate time until event in minutes
 * @param {any} eventTime - Event time
 * @param {number} currentTime - Current time in ms (default: now)
 * @returns {number|null} Minutes until event or null
 */
export function minutesUntilEvent(eventTime, currentTime = Date.now()) {
  const eventMs = parseEventTimeMs(eventTime);
  if (eventMs === null) return null;

  const diffMs = eventMs - currentTime;
  return diffMs / (1000 * 60); // Convert to minutes
}

/**
 * Check if event is upcoming within specified minutes
 * @param {any} eventTime - Event time
 * @param {number} withinMinutes - Time window in minutes
 * @param {number} currentTime - Current time in ms
 * @returns {boolean} True if event is upcoming
 */
export function isUpcomingEvent(eventTime, withinMinutes = 30, currentTime = Date.now()) {
  const minutes = minutesUntilEvent(eventTime, currentTime);
  if (minutes === null) return false;
  
  return minutes >= 0 && minutes <= withinMinutes;
}

/**
 * Check if event recently passed within specified minutes
 * @param {any} eventTime - Event time
 * @param {number} withinMinutes - Time window in minutes (negative means past)
 * @param {number} currentTime - Current time in ms
 * @returns {boolean} True if event recently passed
 */
export function isRecentEvent(eventTime, withinMinutes = 30, currentTime = Date.now()) {
  const minutes = minutesUntilEvent(eventTime, currentTime);
  if (minutes === null) return false;
  
  return minutes < 0 && minutes >= -withinMinutes;
}

/**
 * Parse event impact level from various formats
 * @param {any} impact - Impact level (string, number)
 * @returns {string} Normalized impact level (high, medium, low, none)
 */
export function parseImpactLevel(impact) {
  if (!impact) return 'none';

  const str = String(impact).toLowerCase().trim();

  // Map common variations
  const impactMap = {
    high: ['high', '3', 'h', 'red'],
    medium: ['medium', '2', 'm', 'orange', 'med'],
    low: ['low', '1', 'l', 'yellow'],
  };

  for (const [level, variations] of Object.entries(impactMap)) {
    if (variations.some(v => str.includes(v))) {
      return level;
    }
  }

  return 'none';
}

/**
 * Check if event is high impact
 * @param {any} impact - Impact level
 * @returns {boolean} True if high impact
 */
export function isHighImpact(impact) {
  return parseImpactLevel(impact) === 'high';
}

/**
 * Filter events by impact level
 * @param {Array} events - Array of event objects
 * @param {string} minImpact - Minimum impact level (high, medium, low)
 * @returns {Array} Filtered events
 */
export function filterByImpact(events, minImpact = 'high') {
  if (!Array.isArray(events)) return [];

  const impactLevels = {
    high: 3,
    medium: 2,
    low: 1,
    none: 0,
  };

  const minLevel = impactLevels[minImpact] || 0;

  return events.filter(event => {
    const level = parseImpactLevel(event.impact);
    return impactLevels[level] >= minLevel;
  });
}

/**
 * Find upcoming high-impact events for a currency
 * @param {Array} events - Array of event objects
 * @param {string} currency - Currency code (e.g., 'USD', 'EUR')
 * @param {number} withinMinutes - Time window in minutes
 * @returns {Array} Filtered events
 */
export function findUpcomingHighImpactEvents(events, currency, withinMinutes = 60) {
  if (!Array.isArray(events)) return [];

  const currencyUpper = currency?.toUpperCase();
  const now = Date.now();

  return events.filter(event => {
    // Check impact level
    if (!isHighImpact(event.impact)) return false;

    // Check currency match
    const eventCurrency = event.currency?.toUpperCase();
    if (eventCurrency !== currencyUpper) return false;

    // Check time window
    return isUpcomingEvent(event.time || event.eventTime, withinMinutes, now);
  });
}

/**
 * Check if trading should be avoided due to news
 * @param {Array} events - Array of event objects
 * @param {string} pair - Trading pair (e.g., 'EURUSD')
 * @param {number} beforeMinutes - Minutes before event to avoid
 * @param {number} afterMinutes - Minutes after event to avoid
 * @returns {Object} { shouldAvoid: boolean, reason: string, events: Array }
 */
export function shouldAvoidDueToNews(events, pair, beforeMinutes = 30, afterMinutes = 30) {
  if (!Array.isArray(events) || !pair) {
    return { shouldAvoid: false, reason: '', events: [] };
  }

  // Extract currencies from pair
  const currencies = pair.match(/[A-Z]{3}/g) || [];
  const now = Date.now();

  const relevantEvents = [];

  for (const event of events) {
    if (!isHighImpact(event.impact)) continue;

    const eventCurrency = event.currency?.toUpperCase();
    if (!currencies.includes(eventCurrency)) continue;

    const minutes = minutesUntilEvent(event.time || event.eventTime, now);
    if (minutes === null) continue;

    // Check if event is within avoidance window
    if (minutes >= -afterMinutes && minutes <= beforeMinutes) {
      relevantEvents.push(event);
    }
  }

  if (relevantEvents.length > 0) {
    const eventNames = relevantEvents.map(e => e.title || e.name || 'Unknown').join(', ');
    return {
      shouldAvoid: true,
      reason: `High-impact news upcoming: ${eventNames}`,
      events: relevantEvents,
    };
  }

  return { shouldAvoid: false, reason: '', events: [] };
}

/**
 * Sort events by time
 * @param {Array} events - Array of event objects
 * @param {boolean} ascending - Sort order (true = earliest first)
 * @returns {Array} Sorted events
 */
export function sortEventsByTime(events, ascending = true) {
  if (!Array.isArray(events)) return [];

  return [...events].sort((a, b) => {
    const timeA = parseEventTimeMs(a.time || a.eventTime) || 0;
    const timeB = parseEventTimeMs(b.time || b.eventTime) || 0;
    return ascending ? timeA - timeB : timeB - timeA;
  });
}

export default {
  parseEventTimeMs,
  minutesUntilEvent,
  isUpcomingEvent,
  isRecentEvent,
  parseImpactLevel,
  isHighImpact,
  filterByImpact,
  findUpcomingHighImpactEvents,
  shouldAvoidDueToNews,
  sortEventsByTime,
};
