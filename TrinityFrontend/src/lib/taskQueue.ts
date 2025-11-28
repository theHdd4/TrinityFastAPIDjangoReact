import { TASK_QUEUE_API } from './api';

export interface TaskEnvelope<T> {
  task_id?: string;
  task_status?: string;
  status?: string;
  result?: T;
  error?: string;
  [key: string]: unknown;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForTaskResult<T = any>(initial: TaskEnvelope<T>, maxAttempts: number = 60, timeoutMs: number = 300000): Promise<T> {
  const initialStatus = (initial.task_status || initial.status || '').toLowerCase();
  if (initialStatus === 'success') {
    if (initial.result && typeof initial.result === 'object') {
      return initial.result as T;
    }
    return initial as unknown as T;
  }

  const taskId = initial.task_id || (initial.result as TaskEnvelope<T> | undefined)?.task_id;
  if (!taskId) {
    throw new Error('Task identifier missing from response');
  }

  const startTime = Date.now();
  let attempt = 0;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5;
  
  while (attempt < maxAttempts) {
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Task polling timeout after ${timeoutMs}ms (${attempt} attempts)`);
    }

    // Exponential backoff with jitter, but cap at 10 seconds for very long operations
    const baseDelay = Math.min(1000 * Math.pow(1.5, Math.min(attempt, 10)), 10000);
    const jitter = Math.random() * 500;
    const sleep = baseDelay + jitter;
    await delay(sleep);
    attempt += 1;

    try {
      const response = await fetch(`${TASK_QUEUE_API}/${taskId}`, {
        credentials: 'include',
        // Increase timeout for fetch to prevent connection resets
        signal: AbortSignal.timeout(30000), // 30 second timeout per request
      });
      if (!response.ok) {
        // Reset consecutive errors on successful HTTP response (even if not 200)
        consecutiveErrors = 0;
        throw new Error(`Failed to fetch task status (${response.status})`);
      }
      const payload: TaskEnvelope<T> = await response.json();
      consecutiveErrors = 0; // Reset on successful fetch
      const status = (payload.status || payload.task_status || '').toLowerCase();
      if (status === 'success') {
        if (payload.result && typeof payload.result === 'object') {
          return payload.result as T;
        }
        return payload as unknown as T;
      }
      if (status === 'failure') {
        throw new Error(payload.error ? String(payload.error) : 'Task failed');
      }
    } catch (error) {
      consecutiveErrors += 1;
      
      // If too many consecutive errors, fail early
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        throw new Error(`Task polling failed after ${consecutiveErrors} consecutive errors: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // If it's the last attempt, throw the error
      if (attempt >= maxAttempts) {
        throw error;
      }
      
      // Otherwise, continue polling (might be a transient network error)
      // Use longer delay after errors
      const errorDelay = Math.min(2000 * consecutiveErrors, 10000);
      await delay(errorDelay);
      console.warn(`Task polling attempt ${attempt} failed, retrying in ${errorDelay}ms...`, error);
    }
  }

  throw new Error(`Task did not complete after ${maxAttempts} attempts (${timeoutMs}ms timeout)`);
}

export function isTaskEnvelope<T = any>(value: unknown): value is TaskEnvelope<T> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const envelope = value as TaskEnvelope<T>;
  return typeof envelope.task_id === 'string' || typeof envelope.task_status === 'string';
}

export async function resolveTaskResponse<T = any>(value: unknown, timeoutMs?: number, maxAttempts?: number): Promise<T> {
  if (isTaskEnvelope<T>(value)) {
    // For unpivot operations, use longer timeout (15 minutes) and more attempts
    // Check if this is an unpivot task by looking at the response structure
    const envelope = value as TaskEnvelope<T>;
    const isUnpivotTask = envelope.task_id && (
      (envelope as any).feature === 'unpivot' || 
      (envelope as any).operation === 'compute' ||
      (envelope as any).metadata?.feature === 'unpivot'
    );
    
    // Use longer timeout for unpivot operations (15 minutes) vs default (5 minutes)
    const effectiveTimeout = timeoutMs ?? (isUnpivotTask ? 900000 : 300000);
    const effectiveMaxAttempts = maxAttempts ?? (isUnpivotTask ? 180 : 60);
    
    return waitForTaskResult<T>(value, effectiveMaxAttempts, effectiveTimeout);
  }
  return value as T;
}
