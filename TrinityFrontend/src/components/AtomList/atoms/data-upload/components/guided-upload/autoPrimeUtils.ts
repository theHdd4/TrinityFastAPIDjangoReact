import { UPLOAD_API, VALIDATE_API, CLASSIFIER_API } from '@/lib/api';
import { getActiveProjectContext } from '@/utils/projectEnv';

/**
 * Auto-prime utilities for automatically progressing through guided mode stages
 * with smart defaults without user interaction
 */

interface AutoPrimeResult {
  success: boolean;
  error?: string;
  data?: any;
}

/**
 * U2: Auto-confirm headers - use first row as headers automatically
 */
export async function autoConfirmHeaders(filePath: string): Promise<AutoPrimeResult> {
  try {
    const projectContext = getActiveProjectContext();
    if (!projectContext) {
      return { success: false, error: 'Project context not available' };
    }

    // Fetch file preview to get suggested header row
    const res = await fetch(`${UPLOAD_API}/file-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        file_path: filePath,
        client_id: projectContext.client_id || '',
        app_id: projectContext.app_id || '',
        project_id: projectContext.project_id || '',
      }),
    });

    if (!res.ok) {
      return { success: false, error: 'Failed to fetch file preview' };
    }

    const previewData = await res.json();
    const suggestedHeaderRow = previewData.suggested_header_row_absolute ?? previewData.suggested_header_row ?? 0;
    const headerRowCount = previewData.has_description_rows ? 1 : 1;

    // Apply headers automatically
    const applyRes = await fetch(`${UPLOAD_API}/apply-headers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        file_path: filePath,
        header_row: suggestedHeaderRow,
        header_row_count: headerRowCount,
        client_id: projectContext.client_id || '',
        app_id: projectContext.app_id || '',
        project_id: projectContext.project_id || '',
      }),
    });

    if (!applyRes.ok) {
      return { success: false, error: 'Failed to apply headers' };
    }

    return { success: true, data: { headerRow: suggestedHeaderRow, headerRowCount } };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to auto-confirm headers' };
  }
}

/**
 * U3: Auto-keep column names - keep all column names as-is (no renames)
 */
export async function autoKeepColumnNames(filePath: string): Promise<AutoPrimeResult> {
  try {
    const projectContext = getActiveProjectContext();
    if (!projectContext) {
      return { success: false, error: 'Project context not available' };
    }

    // Fetch column names
    const res = await fetch(`${UPLOAD_API}/column-names`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        object_name: filePath,
        client_id: projectContext.client_id || '',
        app_id: projectContext.app_id || '',
        project_id: projectContext.project_id || '',
      }),
    });

    if (!res.ok) {
      return { success: false, error: 'Failed to fetch column names' };
    }

    const data = await res.json();
    const columns = data.columns || [];

    // Create column name edits with all columns kept as-is
    const columnNameEdits = columns.map((col: string) => ({
      originalName: col,
      editedName: col,
      keep: true,
    }));

    return { success: true, data: { columnNameEdits } };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to auto-keep column names' };
  }
}

/**
 * U4: Auto-detect data types - detect and apply data types automatically
 */
