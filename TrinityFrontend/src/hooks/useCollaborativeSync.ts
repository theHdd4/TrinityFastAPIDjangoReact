import { useEffect, useRef, useCallback, useState } from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { sanitizeLabConfig } from '@/utils/projectStorage';
import { safeStringify } from '@/utils/safeStringify';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { useAuth } from '@/contexts/AuthContext';

// WebSocket message types
export type WSMessageType =
  | 'connect'
  | 'state_update'
  | 'card_update'  // New: granular card-level update
  | 'card_focus'   // New: user focused on a card
  | 'card_blur'    // New: user unfocused from a card
  | 'full_sync'
  | 'ack'
  | 'resume'
  | 'resume_ack'
  | 'session_ack'
  | 'close_session'
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
  session_id?: string;
  sequence?: number;
  last_acked_sequence?: number;
  op?: 'ping' | 'pong';
  reason?: string;
  user_email?: string;
  user_name?: string;
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
  onUsersChanged: () => {},
};

const CLIENT_HEARTBEAT_INTERVAL_MS = 20000;

function clearSharedHeartbeat() {
  if (sharedSocketState.heartbeatInterval) {
    clearInterval(sharedSocketState.heartbeatInterval);
    sharedSocketState.heartbeatInterval = null;
  }
}

function scheduleHeartbeat(send: () => void) {
  clearSharedHeartbeat();
  sharedSocketState.heartbeatInterval = setInterval(() => {
    send();
  }, CLIENT_HEARTBEAT_INTERVAL_MS);
}

function resetReconnectTimer() {
  if (sharedSocketState.reconnectTimeout) {
    clearTimeout(sharedSocketState.reconnectTimeout);
    sharedSocketState.reconnectTimeout = null;
  }
  sharedSocketState.reconnectAttempts = 0;
}

function scheduleReconnect(connectFn: () => void) {
  if (sharedSocketState.manualClose || sharedSocketState.reconnectTimeout) {
    return;
  }

  const attempt = sharedSocketState.reconnectAttempts + 1;
  sharedSocketState.reconnectAttempts = attempt;
  const backoff = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5)) + Math.random() * 500;
  sharedSocketState.reconnectTimeout = setTimeout(() => {
    sharedSocketState.reconnectTimeout = null;
    connectFn();
  }, backoff);
}

function ensureSharedSocket(
  urlFactory: () => string,
  onOpen?: () => void,
  onClose?: (ev: CloseEvent) => void,
  onError?: (ev: Event) => void,
) {
  if (sharedSocketState.ws &&
      (sharedSocketState.ws.readyState === WebSocket.OPEN ||
       sharedSocketState.ws.readyState === WebSocket.CONNECTING)) {
    return sharedSocketState.ws;
  }

  const wsUrl = urlFactory();
  const socket = new WebSocket(wsUrl);
  sharedSocketState.ws = socket;
  sharedSocketState.manualClose = false;

  socket.addEventListener('message', dispatchMessage);

  socket.addEventListener('open', () => {
    resetReconnectTimer();
    notifyConnectionListeners(true);
    onOpen?.();
  });

  socket.addEventListener('close', (ev) => {
    notifyConnectionListeners(false);
    clearSharedHeartbeat();
    onClose?.(ev);
    if (!sharedSocketState.manualClose) {
      scheduleReconnect(() => ensureSharedSocket(urlFactory, onOpen, onClose, onError));
    }
  });

  socket.addEventListener('error', (ev) => {
    onError?.(ev);
  });

  return socket;
}

type MessageListener = (event: MessageEvent) => void;
type ConnectionListener = (connected: boolean) => void;

const sharedSocketState: {
  ws: WebSocket | null;
  listeners: Set<MessageListener>;
  connectionListeners: Set<ConnectionListener>;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  heartbeatInterval: ReturnType<typeof setInterval> | null;
  reconnectAttempts: number;
  manualClose: boolean;
} = {
  ws: null,
  listeners: new Set(),
  connectionListeners: new Set(),
  reconnectTimeout: null,
  heartbeatInterval: null,
  reconnectAttempts: 0,
  manualClose: false,
};

const dispatchMessage = (event: MessageEvent) => {
  sharedSocketState.listeners.forEach((listener) => listener(event));
};

