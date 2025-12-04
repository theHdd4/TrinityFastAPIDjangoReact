import { NavigateFunction } from 'react-router-dom';
import { REGISTRY_API } from '@/lib/api';
import { clearProjectState, saveCurrentProject } from './projectStorage';
import { startProjectTransition } from './projectTransition';
import { safeStringify } from './safeStringify';

interface ProjectInput {
  id: string;
  name: string;
  appId: string;
}

interface OpenProjectOptions {
  onError?: (error: Error) => void;
}

/**
 * Safely sets an item in localStorage with error handling
 */
function safeSetLocalStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Failed to set localStorage item "${key}":`, error);
    return false;
  }
}

/**
 * Saves a minimal project object to localStorage as fallback
 */
function saveMinimalProject(project: ProjectInput, appId: number, appSlug: string): boolean {
  const minimalProject = {
    id: project.id,
    name: project.name,
    app: {
      id: appId,
      slug: appSlug,
    },
  };
  try {
    localStorage.setItem('current-project', safeStringify(minimalProject));
    return true;
  } catch (error) {
    console.warn('Failed to save minimal project to localStorage:', error);
    return false;
  }
}

/**
 * Opens a project and navigates to laboratory mode.
 * Handles the complete flow: clear → setup → fetch → save → verify → navigate
 * 
 * @param project - Project data with id, name, and appId (slug)
 * @param appId - Numeric app ID from backend
 * @param navigate - React Router navigate function
 * @param options - Optional error handler
 * @returns Promise<boolean> - true if navigation succeeded, false otherwise
 */
export async function openProjectAndNavigate(
  project: ProjectInput,
  appId: number,
  navigate: NavigateFunction,
  options?: OpenProjectOptions
): Promise<boolean> {
  if (!project.id || !project.name || !appId) {
    const error = new Error('Missing required project data');
    console.error('❌ Cannot open project:', error);
    options?.onError?.(error);
    return false;
  }

  try {
    // Step 1: Clear project state
    clearProjectState();

    // Step 2: Set up current-app in localStorage (with error handling)
    const currentAppData = { id: appId, slug: project.appId };
    const currentAppSet = safeSetLocalStorage('current-app', safeStringify(currentAppData));
    if (!currentAppSet) {
      console.warn('⚠️ Failed to set current-app, but continuing...');
    }

    // Step 3: Construct initial environment
    let env: Record<string, string> = {
      APP_NAME: project.appId || '',
      APP_ID: appId.toString(),
      PROJECT_NAME: project.name,
      PROJECT_ID: project.id || '',
    };

    // Preserve existing CLIENT_NAME and CLIENT_ID if available
    try {
      const envStr = localStorage.getItem('env');
      const baseEnv = envStr ? JSON.parse(envStr) : {};
      if (baseEnv.CLIENT_NAME) env.CLIENT_NAME = baseEnv.CLIENT_NAME;
      if (baseEnv.CLIENT_ID) env.CLIENT_ID = baseEnv.CLIENT_ID;
    } catch {
      /* ignore parse errors */
    }

    // Save initial env (with error handling)
    const envSet = safeSetLocalStorage('env', safeStringify(env));
    if (!envSet) {
      console.warn('⚠️ Failed to set env, but continuing...');
    }

    // Step 4: Save minimal project object immediately (for ProtectedRoute check)
    const minimalSaved = saveMinimalProject(project, appId, project.appId);
    if (!minimalSaved) {
      console.warn('⚠️ Failed to save minimal project, but continuing...');
    }

    // Step 5: Fetch full project details from API
    let fullProjectData: any = null;
    try {
      const res = await fetch(`${REGISTRY_API}/projects/${project.id}/`, {
        credentials: 'include',
      });

      if (res.ok) {
        fullProjectData = await res.json();

        // Update environment with full project data from API
        if (fullProjectData.environment) {
          env = {
            ...env,
            ...fullProjectData.environment,
            APP_NAME: project.appId || env.APP_NAME,
            APP_ID: appId.toString() || env.APP_ID,
            PROJECT_NAME: project.name,
            PROJECT_ID: project.id || env.PROJECT_ID,
          };

          // Update env with API data (with error handling)
          safeSetLocalStorage('env', safeStringify(env));
        }
      }
    } catch (err) {
      console.log('Project env fetch error:', err);
      // Continue with available data even if API call fails
    }

    // Step 6: Save full project data with fallback to minimal save
    if (fullProjectData) {
      try {
        saveCurrentProject(fullProjectData);
      } catch (error) {
        console.warn('Failed to save full project data, falling back to minimal project:', error);
      }
    }

    // Step 7: Verify critical data exists before navigation
    // If full save failed or we couldn't fetch data, ensure minimal project exists
    let hasCurrentProject = localStorage.getItem('current-project');
    if (!hasCurrentProject) {
      console.warn('⚠️ current-project not found after save, attempting minimal save...');
      const minimalSaved = saveMinimalProject(project, appId, project.appId);
      if (!minimalSaved) {
        const error = new Error('Failed to set current-project in localStorage. Cannot navigate.');
        console.error('❌ Navigation blocked:', error);
        options?.onError?.(error);
        return false;
      }
      hasCurrentProject = localStorage.getItem('current-project');
    }

    // Final verification before navigation
    if (!hasCurrentProject) {
      const error = new Error('Failed to set current-project in localStorage. Cannot navigate.');
      console.error('❌ Navigation blocked - current-project still missing after all attempts:', error);
      options?.onError?.(error);
      return false;
    }

    // Step 8: Navigate to laboratory mode
    startProjectTransition(navigate);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error opening project');
    console.error('❌ Error opening project:', err);
    options?.onError?.(err);
    return false;
  }
}

