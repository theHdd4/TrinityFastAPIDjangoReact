import { VALIDATE_API } from '@/lib/api';
import { AtomHandler, AtomHandlerContext, AtomHandlerResponse, Message } from './types';
import { 
  getEnvironmentContext, 
  getFilename, 
  createMessage, 
  createSuccessMessage, 
  createErrorMessage,
  processSmartResponse,
  executePerformOperation,
  validateFileInput 
} from './utils';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

export const dfValidateHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { atomId, updateAtomSettings, setMessages } = context;
    
    console.log('🔧 ===== DF VALIDATE HANDLER CALLED =====');
    console.log('📦 Full data structure:', JSON.stringify(data, null, 2));
    console.log('🔍 Data keys:', Object.keys(data));
    console.log('🔍 Has validate_json:', !!data.validate_json);
    console.log('🔍 Has validate_config:', !!data.validate_config);
    
    // Show smart_response EXACTLY like other handlers
    const smartResponseText = processSmartResponse(data);
    console.log('💬 DF Validate smart response:', smartResponseText);
    
    // Add AI smart response message
    if (smartResponseText) {
      const aiMessage = createMessage(smartResponseText);
      setMessages(prev => [...prev, aiMessage]);
      console.log('🤖 AI Smart Response displayed:', smartResponseText);
    } else {
      console.warn('⚠️ No smart_response found in df_validate data - creating fallback message');
      const fallbackMsg = createMessage('✅ I\'ve received your data validation request and will process it now.');
      setMessages(prev => [...prev, fallbackMsg]);
    }
    
    // Extract validate_json - check multiple possible locations
    let validateJson = data.validate_json || data.validate_config || null;
    
    if (!validateJson) {
      console.error('❌ No validate_json or validate_config found in data');
      console.error('📦 Available keys:', Object.keys(data));
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: `❌ Invalid response: Missing validate_json configuration. Please try again.`,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
      return { success: false };
    }

    const cfg = validateJson;
    const file_name = cfg.file_name || "";
    const dtype_changes = cfg.dtype_changes || {};
    
    console.log('🤖 AI DF VALIDATE CONFIG EXTRACTED:', { file_name, dtype_changes });
    
    // Validate required fields - file_name is required, but dtype_changes can be empty (just load file)
    if (!file_name) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: `❌ Invalid validation configuration: Missing file name\n\nPlease ensure a file is specified in your request.`,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
      return { success: false };
    }
    
    const hasDtypeChanges = Object.keys(dtype_changes).length > 0;
    
    // STEP 1: Map AI file path to object_name and check if file needs to be loaded
    let mappedFileName = file_name;
    let objectName = file_name;
    let savedDataframe: { object_name: string; csv_name: string } | null = null;
    
    try {
      console.log('🔄 STEP 1: Fetching saved dataframes to map file and check if loading is needed...');
      const framesResponse = await fetch(`${VALIDATE_API}/list_saved_dataframes`);
      if (framesResponse.ok) {
        const framesData = await framesResponse.json();
        const frames = Array.isArray(framesData.files) ? framesData.files : [];
        
        console.log('📋 Available frames:', frames.map(f => ({ object_name: f.object_name, csv_name: f.csv_name })));
        
        // Map AI file path to object_name value
        const mapFilePathToObjectName = (aiFilePath: string) => {
          if (!aiFilePath) return { objectName: aiFilePath, savedDataframe: null };
          
          // Try exact match first
          let exactMatch = frames.find(f => f.object_name === aiFilePath);
          if (exactMatch) {
            console.log(`✅ Exact match found for ${aiFilePath}: ${exactMatch.object_name}`);
            return { objectName: exactMatch.object_name, savedDataframe: exactMatch };
          }
          
          // Try matching by filename
          const aiFileName = aiFilePath.includes('/') ? aiFilePath.split('/').pop() : aiFilePath;
          let filenameMatch = frames.find(f => {
            const frameFileName = f.csv_name.split('/').pop() || f.csv_name;
            return frameFileName === aiFileName;
          });
          
          if (filenameMatch) {
            console.log(`✅ Filename match found for ${aiFilePath} -> ${filenameMatch.object_name}`);
            return { objectName: filenameMatch.object_name, savedDataframe: filenameMatch };
          }
          
          // Try partial match
          let partialMatch = frames.find(f => 
            f.object_name.includes(aiFileName) || 
            f.csv_name.includes(aiFileName) ||
            aiFilePath.includes(f.object_name) ||
            aiFilePath.includes(f.csv_name)
          );
          
          if (partialMatch) {
            console.log(`✅ Partial match found for ${aiFilePath} -> ${partialMatch.object_name}`);
            return { objectName: partialMatch.object_name, savedDataframe: partialMatch };
          }
          
          console.log(`⚠️ No match found for ${aiFilePath}, using original value`);
          return { objectName: aiFilePath, savedDataframe: null };
        };
        
        const mappingResult = mapFilePathToObjectName(file_name);
        objectName = mappingResult.objectName;
        savedDataframe = mappingResult.savedDataframe;
        
        // Extract display filename for UI
        if (savedDataframe) {
          const displayFileName = savedDataframe.csv_name.split('/').pop() || savedDataframe.object_name.split('/').pop() || objectName;
          mappedFileName = displayFileName.replace(/\s+/g, '_');
        } else {
          mappedFileName = file_name.split('/').pop() || file_name;
        }
        
        console.log('🔧 File path mapping results:', {
          original_file: file_name,
          object_name: objectName,
          display_file_name: mappedFileName,
          saved_dataframe_found: !!savedDataframe
        });
      } else {
        console.warn('⚠️ Failed to fetch frames, using original file path');
        mappedFileName = file_name.split('/').pop() || file_name;
      }
    } catch (error) {
      console.error('❌ Error fetching frames for mapping:', error);
      mappedFileName = file_name.split('/').pop() || file_name;
    }
    
    // STEP 2: Load file if not already loaded (via API)
    // Get current settings from the store to check if file is already loaded
    const currentSettings = useLaboratoryStore.getState().getAtom(atomId)?.settings || {};
    
    if (savedDataframe) {
      console.log('📂 STEP 2: Loading file via API...');
      
      // Extract display filename for UI
      const displayFileName = savedDataframe.csv_name.split('/').pop() || savedDataframe.object_name.split('/').pop() || objectName;
      const sanitizedFileName = displayFileName.replace(/\s+/g, '_');
      
      // Check if file is already in uploadedFiles by checking settings
      const currentUploadedFiles = currentSettings?.uploadedFiles || [];
      const fileAlreadyLoaded = currentUploadedFiles.includes(sanitizedFileName);
      
      if (!fileAlreadyLoaded) {
        // Call the API to load the saved dataframe
        try {
          const loadEndpoint = `${VALIDATE_API}/load-saved-dataframe`;
          
          console.log('🚀 Calling load-saved-dataframe API:', { objectName });
          
          const loadResponse = await fetch(loadEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              object_name: objectName
            }),
          });
          
          if (loadResponse.ok) {
            const loadResult = await loadResponse.json();
            console.log('✅ File loaded via API:', loadResult);
            
            // Update atom settings to add the file (using API response data)
            // CRITICAL: Merge with existing settings to preserve all atom state
            const updatedSettings = {
              ...currentSettings, // Preserve all existing settings
              // Add to uploadedFiles array (merge with existing)
              uploadedFiles: [...currentUploadedFiles, sanitizedFileName],
              // Update filePathMap (merge with existing)
              filePathMap: {
                ...(currentSettings?.filePathMap || {}),
                [sanitizedFileName]: loadResult.object_name
              },
              // Update fileSizeMap (merge with existing)
              fileSizeMap: {
                ...(currentSettings?.fileSizeMap || {}),
                [sanitizedFileName]: loadResult.size || 0
              },
              // Update fileMappings if needed (merge with existing)
              fileMappings: {
                ...(currentSettings?.fileMappings || {}),
                [sanitizedFileName]: sanitizedFileName
              }
            };
            
            console.log('🔄 Updating atom settings with file:', {
              atomId,
              sanitizedFileName,
              objectName: loadResult.object_name,
              updatedSettings: {
                uploadedFiles: updatedSettings.uploadedFiles,
                filePathMap: updatedSettings.filePathMap,
                fileSizeMap: updatedSettings.fileSizeMap
              }
            });
            
            updateAtomSettings(atomId, updatedSettings);
            
            // Force a small delay to ensure state propagation, then verify
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Verify the update was successful
            const verifySettings = useLaboratoryStore.getState().getAtom(atomId)?.settings;
            console.log('✅ File added to atom settings after API load:', {
              objectName: loadResult.object_name,
              displayName: sanitizedFileName,
              size: loadResult.size,
              verification: {
                hasSettings: !!verifySettings,
                uploadedFiles: verifySettings?.uploadedFiles || [],
                filePathMap: verifySettings?.filePathMap || {},
                fileInUploadedFiles: (verifySettings?.uploadedFiles || []).includes(sanitizedFileName)
              }
            });
            
            // Show loading message
            const loadingMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `📂 Step 1: Loading file "${sanitizedFileName}" into the data upload atom...`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, loadingMsg]);
          } else {
            const errorText = await loadResponse.text();
            console.error('❌ Failed to load file via API:', loadResponse.status, errorText);
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Failed to load file: ${loadResponse.status} ${loadResponse.statusText}\n\n${errorText}`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
            return { success: false };
          }
        } catch (error) {
          console.error('❌ Error calling load-saved-dataframe API:', error);
          const errorMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: `❌ Error loading file: ${(error as Error).message || 'Unknown error occurred'}`,
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, errorMsg]);
          return { success: false };
        }
      } else {
        console.log('✅ File already loaded in UI:', sanitizedFileName);
        const alreadyLoadedMsg: Message = {
          id: (Date.now() + 1).toString(),
          content: `✅ File "${sanitizedFileName}" is already loaded. Proceeding with dtype conversion...`,
          sender: 'ai',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, alreadyLoadedMsg]);
      }
    }
    
    // STEP 3: Apply dtype changes (only if user requested changes)
    if (hasDtypeChanges) {
      console.log('🔄 STEP 3: Applying dtype changes...');
      
      // Update atom settings with dtype changes
      // The dtype_changes format should match what the backend expects
      // Format: { [fileName]: { [columnName]: dtype_string | { dtype: string, format?: string } } }
      const updatedDtypeChanges: Record<string, Record<string, string | { dtype: string; format?: string }>> = {};
      updatedDtypeChanges[mappedFileName] = dtype_changes;
      
      updateAtomSettings(atomId, { 
        dtypeChanges: updatedDtypeChanges,
        aiConfig: cfg,
        aiMessage: data.message
      });
      
      console.log('🔧 Atom settings updated with dtype changes:', {
        atomId,
        file_name: mappedFileName,
        dtype_changes_count: Object.keys(dtype_changes).length,
        note: 'Mapped to object_name value for UI dropdown compatibility'
      });
      
      // Automatically call apply-data-transformations endpoint
      try {
      const applyEndpoint = `${VALIDATE_API}/apply-data-transformations`;
      console.log('🚀 Calling apply-data-transformations endpoint with AI config:', { file_path: objectName, dtype_changes });
      
      const payload = {
        file_path: objectName, // Use full object_name path for backend
        dtype_changes: dtype_changes,
        missing_value_strategies: {} // Can be extended later
      };
      
      console.log('📁 Sending dtype changes to backend:', payload);
      
      const res2 = await fetch(applyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (res2.ok) {
        const result = await res2.json();
        console.log('✅ Apply transformations operation successful:', result);
        
        // Build insights summary
        const dtypeSummary = Object.entries(dtype_changes).map(([col, dtype]) => {
          let dtypeStr: string;
          if (typeof dtype === 'object' && dtype !== null && 'dtype' in dtype) {
            const dtypeObj = dtype as { dtype: string; format?: string };
            dtypeStr = dtypeObj.dtype + (dtypeObj.format ? ` (${dtypeObj.format})` : '');
          } else {
            dtypeStr = String(dtype);
          }
          return `  • ${col}: ${dtypeStr}`;
        }).join('\n');
        
        // Get current filesWithAppliedChanges to update
        const currentFilesWithAppliedChanges = currentSettings?.filesWithAppliedChanges || [];
        const updatedFilesWithAppliedChanges = currentFilesWithAppliedChanges.includes(mappedFileName) 
          ? currentFilesWithAppliedChanges 
          : [...currentFilesWithAppliedChanges, mappedFileName];
        
        updateAtomSettings(atomId, {
          dtypeChanges: updatedDtypeChanges,
          transformationResults: result,
          operationCompleted: true,
          // Mark file as having applied changes
          filesWithAppliedChanges: updatedFilesWithAppliedChanges
        });
        
        console.log('🔧 Final atom settings after successful operation:', {
          atomId,
          file_name: mappedFileName,
          operationCompleted: true
        });
        
        // Show detailed completion message with insights
        const completionMsg: Message = {
          id: (Date.now() + 1).toString(),
          content: `🎉 Data type conversion completed successfully!\n\n📊 **Work Done:**\n✅ File loaded: ${mappedFileName}\n✅ Columns converted: ${Object.keys(dtype_changes).length}\n✅ Rows processed: ${result.rows_affected || result.rows || 'N/A'}\n\n📝 **Dtype Changes Applied:**\n${dtypeSummary}\n\n💡 The file has been updated with the new data types and is ready for use in downstream operations.`,
          sender: 'ai',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, completionMsg]);
        
      } else {
        console.error('❌ Apply transformations operation failed:', res2.status, res2.statusText);
        const errorText = await res2.text();
        const errorMsg: Message = {
          id: (Date.now() + 1).toString(),
          content: `❌ Operation failed: ${res2.status} ${res2.statusText}\n\n${errorText}`,
          sender: 'ai',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMsg]);
        
        updateAtomSettings(atomId, {
          dtypeChanges: updatedDtypeChanges,
          operationCompleted: false
        });
      }
    } catch (error) {
      console.error('❌ Error calling apply-data-transformations endpoint:', error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: `❌ Error: ${(error as Error).message || 'Unknown error occurred'}`,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
      
      updateAtomSettings(atomId, {
        dtypeChanges: updatedDtypeChanges,
        operationCompleted: false
      });
      }
    } else {
      // No dtype changes requested - just load the file
      console.log('✅ STEP 3: No dtype changes requested - file loaded successfully');
      
      const completionMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: `✅ File loaded successfully!\n\n📂 **File:** ${mappedFileName}\n\n💡 The file has been loaded into the data upload atom and is ready for use in downstream operations. No dtype changes were requested, so the file maintains its current data types.`,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, completionMsg]);
      
      // Update atom settings (no dtype changes)
      updateAtomSettings(atomId, {
        aiConfig: cfg,
        aiMessage: data.message,
        operationCompleted: true
      });
    }

    return { success: true };
  },

  handleFailure: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { setMessages, updateAtomSettings, atomId } = context;
    
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
        if (data.file_analysis.recommended_conversions && data.file_analysis.recommended_conversions.length > 0) {
          aiText += `• Recommended conversions: ${data.file_analysis.recommended_conversions.join(', ')}\n`;
        }
        if (data.file_analysis.validation_tips && data.file_analysis.validation_tips.length > 0) {
          aiText += `• Tips: ${data.file_analysis.validation_tips.join(', ')}\n`;
        }
      }
      
      if (data.next_steps && data.next_steps.length > 0) {
        aiText += `\n\n🎯 Next Steps:\n`;
        data.next_steps.forEach((step: string, index: number) => {
          aiText += `${index + 1}. ${step}\n`;
        });
      }
    } else {
      // Fallback to processSmartResponse for backward compatibility
      aiText = processSmartResponse(data);
    }
    
    // Create and add AI message
    const aiMsg = createMessage(aiText);
    setMessages(prev => [...prev, aiMsg]);
    
    // Store suggestions for potential use
    if (data.suggestions || data.next_steps || data.file_analysis) {
      updateAtomSettings(atomId, {
        aiSuggestions: data.suggestions || [],
        aiNextSteps: data.next_steps || [],
        fileAnalysis: data.file_analysis || null,
        lastInteractionTime: Date.now()
      });
    }
    
    return { success: true };
  }
};