const notifyConnectionListeners = (connected: boolean) => {
  sharedSocketState.connectionListeners.forEach((listener) => listener(connected));
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

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullSyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStateRef = useRef<string>('');
  const lastCardsRef = useRef<any[]>([]);  // Track previous cards for diff
  const lastLocalChangeTimestampRef = useRef<number>(0);  // Track when we last made a local change
  const clientIdRef = useRef<string>(`client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const isApplyingRemoteUpdateRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const manualCloseRef = useRef(false);
  const hasInitialFullSyncRef = useRef(false);
  const initialFullSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string>('');
  const lastAckSequenceRef = useRef<number>(0);
  
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [cardEditors, setCardEditors] = useState<Map<string, CardEditor>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  
  const cards = useLaboratoryStore(state => state.cards);
  const setCards = useLaboratoryStore(state => state.setCards);
  const updateCard = useLaboratoryStore(state => state.updateCard);
  const auxiliaryMenuLeftOpen = useLaboratoryStore(state => state.auxiliaryMenuLeftOpen);
  const setAuxiliaryMenuLeftOpen = useLaboratoryStore(state => state.setAuxiliaryMenuLeftOpen);
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

  const getSessionStorageKey = useCallback(() => {
    const projectContext = getActiveProjectContext();
    if (!projectContext) {
      return 'lab_ws_session_global';
    }
    return `lab_ws_session_${projectContext.client_name}_${projectContext.app_name}_${projectContext.project_name}`;
  }, []);

  const loadSessionState = useCallback(() => {
    if (typeof window === 'undefined') return '';

    const storageKey = getSessionStorageKey();
    let sessionId = sessionStorage.getItem(storageKey);

    if (!sessionId) {
      sessionId =
        (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
          ? crypto.randomUUID()
          : `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(storageKey, sessionId);
    }

    sessionIdRef.current = sessionId;

    const lastAck = Number(sessionStorage.getItem(`${storageKey}_lastAck`) || '0');
    lastAckSequenceRef.current = Number.isFinite(lastAck) ? lastAck : 0;

    return sessionId;
  }, [getSessionStorageKey]);

  const persistLastAck = useCallback(
    (sequence?: number) => {
      if (!sequence || sequence <= 0 || typeof window === 'undefined') return;
      const storageKey = getSessionStorageKey();
      sessionStorage.setItem(`${storageKey}_lastAck`, sequence.toString());
      lastAckSequenceRef.current = sequence;
    },
    [getSessionStorageKey],
  );

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

    const sessionId = sessionIdRef.current || loadSessionState();
    const params = new URLSearchParams({
      session_id: sessionId,
      resume: '1',
    });

    const wsUrl = `${baseUrl}/api/laboratory/sync/${projectContext.client_name}/${projectContext.app_name}/${projectContext.project_name}?${params.toString()}`;
    return wsUrl;
  }, [loadSessionState]);

  // Serialize current state
  const serializeState = useCallback(() => {
    try {
      const projectContext = getActiveProjectContext();
      if (!projectContext) return null;

      const labConfig = {
        cards: cards || [],
        auxiliaryMenuLeftOpen: auxiliaryMenuLeftOpen,
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
  }, [cards, auxiliaryMenuLeftOpen]);

  // Send message via WebSocket
  const sendMessage = useCallback((message: WSMessage) => {
    const socket = sharedSocketState.ws;
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        const payload: WSMessage = {
          session_id: sessionIdRef.current || undefined,
          ...message,
        };
        socket.send(JSON.stringify(payload));
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

      if (typeof message.sequence === 'number') {
        persistLastAck(message.sequence);
      }

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
        case 'session_ack':
          if (message.session_id) {
            sessionIdRef.current = message.session_id;
            const storageKey = getSessionStorageKey();
            if (typeof window !== 'undefined') {
              sessionStorage.setItem(storageKey, message.session_id);
            }
          }
          break;

        case 'resume_ack':
          if (typeof message.last_acked_sequence === 'number') {
            persistLastAck(message.last_acked_sequence);
          }
          break;

        case 'card_update':
          // Apply single card update
          if (message.card_id && message.payload) {
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
            
            isApplyingRemoteUpdateRef.current = true;
            
            // Update only the specific card
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
          // Respond to heartbeat ping
          if (message.op === 'ping') {
            sendMessage({ type: 'heartbeat', op: 'pong', client_id: clientIdRef.current });
          }
          break;

        default:
          console.warn('[CollaborativeSync] Unknown message type:', message.type);
      }
    } catch (error) {
      onErrorRef.current(error as Error);
    }
  }, [getSessionStorageKey, persistLastAck, serializeState, sendMessage, setCards]);

  const handleMessageRef = useRef(handleMessage);
  useEffect(() => {
    handleMessageRef.current = handleMessage;
  }, [handleMessage]);

  const sendFullSyncRef = useRef(sendFullSync);
  useEffect(() => {
    sendFullSyncRef.current = sendFullSync;
  }, [sendFullSync]);

  // Connect to WebSocket (shared singleton)
  const connect = useCallback(() => {
    if (!enabled) return;

    try {
      const sessionId = loadSessionState();
      const wsUrlFactory = () => getWebSocketUrl();
      manualCloseRef.current = false;
      sharedSocketState.manualClose = false;

      const onOpen = () => {
        console.log('[CollaborativeSync] Connected');
        setIsConnected(true);
        hasInitialFullSyncRef.current = false;
        reconnectAttemptsRef.current = 0;
        onConnectedRef.current?.();

        // Attempt resume before sending additional data
        sendMessage({
          type: 'resume',
          session_id: sessionId || sessionIdRef.current,
          last_acked_sequence: lastAckSequenceRef.current,
          client_id: clientIdRef.current,
          timestamp: new Date().toISOString(),
        });

        // Send initial connection message with user info
        const projectContext = getActiveProjectContext();
        const currentUser = userRef.current;
        sendMessage({
          type: 'connect',
          client_id: clientIdRef.current,
          user_email: currentUser?.email || 'Anonymous',
          user_name:
            currentUser?.username ||
            currentUser?.email ||
            'Anonymous User',
          project_context: projectContext || undefined,
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

        // Start periodic full sync (once per hook instance)
        if (!fullSyncTimerRef.current) {
          fullSyncTimerRef.current = setInterval(() => {
            sendFullSyncRef.current();
          }, fullSyncIntervalMs);
        }

        scheduleHeartbeat(() => {
          sendMessage({ type: 'heartbeat', op: 'pong', client_id: clientIdRef.current });
        });
      };

      const onClose = (event: CloseEvent) => {
        console.log('[CollaborativeSync] Disconnected', event.code, event.reason);
        setIsConnected(false);
        hasInitialFullSyncRef.current = false;
        onDisconnectedRef.current?.();

        if (typeof window !== 'undefined' && event.code === 4001) {
          const storageKey = getSessionStorageKey();
          sessionStorage.removeItem(storageKey);
          sessionStorage.removeItem(`${storageKey}_lastAck`);
          sessionIdRef.current = '';
          lastAckSequenceRef.current = 0;
        }

        if (fullSyncTimerRef.current) {
          clearInterval(fullSyncTimerRef.current);
          fullSyncTimerRef.current = null;
        }
      };

      const onError = (event: Event) => {
        console.error('[CollaborativeSync] WebSocket error:', event);
        onErrorRef.current(new Error('WebSocket connection error'));
      };

      ensureSharedSocket(wsUrlFactory, onOpen, onClose, onError);

      const listener: MessageListener = (event) => handleMessageRef.current(event);
      const connectionListener: ConnectionListener = (connected) => setIsConnected(connected);

      sharedSocketState.listeners.add(listener);
      sharedSocketState.connectionListeners.add(connectionListener);

      return () => {
        sharedSocketState.listeners.delete(listener);
        sharedSocketState.connectionListeners.delete(connectionListener);
      };
    } catch (error) {
      onErrorRef.current(error as Error);
      return undefined;
    }
  }, [enabled, fullSyncIntervalMs, getSessionStorageKey, getWebSocketUrl, loadSessionState, sendMessage]);

  // Disconnect from WebSocket (does not close shared socket unless explicitly requested)
  const disconnect = useCallback((endSession = false, reason = 'client_closed') => {
    manualCloseRef.current = true;
    sharedSocketState.manualClose = endSession || sharedSocketState.manualClose;

    const socket = sharedSocketState.ws;
    if (socket && socket.readyState === WebSocket.OPEN) {
      if (endSession) {
        sendMessage({ type: 'close_session', reason });
      }
      if (endSession) {
        socket.close(1000, reason);
      }
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (fullSyncTimerRef.current) {
      clearInterval(fullSyncTimerRef.current);
      fullSyncTimerRef.current = null;
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
    let unsubscribe: (() => void) | undefined;
    if (enabled) {
      unsubscribe = connect() as (() => void) | undefined;
    }

    return () => {
      unsubscribe?.();
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  // Resend user details when identity information becomes available
  useEffect(() => {
    const socket = sharedSocketState.ws;
    if (!user || !socket || socket.readyState !== WebSocket.OPEN) {
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

  const endSession = useCallback(
    (reason = 'session ended') => {
      disconnect(true, reason);
      if (typeof window !== 'undefined') {
        const storageKey = getSessionStorageKey();
        sessionStorage.removeItem(storageKey);
        sessionStorage.removeItem(`${storageKey}_lastAck`);
      }
      sessionIdRef.current = '';
      lastAckSequenceRef.current = 0;
    },
    [disconnect, getSessionStorageKey],
  );

  return {
    isConnected,
    clientId: clientIdRef.current,
    activeUsers,
    cardEditors,
    notifyCardFocus,
    notifyCardBlur,
    disconnect,
    endSession,
    reconnect: connect,
  };
}

