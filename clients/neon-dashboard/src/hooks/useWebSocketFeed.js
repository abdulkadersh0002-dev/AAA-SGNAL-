import { useEffect, useRef } from 'react';
import { getApiConfig } from '../utils/api.js';

const BASE_RECONNECT_DELAY_MS = 2500;
const MAX_RECONNECT_DELAY_MS = 20000;
const CLOSE_IF_IDLE_DELAY_MS = 250;
const HEARTBEAT_INTERVAL_MS = 15000;
const STALE_CONNECTION_MS = 45000;

const listeners = new Set();
let socket = null;
let reconnectTimer = null;
let closeIfIdleTimer = null;
let heartbeatTimer = null;
let reconnectAttempts = 0;
let lastMessageAt = null;
let currentConfig = null;

const toEventPayload = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return {
      id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: 'unknown',
      payload: raw,
      timestamp: Date.now(),
    };
  }
  const timestamp = raw.timestamp || Date.now();
  const type = raw.type || raw.event || 'unknown';
  return {
    id: raw.id || `${type}-${timestamp}-${Math.random().toString(16).slice(2)}`,
    type,
    payload: raw.payload ?? raw.data ?? null,
    timestamp,
  };
};

const notifyListeners = (event) => {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.warn('WebSocket listener error', error);
    }
  }
};

const closeSocket = () => {
  if (closeIfIdleTimer) {
    clearTimeout(closeIfIdleTimer);
    closeIfIdleTimer = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (socket && typeof globalThis !== 'undefined') {
    try {
      socket.close();
    } catch (_error) {
      // ignore close errors
    }
  }
  socket = null;
  lastMessageAt = null;
};

const scheduleCloseIfIdle = () => {
  if (closeIfIdleTimer || listeners.size > 0) {
    return;
  }

  closeIfIdleTimer = setTimeout(() => {
    closeIfIdleTimer = null;
    if (listeners.size === 0) {
      closeSocket();
    }
  }, CLOSE_IF_IDLE_DELAY_MS);
};

const scheduleReconnect = () => {
  if (reconnectTimer || listeners.size === 0) {
    return;
  }
  const delay = Math.min(
    BASE_RECONNECT_DELAY_MS * Math.pow(2, Math.min(reconnectAttempts, 4)),
    MAX_RECONNECT_DELAY_MS
  );
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    ensureSocket();
  }, delay);
};

const ensureSocket = () => {
  if (socket || listeners.size === 0) {
    return;
  }

  if (closeIfIdleTimer) {
    clearTimeout(closeIfIdleTimer);
    closeIfIdleTimer = null;
  }

  if (typeof globalThis === 'undefined' || typeof globalThis.WebSocket === 'undefined') {
    return;
  }

  if (!currentConfig) {
    currentConfig = getApiConfig();
  }

  const { wsUrl } = currentConfig;
  if (!wsUrl) {
    return;
  }

  try {
    socket = new globalThis.WebSocket(wsUrl);
  } catch (_error) {
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    // connection established
    reconnectAttempts = 0;
    lastMessageAt = Date.now();
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    heartbeatTimer = setInterval(() => {
      if (!socket) {
        return;
      }
      const now = Date.now();
      if (lastMessageAt && now - lastMessageAt > STALE_CONNECTION_MS) {
        closeSocket();
        scheduleReconnect();
        return;
      }
      try {
        socket.send(JSON.stringify({ type: 'ping', timestamp: now }));
      } catch (_error) {
        closeSocket();
        scheduleReconnect();
      }
    }, HEARTBEAT_INTERVAL_MS);
  };

  socket.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      lastMessageAt = Date.now();
      notifyListeners(toEventPayload(parsed));
    } catch (error) {
      console.warn('Failed to parse WebSocket payload', error);
    }
  };

  socket.onerror = () => {
    closeSocket();
    scheduleReconnect();
  };

  socket.onclose = () => {
    closeSocket();
    scheduleReconnect();
  };
};

export const useWebSocketFeed = (onEvent) => {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (typeof handlerRef.current !== 'function') {
      return () => undefined;
    }

    const listener = (event) => {
      handlerRef.current?.(event);
    };

    listeners.add(listener);
    ensureSocket();

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        scheduleCloseIfIdle();
        currentConfig = null;
      }
    };
  }, []);
};
