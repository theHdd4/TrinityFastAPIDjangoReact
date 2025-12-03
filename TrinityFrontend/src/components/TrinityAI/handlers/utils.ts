import { Message, EnvironmentContext } from './types';
import { MERGE_API, CONCAT_API, GROUPBY_API, CREATECOLUMN_API, DATAFRAME_OPERATIONS_API, VALIDATE_API, TEXT_API, LABORATORY_PROJECT_STATE_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { useLaboratoryStore, DEFAULT_TEXTBOX_SETTINGS, TextBoxConfig } from '@/components/LaboratoryMode/store/laboratoryStore';

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
  // Priority 1: Use reasoning if available (detailed explanation from atom)
  if (data.reasoning || data.data?.reasoning) {
    return data.reasoning || data.data?.reasoning || '';
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
  return data.message || data.final_response || 'AI response received';
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

const buildAliasFilename = (alias?: string): string | null => {
  if (!alias || typeof alias !== 'string') {
    return null;
  }

  const trimmed = alias.trim();
  if (!trimmed) {
    return null;
  }

  const withoutExtension = trimmed.replace(/\.arrow$/i, '');
  const sanitizedAlias = sanitizeFileName(withoutExtension);
  if (!sanitizedAlias) {
    return null;
  }

  const pad = (value: number): string => value.toString().padStart(2, '0');
  const now = new Date();
  const timestampToken = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}_${pad(
    now.getUTCHours()
  )}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;

  return `${sanitizedAlias}_${timestampToken}.arrow`;
};

const buildDefaultFilename = (aliasKey: string): string => {
  const timestamp = Date.now();
  const baseName = sanitizeFileName(aliasKey || 'stream_step');
  return baseName.toLowerCase().endsWith('.arrow')
    ? `${baseName}_${timestamp}`
    : `${baseName}_${timestamp}.arrow`;
};

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
  const trimmedAlias = typeof stepAlias === 'string' ? stepAlias.trim() : '';
  const aliasKey = trimmedAlias || `${atomType}_step`;
  const aliasFilename = buildAliasFilename(trimmedAlias);

  if (currentSettings.lastAutoSavedAlias === aliasKey) {
    return;
  }

  const defaultFilename = buildDefaultFilename(aliasKey);
  const resolveFilename = (override?: string | null): string => {
    if (typeof override === 'string') {
      const trimmedOverride = override.trim();
      if (trimmedOverride) {
        return trimmedOverride;
      }
    }
    return aliasFilename || defaultFilename;
  };

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

      const filename = resolveFilename();
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

      const filename = resolveFilename();
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

    if (atomType === 'groupby-wtg-avg' || atomType === 'groupby') {
      let csvData: string | null = null;

      if (Array.isArray(result?.unsaved_data)) {
        csvData = convertRowsToCsv(result.unsaved_data);
      } else if (typeof result?.data === 'string') {
        csvData = result.data;
      } else if (Array.isArray(result?.results)) {
        csvData = convertRowsToCsv(result.results);
      }

      if (!csvData) {
        return;
      }

      const filename = resolveFilename();
      const response = await fetch(`${GROUPBY_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_data: csvData, filename })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'GroupBy save failed');
      }

      const payload = await response.json();
      const savedPath = payload?.filename || payload?.result_file || filename;

      updateAtomSettings(atomId, {
        groupbyResults: {
          ...(currentSettings.groupbyResults || {}),
          result_file: savedPath,
          unsaved_data: null,
        },
        lastAutoSavedAlias: aliasKey,
      });

      sendMessage(`💾 GroupBy output saved automatically as ${savedPath}`);
      return;
    }

    if (atomType === 'create-column' || atomType === 'create-transform') {
      // 🔧 CRITICAL FIX: Always save as Arrow file (perform endpoint saves CSV, we need Arrow)
      // Get CSV data from result or convert from unsaved_data
      let csvData: string | null = null;

      if (typeof result?.data === 'string') {
        csvData = result.data;
      } else if (Array.isArray(result?.unsaved_data)) {
        csvData = convertRowsToCsv(result.unsaved_data);
      } else if (result?.result_file) {
        // If we have result_file but no CSV data, try to fetch it from cached_dataframe
        try {
          const cachedRes = await fetch(`${CREATECOLUMN_API}/cached_dataframe?object_name=${encodeURIComponent(result.result_file)}`);
          if (cachedRes.ok) {
            const cachedJson = await cachedRes.json();
            csvData = cachedJson?.data ?? null;
            console.log(`✅ Retrieved CSV data from cached_dataframe for auto-save`);
          }
        } catch (fetchError) {
          console.warn(`⚠️ Could not fetch CSV data from cached_dataframe:`, fetchError);
        }
      }

      if (!csvData) {
        console.warn(`⚠️ Create-transform auto-save: No CSV data available`);
        return;
      }

      // Always save as Arrow file with proper filename in create-data folder
      const filename = resolveFilename();
      const response = await fetch(`${CREATECOLUMN_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_data: csvData, filename })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Create Column save failed');
      }

      const payload = await response.json();
      const saveResult = await resolveTaskResponse<Record<string, any>>(payload);
      const savedPath = saveResult?.result_file || saveResult?.filename || filename;

      updateAtomSettings(atomId, {
        createColumnResults: {
          ...(currentSettings.createColumnResults || {}),
          result_file: savedPath,
          unsaved_data: null,
        },
        createResults: {
          ...(currentSettings.createResults || {}),
          result_file: savedPath,
        },
        lastAutoSavedAlias: aliasKey,
      });

      sendMessage(`💾 Create Column output saved automatically as ${savedPath}`);
      return;
    }

    if (atomType === 'dataframe-operations') {
      let csvData: string | null = null;
      const tableData = result?.tableData;

      if (typeof result?.csv_data === 'string') {
        csvData = result.csv_data;
      } else if (Array.isArray(result?.rows) && Array.isArray(result?.headers)) {
        csvData = convertTableDataToCsv(result.headers, result.rows);
      } else if (tableData?.headers && Array.isArray(tableData?.rows)) {
        csvData = convertTableDataToCsv(tableData.headers, tableData.rows);
      } else if (Array.isArray(result?.unsaved_data)) {
        csvData = convertRowsToCsv(result.unsaved_data);
      }

      if (!csvData) {
        console.warn('⚠️ DataFrame Operations auto-save skipped: No CSV data available');
        return;
      }

      const inferBaseName = (): string => {
        const candidates = [
          result?.baseFileName,
          result?.selectedFile,
          currentSettings.selectedFile,
          currentSettings.tableData?.fileName
        ];
        for (const candidate of candidates) {
          if (typeof candidate === 'string' && candidate.trim().length > 0) {
            const cleaned = getFilename(candidate).replace(/\.[^/.]+$/, '');
            if (cleaned) {
              return sanitizeFileName(cleaned);
            }
          }
        }
        return 'dataframe';
      };

      let resolvedFilename = aliasFilename;
      let dfOpsFilename: string | null = aliasFilename ? aliasFilename.replace(/\.arrow$/i, '') : null;

      if (!resolvedFilename) {
        const baseName = inferBaseName() || 'dataframe';
        let nextSerial = 1;

        try {
          const res = await fetch(`${VALIDATE_API}/list_saved_dataframes`, { credentials: 'include' });
          if (res.ok) {
            const data = await res.json();
            const files = Array.isArray(data?.files) ? data.files : [];
            const maxSerial = files.reduce((max: number, file: any) => {
              const match = file?.object_name?.match(/dataframe operations\/DF_OPS_(\d+)_/i);
              if (match) {
                const value = parseInt(match[1], 10);
                if (!Number.isNaN(value)) {
                  return Math.max(max, value);
                }
              }
              return max;
            }, 0);
            nextSerial = maxSerial + 1;
          }
        } catch (err) {
          console.warn('⚠️ list_saved_dataframes failed for DataFrame auto-save:', err);
        }

        dfOpsFilename = `DF_OPS_${nextSerial}_${baseName}`;
        resolvedFilename = `${dfOpsFilename}.arrow`;
      }

      const savePayload = {
        csv_data: csvData,
        filename: resolvedFilename
      };

      const response = await fetch(`${DATAFRAME_OPERATIONS_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(savePayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'DataFrame Operations save failed');
      }

      const payload = await response.json();
      const savedPath = payload?.result_file || payload?.object_name || savePayload.filename;
      const dfIdFromSave = payload?.df_id || result?.dfId || currentSettings.fileId;

      const nextSettings: Record<string, any> = {
        lastAutoSavedAlias: aliasKey,
        autoSavedFile: savedPath,
        fileId: dfIdFromSave,
        currentDfId: dfIdFromSave
      };

      if (tableData?.headers && Array.isArray(tableData.rows)) {
        nextSettings.tableData = {
          ...tableData,
          fileName: resolvedFilename
        };
      }

      updateAtomSettings(atomId, nextSettings);
      sendMessage(`💾 DataFrame saved automatically as ${savedPath}`);
      return;
    }
  } catch (error) {
    console.error(`Auto-save failed for ${atomType}:`, error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendMessage(`⚠️ Auto-save skipped: ${message}`);
  }
};

const convertRowsToCsv = (rows: any[]): string => {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '';
  }

  const headers = Object.keys(rows[0]);
  const headerRow = headers.join(',');
  const valueRows = rows.map((row) =>
    headers
      .map((key) => {
        const value = row[key] ?? '';
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      })
      .join(',')
  );

  return [headerRow, ...valueRows].join('\n');
};

const convertTableDataToCsv = (headers: string[], rows: Record<string, any>[]): string => {
  if (!Array.isArray(headers) || headers.length === 0 || !Array.isArray(rows) || rows.length === 0) {
    return '';
  }

  const sanitizeValue = (value: any): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerRow = headers.join(',');
  const valueRows = rows.map(row =>
    headers
      .map(header => sanitizeValue(row?.[header]))
      .join(',')
  );

  return [headerRow, ...valueRows].join('\n');
};

/**
 * Format agent response field (reasoning only) for text box display
 * Can be used by all agent handlers
 * Now only uses reasoning field (smart_response and response are no longer used)
 */
export const formatAgentResponseForTextBox = (data: any): string => {
  // Handle both top-level and nested data structures
  const reasoning = data?.reasoning || data?.data?.reasoning || '';
  
  let formattedText = '';
  
  // Only show reasoning (detailed explanation from atom)
  if (reasoning) {
    formattedText += `**Reasoning:**\n${reasoning}`;
  }
  
  return formattedText.trim() || 'No response data available.';
};

/**
 * Update card text box with agent response fields
 * Finds the card containing the atom and enables/updates its text box
 * Also saves the state via the API endpoint
 */
/**
 * Add a new text box to a card with the given content
 * This creates a new text box below existing ones (like clicking the plus icon)
 */
export const addCardTextBox = async (atomId: string, content: string, title: string = 'Insight'): Promise<void> => {
  try {
    console.log(`📝 ========== addCardTextBox START ==========`);
    console.log(`📝 atomId: ${atomId}`);
    console.log(`📝 title: ${title}`);
    console.log(`📝 content length: ${content.length}`);
    console.log(`📝 content preview: ${content.substring(0, 100)}...`);
    
    if (!atomId) {
      console.error(`❌ atomId is empty or undefined!`);
      return;
    }
    
    if (!content || content.trim() === '') {
      console.error(`❌ content is empty!`);
      return;
    }
    
    const { getAtom, updateCard, cards, setCards } = useLaboratoryStore.getState();
    const atom = getAtom(atomId);
    
    if (!atom) {
      console.error(`❌ Atom not found: ${atomId}`);
      return;
    }
    
    // Find the card containing this atom
    const card = cards.find(c => c.atoms?.some((a: any) => a.id === atomId));
    
    if (!card) {
      console.error(`❌ Card not found for atom: ${atomId}`);
      return;
    }
    
    console.log(`📝 Found card: ${card.id}`);
    
    // Get existing text boxes
    const existingTextBoxes = card.textBoxes || [];
    const nextIndex = existingTextBoxes.length + 1;
    
    // Create new text box with insight content
    const newTextBox: TextBoxConfig = {
      id: `text-box-${nextIndex}-${Date.now()}`,
      title: title,
      content: content,
      html: content.replace(/\n/g, '<br />'), // Convert newlines to HTML breaks
      settings: { ...DEFAULT_TEXTBOX_SETTINGS },
    };
    
    // Add new text box to the array
    const updatedTextBoxes = [...existingTextBoxes, newTextBox];
    
    // Update card with new text boxes array
    const textBoxUpdate = {
      textBoxes: updatedTextBoxes,
      textBoxEnabled: true, // Ensure text box is enabled
    };
    
    console.log(`📝 Adding new text box to card ${card.id}`);
    console.log(`📝 Total text boxes after add: ${updatedTextBoxes.length}`);
    
    // Update the card
    updateCard(card.id, textBoxUpdate);
    
    // Also update using setCards to ensure React re-renders
    const allCards = cards.map(c => 
      c.id === card.id 
        ? { ...c, ...textBoxUpdate }
        : c
    );
    setCards(allCards);
    
    console.log(`📝 Updated card in store with new text box`);
    
    // Verify the update
    const verifyCards = useLaboratoryStore.getState().cards;
    const verifyCard = verifyCards.find(c => c.id === card.id);
    
    if (verifyCard) {
      const verifyTextBoxes = verifyCard.textBoxes || [];
      console.log(`✅ Verification: Card has ${verifyTextBoxes.length} text boxes`);
      if (verifyTextBoxes.length === 0) {
        console.error(`❌ ERROR: textBoxes array is empty after update!`);
        // Retry with force update
        const retryCards = cards.map(c => 
          c.id === card.id 
            ? { ...c, textBoxes: updatedTextBoxes, textBoxEnabled: true }
            : c
        );
        setCards(retryCards);
        console.log(`🔄 Retried text box add for card ${card.id}`);
      }
    } else {
      console.error(`❌ Card not found after update!`);
    }
    
    // Get updated cards from store after update for API save
    const finalCards = useLaboratoryStore.getState().cards;
    const finalCard = finalCards.find(c => c.id === card.id);
   
    if (!finalCard) {
      console.error(`❌ Final card not found after update`);
      return;
    }
    
    // Get environment context for API call
    const envContext = getEnvironmentContext();
    
    if (!envContext.client_name || !envContext.app_name || !envContext.project_name) {
      console.warn(`⚠️ Missing environment context, skipping API save. Context:`, envContext);
      console.warn(`⚠️ Text box is added in store but not saved to backend. Please save manually.`);
      return;
    }
    
    // Import sanitizeLabConfig dynamically to avoid circular dependencies
    let sanitizeLabConfig: ((config: any) => any) | null = null;
    try {
      const projectStorage = await import('@/utils/projectStorage');
      sanitizeLabConfig = projectStorage.sanitizeLabConfig;
    } catch (error) {
      console.warn('⚠️ Could not import sanitizeLabConfig, using cards as-is');
    }
    
    // Sanitize cards if function is available
    const cardsToSave = sanitizeLabConfig 
      ? sanitizeLabConfig({ cards: finalCards }).cards || finalCards
      : finalCards;
    
    // Prepare payload for API
    const payload = {
      client_name: envContext.client_name,
      app_name: envContext.app_name,
      project_name: envContext.project_name,
      cards: cardsToSave,
      workflow_molecules: [],
      auxiliaryMenuLeftOpen: true,
      autosaveEnabled: true,
      mode: 'laboratory',
    };
    
    console.log(`📤 Saving card state via API for card ${card.id}`);
    console.log(`📤 Payload:`, {
      client_name: payload.client_name,
      app_name: payload.app_name,
      project_name: payload.project_name,
      cardsCount: payload.cards.length,
      textBoxEnabled: finalCard.textBoxEnabled,
      textBoxCount: finalCard.textBoxes?.length || 0,
    });
   
   // Save via API
   const requestUrl = `${LABORATORY_PROJECT_STATE_API}/save`;
   const response = await fetch(requestUrl, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     credentials: 'include',
     body: JSON.stringify(payload),
   });
   
   if (response.ok) {
     const result = await response.json();
     console.log(`✅ Card text box added and saved via API for card ${card.id}:`, result);
   } else {
     const errorText = await response.text();
     console.error(`❌ Failed to save card text box via API:`, response.status, response.statusText, errorText);
   }
   
   console.log(`📝 ========== addCardTextBox END ==========`);
 } catch (error) {
   console.error('❌ Error adding card text box:', error);
   if (error instanceof Error) {
     console.error('❌ Error details:', error.message, error.stack);
   }
 }
};

export const updateCardTextBox = async (atomId: string, content: string): Promise<void> => {
  try {
    console.log(`📝 ========== updateCardTextBox START ==========`);
    console.log(`📝 atomId: ${atomId}`);
    console.log(`📝 content length: ${content.length}`);
    console.log(`📝 content preview: ${content.substring(0, 100)}...`);
    
    if (!atomId) {
      console.error(`❌ atomId is empty or undefined!`);
      return;
    }
    
    if (!content || content.trim() === '') {
      console.error(`❌ content is empty!`);
      return;
    }
    
    const { getAtom, updateCard, cards } = useLaboratoryStore.getState();
    
    console.log(`📝 Total cards in store: ${cards.length}`);
    console.log(`📝 Cards IDs: ${cards.map(c => c.id).join(', ')}`);
    
    // Find the atom
    const atom = getAtom(atomId);
    if (!atom) {
      console.error(`❌ Atom not found: ${atomId}`);
      console.error(`❌ Available atoms:`, cards.flatMap(c => (c.atoms || []).map(a => a.id)).join(', '));
      return;
    }
    
    console.log(`✅ Atom found: ${atom.id}, atomId: ${atom.atomId}`);
    
    // Find the card that contains this atom
    const card = cards.find(c => 
      Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId)
    );
    
    if (!card) {
      console.error(`❌ Card not found for atom: ${atomId}`);
      console.error(`❌ Searching through cards:`, cards.map(c => ({
        cardId: c.id,
        atomIds: (c.atoms || []).map(a => a.id)
      })));
      return;
    }
    
    console.log(`✅ Found card: ${card.id} for atom: ${atomId}`);
    console.log(`📝 Card current textBoxEnabled: ${card.textBoxEnabled}`);
    console.log(`📝 Card current textBoxContent length: ${card.textBoxContent?.length || 0}`);
    
    // Enable text box and set content
    // Create text box structure matching the expected format
    const textBoxConfig = {
      id: `text-box-${atomId}`,
      title: 'Agent Response',
      content: content,
      html: content,
      settings: {
        ...DEFAULT_TEXTBOX_SETTINGS,
        text_align: 'left',
        font_size: 14,
        font_family: 'Inter',
        text_color: '#000000',
        bold: false,
        italics: false,
        underline: false,
      }
    };
    
    // Get existing text boxes to preserve them
    const existingTextBoxes = Array.isArray(card.textBoxes) ? card.textBoxes : [];
    
    // Check if first text box already exists (for 3 keys) - update it, otherwise create new
    let updatedTextBoxes: TextBoxConfig[];
    if (existingTextBoxes.length > 0 && existingTextBoxes[0].title === 'Agent Response') {
      // Update existing first text box
      updatedTextBoxes = [
        { ...existingTextBoxes[0], content, html: content },
        ...existingTextBoxes.slice(1)
      ];
      console.log(`📝 Updating existing first text box (preserving ${existingTextBoxes.length - 1} other text boxes)`);
    } else {
      // Create new first text box, preserving existing ones
      updatedTextBoxes = [textBoxConfig, ...existingTextBoxes];
      console.log(`📝 Creating new first text box (preserving ${existingTextBoxes.length} existing text boxes)`);
    }
    
    const textBoxUpdate = {
      textBoxEnabled: true,
      textBoxContent: content, // For backward compatibility
      textBoxHtml: content, // Also set HTML version
      textBoxSettings: {
        ...DEFAULT_TEXTBOX_SETTINGS,
        text_align: 'left',
        font_size: 14,
        font_family: 'Inter',
        text_color: '#000000',
        bold: false,
        italics: false,
        underline: false,
      },
      textBoxes: updatedTextBoxes // Preserve existing text boxes
    };
    
    console.log(`📝 Text box config:`, {
      id: textBoxConfig.id,
      title: textBoxConfig.title,
      contentLength: textBoxConfig.content.length,
      hasSettings: !!textBoxConfig.settings,
    });
    
    console.log(`📝 Updating card with text box:`, {
      cardId: card.id,
      textBoxEnabled: textBoxUpdate.textBoxEnabled,
      textBoxContentLength: textBoxUpdate.textBoxContent.length,
      textBoxesCount: textBoxUpdate.textBoxes.length,
    });
    
     // Update the card using both updateCard and setCards to ensure re-render
     const cardWithTextBox = {
       ...card,
       ...textBoxUpdate
     };
     
     console.log(`📝 Card before update:`, {
       id: card.id,
       textBoxEnabled: card.textBoxEnabled,
       hasTextBoxContent: !!card.textBoxContent,
     });
     
     // Update the card in the store
     updateCard(card.id, textBoxUpdate);
     
     // Also update using setCards to ensure React re-renders
     const allCards = cards.map(c => c.id === card.id ? cardWithTextBox : c);
     const { setCards } = useLaboratoryStore.getState();
     setCards(allCards);
     
     console.log(`📝 Updated card in store using both updateCard and setCards`);
     console.log(`📝 Card after update:`, {
       id: cardWithTextBox.id,
       textBoxEnabled: cardWithTextBox.textBoxEnabled,
       textBoxContentLength: cardWithTextBox.textBoxContent?.length || 0,
       textBoxesCount: cardWithTextBox.textBoxes?.length || 0,
       textBoxContentPreview: cardWithTextBox.textBoxContent?.substring(0, 50) + '...',
     });
     
     // Wait for state to propagate
     await new Promise(resolve => setTimeout(resolve, 100));
     
     // Double-check: Get cards again and verify
     const doubleCheckCards = useLaboratoryStore.getState().cards;
     const doubleCheckCard = doubleCheckCards.find(c => c.id === card.id);
     if (doubleCheckCard) {
       console.log(`📝 Double-check - textBoxEnabled: ${doubleCheckCard.textBoxEnabled}, content length: ${doubleCheckCard.textBoxContent?.length || 0}`);
       if (!doubleCheckCard.textBoxEnabled || !doubleCheckCard.textBoxContent) {
         console.error(`❌ CRITICAL: textBoxEnabled or content missing after double-check! Forcing update...`);
         const forceUpdate = doubleCheckCards.map(c => 
           c.id === card.id ? { ...c, ...textBoxUpdate } : c
         );
         setCards(forceUpdate);
         console.log(`🔄 Forced text box update for card ${card.id}`);
       } else {
         console.log(`✅ Text box is properly enabled and has content on card ${card.id}`);
       }
     }
     
     // Wait a bit for state to update
     await new Promise(resolve => setTimeout(resolve, 200));
     
     // Verify the update
     const verifyCards = useLaboratoryStore.getState().cards;
     const verifyCard = verifyCards.find(c => c.id === card.id);
     
     if (verifyCard) {
       console.log(`✅ Card text box updated in store for card ${card.id}`);
       console.log(`✅ Verification - textBoxEnabled: ${verifyCard.textBoxEnabled}`);
       console.log(`✅ Verification - textBoxContent length: ${verifyCard.textBoxContent?.length || 0}`);
       console.log(`✅ Verification - textBoxContent preview: ${verifyCard.textBoxContent?.substring(0, 100)}...`);
       console.log(`✅ Verification - textBoxes count: ${verifyCard.textBoxes?.length || 0}`);
       
       if (!verifyCard.textBoxEnabled) {
         console.error(`❌ ERROR: textBoxEnabled is still false after update!`);
         // Retry the update
         const retryCards = verifyCards.map(c => 
           c.id === card.id ? { ...c, ...textBoxUpdate } : c
         );
         setCards(retryCards);
         console.log(`🔄 Retried text box update for card ${card.id}`);
       }
       if (!verifyCard.textBoxContent || verifyCard.textBoxContent.length === 0) {
         console.error(`❌ ERROR: textBoxContent is empty after update!`);
       }
     } else {
       console.error(`❌ Card not found after update!`);
     }
     
     // Get updated cards from store after update for API save
     const finalCards = useLaboratoryStore.getState().cards;
     const finalCard = finalCards.find(c => c.id === card.id);
    
     if (!finalCard) {
       console.error(`❌ Final card not found after update`);
       return;
     }
     
     // Get environment context for API call
     const envContext = getEnvironmentContext();
     
     if (!envContext.client_name || !envContext.app_name || !envContext.project_name) {
       console.warn(`⚠️ Missing environment context, skipping API save. Context:`, envContext);
       console.warn(`⚠️ Text box is updated in store but not saved to backend. Please save manually.`);
       return;
     }
     
     // Import sanitizeLabConfig dynamically to avoid circular dependencies
     let sanitizeLabConfig: ((config: any) => any) | null = null;
     try {
       const projectStorage = await import('@/utils/projectStorage');
       sanitizeLabConfig = projectStorage.sanitizeLabConfig;
     } catch (error) {
       console.warn('⚠️ Could not import sanitizeLabConfig, using cards as-is');
     }
     
     // Sanitize cards if function is available
     const cardsToSave = sanitizeLabConfig 
       ? sanitizeLabConfig({ cards: finalCards }).cards || finalCards
       : finalCards;
     
     // Prepare payload for API
     const payload = {
       client_name: envContext.client_name,
       app_name: envContext.app_name,
       project_name: envContext.project_name,
       cards: cardsToSave, // Send all cards with updated text box
       workflow_molecules: [], // Empty for now, can be enhanced if needed
       auxiliaryMenuLeftOpen: true,
       autosaveEnabled: true,
       mode: 'laboratory',
     };
     
     console.log(`📤 Saving card state via API for card ${card.id}`);
     console.log(`📤 Payload:`, {
       client_name: payload.client_name,
       app_name: payload.app_name,
       project_name: payload.project_name,
       cardsCount: payload.cards.length,
       textBoxEnabled: finalCard.textBoxEnabled,
       textBoxContentLength: finalCard.textBoxContent?.length || 0,
     });
    
    // Save via API
    const requestUrl = `${LABORATORY_PROJECT_STATE_API}/save`;
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Card text box saved via API for card ${card.id}:`, result);
    } else {
      const errorText = await response.text();
      console.error(`❌ Failed to save card text box via API:`, response.status, response.statusText, errorText);
    }
  } catch (error) {
    console.error('❌ Error updating card text box:', error);
    if (error instanceof Error) {
      console.error('❌ Error details:', error.message, error.stack);
    }
  }
};

