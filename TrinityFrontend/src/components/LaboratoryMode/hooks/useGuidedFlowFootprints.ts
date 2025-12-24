import { useCallback, useRef, useMemo } from 'react';
import { UPLOAD_API } from '@/lib/api';
import { getActiveProjectContext, type ProjectContext } from '@/utils/projectEnv';
import type { GuidedUploadFlowState } from '@/components/AtomList/atoms/data-upload/components/guided-upload/useGuidedUploadFlow';

export interface FootprintEvent {
  session_id: string;
  event_type: string; // "click", "edit", "navigation", "selection", etc.
  stage: string; // "U2", "U3", "U4", "U5", "U6"
  action: string; // "header_selection", "column_edit", "data_type_change", etc.
  target: string; // What was interacted with (column name, button, etc.)
  details?: Record<string, any>;
  before_value?: any;
  after_value?: any;
  metadata?: Record<string, any>;
}

interface EventQueueItem {
  event: FootprintEvent;
  timestamp: number;
  retries: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second
const BATCH_DELAY = 500; // 500ms for batching
const MAX_QUEUE_SIZE = 100;

export function useGuidedFlowFootprints() {
  const projectContextRef = useRef<ProjectContext | null>(null);
  const sessionIdRef = useRef<string>((() => {
    // Generate unique session ID
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  })());
  const eventQueueRef = useRef<EventQueueItem[]>([]);
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);

  // Initialize project context
  projectContextRef.current = getActiveProjectContext();

  // Get project context
  const getContext = useCallback((): ProjectContext | null => {
    return projectContextRef.current || getActiveProjectContext();
  }, []);

  // Add event to queue
  const addToQueue = useCallback((event: FootprintEvent) => {
    if (eventQueueRef.current.length >= MAX_QUEUE_SIZE) {
      // Remove oldest event if queue is full
      eventQueueRef.current.shift();
    }
    eventQueueRef.current.push({
      event,
      timestamp: Date.now(),
      retries: 0,
    });
  }, []);

