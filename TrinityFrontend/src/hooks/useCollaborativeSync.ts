import { useEffect, useRef, useCallback, useState } from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { sanitizeLabConfig } from '@/utils/projectStorage';
import { safeStringify } from '@/utils/safeStringify';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { useAuth } from '@/contexts/AuthContext';

// Type alias to avoid circular dependency
type LaboratorySubMode = 'analytics' | 'dashboard';

// WebSocket message types
export type WSMessageType =
  | 'connect'
  | 'state_update'
  | 'card_update'  // New: granular card-level update
  | 'card_focus'   // New: user focused on a card
  | 'card_blur'    // New: user unfocused from a card
  | 'full_sync'
  | 'ack'
  | 'error'
  | 'heartbeat'
  | 'user_list_update';

export interface WSMessage {
  type: WSMessageType;
  payload?: any;
  card_id?: string;  // For card_update, card_focus, card_blur messages
  version?: string;
  timestamp?: string;
  client_id?: string;
  user_email?: string;
  user_name?: string;
  mode?: string; // Add mode to message for filtering
  project_context?: {
    client_name: string;
    app_name: string;
    project_name: string;
  };
}

export interface ActiveUser {
  email: string;
  name: string;
  client_id: string;
  connected_at: string;
  color?: string;  // Unique color for this user
}

export interface CardEditor {
  card_id: string;
  user_email: string;
  user_name: string;
  user_color: string;
  client_id: string;
}

interface CollaborativeSyncOptions {
  enabled?: boolean;
  debounceMs?: number;
  fullSyncIntervalMs?: number;
  onError?: (error: Error) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onUsersChanged?: (users: ActiveUser[]) => void;
}

const DEFAULT_OPTIONS: Required<CollaborativeSyncOptions> = {
  enabled: true,
  debounceMs: 2000, // 2 seconds debounce for incremental updates
  fullSyncIntervalMs: 30000, // 30 seconds for full sync
  onError: (error) => console.error('[CollaborativeSync]', error),
  onConnected: () => console.log('[CollaborativeSync] Connected'),
  onDisconnected: () => console.log('[CollaborativeSync] Disconnected'),
  onUsersChanged: () => { },
};

/**
 * Hook for real-time collaborative synchronization using WebSocket
 * 
 * Features:
 * - Watches Zustand store for changes
 * - Debounces updates before sending
 * - Sends full state periodically for alignment
 * - Receives and applies updates from other clients
 * - Tracks active users in the project
 * - Handles reconnection automatically
 */