/**
 * Update the insight text box with generated insight
 * This function is robust and handles state changes, retries, and concurrent operations
 * It ensures insight generation completes even when other operations start
 */
export const updateInsightTextBox = async (
  atomId: string,
  insight: string,
  maxRetries: number = 3,
  retryDelay: number = 500
): Promise<boolean> => {
  console.log(`🔍 updateInsightTextBox called for atomId: ${atomId}, insight length: ${insight.length}`);
  
  if (!atomId || !insight || insight.trim() === '') {
    console.warn('⚠️ updateInsightTextBox: Invalid parameters');
    return false;
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔍 updateInsightTextBox attempt ${attempt}/${maxRetries}`);
      
      const { getAtom, cards, setCards, updateCard } = useLaboratoryStore.getState();
      
      // Get fresh state on each attempt
      const atom = getAtom(atomId);
      if (!atom) {
        console.warn(`⚠️ Atom not found (attempt ${attempt}/${maxRetries}), retrying...`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        return false;
      }
      
      // Find the card containing this atom
      const card = cards.find(c => c.atoms?.some((a: any) => a.id === atomId));
      if (!card) {
        console.warn(`⚠️ Card not found (attempt ${attempt}/${maxRetries}), retrying...`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        return false;
      }
      
      // Get existing text boxes
      const existingTextBoxes = Array.isArray(card.textBoxes) ? card.textBoxes : [];
      
      // Find the last text box with title 'AI Insight' or 'Generating insight...'
      let insightTextBoxIndex = -1;
      for (let i = existingTextBoxes.length - 1; i >= 0; i--) {
        const title = existingTextBoxes[i]?.title || '';
        if (title === 'AI Insight' || title === 'Generating insight...' || title.includes('Insight')) {
          insightTextBoxIndex = i;
          break;
        }
      }
      
      // If no insight text box found, create a new one
      let updatedTextBoxes: TextBoxConfig[];
      if (insightTextBoxIndex === -1) {
        console.log(`📝 No insight text box found, creating new one`);
        const newTextBox: TextBoxConfig = {
          id: `insight-${atomId}-${Date.now()}`,
          title: 'AI Insight',
          content: insight,
          html: insight.replace(/\n/g, '<br />'),
          settings: { ...DEFAULT_TEXTBOX_SETTINGS },
        };
        updatedTextBoxes = [...existingTextBoxes, newTextBox];
      } else {
        // Update existing insight text box
        console.log(`📝 Updating existing insight text box at index ${insightTextBoxIndex}`);
        updatedTextBoxes = [...existingTextBoxes];
        updatedTextBoxes[insightTextBoxIndex] = {
          ...updatedTextBoxes[insightTextBoxIndex],
          title: 'AI Insight',
          content: insight,
          html: insight.replace(/\n/g, '<br />'),
        };
      }
      
      // Update the card
      const textBoxUpdate = {
        textBoxes: updatedTextBoxes,
        textBoxEnabled: true,
      };
      
      updateCard(card.id, textBoxUpdate);
      
      // Also update using setCards to ensure React re-renders
      const allCards = cards.map(c => 
        c.id === card.id 
          ? { ...c, ...textBoxUpdate }
          : c
      );
      setCards(allCards);
      
      console.log(`✅ Successfully updated insight text box on attempt ${attempt}`);
      
      // Verify the update
      await new Promise(resolve => setTimeout(resolve, 100));
      const verifyCards = useLaboratoryStore.getState().cards;
      const verifyCard = verifyCards.find(c => c.id === card.id);
      
      if (verifyCard && verifyCard.textBoxes) {
        const verifyTextBoxes = verifyCard.textBoxes;
        const lastTextBox = verifyTextBoxes[verifyTextBoxes.length - 1];
        if (lastTextBox && (lastTextBox.title === 'AI Insight' || lastTextBox.content === insight)) {
          console.log(`✅ Verification successful: Insight text box updated correctly`);
          return true;
        }
      }
      
      // If verification failed but we're not on last attempt, retry
      if (attempt < maxRetries) {
        console.warn(`⚠️ Verification failed (attempt ${attempt}/${maxRetries}), retrying...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      
      return true; // Return true even if verification fails on last attempt
      
    } catch (error) {
      console.error(`❌ Error updating insight text box (attempt ${attempt}/${maxRetries}):`, error);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      return false;
    }
  }
  
  return false;
};
