import { UPLOAD_API } from '@/lib/api';

/**
 * Helper function to derive a file key from a filename
 */
export function deriveFileKey(fileName: string): string {
  // Remove extension and special characters, convert to lowercase
  const baseName = fileName.replace(/\.[^/.]+$/, ''); // Remove extension
  return baseName
    .replace(/[^a-zA-Z0-9]/g, '_') // Replace special chars with underscore
    .toLowerCase()
    .substring(0, 50); // Limit length
}

/**
 * Helper function to append environment fields to FormData
 */
export function appendEnvFields(form: FormData) {
  const envStr = localStorage.getItem('env');
  if (envStr) {
    try {
      const env = JSON.parse(envStr);
      form.append('client_id', env.CLIENT_ID || '');
      form.append('app_id', env.APP_ID || '');
      form.append('project_id', env.PROJECT_ID || '');
      form.append('client_name', env.CLIENT_NAME || '');
      form.append('app_name', env.APP_NAME || '');
      form.append('project_name', env.PROJECT_NAME || '');
    } catch {
      /* ignore */
    }
  }
}

/**
 * Save a file to the Saved DataFrames panel.
 * This function saves files from MinIO temp locations to the proper Saved DataFrames location.
 * 
 * @param filePath - The MinIO path of the file to save
 * @param fileName - The display name of the file
 * @param oldFilePath - Optional: The old file path to remove after saving
 * @param overwrite - Whether to overwrite existing file (default: true for updates, false for initial save)
 * @returns The new file path if successful, null if failed
 */
export async function saveFileToSavedDataFrames(
  filePath: string,
  fileName: string,
  oldFilePath?: string,
  overwrite: boolean = true
): Promise<string | null> {
  try {
    const fileKey = deriveFileKey(fileName);
    
    const form = new FormData();
    form.append('validator_atom_id', 'guided-upload');
    form.append('file_paths', JSON.stringify([filePath]));
    form.append('file_keys', JSON.stringify([fileKey]));
    form.append('overwrite', overwrite.toString()); // Overwrite existing file for updates
    appendEnvFields(form);
    
    const res = await fetch(`${UPLOAD_API}/save_dataframes`, {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Failed to save file');
      console.error('Failed to save file to Saved DataFrames:', errorText);
      throw new Error(errorText || 'Failed to save file');
    }
    
    const result = await res.json();
    const uploadResult = result.minio_uploads?.[0];
    
    if (!uploadResult || uploadResult.error) {
      throw new Error(uploadResult?.error || 'Failed to save file');
    }
    
    // Get the new file path from the result
    const newFilePath = uploadResult.minio_upload?.object_name || filePath;
    
    // Remove old file if provided and different from new file
    if (oldFilePath && oldFilePath !== newFilePath && oldFilePath.startsWith('temp_uploads/')) {
      try {
        // The backend should handle temp file removal, but we can also try to delete it
        // For now, we'll rely on the backend to clean up temp files
        console.log(`Old file ${oldFilePath} will be cleaned up by backend`);
      } catch (err) {
        console.warn('Failed to remove old file:', err);
        // Non-critical error, continue
      }
    }
    
    // Trigger refresh of Saved DataFrames panel
    window.dispatchEvent(new CustomEvent('dataframe-saved', {
      detail: { filePath: newFilePath, fileName }
    }));
    
    return newFilePath;
  } catch (error) {
    console.error('Error saving file to Saved DataFrames:', error);
    return null;
  }
}

