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
    const client = normaliseValue(env.CLIENT_NAME ?? env.client_name);
    const app = normaliseValue(env.APP_NAME ?? env.app_name);
    const project = normaliseValue(env.PROJECT_NAME ?? env.project_name);

    if (!client && !app && !project) {
      return null;
    }

    return {
      client_name: client,
      app_name: app,
      project_name: project,
    };
  } catch (error) {
    console.warn('Failed to parse project environment from localStorage', error);
    return null;
  }
}