  // Send single event to backend
  const sendEventToBackend = useCallback(async (
    event: FootprintEvent,
    context: ProjectContext
  ): Promise<void> => {
    const payload = {
      ...event,
      client_name: context.client_name || '',
      app_name: context.app_name || '',
      project_name: context.project_name || '',
      user_id: context.user_id || '',
    };

    const res = await fetch(`${UPLOAD_API}/guided-workflow/track-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to track event: ${res.status} ${errorText}`);
    }
  }, []);

  // Process event queue (send batch)
  const processEventQueue = useCallback(async () => {
    if (isProcessingRef.current || eventQueueRef.current.length === 0) {
      return;
    }

    isProcessingRef.current = true;
    const context = getContext();
    if (!context) {
      console.warn('[useGuidedFlowFootprints] No project context, clearing queue');
      eventQueueRef.current = [];
      isProcessingRef.current = false;
      return;
    }

    // Get events to send
    const eventsToSend = eventQueueRef.current.splice(0, 50); // Send up to 50 at a time
    const events = eventsToSend.map(item => ({
      ...item.event,
      client_name: context.client_name || '',
      app_name: context.app_name || '',
      project_name: context.project_name || '',
      user_id: context.user_id || '',
    }));

    try {
      const res = await fetch(`${UPLOAD_API}/guided-workflow/track-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ events }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to track batch: ${res.status} ${errorText}`);
      }

      // Success - events are sent
      console.log(`[useGuidedFlowFootprints] Successfully sent ${events.length} events`);
    } catch (error) {
      console.error('[useGuidedFlowFootprints] Failed to send batch:', error);
      // Re-add failed events to queue with retry count
      eventsToSend.forEach(item => {
        if (item.retries < MAX_RETRIES) {
          item.retries++;
          eventQueueRef.current.push(item);
        } else {
          console.warn('[useGuidedFlowFootprints] Event dropped after max retries:', item.event);
        }
      });
    } finally {
      isProcessingRef.current = false;
      // Process remaining events if any
      if (eventQueueRef.current.length > 0) {
        setTimeout(() => processEventQueue(), RETRY_DELAY);
      }
    }
  }, [getContext]);

  // Track a single event
  const trackEvent = useCallback(async (
    event: Omit<FootprintEvent, 'session_id'>,
    options?: { immediate?: boolean; skipQueue?: boolean }
  ): Promise<void> => {
    const context = getContext();
    if (!context) {
      console.warn('[useGuidedFlowFootprints] No project context available, skipping event');
      return;
    }

    const fullEvent: FootprintEvent = {
      ...event,
      session_id: sessionIdRef.current,
    };

    // If immediate flag is set, send right away (for critical events)
    if (options?.immediate || options?.skipQueue) {
      try {
        await sendEventToBackend(fullEvent, context);
      } catch (error) {
        console.error('[useGuidedFlowFootprints] Failed to send immediate event:', error);
        // Add to queue for retry
        addToQueue(fullEvent);
      }
      return;
    }

    // Add to queue for batching
    addToQueue(fullEvent);

    // Schedule batch send
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
    }
    batchTimeoutRef.current = setTimeout(() => {
      processEventQueue();
    }, BATCH_DELAY);
  }, [getContext, sendEventToBackend, addToQueue, processEventQueue]);

  // Track multiple events in batch
  const trackBatch = useCallback(async (
    events: Omit<FootprintEvent, 'session_id'>[]
  ): Promise<void> => {
    const context = getContext();
    if (!context) {
      console.warn('[useGuidedFlowFootprints] No project context, skipping batch');
      return;
    }

    const fullEvents: FootprintEvent[] = events.map(event => ({
      ...event,
      session_id: sessionIdRef.current,
    }));

    try {
      const payload = {
        events: fullEvents.map(event => ({
          ...event,
          client_name: context.client_name || '',
          app_name: context.app_name || '',
          project_name: context.project_name || '',
          user_id: context.user_id || '',
        })),
      };

      const res = await fetch(`${UPLOAD_API}/guided-workflow/track-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to track batch: ${res.status} ${errorText}`);
      }
    } catch (error) {
      console.error('[useGuidedFlowFootprints] Failed to send batch:', error);
      // Add to queue for retry
      fullEvents.forEach(event => addToQueue(event));
    }
  }, [getContext, addToQueue]);

  // Get latest workflow summary
  const getSummary = useCallback(async (
    file_name?: string
  ): Promise<any | null> => {
    const context = getContext();
    if (!context) {
      console.warn('[useGuidedFlowFootprints] No project context, cannot get summary');
      return null;
    }

    try {
      const params = new URLSearchParams({
        client_name: context.client_name || '',
        app_name: context.app_name || '',
        project_name: context.project_name || '',
      });
      if (file_name) {
        params.append('file_name', file_name);
      }

      const res = await fetch(
        `${UPLOAD_API}/guided-workflow/get-summary?${params.toString()}`,
        { credentials: 'include' }
      );

      if (res.ok) {
        const data = await res.json();
        if (data?.status === 'success' && data?.summary) {
          return data.summary;
        }
      }
    } catch (error) {
      console.error('[useGuidedFlowFootprints] Failed to get summary:', error);
    }

    return null;
  }, [getContext]);

  // Save workflow summary
  const saveSummary = useCallback(async (
    current_stage: string,
    state: Partial<GuidedUploadFlowState>,
    file_name?: string
  ): Promise<void> => {
    const context = getContext();
    if (!context) {
      console.warn('[useGuidedFlowFootprints] No project context, cannot save summary');
      return;
    }

    try {
      const payload = {
        session_id: sessionIdRef.current,
        current_stage,
        client_name: context.client_name || '',
        app_name: context.app_name || '',
        project_name: context.project_name || '',
        user_id: context.user_id || '',
        uploaded_files: state.uploadedFiles || [],
        header_selections: state.headerSelections || {},
        column_name_edits: state.columnNameEdits || {},
        data_type_selections: state.dataTypeSelections || {},
        missing_value_strategies: state.missingValueStrategies || {},
        file_metadata: state.fileMetadata || {},
      };

      if (file_name) {
        payload.file_name = file_name;
      }

      const res = await fetch(`${UPLOAD_API}/guided-workflow/save-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.warn('[useGuidedFlowFootprints] Failed to save summary:', errorText);
      }
    } catch (error) {
      console.error('[useGuidedFlowFootprints] Failed to save summary:', error);
    }
  }, [getContext]);

  // Get events for current session
  const getEvents = useCallback(async (
    file_name?: string,
    limit: number = 1000
  ): Promise<FootprintEvent[]> => {
    const context = getContext();
    if (!context) {
      console.warn('[useGuidedFlowFootprints] No project context, cannot get events');
      return [];
    }

    try {
      const params = new URLSearchParams({
        client_name: context.client_name || '',
        app_name: context.app_name || '',
        project_name: context.project_name || '',
        session_id: sessionIdRef.current,
        limit: limit.toString(),
      });
      if (file_name) {
        params.append('file_name', file_name);
      }

      const res = await fetch(
        `${UPLOAD_API}/guided-workflow/get-events?${params.toString()}`,
        { credentials: 'include' }
      );

      if (res.ok) {
        const data = await res.json();
        if (data?.status === 'success' && data?.events) {
          return data.events;
        }
      }
    } catch (error) {
      console.error('[useGuidedFlowFootprints] Failed to get events:', error);
    }

    return [];
  }, [getContext]);

  // Flush queue (send all pending events)
  const flushQueue = useCallback(async (): Promise<void> => {
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
      batchTimeoutRef.current = null;
    }
    await processEventQueue();
  }, [processEventQueue]);

  return {
    trackEvent,
    trackBatch,
    getSummary,
    saveSummary,
    getEvents,
    flushQueue,
    sessionId: sessionIdRef.current,
  };
}
