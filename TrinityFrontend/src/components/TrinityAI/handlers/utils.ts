import { Message, EnvironmentContext } from './types';
import { MERGE_API, CONCAT_API } from '@/lib/api';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

/**
 * Enhanced utility functions for Trinity AI handlers
 * Based on comprehensive logic from Atom_ai_chat.tsx
 */

// Environment context utilities [[memory:6827530]]
export const getEnvironmentContext = (): EnvironmentContext => {
  try {
    const envStr = localStorage.getItem('env');
    if (envStr) {
      const env = JSON.parse(envStr);
      return {
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      };
    }
  } catch (error) {
    console.warn('Failed to load environment context:', error);
  }
  
  return {
    client_name: '',
    app_name: '',
    project_name: ''
  };
};

// File name utilities based on Atom_ai_chat.tsx patterns
export const getFilename = (filePath: string): string => {
  if (!filePath) return "";
  return filePath.includes("/") ? filePath.split("/").pop() || filePath : filePath;
};

export const constructFullPath = (filename: string, envContext?: EnvironmentContext): string => {
  if (!filename) return '';
  
  const context = envContext || getEnvironmentContext();
  
  if (context.client_name && context.app_name && context.project_name) {
    // Construct full path: client/app/project/filename
    return `${context.client_name}/${context.app_name}/${context.project_name}/${filename}`;
  }
  
  return filename;
};

// Message creation utilities
export const createMessage = (content: string, sender: 'user' | 'ai' = 'ai'): Message => ({
  id: (Date.now() + Math.random()).toString(),
  content,
  sender,
  timestamp: new Date(),
});

export const createSuccessMessage = (operation: string, details: Record<string, any>): Message => {
  const detailsText = Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
    .join('\n');
  
  return createMessage(`✅ ${operation} completed successfully!\n\n${detailsText}`);
};

export const createErrorMessage = (operation: string, error: any, context?: string): Message => {
  const errorText = error?.message || error?.detail || error || 'Unknown error occurred';
  const contextText = context ? `\n\nContext: ${context}` : '';
  
  return createMessage(`❌ ${operation} failed: ${errorText}${contextText}\n\n💡 Please try again or use manual configuration.`);
};

// Smart response processing based on Atom_ai_chat.tsx logic
export const processSmartResponse = (data: any): string => {
  // Priority 1: Use smart_response if available (clean, user-friendly message)
  if (data.smart_response) {
    return data.smart_response;
  }
  
  // Priority 2: Build from suggestions and next steps
  if (data.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
    let content = `${data.message || 'Here\'s what I can help you with:'}\n\n${data.suggestions.join('\n\n')}`;
    
    // Add file analysis if available
    if (data.file_analysis) {
      content += `\n\n📊 File Analysis:\n`;
      if (data.file_analysis.total_files) {
        content += `• Total files available: ${data.file_analysis.total_files}\n`;
      }
      if (data.file_analysis.recommended_pairs && data.file_analysis.recommended_pairs.length > 0) {
        content += `• Recommended pairs: ${data.file_analysis.recommended_pairs.join(', ')}\n`;
      }
      if (data.file_analysis.common_columns && data.file_analysis.common_columns.length > 0) {
        content += `• Common columns: ${data.file_analysis.common_columns.join(', ')}\n`;
      }
      // Add specific tips based on atom type
      ['concat_tips', 'merge_tips', 'groupby_tips', 'chart_tips'].forEach(tipType => {
        if (data.file_analysis[tipType] && data.file_analysis[tipType].length > 0) {
          content += `• Tips: ${data.file_analysis[tipType].join(', ')}\n`;
        }
      });
    }
    
    // Add next steps if available
    if (data.next_steps && data.next_steps.length > 0) {
      content += `\n\n🎯 Next Steps:\n${data.next_steps.map((step: string, idx: number) => `${idx + 1}. ${step}`).join('\n')}`;
    }
    
    return content;
  }
  
  // Priority 3: Fallback to basic message
  return data.message || data.response || data.final_response || 'AI response received';
};

// Enhanced error handling with specific context
export const handleFetchError = async (response: Response, operation: string): Promise<string> => {
  let errorDetail = response.statusText;
  
  try {
    const errorData = await response.json();
    errorDetail = errorData.detail || errorData.message || response.statusText;
  } catch (e) {
    // If we can't parse error response, use status text
  }
  
  return `${operation} failed: ${response.status} - ${errorDetail}`;
};

// Validation utilities
export const validateFileInput = (filename: string, source: string = 'AI'): { isValid: boolean; message?: string } => {
  if (!filename) {
    return {
      isValid: false,
      message: `No valid file found from ${source}. Please ensure you have selected a data file.`
    };
  }
  
  if (filename === 'your_file.csv' || filename === 'N/A' || filename.toLowerCase().includes('placeholder')) {
    return {
      isValid: false,
      message: `${source} provided placeholder filename: ${filename}. Please select a real data file.`
    };
  }
  
  return { isValid: true };
};

