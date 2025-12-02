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

export async function fetchTaskStatus<T = any>(taskId: string): Promise<TaskEnvelope<T>> {
  const response = await fetch(`${TASK_QUEUE_API}/${taskId}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch task status (${response.status})`);
  }
  return (await response.json()) as TaskEnvelope<T>;
}

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
  while (attempt < maxAttempts) {
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Task polling timeout after ${timeoutMs}ms (${attempt} attempts)`);
    }

    const sleep = Math.min(1000 * Math.max(attempt, 1), 5000);
    await delay(sleep);
    attempt += 1;

    try {
      const payload = await fetchTaskStatus<T>(taskId);
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
      // If it's the last attempt, throw the error
      if (attempt >= maxAttempts) {
        throw error;
      }
      // Otherwise, continue polling (might be a transient network error)
      console.warn(`Task polling attempt ${attempt} failed, retrying...`, error);
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

export async function resolveTaskResponse<T = any>(value: unknown): Promise<T> {
  if (isTaskEnvelope<T>(value)) {
    return waitForTaskResult<T>(value);
  }
  return value as T;
}
