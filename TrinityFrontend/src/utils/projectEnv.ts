export interface ProjectContext {
  client_name: string;
  app_name: string;
  project_name: string;
}

const FALLBACK_CONTEXT: ProjectContext = {
  client_name: '',
  app_name: '',
  project_name: '',
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
    const client = env.CLIENT_NAME || env.client_name || '';
    const app = env.APP_NAME || env.app_name || '';
    const project = env.PROJECT_NAME || env.project_name || '';

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
    return { ...FALLBACK_CONTEXT };
  }
}
