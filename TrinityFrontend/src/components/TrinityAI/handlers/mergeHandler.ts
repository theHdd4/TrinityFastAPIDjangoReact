import { MERGE_API, VALIDATE_API } from '@/lib/api';
import { AtomHandler, AtomHandlerContext, AtomHandlerResponse, Message } from './types';
import { 
  getEnvironmentContext, 
  getFilename, 
  createMessage, 
  createSuccessMessage, 
  createErrorMessage,
  processSmartResponse,
  executePerformOperation,
  validateFileInput,
  autoSaveStepResult
} from './utils';

export const mergeHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    console.log('🚀🚀🚀 MERGE HANDLER - handleSuccess START');
    console.log('📥 Data received:', JSON.stringify(data, null, 2));
    console.log('🆔 AtomId:', context.atomId);
    console.log('🔢 SessionId:', context.sessionId);
    
    const { atomId, updateAtomSettings, setMessages, sessionId, stepAlias } = context;
    
    // 🚨 FORCED TEST MESSAGE - This MUST appear if handler is called
    console.log('🚨🚨🚨 MERGE HANDLER CALLED - FORCING TEST MESSAGE');
    const testMsg: Message = {
      id: `test_${Date.now()}`,
      content: '🚨 TEST: Merge handler was called! If you see this, the handler works.',
      sender: 'ai',
      timestamp: new Date(),
    };
    setMessages((prev: Message[]) => {
      console.log('🚨 BEFORE adding test message:', prev.length);
      const updated = [...prev, testMsg];
      console.log('🚨 AFTER adding test message:', updated.length);
      return updated;
    });
    console.log('🚨 Test message added to state');
    
    // 🔧 CRITICAL FIX: Show smart_response EXACTLY like DataFrame Operations (no isStreamMode check)
    const smartResponseText = processSmartResponse(data);
    console.log('💬 Smart response text:', smartResponseText);
    console.log('💬 Smart response length:', smartResponseText?.length);
    console.log('🔍 Has merge_json:', !!data.merge_json);
    
    // Add AI smart response message (prioritize smart_response - SAME AS DATAFRAME OPERATIONS)
    if (smartResponseText) {
      // Use the AI's smart response for a more conversational experience
      const aiMessage = createMessage(smartResponseText);
      setMessages(prev => [...prev, aiMessage]);
      console.log('🤖 AI Smart Response displayed:', smartResponseText);
    } else {
      // 🔧 FALLBACK: If backend doesn't send smart_response, create a generic success message
      console.warn('⚠️ No smart_response found in merge data - creating fallback message');
      const fallbackMsg = createMessage('✅ I\'ve received your merge request and will process it now.');
      setMessages(prev => [...prev, fallbackMsg]);
      console.log('🤖 Fallback message displayed');
    }
    
    if (!data.merge_json) {
      return { success: false, error: 'No merge configuration found in AI response' };
    }

    const cfg = data.merge_json;
    console.log('🤖 AI MERGE CONFIG EXTRACTED:', cfg, 'Session:', sessionId);
    
    // Extract configuration
    const file1 = Array.isArray(cfg.file1) ? cfg.file1[0] : cfg.file1;
    const file2 = Array.isArray(cfg.file2) ? cfg.file2[0] : cfg.file2;
    const joinColumns = Array.isArray(cfg.join_columns) ? cfg.join_columns : [];
    const joinType = cfg.join_type || 'inner';
    const bucketName = cfg.bucket_name || 'trinity';
    
    console.log('🔍 Extracted merge config:', { file1, file2, joinColumns, joinType, bucketName });
    
    // Validate file inputs
    const file1Validation = validateFileInput(file1, 'File 1');
    if (!file1Validation.isValid) {
      const errorMsg = createErrorMessage(
        'Merge configuration',
        file1Validation.message || 'Invalid file 1',
        'File 1 validation'
      );
      setMessages(prev => [...prev, errorMsg]);
      return { success: false, error: 'Invalid file 1' };
    }
    
    const file2Validation = validateFileInput(file2, 'File 2');
    if (!file2Validation.isValid) {
      const errorMsg = createErrorMessage(
        'Merge configuration',
        file2Validation.message || 'Invalid file 2',
        'File 2 validation'
      );
      setMessages(prev => [...prev, errorMsg]);
      return { success: false, error: 'Invalid file 2' };
    }
    
    // Validate join columns
    if (joinColumns.length === 0) {
      const errorMsg = createErrorMessage(
        'Merge configuration',
        'No join columns specified',
        'Join columns validation'
      );
      errorMsg.content += '\n\n💡 Please specify which columns to use for joining the files.';
      setMessages(prev => [...prev, errorMsg]);
      return { success: false, error: 'No join columns specified' };
    }
    
    console.log('✅ Validation passed');
    
    // Get environment context
    const envContext = getEnvironmentContext();
    console.log('🔍 Environment context loaded:', envContext);
    
    // Map AI file paths to correct file paths for UI compatibility (same as create-column)
    let mappedFile1 = file1;
    let mappedFile2 = file2;
    
    try {
      console.log('🔄 Fetching frames to map AI file paths for merge...');
      const framesResponse = await fetch(`${VALIDATE_API}/list_saved_dataframes`);
      if (framesResponse.ok) {
        const framesData = await framesResponse.json();
        const frames = Array.isArray(framesData.files) ? framesData.files : [];
        
        console.log('📋 Available frames for merge:', frames.map(f => ({ object_name: f.object_name, csv_name: f.csv_name })));
        
        // Map AI file path to correct file path for merge UI (same logic as create-column)
        const mapFilePathToObjectName = (aiFilePath: string) => {
          if (!aiFilePath) return aiFilePath;
          
          // Try exact match first
          let exactMatch = frames.find(f => f.object_name === aiFilePath);
          if (exactMatch) {
            console.log(`✅ Exact match found for merge ${aiFilePath}: ${exactMatch.object_name}`);
            return exactMatch.object_name;
          }
          
          // Try matching by filename
          const aiFileName = aiFilePath.includes('/') ? aiFilePath.split('/').pop() : aiFilePath;
          let filenameMatch = frames.find(f => {
            const frameFileName = f.csv_name.split('/').pop() || f.csv_name;
            return frameFileName === aiFileName;
          });
          
          if (filenameMatch) {
            console.log(`✅ Filename match found for merge ${aiFilePath} -> ${filenameMatch.object_name}`);
            return filenameMatch.object_name;
          }
          
          // Try partial match
          let partialMatch = frames.find(f => 
            f.object_name.includes(aiFileName) || 
            f.csv_name.includes(aiFileName) ||
            aiFilePath.includes(f.object_name) ||
            aiFilePath.includes(f.csv_name)
          );
          
          if (partialMatch) {
            console.log(`✅ Partial match found for merge ${aiFilePath} -> ${partialMatch.object_name}`);
            return partialMatch.object_name;
          }
          
          console.log(`⚠️ No match found for merge ${aiFilePath}, using original value`);
          return aiFilePath;
        };
        
        mappedFile1 = mapFilePathToObjectName(file1);
        mappedFile2 = mapFilePathToObjectName(file2);
        
        console.log('🔧 Merge file path mapping results:', {
          original_file1: file1,
          mapped_file1: mappedFile1,
          original_file2: file2,
          mapped_file2: mappedFile2
        });
      } else {
        console.warn('⚠️ Failed to fetch frames for merge mapping, using original file paths');
      }
    } catch (error) {
      console.error('❌ Error fetching frames for merge mapping:', error);
    }
    
    // Update atom settings with mapped file names (same structure as create-column)
    const settingsToUpdate = {
      file1: mappedFile1,  // Use mapped values for UI
      file2: mappedFile2,  // Use mapped values for UI
      joinColumns, 
      joinType, 
      availableColumns: joinColumns,
      aiConfig: cfg,
      aiMessage: data.message,
      operationCompleted: false,
      // Include environment context
      envContext,
      lastUpdateTime: Date.now()
    };
    
    console.log('🔧 Updating atom settings with:', {
      atomId,
      file1: mappedFile1,
      file2: mappedFile2,
      joinColumns,
      joinType,
      fullSettings: settingsToUpdate
    });
    
    updateAtomSettings(atomId, settingsToUpdate);
    
    // 🔧 FIX: No need for duplicate success message - smart_response already shown at the top
    console.log('📋 Merge configuration:', {
      file1: mappedFile1,
      file2: mappedFile2,
      joinColumns,
      joinType,
      session: sessionId
    });

    // 🔧 CRITICAL FIX: Call perform endpoint immediately (like create-column)
    try {
      console.log('🚀 Calling Merge perform endpoint immediately (like create-column)');
      console.log('📋 Configuration to execute:', { file1: mappedFile1, file2: mappedFile2, joinColumns, joinType });
      
      // Extract just the filename if it's a full path
      const filename1 = getFilename(file1);
      const filename2 = getFilename(file2);
      
      // Convert join columns to lowercase (backend requirement)
      const lowercaseJoinColumns = joinColumns.map((col: string) => col.toLowerCase());
      
      const formData = new URLSearchParams({
        file1: filename1,
        file2: filename2,
        bucket_name: bucketName,
        join_columns: JSON.stringify(lowercaseJoinColumns),
        join_type: joinType,
      });
      
      console.log('📁 Auto-executing with form data:', {
        file1: filename1,
        file2: filename2,
        bucket_name: bucketName,
        join_columns: lowercaseJoinColumns,
        join_type: joinType
      });
      
      const performEndpoint = `${MERGE_API}/perform`;
      console.log('📡 Calling perform endpoint:', performEndpoint);
      console.log('📦 FormData payload:', {
        file1: filename1,
        file2: filename2,
        bucket_name: bucketName,
        join_columns: JSON.stringify(lowercaseJoinColumns),
        join_type: joinType
      });
      
      const res2 = await fetch(performEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });
      
      console.log('📨 Perform endpoint response status:', res2.status);
      
      if (res2.ok) {
        const result = await res2.json();
        console.log('✅ Auto-execution successful:', result);
        
        // Update atom settings with results
        updateAtomSettings(atomId, {
          file1: mappedFile1,
          file2: mappedFile2,
          joinColumns,
          joinType,
          availableColumns: joinColumns,
          mergeResults: {
            ...result,
            result_file: null,
            unsaved_data: result.data,
          },
          operationCompleted: true,
          lastUpdateTime: Date.now()
        });
        
        // Add success message
        const completionDetails = {
          'Files': `${mappedFile1} + ${mappedFile2}`,
          'Join Type': joinType,
          'Join Columns': joinColumns.join(', '),
          'Result ID': result.merge_id || 'N/A',
          'Shape': result.result_shape || 'N/A',
          'Columns': result.columns?.length || 0
        };
        const completionMsg = createSuccessMessage('Merge operation', completionDetails);
        completionMsg.content += '\n\n📊 Results are ready! The files have been merged.\n\n💡 You can now view the merged data in the Merge interface.';
        setMessages(prev => [...prev, completionMsg]);
        
      } else {
        console.error('❌ Auto-execution failed:', res2.status, res2.statusText);
        
        // Try to get detailed error message
        let errorDetail = res2.statusText;
        try {
          const errorData = await res2.json();
          errorDetail = errorData.detail || errorData.message || res2.statusText;
        } catch (e) {
          // If we can't parse error response, use status text
        }
        
        const errorMsg = createErrorMessage(
          'Merge auto-execution',
          errorDetail,
          `Files: ${mappedFile1} + ${mappedFile2}, Join Columns: ${joinColumns.join(', ')}, Join Type: ${joinType}`
        );
        errorMsg.content += '\n\n💡 Please try clicking the Perform button manually.';
        setMessages(prev => [...prev, errorMsg]);
        
        updateAtomSettings(atomId, {
          operationCompleted: false,
          lastError: errorDetail
        });
      }
    } catch (error) {
      console.error('❌ Error during perform operation:', error);
      
      const errorMsg = createErrorMessage(
        'Merge auto-execution',
        error,
        `Files: ${mappedFile1} + ${mappedFile2}, Join Columns: ${joinColumns.join(', ')}, Join Type: ${joinType}`
      );
      errorMsg.content += '\n\n💡 Please try clicking the Perform button manually.';
      setMessages(prev => [...prev, errorMsg]);
      
      updateAtomSettings(atomId, {
        operationCompleted: false,
        lastError: (error as Error).message
      });
    }
    
    try {
      await autoSaveStepResult({
        atomType: 'merge',
        atomId,
        stepAlias,
        result,
        updateAtomSettings,
        setMessages,
        isStreamMode: context.isStreamMode,
      });
    } catch (autoSaveError) {
      console.error('❌ Merge auto-save failed:', autoSaveError);
    }

    console.log('🏁 MERGE HANDLER - handleSuccess COMPLETE');
    return { success: true };
  },

  handleFailure: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { setMessages, atomId, updateAtomSettings } = context;
    
    // 🔧 FIX: EXACTLY like DataFrame Operations - no isStreamMode check
    let aiText = '';
    if (data.smart_response) {
      aiText = data.smart_response;
    } else if (data.suggestions && Array.isArray(data.suggestions)) {
      aiText = `${data.message || 'Here\'s what I can help you with:'}\n\n${data.suggestions.join('\n\n')}`;
      
      if (data.file_analysis) {
        aiText += `\n\n📊 File Analysis:\n`;
        if (data.file_analysis.total_files) {
          aiText += `• Total files available: ${data.file_analysis.total_files}\n`;
        }
        if (data.file_analysis.merge_tips && data.file_analysis.merge_tips.length > 0) {
          aiText += `• Tips: ${data.file_analysis.merge_tips.join(', ')}\n`;
        }
      }
      
      if (data.next_steps && data.next_steps.length > 0) {
        aiText += `\n\n🎯 Next Steps:\n${data.next_steps.map((step: string, idx: number) => `${idx + 1}. ${step}`).join('\n')}`;
      }
    } else {
      aiText = data.smart_response || data.message || 'AI response received';
    }
    
    // Create and add AI message (EXACTLY like DataFrame Operations - no conditional)
    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      content: aiText,
      sender: 'ai',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, aiMsg]);
    console.log('📤 Added AI message to chat:', aiText.substring(0, 100) + '...');
    
    // 🔧 CRITICAL FIX: Load available files into atom settings for dropdown population
    // This ensures files appear in the merge interface even for failure cases
    if (data.available_files && typeof data.available_files === 'object') {
      console.log('📁 Loading available files into atom settings for merge interface');
      console.log('📋 Available files:', Object.keys(data.available_files));
      
      // Update atom settings with available files
      updateAtomSettings(atomId, {
        availableFiles: data.available_files,
        fileSuggestions: data.suggestions || [],
        nextSteps: data.next_steps || [],
        lastUpdateTime: Date.now()
      });
      
      console.log('✅ Files loaded into merge interface');
    }
    
    return { success: true };
  }
};