export function useCollaborativeSync(options: CollaborativeSyncOptions = {}) {
  const enabled = options.enabled ?? DEFAULT_OPTIONS.enabled;
  const debounceMs = options.debounceMs ?? DEFAULT_OPTIONS.debounceMs;
  const fullSyncIntervalMs =
    options.fullSyncIntervalMs ?? DEFAULT_OPTIONS.fullSyncIntervalMs;
  const onError = options.onError ?? DEFAULT_OPTIONS.onError;
  const onConnected = options.onConnected ?? DEFAULT_OPTIONS.onConnected;
  const onDisconnected = options.onDisconnected ?? DEFAULT_OPTIONS.onDisconnected;
  const onUsersChanged = options.onUsersChanged ?? DEFAULT_OPTIONS.onUsersChanged;

  const wsRef = useRef<WebSocket | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullSyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStateRef = useRef<string>('');
  const lastCardsRef = useRef<any[]>([]);  // Track previous cards for diff
  const lastLocalChangeTimestampRef = useRef<number>(0);  // Track when we last made a local change
  const clientIdRef = useRef<string>(`client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const isApplyingRemoteUpdateRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const manualCloseRef = useRef(false);
  const hasInitialFullSyncRef = useRef(false);
  const initialFullSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [cardEditors, setCardEditors] = useState<Map<string, CardEditor>>(new Map());
  const [isConnected, setIsConnected] = useState(false);

  const cards = useLaboratoryStore(state => state.cards);
  const setCards = useLaboratoryStore(state => state.setCards);
  const updateCard = useLaboratoryStore(state => state.updateCard);
  const auxiliaryMenuLeftOpen = useLaboratoryStore(state => state.auxiliaryMenuLeftOpen);
  const setAuxiliaryMenuLeftOpen = useLaboratoryStore(state => state.setAuxiliaryMenuLeftOpen);
  const subMode = useLaboratoryStore(state => state.subMode);
  const previousSubModeRef = useRef<LaboratorySubMode | undefined>(subMode);
  const { user } = useAuth();
  const userRef = useRef(user);

  // Generate consistent color for user
  const getUserColor = useCallback((email: string) => {
    const colors = [
      '#3B82F6', // blue
      '#10B981', // green
      '#F59E0B', // amber
      '#EF4444', // red
      '#8B5CF6', // purple
      '#EC4899', // pink
      '#14B8A6', // teal
      '#F97316', // orange
    ];

    // Simple hash function to get consistent color per email
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }, []);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const onErrorRef = useRef(onError);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  const onUsersChangedRef = useRef(onUsersChanged);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onConnectedRef.current = onConnected;
  }, [onConnected]);

  useEffect(() => {
    onDisconnectedRef.current = onDisconnected;
  }, [onDisconnected]);

  useEffect(() => {
    onUsersChangedRef.current = onUsersChanged;
  }, [onUsersChanged]);

  // Get WebSocket URL
  const getWebSocketUrl = useCallback(() => {
    const projectContext = getActiveProjectContext();
    if (!projectContext) {
      throw new Error('No project context available');
    }

    // Determine the base URL for WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostIp = (import.meta as any).env?.VITE_HOST_IP;
    const host = window.location.hostname;

    let baseUrl: string;

    // Production: Use domain without port (reverse proxy handles routing)
    if (host.includes('quantmatrixai.com') || host.includes('trinity')) {
      baseUrl = `${protocol}//${host}`;
    }
    // Local development with HOST_IP
    else if (hostIp) {
      const resolvedFastapiPort = (() => {
        const envPort = (import.meta as any).env?.VITE_FASTAPI_PORT;
        if (envPort) {
          return envPort;
        }
        if (typeof window !== 'undefined') {
          const { port } = window.location;
          if (port === '8081') {
            return '8004';
          }
        }
        return '8001';
      })();
      baseUrl = `${protocol}//${hostIp}:${resolvedFastapiPort}`;
    }
    // Local development without HOST_IP
    else {
      const resolvedFastapiPort = (() => {
        const envPort = (import.meta as any).env?.VITE_FASTAPI_PORT;
        if (envPort) {
          return envPort;
        }
        if (typeof window !== 'undefined') {
          const { port } = window.location;
          if (port === '8081') {
            return '8004';
          }
        }
        return '8001';
      })();
      baseUrl = `${protocol}//${host}:${resolvedFastapiPort}`;
    }

    const wsUrl = `${baseUrl}/api/laboratory/sync/${projectContext.client_name}/${projectContext.app_name}/${projectContext.project_name}`;
    return wsUrl;
  }, []);

  // Serialize current state
  const serializeState = useCallback(() => {
    try {
      const projectContext = getActiveProjectContext();
      if (!projectContext) return null;

      // Determine mode value based on subMode
      const mode = subMode === 'analytics' ? 'laboratory' : 'laboratory-dashboard';

      const labConfig = {
        cards: cards || [],
        auxiliaryMenuLeftOpen: auxiliaryMenuLeftOpen,
        mode: mode, // Include mode in WebSocket payload
        timestamp: new Date().toISOString(),
      };

      const sanitized = sanitizeLabConfig(labConfig);
      return {
        config: sanitized,
        serialized: safeStringify(sanitized),
        projectContext,
      };
    } catch (error) {
      onErrorRef.current(error as Error);
      return null;
    }
  }, [cards, auxiliaryMenuLeftOpen, subMode]);

  // Send message via WebSocket
  const sendMessage = useCallback((message: WSMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
      } catch (error) {
        onErrorRef.current(error as Error);
      }
    }
  }, []);

  // Notify that user is focusing on a card
  const notifyCardFocus = useCallback((cardId: string) => {
    const projectContext = getActiveProjectContext();
    const currentUser = userRef.current;

    if (!projectContext || !currentUser) return;

    const message: WSMessage = {
      type: 'card_focus',
      card_id: cardId,
      client_id: clientIdRef.current,
      user_email: currentUser.email,
      user_name: currentUser.username || currentUser.email,
      project_context: projectContext,
      timestamp: new Date().toISOString(),
    };

    sendMessage(message);
  }, [sendMessage]);

  // Notify that user unfocused from a card
  const notifyCardBlur = useCallback((cardId: string) => {
    const projectContext = getActiveProjectContext();

    if (!projectContext) return;

    const message: WSMessage = {
      type: 'card_blur',
      card_id: cardId,
      client_id: clientIdRef.current,
      project_context: projectContext,
      timestamp: new Date().toISOString(),
    };

    sendMessage(message);
  }, [sendMessage]);

  // Detect which cards changed
  const getChangedCards = useCallback(() => {
    const currentCards = cards || [];
    const previousCards = lastCardsRef.current || [];

    // If card count changed (add/delete), return empty to trigger full sync instead
    if (currentCards.length !== previousCards.length) {
      return { changed: [], countChanged: true };
    }

    const changed: any[] = [];

    // Check for modified cards (same count, different content)
    currentCards.forEach((card) => {
      const prevCard = previousCards.find((c) => c.id === card.id);
      if (!prevCard) {
        // Card ID changed but count is same - treat as modification
        changed.push(card);
        return;
      }

      const cardStr = safeStringify(card);
      const prevCardStr = safeStringify(prevCard);

      if (cardStr !== prevCardStr) {
        changed.push(card);
      }
    });

    return { changed, countChanged: false };
  }, [cards]);

  // Send debounced card-level updates
  const sendStateUpdate = useCallback(() => {
    const { changed: changedCards, countChanged } = getChangedCards();

    if (changedCards.length === 0 && !countChanged) {
      return;
    }

    const projectContext = getActiveProjectContext();
    if (!projectContext) return;

    // Record timestamp of this local change
    lastLocalChangeTimestampRef.current = Date.now();

    // Update reference BEFORE sending to prevent race condition
    lastCardsRef.current = cards || [];

    // If cards were added/deleted, send full sync to avoid conflicts
    if (countChanged) {
      const stateData = serializeState();
      if (!stateData) return;

      const message: WSMessage = {
        type: 'full_sync',
        payload: stateData.config,
        timestamp: new Date().toISOString(),
        client_id: clientIdRef.current,
        project_context: projectContext,
      };

      sendMessage(message);
      return;
    }

    // Send individual card updates for modifications only
    changedCards.forEach((card) => {
      const message: WSMessage = {
        type: 'card_update',
        card_id: card.id,
        payload: card,
        timestamp: new Date().toISOString(),
        client_id: clientIdRef.current,
        project_context: projectContext,
      };

      sendMessage(message);
    });
}, [cards, getChangedCards, sendMessage, serializeState]);