export async function autoDetectDataTypes(filePath: string, columnNames: string[]): Promise<AutoPrimeResult> {
  try {
    const projectContext = getActiveProjectContext();
    if (!projectContext) {
      return { success: false, error: 'Project context not available' };
    }

    // Fetch file metadata to get detected types
    const res = await fetch(`${UPLOAD_API}/file-metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        file_path: filePath,
        client_id: projectContext.client_id || '',
        app_id: projectContext.app_id || '',
        project_id: projectContext.project_id || '',
      }),
    });

    if (!res.ok) {
      return { success: false, error: 'Failed to fetch file metadata' };
    }

    const data = await res.json();
    const columns = data.columns || [];

    // Map backend dtype to frontend data type
    const mapDtypeToDataType = (dtype: string): string => {
      const dtypeLower = dtype.toLowerCase();
      if (dtypeLower.includes('int') && !dtypeLower.includes('float')) return 'int';
      if (dtypeLower.includes('float')) return 'float';
      if (dtypeLower.includes('bool')) return 'boolean';
      if (dtypeLower.includes('datetime64') || dtypeLower.includes('datetime')) return 'datetime';
      if (dtypeLower.includes('date') && !dtypeLower.includes('datetime')) return 'date';
      return 'string';
    };

    // Infer role from dtype (numeric -> measure, others -> identifier)
    const inferRole = (dtype: string): 'identifier' | 'measure' => {
      const dtypeLower = dtype.toLowerCase();
      if (dtypeLower.includes('int') || dtypeLower.includes('float')) return 'measure';
      return 'identifier';
    };

    // Create data type selections with auto-detected types
    const dataTypeSelections = columns.map((col: any) => {
      const detectedType = mapDtypeToDataType(col.dtype || 'object');
      const detectedRole = inferRole(col.dtype || 'object');

      return {
        columnName: col.name,
        detectedType: col.dtype || 'object',
        selectedType: detectedType,
        updateType: detectedType,
        columnRole: detectedRole,
        dtype: col.dtype || 'object',
      };
    });

    return { success: true, data: { dataTypeSelections } };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to auto-detect data types' };
  }
}

/**
 * U5: Auto-apply missing value strategies - use default strategy (none - keep as missing)
 */
export async function autoApplyMissingValueStrategies(
  filePath: string,
  columnNames: string[],
  dataTypes: Array<{ columnName: string; dataType: string; columnRole: 'identifier' | 'measure' }>
): Promise<AutoPrimeResult> {
  try {
    const projectContext = getActiveProjectContext();
    if (!projectContext) {
      return { success: false, error: 'Project context not available' };
    }

    // Fetch file metadata to get missing value info
    const res = await fetch(`${UPLOAD_API}/file-metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        file_path: filePath,
        client_id: projectContext.client_id || '',
        app_id: projectContext.app_id || '',
        project_id: projectContext.project_id || '',
      }),
    });

    if (!res.ok) {
      return { success: false, error: 'Failed to fetch file metadata' };
    }

    const data = await res.json();
    const columns = data.columns || [];

    // Create missing value strategies with smart defaults
    const missingValueStrategies = columns.map((col: any) => {
      const colInfo = dataTypes.find(dt => dt.columnName === col.name);
      const dataType = colInfo?.dataType || 'string';
      const columnRole = colInfo?.columnRole || 'identifier';
      const missingPercent = col.missing_percentage || 0;

      // Smart defaults based on type and role
      let strategy: string = 'none'; // Default: keep as missing
      
      // For numeric measures with low missing %, use mean
      if (dataType === 'float' || dataType === 'int') {
        if (columnRole === 'measure' && missingPercent < 10) {
          strategy = 'mean';
        } else if (columnRole === 'identifier') {
          strategy = 'none'; // Keep missing for identifiers
        }
      }
      // For categorical identifiers with low missing %, use mode
      else if (dataType === 'string' && columnRole === 'identifier' && missingPercent < 10) {
        strategy = 'mode';
      }

      return {
        columnName: col.name,
        strategy: strategy as any,
        value: undefined,
      };
    });

    return { success: true, data: { missingValueStrategies } };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to auto-apply missing value strategies' };
  }
}

/**
 * U6: Auto-finalize and prime - process file, save classifications, and mark as primed
 * This matches exactly what U6FinalPreview does in manual mode
 */
