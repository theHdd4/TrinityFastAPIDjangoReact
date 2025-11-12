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
      return initial.result as T;
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
        return payload.result as T;
      }
      return payload as unknown as T;
    }
    if (status === 'failure') {
      throw new Error(payload.error ? String(payload.error) : 'Task failed');
    }
  }
}