// Send full sync
const sendFullSync = useCallback(() => {
  const stateData = serializeState();
  if (!stateData) return;

  lastStateRef.current = stateData.serialized;

  const message: WSMessage = {
    type: 'full_sync',
    payload: stateData.config,
    timestamp: new Date().toISOString(),
    client_id: clientIdRef.current,
    project_context: stateData.projectContext,
  };

  sendMessage(message);
}, [serializeState, sendMessage]);

// Handle incoming WebSocket messages
const handleMessage = useCallback((event: MessageEvent) => {
  try {
    const message: WSMessage = JSON.parse(event.data);

    // Ignore messages from self
    if (message.client_id === clientIdRef.current) {
      console.log('[CollaborativeSync] Ignoring self-echo message:', {
        type: message.type,
        myClientId: clientIdRef.current,
        messageClientId: message.client_id,
      });
      return;
    }

    switch (message.type) {
      case 'card_update':
        // Apply single card update
        if (message.card_id && message.payload) {
          // CRITICAL FIX: Note - card_update doesn't have mode in payload, but backend filters by mode
          // We still need to verify the card's atoms are allowed in current mode if in dashboard mode
          // The backend should already filter broadcasts by mode, but add defensive check here

          // Parse message timestamp
          const messageTimestamp = message.timestamp ? new Date(message.timestamp).getTime() : 0;

          // Ignore if we have pending local changes that are newer
          // Add a 500ms buffer to account for network latency
          if (lastLocalChangeTimestampRef.current > 0 &&
            messageTimestamp < lastLocalChangeTimestampRef.current - 500) {
            console.log('[CollaborativeSync] Ignoring stale card_update', {
              cardId: message.card_id,
              messageTime: messageTimestamp,
              lastLocalChange: lastLocalChangeTimestampRef.current,
            });
            break;
          }

          // CRITICAL FIX: Check mode compatibility for card updates
          // If the message has a mode, ensure it matches our current mode
          if (message.mode) {
            const currentMode = subMode === 'analytics' ? 'laboratory' : 'laboratory-dashboard';
            if (message.mode !== currentMode) {
              console.log('[CollaborativeSync] Ignoring card_update from different mode:', {
                cardId: message.card_id,
                messageMode: message.mode,
                currentMode,
              });
              break;
            }
          }

          isApplyingRemoteUpdateRef.current = true;

          // Update only the specific card
          // Note: The store's setCards will apply mode filtering if in dashboard mode
          updateCard(message.card_id, message.payload);

          // Update lastCardsRef to reflect this change immediately
          // This prevents detecting this as a "new" change in the next cycle
          const currentCards = cards || [];
          lastCardsRef.current = currentCards.map((c) =>
            c.id === message.card_id ? message.payload : c
          );

          // Reset timestamp to allow future updates
          lastLocalChangeTimestampRef.current = 0;

          // Reset flag after a brief delay
          setTimeout(() => {
            isApplyingRemoteUpdateRef.current = false;
          }, 100);
        }
        break;

      case 'state_update':
      case 'full_sync':
        if (message.payload && message.payload.cards) {
          // CRITICAL FIX: Check mode compatibility before applying remote updates
          const messageMode = message.payload.mode;
          const currentMode = subMode === 'analytics' ? 'laboratory' : 'laboratory-dashboard';

          if (messageMode && messageMode !== currentMode) {
            console.warn('[CollaborativeSync] Ignoring message from different mode:', {
              messageMode,
              currentMode,
              subMode,
              messageType: message.type,
            });
            break; // Don't apply updates from different mode
          }

          // Parse message timestamp
          const messageTimestamp = message.timestamp ? new Date(message.timestamp).getTime() : 0;

          // Ignore if we have pending local changes that are newer
          // Add a 500ms buffer to account for network latency
          if (lastLocalChangeTimestampRef.current > 0 &&
            messageTimestamp < lastLocalChangeTimestampRef.current - 500) {
            console.log('[CollaborativeSync] Ignoring stale full_sync', {
              messageTime: messageTimestamp,
              lastLocalChange: lastLocalChangeTimestampRef.current,
            });
            break;
          }

          // Apply remote full update
          isApplyingRemoteUpdateRef.current = true;
          setCards(message.payload.cards);
          lastCardsRef.current = message.payload.cards;

          // Update auxiliaryMenuLeftOpen if present in payload
          if (message.payload.auxiliaryMenuLeftOpen !== undefined) {
            setAuxiliaryMenuLeftOpen(message.payload.auxiliaryMenuLeftOpen);
          }

          // Update last state to prevent echo
          const stateData = serializeState();
          if (stateData) {
            lastStateRef.current = stateData.serialized;
          }

          // Reset timestamp to allow future updates
          lastLocalChangeTimestampRef.current = 0;

          // Reset flag after a brief delay
          setTimeout(() => {
            isApplyingRemoteUpdateRef.current = false;
          }, 100);
        }
        break;

      case 'card_focus':
        // Another user focused on a card
        if (message.card_id && message.user_email) {
          setCardEditors((prev) => {
            const newMap = new Map(prev);
            const userColor = getUserColor(message.user_email || 'unknown');
            newMap.set(message.card_id!, {
              card_id: message.card_id!,
              user_email: message.user_email!,
              user_name: message.user_name || message.user_email!,
              user_color: userColor,
              client_id: message.client_id!,
            });
            return newMap;
          });
        }
        break;

      case 'card_blur':
        // Another user unfocused from a card
        if (message.card_id) {
          setCardEditors((prev) => {
            const newMap = new Map(prev);
            newMap.delete(message.card_id!);
            return newMap;
          });
        }
        break;

      case 'user_list_update':
        if (message.payload && message.payload.users) {
          const users = message.payload.users as ActiveUser[];
          // Assign colors to users
          const usersWithColors = users.map(u => ({
            ...u,
            color: getUserColor(u.email),
          }));
          setActiveUsers(usersWithColors);
          onUsersChangedRef.current(usersWithColors);
        }
        break;

      case 'ack':
        // Acknowledgment received
        break;

      case 'error':
        onErrorRef.current(new Error(message.payload?.message || 'WebSocket error'));
        break;

      case 'heartbeat':
        // Respond to heartbeat
        sendMessage({ type: 'heartbeat', client_id: clientIdRef.current });
        break;

      default:
        console.warn('[CollaborativeSync] Unknown message type:', message.type);
    }
  } catch (error) {
    onErrorRef.current(error as Error);
  }
}, [setCards, serializeState, sendMessage]);