export async function autoFinalizeAndPrime(
  filePath: string,
  originalFilePath: string,
  fileName: string,
  columnNameEdits: any[],
  dataTypeSelections: any[],
  missingValueStrategies: any[]
): Promise<AutoPrimeResult> {
  try {
    const projectContext = getActiveProjectContext();
    if (!projectContext) {
      return { success: false, error: 'Project context not available' };
    }

    // Get project and env info (same as U6FinalPreview)
    const stored = localStorage.getItem('current-project');
    const envStr = localStorage.getItem('env');
    const project = stored ? JSON.parse(stored) : {};
    const env = envStr ? JSON.parse(envStr) : {};

    // Build instructions array exactly like U6FinalPreview does
    // Combine all transformations per column into a single instruction (matching U6FinalPreview format)
    const instructionsMap = new Map<string, Record<string, any>>();
    
    // First, process all columns to create instruction map
    // Get all unique column names from all sources
    const allColumnNames = new Set<string>();
    columnNameEdits.forEach(edit => allColumnNames.add(edit.originalName));
    dataTypeSelections.forEach(dt => allColumnNames.add(dt.columnName));
    missingValueStrategies.forEach(s => allColumnNames.add(s.columnName));
    
    // Build one instruction per column (matching U6FinalPreview)
    allColumnNames.forEach(columnName => {
      const edit = columnNameEdits.find(e => e.originalName === columnName);
      const dataType = dataTypeSelections.find(dt => dt.columnName === columnName);
      const missingStrategy = missingValueStrategies.find(s => s.columnName === columnName);
      
      // Skip if column is dropped
      if (edit?.keep === false) {
        instructionsMap.set(columnName, {
          column: columnName,
          drop_column: true,
        });
        return;
      }
      
      // Build instruction for this column
      const instruction: Record<string, any> = { column: columnName };
      
      // Add rename if present
      if (edit?.editedName) {
        const trimmedNewName = edit.editedName.trim();
        if (trimmedNewName && trimmedNewName !== columnName) {
          instruction.new_name = trimmedNewName;
        }
      }
      
      // Add dtype change if present
      if (dataType) {
        const updateType = dataType.updateType || dataType.selectedType;
        const detectedType = dataType.detectedType || '';
        
        // Map frontend types to backend dtypes
        if (updateType && updateType !== detectedType) {
          let backendDtype: string;
          if (updateType === 'int') {
            backendDtype = 'int64';
          } else if (updateType === 'float') {
            backendDtype = 'float64';
          } else if (updateType === 'datetime' || updateType === 'date') {
            backendDtype = 'datetime64';
            if (dataType.format) {
              instruction.datetime_format = dataType.format;
            }
          } else if (updateType === 'boolean') {
            backendDtype = 'bool';
          } else {
            backendDtype = 'object';
          }
          instruction.dtype = backendDtype;
        }
      }
      
      // Add missing value strategy if present
      if (missingStrategy && missingStrategy.strategy !== 'none') {
        instruction.missing_strategy = missingStrategy.strategy;
        if (missingStrategy.strategy === 'custom' && missingStrategy.value !== undefined) {
          instruction.custom_value = missingStrategy.value;
        }
      }
      
      // Only add instruction if it has changes (more than just column name)
      if (Object.keys(instruction).length > 1) {
        instructionsMap.set(columnName, instruction);
      }
    });
    
    // Convert map to array
    const filteredInstructions = Array.from(instructionsMap.values());

    // Step 1: Process dataframe if there are changes (same as U6FinalPreview)
    if (filteredInstructions.length > 0) {
      const processRes = await fetch(`${VALIDATE_API}/process_saved_dataframe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          object_name: filePath, // Use exact MinIO path
          instructions: filteredInstructions,
        }),
      });

      if (!processRes.ok) {
        const errorData = await processRes.json().catch(() => null);
        const detail = errorData?.detail || (typeof errorData === 'string' ? errorData : '');
        return { success: false, error: detail || 'Failed to process dataframe' };
      }
    }

    // Step 2: Extract identifiers and measures from dataTypeSelections (same as U6FinalPreview)
    // Use final column names (after renames)
    const identifiers: string[] = [];
    const measures: string[] = [];
    
    dataTypeSelections.forEach(dt => {
      // Check if column was dropped
      const edit = columnNameEdits.find(e => e.originalName === dt.columnName);
      if (edit?.keep === false) {
        return; // Skip dropped columns
      }
      
      // Get final column name (after rename)
      const finalName = edit?.editedName && edit.editedName.trim() && edit.editedName !== edit.originalName
        ? edit.editedName.trim()
        : dt.columnName;
      
      // Classify based on columnRole
      if (dt.columnRole === 'identifier') {
        identifiers.push(finalName);
      } else if (dt.columnRole === 'measure') {
        measures.push(finalName);
      }
    });

    // Step 3: Save classification config to Redis and MongoDB (same as U6FinalPreview)
    const payload: Record<string, any> = {
      project_id: project.id || null,
      client_name: env.CLIENT_NAME || '',
      app_name: env.APP_NAME || '',
      project_name: env.PROJECT_NAME || '',
      identifiers,
      measures,
      dimensions: {},
    };
    if (filePath) {
      payload.file_name = filePath; // Use exact MinIO path for classification save
    }

    const saveRes = await fetch(`${CLASSIFIER_API}/save_config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include',
    });

    if (!saveRes.ok) {
      return { success: false, error: 'Failed to save classification config' };
    }

    // Step 4: Mark file as primed (same as U6FinalPreview)
    // Use markFileAsPrimed function which will be called from the component
    // For now, we'll return success and let the component handle marking as primed
    
    return { 
      success: true, 
      data: { 
        filePath,
        identifiers,
        measures,
        instructions: filteredInstructions,
      } 
    };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to auto-finalize and prime' };
  }
}
