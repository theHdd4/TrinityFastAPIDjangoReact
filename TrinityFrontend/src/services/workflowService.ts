import { REGISTRY_API } from '@/lib/api';

// Get the base backend URL from REGISTRY_API
const getBackendBase = () => {
  const registryUrl = new URL(REGISTRY_API);
  return `${registryUrl.protocol}//${registryUrl.host}`;
};

const WORKFLOWS_API = `${getBackendBase()}/api/workflows`;

// Utility function to extract current project context and create workflow_id
const getCurrentProjectContext = () => {
  const context: any = {};
  
  // Get environment information
  try {
    const envStr = localStorage.getItem('env');
    if (envStr) {
      const env = JSON.parse(envStr);
      context.client_name = env.CLIENT_NAME || env.client_name;
      context.app_name = env.APP_NAME || env.app_name;
      context.project_name = env.PROJECT_NAME || env.project_name;
    }
  } catch (error) {
    console.warn('Failed to parse environment context:', error);
  }
  
  // Get current project information as fallback
  try {
    const currentStr = localStorage.getItem('current-project');
    if (currentStr) {
      const current = JSON.parse(currentStr);
      context.project_name = context.project_name || current.name;
    }
  } catch (error) {
    console.warn('Failed to parse current project:', error);
  }
  
  // Get current app information as fallback
  try {
    const appStr = localStorage.getItem('current-app');
    if (appStr) {
      const app = JSON.parse(appStr);
      context.app_name = context.app_name || app.name;
    }
  } catch (error) {
    console.warn('Failed to parse current app:', error);
  }
  
  // Create structured workflow_id: {client_name}/{app_name}/{project_name}
  if (context.client_name && context.app_name && context.project_name) {
    context.workflow_id = `${context.client_name}/${context.app_name}/${context.project_name}`;
  }
  
  return context;
};

export interface WorkflowSaveData {
  project_id: number;
  name: string;
  slug: string;
  workflow_id?: string; // Format: {client_name}/{app_name}/{project_name}
  canvas_data: {
    molecules: any[];
    [key: string]: any;
  };
  context?: {
    client_name?: string;
    app_name?: string;
    project_name?: string;
  };
}

export interface WorkflowLoadResponse {
  success: boolean;
  workflow?: any;
  workflows?: any[];
  message?: string;
}

export interface WorkflowSaveResponse {
  success: boolean;
  workflow?: any;
  message?: string;
  created?: boolean;
}

class WorkflowService {
  /**
   * Save a workflow to PostgreSQL
   */
  async saveWorkflow(data: WorkflowSaveData): Promise<WorkflowSaveResponse> {
    try {
      const url = `${WORKFLOWS_API}/workflows/save/`;
      
      // Automatically extract and include context information
      const context = getCurrentProjectContext();
      const enhancedData = {
        ...data,
        workflow_id: context.workflow_id, // Add structured workflow_id
        context: {
          client_name: context.client_name,
          app_name: context.app_name,
          project_name: context.project_name,
          ...data.context // Allow manual context override if needed
        }
      };
      
      console.log('🔧 Saving workflow to:', url);
      console.log('📦 Workflow data:', enhancedData);
      console.log('🏢 Context information:', context);
      console.log('🆔 Generated workflow_id:', context.workflow_id);
      
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(enhancedData),
      });

      console.log('📡 Response status:', response.status);
      console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ Save workflow result:', result);
      return result;
    } catch (error) {
      console.error('❌ Failed to save workflow:', error);
      return {
        success: false,
        message: `Failed to save workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Load workflows for a project
   */
  async loadWorkflows(projectId: number, slug?: string): Promise<WorkflowLoadResponse> {
    try {
      const url = new URL(`${WORKFLOWS_API}/workflows/load/`);
      url.searchParams.append('project_id', projectId.toString());
      if (slug) {
        url.searchParams.append('slug', slug);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to load workflows:', error);
      return {
        success: false,
        message: `Failed to load workflows: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Load a specific workflow by slug
   */
  async loadWorkflow(projectId: number, slug: string): Promise<WorkflowLoadResponse> {
    return this.loadWorkflows(projectId, slug);
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(workflowId: number): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await fetch(`${WORKFLOWS_API}/workflows/${workflowId}/`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      return {
        success: false,
        message: `Failed to delete workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

export const workflowService = new WorkflowService();