const handleMessageRef = useRef(handleMessage);
useEffect(() => {
  handleMessageRef.current = handleMessage;
}, [handleMessage]);

const sendFullSyncRef = useRef(sendFullSync);
useEffect(() => {
  sendFullSyncRef.current = sendFullSync;
}, [sendFullSync]);

// CRITICAL FIX: Notify backend immediately when mode changes (same device scenario)
// This must be defined AFTER serializeState to avoid "Cannot access before initialization" error
useEffect(() => {
  if (!enabled) return;

  // Skip on initial mount (when previousSubModeRef is undefined)
  if (previousSubModeRef.current === undefined) {
    previousSubModeRef.current = subMode;
    return;
  }

  // Only act if mode actually changed
  if (previousSubModeRef.current === subMode) {
    return;
  }

  console.log('[CollaborativeSync] 🔄 Mode changed, updating backend:', {
    from: previousSubModeRef.current,
    to: subMode,
  });

  // Update ref immediately
  previousSubModeRef.current = subMode;

  // If WebSocket is connected, send a connect message with new mode to update backend
  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
    const projectContext = getActiveProjectContext();
    const currentUser = userRef.current;
    const currentMode = subMode === 'analytics' ? 'laboratory' : 'laboratory-dashboard';

    // Send connect message with new mode to update backend's tracked mode
    sendMessage({
      type: 'connect',
      client_id: clientIdRef.current,
      user_email: currentUser?.email || 'Anonymous',
      user_name:
        currentUser?.username ||
        currentUser?.email ||
        'Anonymous User',
      project_context: projectContext || undefined,
      payload: {
        mode: currentMode,
      },
      timestamp: new Date().toISOString(),
    });

    // Also send a full_sync with current state (empty cards after mode switch) to clear backend's pending state
    // This ensures backend knows we've switched modes and clears any old mode state
    setTimeout(() => {
      const stateData = serializeState();
      if (stateData && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('[CollaborativeSync] Sending full_sync after mode switch:', {
          mode: currentMode,
          cardsCount: stateData.config.cards?.length || 0,
        });
        sendMessage({
          type: 'full_sync',
          payload: stateData.config,
          timestamp: new Date().toISOString(),
          client_id: clientIdRef.current,
          project_context: projectContext || undefined,
        });
      }
    }, 100); // Small delay to ensure cards are cleared first
  }
}, [subMode, enabled, sendMessage, serializeState]);