// Perform endpoint utilities
export const executePerformOperation = async (
  endpoint: string,
  payload: any,
  options: {
    method?: 'POST' | 'GET';
    contentType?: 'application/json' | 'application/x-www-form-urlencoded' | 'multipart/form-data';
    isFormData?: boolean;
  } = {}
): Promise<{ success: boolean; data?: any; error?: string }> => {
  try {
    const {
      method = 'POST',
      contentType = 'application/json',
      isFormData = false
    } = options;
    
    const fetchOptions: RequestInit = {
      method,
      ...(isFormData 
        ? { body: payload } // FormData
        : contentType === 'application/x-www-form-urlencoded'
        ? { 
            headers: { 'Content-Type': contentType },
            body: payload instanceof URLSearchParams ? payload : new URLSearchParams(payload)
          }
        : {
            headers: { 'Content-Type': contentType },
            body: JSON.stringify(payload)
          }
      )
    };
    
    console.log(`🚀 Executing ${method} ${endpoint}:`, isFormData ? '[FormData]' : payload);
    
    const response = await fetch(endpoint, fetchOptions);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Operation successful:', data);
      return { success: true, data };
    } else {
      const errorMessage = await handleFetchError(response, 'Operation');
      console.error('❌ Operation failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  } catch (error) {
    const errorMessage = `Network error: ${(error as Error).message || 'Unknown error occurred'}`;
    console.error('❌ Fetch error:', errorMessage);
    return { success: false, error: errorMessage };
  }
};

// Debouncing utility for chart generation
export const createDebouncer = () => {
  const delays = new Map<string, number>();
  
  return <T>(key: string, fn: () => Promise<T>, delay: number): Promise<T> => {
    return new Promise((resolve, reject) => {
      const currentDelay = delays.get(key) || 0;
      delays.set(key, currentDelay + delay);
      
      setTimeout(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, currentDelay);
    });
  };
};

// Column name normalization (for explore handler)
export const normalizeColumnName = (colName: string): string => {
  if (!colName || typeof colName !== 'string') return '';
  return colName.toLowerCase();
};

// Progress tracking utilities
export const createProgressTracker = (total: number, operation: string) => {
  let completed = 0;
  let failed = 0;
  
  return {
    markCompleted: () => {
      completed++;
      console.log(`✅ ${operation} progress: ${completed}/${total} completed, ${failed} failed`);
    },
    markFailed: () => {
      failed++;
      console.log(`❌ ${operation} progress: ${completed}/${total} completed, ${failed} failed`);
    },
    getStatus: () => ({
      completed,
      failed,
      total,
      remaining: total - completed - failed,
      isComplete: completed + failed >= total
    }),
    createSummaryMessage: (): string => {
      if (completed === total) {
        return `🎉 All ${total} ${operation}(s) completed successfully!`;
      } else if (completed > 0) {
        return `✅ ${completed}/${total} ${operation}(s) completed successfully. ${failed > 0 ? `${failed} failed.` : ''}`;
      } else {
        return `❌ ${operation} failed. ${failed}/${total} operations encountered errors.`;
      }
    }
  };
};

const sanitizeFileName = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_\-]+/g, '_');

interface AutoSaveParams {
  atomType: string;
  atomId: string;
  stepAlias?: string;
  result: any;
  updateAtomSettings: (atomId: string, settings: any) => void;
  setMessages: (updater: (prev: Message[]) => Message[]) => void;
  isStreamMode?: boolean;
}

export const autoSaveStepResult = async ({
  atomType,
  atomId,
  stepAlias,
  result,
  updateAtomSettings,
  setMessages,
  isStreamMode
}: AutoSaveParams): Promise<void> => {
  const store = useLaboratoryStore.getState();
  const currentAtom = store.getAtom(atomId);
  const currentSettings = currentAtom?.settings || {};
  const aliasKey = stepAlias || `${atomType}_step`;

  if (currentSettings.lastAutoSavedAlias === aliasKey) {
    return;
  }

  const timestamp = Date.now();
  const baseName = sanitizeFileName(aliasKey || atomType);
  const filename = baseName.endsWith('.arrow') ? `${baseName}_${timestamp}` : `${baseName}_${timestamp}.arrow`;

  const notify = !isStreamMode;

  const sendMessage = (content: string) => {
    if (!notify) return;
    setMessages(prev => [...prev, createMessage(content)]);
  };

  try {
    if (atomType === 'merge') {
      const csvData = result?.data;
      if (!csvData) {
        return;
      }

      const response = await fetch(`${MERGE_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_data: csvData, filename })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Merge save failed');
      }

      const payload = await response.json();
      const savedPath = payload?.result_file || payload?.object_name || filename;

      updateAtomSettings(atomId, {
        mergeResults: {
          ...(currentSettings.mergeResults || {}),
          result_file: savedPath,
          unsaved_data: null,
        },
        lastAutoSavedAlias: aliasKey,
      });

      sendMessage(`💾 Merge output saved automatically as ${savedPath}`);
      return;
    }

    if (atomType === 'concat') {
      const csvData = result?.data;
      if (!csvData) {
        return;
      }

      const response = await fetch(`${CONCAT_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_data: csvData, filename })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Concat save failed');
      }

      const payload = await response.json();
      const savedPath = payload?.result_file || payload?.object_name || filename;

      updateAtomSettings(atomId, {
        concatResults: {
          ...(currentSettings.concatResults || {}),
          result_file: savedPath,
          unsaved_data: null,
        },
        lastAutoSavedAlias: aliasKey,
      });

      sendMessage(`💾 Concat output saved automatically as ${savedPath}`);
      return;
    }
  } catch (error) {
    console.error(`Auto-save failed for ${atomType}:`, error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendMessage(`⚠️ Auto-save skipped: ${message}`);
  }
};
