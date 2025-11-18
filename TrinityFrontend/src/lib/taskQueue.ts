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

export async function waitForTaskResult<T = any>(initial: TaskEnvelope<T>, debugPrefix?: string): Promise<T> {
  const initialStatus = (initial.task_status || initial.status || '').toLowerCase();
  console.log(`${debugPrefix || '[taskQueue]'} initial task envelope`, initial);
  if (initialStatus === 'success') {
    if (initial.result && typeof initial.result === 'object') {
      console.log(`${debugPrefix || '[taskQueue]'} immediate success payload`, initial.result);
      return initial.result as T;
    }
    console.log(`${debugPrefix || '[taskQueue]'} immediate success raw`, initial);
    return initial as unknown as T;
  }

  const taskId = initial.task_id || (initial.result as TaskEnvelope<T> | undefined)?.task_id;
  if (!taskId) {
    console.error(`${debugPrefix || '[taskQueue]'} missing task id in envelope`, initial);
    throw new Error('Task identifier missing from response');
  }

  let attempt = 0;
  while (true) {
    const sleep = Math.min(1000 * Math.max(attempt, 1), 5000);
    await delay(sleep);
    attempt += 1;

    console.log(`${debugPrefix || '[taskQueue]'} polling task`, { taskId, attempt, sleep });
    const response = await fetch(`${TASK_QUEUE_API}/${taskId}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      console.error(`${debugPrefix || '[taskQueue]'} task status fetch failed`, { status: response.status, taskId });
      throw new Error(`Failed to fetch task status (${response.status})`);
    }
    const payload: TaskEnvelope<T> = await response.json();
    console.log(`${debugPrefix || '[taskQueue]'} task status payload`, payload);
    const status = (payload.status || payload.task_status || '').toLowerCase();
    if (status === 'success') {
      if (payload.result && typeof payload.result === 'object') {
        console.log(`${debugPrefix || '[taskQueue]'} task succeeded with result`, payload.result);
        return payload.result as T;
      }
      console.log(`${debugPrefix || '[taskQueue]'} task succeeded with raw payload`, payload);
      return payload as unknown as T;
    }
    if (status === 'failure') {
      console.error(`${debugPrefix || '[taskQueue]'} task failed`, payload);
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

export async function resolveTaskResponse<T = any>(value: unknown, debugPrefix?: string): Promise<T> {
  if (isTaskEnvelope<T>(value)) {
    console.log(`${debugPrefix || '[taskQueue]'} received task envelope`, value);
    return waitForTaskResult<T>(value, debugPrefix);
  }
  console.log(`${debugPrefix || '[taskQueue]'} received non-task payload`, value);
  return value as T;
}
