import { VALIDATE_API } from '@/lib/api';

export interface ProjectContext {
  client_name: string;
  app_name: string;
  project_name: string;
}

const normaliseValue = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return trimmed;
};

const normaliseEnvironment = (env: any): ProjectContext | null => {
  if (!env || typeof env !== 'object') {
    return null;
  }

  const client = normaliseValue(
    env.CLIENT_NAME ?? env.client_name ?? env.client ?? env.CLIENT,
  );
  const app = normaliseValue(env.APP_NAME ?? env.app_name ?? env.app ?? env.APP);
  const project = normaliseValue(
    env.PROJECT_NAME ?? env.project_name ?? env.project ?? env.PROJECT,
  );

  if (!client && !app && !project) {
    return null;
  }

  return {
    client_name: client,
    app_name: app,
    project_name: project,
  };
};

const persistEnvironment = (env: Record<string, unknown>, context: ProjectContext) => {
  if (typeof window === 'undefined') {
    return;
  }

  let existing: Record<string, unknown> = {};
  try {
    const rawExisting = window.localStorage.getItem('env');
    existing = rawExisting ? (JSON.parse(rawExisting) as Record<string, unknown>) : {};
  } catch (error) {
    console.warn('[ProjectEnv] Unable to parse cached environment, refreshing', error);
  }

  const payload = {
    ...existing,
    ...env,
    CLIENT_NAME: context.client_name || (env.CLIENT_NAME as string | undefined) || '',
    APP_NAME: context.app_name || (env.APP_NAME as string | undefined) || '',
    PROJECT_NAME: context.project_name || (env.PROJECT_NAME as string | undefined) || '',
  };

  try {
    window.localStorage.setItem('env', JSON.stringify(payload));
  } catch (error) {
    console.warn('[ProjectEnv] Unable to persist environment to localStorage', error);
  }
};

export function getActiveProjectContext(): ProjectContext | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem('env');
  if (!raw) {
    return null;
  }

  try {
    const env = JSON.parse(raw);
    return normaliseEnvironment(env);
  } catch (error) {
    console.warn('Failed to parse project environment from localStorage', error);
    return null;
  }
}

let inFlightContext: Promise<ProjectContext | null> | null = null;

const fetchRemoteContext = async (): Promise<ProjectContext | null> => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const response = await fetch(`${VALIDATE_API}/get_object_prefix`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      console.warn('[ProjectEnv] Unable to resolve remote project context', response.status);
      return null;
    }

    const payload: any = await response.json();
    const environment = payload?.environment;
    const context = normaliseEnvironment(environment);

    if (context && environment && typeof environment === 'object') {
      persistEnvironment(environment as Record<string, unknown>, context);
    }

    return context;
  } catch (error) {
    console.warn('[ProjectEnv] Failed to fetch project environment', error);
    return null;
  }
};

export async function resolveProjectContext(): Promise<ProjectContext | null> {
  const cached = getActiveProjectContext();
  if (cached && cached.client_name && cached.app_name && cached.project_name) {
    return cached;
  }

  if (!inFlightContext) {
    inFlightContext = fetchRemoteContext().finally(() => {
      inFlightContext = null;
    });
  }

  const resolved = await inFlightContext;
  if (resolved && resolved.client_name && resolved.app_name && resolved.project_name) {
    return resolved;
  }

  return cached;
}