// Connect to WebSocket
const connect = useCallback(() => {
  if (!enabled) return;

  try {
    const wsUrl = getWebSocketUrl();
    console.log('[CollaborativeSync] Connecting to:', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    manualCloseRef.current = false;

    ws.onopen = () => {
      console.log('[CollaborativeSync] Connected');
      setIsConnected(true);
      hasInitialFullSyncRef.current = false;
      onConnectedRef.current?.();

      // Send initial connection message with user info and mode
      const projectContext = getActiveProjectContext();
      const currentUser = userRef.current;
      const currentMode = subMode === 'analytics' ? 'laboratory' : 'laboratory-dashboard';

      // CRITICAL FIX: Include mode in connect message payload so backend can track client mode
      sendMessage({
        type: 'connect',
        client_id: clientIdRef.current,
        user_email: currentUser?.email || 'Anonymous',
        user_name:
          currentUser?.username ||
          currentUser?.email ||
          'Anonymous User',
        project_context: projectContext || undefined,
        payload: {
          mode: currentMode,
        },
        timestamp: new Date().toISOString(),
      });

      // Send initial full sync after a short delay to allow cards to load
      setTimeout(() => {
        const latestCards = useLaboratoryStore.getState().cards || [];
        if (latestCards.length > 0 && !hasInitialFullSyncRef.current) {
          hasInitialFullSyncRef.current = true;
          sendFullSyncRef.current();
          console.log('[CollaborativeSync] Initial full sync sent with', latestCards.length, 'cards');
        }
      }, 100);

      // Start periodic full sync
      fullSyncTimerRef.current = setInterval(() => {
        sendFullSyncRef.current();
      }, fullSyncIntervalMs);

      // Start heartbeat
      heartbeatIntervalRef.current = setInterval(() => {
        sendMessage({ type: 'heartbeat', client_id: clientIdRef.current });
      }, 15000); // 15 seconds
    };

    ws.onmessage = (event) => handleMessageRef.current(event);

    ws.onerror = (error) => {
      console.error('[CollaborativeSync] WebSocket error:', error);
      onErrorRef.current(new Error('WebSocket connection error'));
    };

    ws.onclose = () => {
      console.log('[CollaborativeSync] Disconnected');
      setIsConnected(false);
      hasInitialFullSyncRef.current = false;
      onDisconnectedRef.current?.();

      // Clear timers
      if (fullSyncTimerRef.current) {
        clearInterval(fullSyncTimerRef.current);
        fullSyncTimerRef.current = null;
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      // Attempt reconnection after 3 seconds
      if (!manualCloseRef.current && enabled) {
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[CollaborativeSync] Attempting reconnection...');
          connect();
        }, 3000);
      }
    };
  } catch (error) {
    onErrorRef.current(error as Error);
  }
}, [enabled, fullSyncIntervalMs, getWebSocketUrl, sendMessage]);

