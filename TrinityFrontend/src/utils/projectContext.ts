/**
 * Project Context Utility
 * Provides consistent access to project context from localStorage
 */

export interface ProjectContext {
  client_name: string;
  app_name: string;
  project_name: string;
}

/**
 * Extract project context from localStorage environment
 * Returns null if context is unavailable or invalid
 */
export function getProjectContext(): ProjectContext | null {
  try {
    const envStr = localStorage.getItem('env');
    if (!envStr) return null;
    
    const env = JSON.parse(envStr);
    return {
      client_name: env.CLIENT_NAME || '',
      app_name: env.APP_NAME || '',
      project_name: env.PROJECT_NAME || '',
    };
  } catch {
    return null;
  }
}

/**
 * Check if project context is complete (all fields present)
 */
export function hasCompleteProjectContext(context: ProjectContext | null): boolean {
  return !!(context?.client_name && context?.app_name && context?.project_name);
}