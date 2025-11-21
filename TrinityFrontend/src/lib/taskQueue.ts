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

export async function waitForTaskResult<T = any>(initial: TaskEnvelope<T>): Promise<T> {
  const initialStatus = (initial.task_status || initial.status || '').toLowerCase();
  if (initialStatus === 'success') {
    if (initial.result && typeof initial.result === 'object') {
      const merged: Record<string, unknown> = {
        ...(initial.result as Record<string, unknown>),
      };
      if (initial.metadata) merged.metadata = initial.metadata;
      if (initial.task_id) merged.task_id = initial.task_id;
      if (initial.task_status || initial.status) {
        merged.task_status = initial.task_status || initial.status;
      }
      return merged as T;
    }
    return initial as unknown as T;
  }

  const taskId = initial.task_id || (initial.result as TaskEnvelope<T> | undefined)?.task_id;
  if (!taskId) {
    throw new Error('Task identifier missing from response');
  }

  let attempt = 0;
  while (true) {
    const sleep = Math.min(1000 * Math.max(attempt, 1), 5000);
    await delay(sleep);
    attempt += 1;

    const response = await fetch(`${TASK_QUEUE_API}/${taskId}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch task status (${response.status})`);
    }
    const payload: TaskEnvelope<T> = await response.json();
    const status = (payload.status || payload.task_status || '').toLowerCase();
    if (status === 'success') {
      if (payload.result && typeof payload.result === 'object') {
        const merged: Record<string, unknown> = {
          ...(payload.result as Record<string, unknown>),
        };
        if (payload.metadata) merged.metadata = payload.metadata;
        if (payload.task_id) merged.task_id = payload.task_id;
        if (payload.task_status || payload.status) {
          merged.task_status = payload.task_status || payload.status;
        }
        return merged as T;
      }
      return payload as unknown as T;
    }
    if (status === 'failure') {
      throw new Error(payload.error ? String(payload.error) : 'Task failed');
    }
  }
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