// Disconnect from WebSocket
const disconnect = useCallback(() => {
  manualCloseRef.current = true;
  if (wsRef.current) {
    wsRef.current.close();
    wsRef.current = null;
  }

  if (debounceTimerRef.current) {
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
  }

  if (fullSyncTimerRef.current) {
    clearInterval(fullSyncTimerRef.current);
    fullSyncTimerRef.current = null;
  }

  if (heartbeatIntervalRef.current) {
    clearInterval(heartbeatIntervalRef.current);
    heartbeatIntervalRef.current = null;
  }

  if (initialFullSyncTimeoutRef.current) {
    clearTimeout(initialFullSyncTimeoutRef.current);
    initialFullSyncTimeoutRef.current = null;
  }

  if (reconnectTimeoutRef.current) {
    clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = null;
  }
}, []);

// Watch for state changes and debounce updates
useEffect(() => {
  if (!enabled) return;

  // Skip if applying remote update
  if (isApplyingRemoteUpdateRef.current) {
    return;
  }

  // Record that a local change just happened
  lastLocalChangeTimestampRef.current = Date.now();

  // Clear existing debounce timer
  if (debounceTimerRef.current) {
    clearTimeout(debounceTimerRef.current);
  }

  // Set new debounce timer
  debounceTimerRef.current = setTimeout(() => {
    sendStateUpdate();
  }, debounceMs);

  return () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  };
}, [cards, enabled, debounceMs, sendStateUpdate]);

// Connect on mount, disconnect on unmount
useEffect(() => {
  if (enabled) {
    connect();
  }

  return () => {
    disconnect();
  };
}, [enabled, connect, disconnect]);

// Resend user details when identity information becomes available
useEffect(() => {
  if (!user || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
    return;
  }

  const projectContext = getActiveProjectContext();
  sendMessage({
    type: 'connect',
    client_id: clientIdRef.current,
    user_email: user.email,
    user_name: user.username || user.email,
    project_context: projectContext || undefined,
    timestamp: new Date().toISOString(),
  });
}, [user, sendMessage]);

// Ensure the backend receives a full snapshot once cards are loaded
useEffect(() => {
  if (!enabled || !isConnected) {
    return;
  }

  if (hasInitialFullSyncRef.current) {
    return;
  }

  if (initialFullSyncTimeoutRef.current) {
    clearTimeout(initialFullSyncTimeoutRef.current);
    initialFullSyncTimeoutRef.current = null;
  }

  const triggerFullSync = () => {
    if (!enabled || !isConnected) {
      return;
    }
    if (hasInitialFullSyncRef.current) {
      return;
    }
    const latestCards = useLaboratoryStore.getState().cards || [];
    if (!Array.isArray(latestCards) || latestCards.length === 0) {
      return;
    }
    hasInitialFullSyncRef.current = true;
    sendFullSyncRef.current();
  };

  if (isApplyingRemoteUpdateRef.current) {
    if (!initialFullSyncTimeoutRef.current) {
      initialFullSyncTimeoutRef.current = setTimeout(() => {
        initialFullSyncTimeoutRef.current = null;
        triggerFullSync();
      }, 250);
    }
    return;
  }

  triggerFullSync();
}, [enabled, isConnected, cards]);

return {
  isConnected,
  clientId: clientIdRef.current,
  activeUsers,
  cardEditors,
  notifyCardFocus,
  notifyCardBlur,
  disconnect,
  reconnect: connect,
};
}

