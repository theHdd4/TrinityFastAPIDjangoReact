import { MERGE_API, VALIDATE_API } from '@/lib/api';
import { AtomHandler, AtomHandlerContext, AtomHandlerResponse, Message } from './types';
import { 
  getFilename,
  createMessage,
  createSuccessMessage,
  createErrorMessage
} from './utils';

export const mergeHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { atomId, updateAtomSettings, setMessages } = context;
    
    console.log('🔍 MERGE HANDLER - FULL DATA RECEIVED:');
    console.log('='.repeat(80));
    console.log(JSON.stringify(data, null, 2));
    console.log('='.repeat(80));
    
    // 🔧 SIMPLIFIED: smart_response is now displayed directly in main component
    // Handlers only handle UI updates, not message display
    
    if (!data.merge_json) {
      return { success: false };
    }

    const cfg = data.merge_json;
    const file1 = Array.isArray(cfg.file1) ? cfg.file1[0] : cfg.file1;
    const file2 = Array.isArray(cfg.file2) ? cfg.file2[0] : cfg.file2;
    let joinColumns = Array.isArray(cfg.join_columns) ? cfg.join_columns : [];
    const joinType = cfg.join_type || 'inner';
    const bucketName = cfg.bucket_name || 'trinity';
    
    // 🔧 FIX: If LLM sends empty join_columns, we'll let the UI handle "Select All" default
    // The UI will show all available columns and user can select what they want
    console.log('🔍 LLM sent join_columns:', joinColumns);
    if (joinColumns.length === 0) {
      console.log('⚠️ LLM sent empty join_columns, will let UI handle default selection');
    }
    
    console.log('🤖 AI MERGE CONFIG EXTRACTED:', { file1, file2, joinColumns, joinType, bucketName });
    
    // Validate required fields
    if (!file1 || !file2) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: `❌ Invalid merge configuration: Missing file paths\n\nFile1: ${file1 || 'Missing'}\nFile2: ${file2 || 'Missing'}\n\nPlease ensure both files are specified in your request.`,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
      return { success: false };
    }
    
    if (joinColumns.length === 0) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: `❌ Invalid merge configuration: No join columns specified\n\nPlease specify which columns to use for joining the files.`,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
      return { success: false };
    }
    
    // Map AI file paths to object_name values for UI dropdown compatibility (using shared utility)
    let mappedFile1 = file1;
    let mappedFile2 = file2;
    
    try {
      console.log('🔄 Fetching frames to map AI file paths for merge...');
      
      // Fetch available files directly from VALIDATE_API
      const response = await fetch(`${VALIDATE_API}/list_saved_dataframes`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const availableFiles = await response.json();
      
      if (availableFiles && availableFiles.length > 0) {
        console.log('📋 Available frames for merge:', availableFiles.map((f: any) => ({ object_name: f.object_name, csv_name: f.csv_name })));
        
        // Map file paths to object names
        const mapFilePathToObjectName = (filePath: string, files: any[]) => {
          if (!filePath) return filePath;
          
          // Extract filename from path
          const filename = filePath.includes('/') ? filePath.split('/').pop() : filePath;
          
          // Find matching file
          const matchedFile = files.find(f => 
            f.csv_name === filename || 
            f.object_name === filename ||
            f.csv_name?.toLowerCase() === filename?.toLowerCase() ||
            f.object_name?.toLowerCase() === filename?.toLowerCase()
          );
          
          return matchedFile ? matchedFile.object_name : filePath;
        };
        
        mappedFile1 = mapFilePathToObjectName(file1, availableFiles);
        mappedFile2 = mapFilePathToObjectName(file2, availableFiles);
        
        console.log('🔧 File path mapping results:', {
          original_file1: file1,
          mapped_file1: mappedFile1,
          original_file2: file2,
          mapped_file2: mappedFile2
        });
      } else {
        console.warn('⚠️ No files available for mapping, using original file paths');
      }
    } catch (error) {
      console.error('❌ Error fetching frames for mapping:', error);
    }
    
    // 🔧 FIX: If LLM sent empty join_columns, we need to get available columns
    // and either use them all or let the UI handle the default
    if (joinColumns.length === 0) {
      console.log('⚠️ LLM sent empty join_columns, will let UI handle default selection');
      // The UI will show all available columns and user can select what they want
      // We'll keep joinColumns as empty array and let the MultiSelectDropdown handle it
    }
    
    // Update atom settings with mapped file names
    updateAtomSettings(atomId, { 
      file1: mappedFile1,  // Use mapped values for UI
      file2: mappedFile2,  // Use mapped values for UI
      joinColumns, 
      joinType, 
      availableColumns: joinColumns,
      aiConfig: cfg,
      aiMessage: data.message
    });
    
    // Add AI success message
    const aiSuccessMsg: Message = {
      id: (Date.now() + 1).toString(),
      content: `✅ ${data.message || 'AI merge configuration completed'}\n\nFiles: ${file1} + ${file2}\nJoin Type: ${joinType}\nJoin Columns: ${joinColumns.join(', ')}\n\n🔄 Operation completed! You can now configure the merge or proceed with the current settings.`,
      sender: 'ai',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, aiSuccessMsg]);
    
    // Auto-execute merge operation
    const getFilename = (filePath: string) => {
      if (!filePath) return "";
      return filePath.includes("/") ? filePath.split("/").pop() || filePath : filePath;
    };
    
    const lowercaseJoinColumns = joinColumns.map((col: string) => col.toLowerCase());
    
    try {
      const performEndpoint = `${MERGE_API}/perform`;
      console.log('🚀 Calling merge perform endpoint with AI config:', { file1, file2, joinColumns, joinType });
      
      const formData = new URLSearchParams({
        file1: getFilename(file1),
        file2: getFilename(file2),
        bucket_name: bucketName,
        join_columns: JSON.stringify(lowercaseJoinColumns),
        join_type: joinType,
      });
      
      console.log('📁 Sending filenames to merge backend:', { 
        file1: getFilename(file1), 
        file2: getFilename(file2),
        bucket_name: bucketName,
        join_columns: JSON.stringify(lowercaseJoinColumns),
        join_type: joinType
      });
      
      console.log('🔄 Column case conversion:', {
        original: joinColumns,
        lowercase: lowercaseJoinColumns
      });
      
      console.log('🔍 AI Config Debug:', {
        original_file1: file1,
        original_file2: file2,
        extracted_file1: getFilename(file1),
        extracted_file2: getFilename(file2),
        bucket_name: bucketName,
        join_columns_original: joinColumns,
        join_columns_lowercase: lowercaseJoinColumns,
        join_type: joinType
      });
      
      const res2 = await fetch(performEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });
      
      if (res2.ok) {
        const result = await res2.json();
        console.log('✅ Merge operation successful:', result);
        
        updateAtomSettings(atomId, {
          file1,
          file2,
          joinColumns,
          joinType,
          availableColumns: joinColumns,
          mergeResults: {
            ...result,
            result_file: null,
            unsaved_data: result.data,
          },
          operationCompleted: true
        });
        
        const completionMsg: Message = {
          id: (Date.now() + 1).toString(),
          content: `🎉 Merge operation completed successfully!\n\nResult ID: ${result.merge_id}\nShape: ${result.result_shape}\nColumns: ${result.columns?.length || 0}`,
          sender: 'ai',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, completionMsg]);
        
      } else {
        console.error('❌ Merge operation failed:', res2.status, res2.statusText);
        console.error('❌ Request details:', {
          endpoint: performEndpoint,
          file1: getFilename(file1),
          file2: getFilename(file2),
          bucket_name: bucketName,
          join_columns: lowercaseJoinColumns,
          join_type: joinType
        });
        
        let errorDetail = res2.statusText;
        let errorData = null;
        try {
          errorData = await res2.json();
          errorDetail = errorData.detail || errorData.message || res2.statusText;
          console.error('❌ Backend error details:', errorData);
        } catch (e) {
          console.error('❌ Could not parse error response:', e);
          // Use status text if can't parse error response
        }
        
        // Enhanced error message with more debugging info
        let errorContent = `❌ Merge operation failed: ${res2.status}\n\nError: ${errorDetail}\n\n`;
        errorContent += `Files: ${file1} + ${file2}\n`;
        errorContent += `Extracted: ${getFilename(file1)} + ${getFilename(file2)}\n`;
        errorContent += `Join Columns: ${joinColumns.join(', ')} (${lowercaseJoinColumns.join(', ')})\n`;
        errorContent += `Join Type: ${joinType}\n`;
        errorContent += `Bucket: ${bucketName}\n\n`;
        
        if (res2.status === 404) {
          errorContent += `💡 This might be a file not found error. Check if the files exist in the specified bucket.`;
        } else if (res2.status === 400) {
          errorContent += `💡 This might be a configuration error. Check the join columns and file formats.`;
        } else if (res2.status === 500) {
          errorContent += `💡 This is a server error. Please try again or contact support.`;
        }
        
        const errorMsg: Message = {
          id: (Date.now() + 1).toString(),
          content: errorContent,
          sender: 'ai',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMsg]);
        
        updateAtomSettings(atomId, {
          file1,
          file2,
          joinColumns,
          joinType,
          availableColumns: joinColumns,
          operationCompleted: false
        });
      }
    } catch (error) {
      console.error('❌ Error calling merge perform endpoint:', error);
      console.error('❌ Error details:', {
        message: (error as Error).message,
        stack: (error as Error).stack,
        file1: getFilename(file1),
        file2: getFilename(file2),
        bucket_name: bucketName,
        join_columns: lowercaseJoinColumns,
        join_type: joinType
      });
      
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: `❌ Error: ${(error as Error).message || 'Unknown error occurred'}\n\nFiles: ${file1} + ${file2}\nJoin Columns: ${joinColumns.join(', ')}\nJoin Type: ${joinType}\n\n💡 Please check your network connection and try again.`,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
      
      updateAtomSettings(atomId, {
        file1,
        file2,
        joinColumns,
        joinType,
        availableColumns: joinColumns,
        operationCompleted: false
      });
    }

    return { success: true };
  },

  handleFailure: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    // 🔧 SIMPLIFIED: smart_response is now displayed directly in main component
    // Handlers only handle UI updates, not message display
    console.log('💡 Merge handler failure - smart_response already displayed in main component');
    
    return { success: true };
  }
};
