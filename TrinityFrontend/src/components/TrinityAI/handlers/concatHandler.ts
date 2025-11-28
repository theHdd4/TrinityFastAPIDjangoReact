import { CONCAT_API, VALIDATE_API } from '@/lib/api';
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
  formatAgentResponseForTextBox,
  updateCardTextBox
} from './utils';

export const concatHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { atomId, updateAtomSettings, setMessages } = context;
    
    // 🚨 FORCED TEST MESSAGE - This MUST appear if handler is called
    console.log('🚨🚨🚨 CONCAT HANDLER CALLED - FORCING TEST MESSAGE');
    const testMsg: Message = {
      id: `test_${Date.now()}`,
      content: '🚨 TEST: Concat handler was called! If you see this, the handler works.',
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
    
    // 📝 Update card text box with response, reasoning, and smart_response
    console.log('📝 RAW DATA RECEIVED:', {
      hasResponse: !!data.response,
      hasDataResponse: !!data.data?.response,
      hasReasoning: !!data.reasoning,
      hasDataReasoning: !!data.data?.reasoning,
      hasSmartResponse: !!data.smart_response,
      hasDataSmartResponse: !!data.data?.smart_response,
      dataKeys: Object.keys(data),
      dataDataKeys: data.data ? Object.keys(data.data) : [],
    });
    
    const textBoxContent = formatAgentResponseForTextBox(data);
    console.log('📝 Formatted text box content length:', textBoxContent.length);
    console.log('📝 Formatted text box content preview:', textBoxContent.substring(0, 300));
    
    if (!textBoxContent || textBoxContent.trim() === '' || textBoxContent === 'No response data available.') {
      console.warn('⚠️ WARNING: Text box content is empty or invalid!');
      console.warn('⚠️ Data structure:', JSON.stringify(data, null, 2).substring(0, 1000));
    }
    
    // Store in atom settings for reference
    updateAtomSettings(atomId, {
      agentResponse: {
        response: data.response || data.data?.response || '',
        reasoning: data.reasoning || data.data?.reasoning || '',
        smart_response: data.smart_response || data.data?.smart_response || data.smartResponse || '',
        formattedText: textBoxContent
      }
    });
    
    // Update card's text box (this enables the text box icon on the card)
    console.log('📝 About to call updateCardTextBox with atomId:', atomId);
    try {
      await updateCardTextBox(atomId, textBoxContent);
      console.log('✅ updateCardTextBox completed successfully');
    } catch (error) {
      console.error('❌ ERROR in updateCardTextBox:', error);
      if (error instanceof Error) {
        console.error('❌ Error stack:', error.stack);
      }
    }
    
    // 🔧 CRITICAL FIX: Show smart_response EXACTLY like DataFrame Operations (no isStreamMode check)
    const smartResponseText = processSmartResponse(data);
    console.log('💬 Concat smart response:', smartResponseText);
    console.log('💬 Smart response length:', smartResponseText?.length);
    
    // Add AI smart response message (prioritize smart_response - SAME AS DATAFRAME OPERATIONS)
    if (smartResponseText) {
      // Use the AI's smart response for a more conversational experience
      const aiMessage = createMessage(smartResponseText);
      setMessages(prev => [...prev, aiMessage]);
      console.log('🤖 AI Smart Response displayed:', smartResponseText);
    } else {
      // 🔧 FALLBACK: If backend doesn't send smart_response, create a generic success message
      console.warn('⚠️ No smart_response found in concat data - creating fallback message');
      const fallbackMsg = createMessage('✅ I\'ve received your concat request and will process it now.');
      setMessages(prev => [...prev, fallbackMsg]);
      console.log('🤖 Fallback message displayed');
    }
    
    if (!data.concat_json) {
      return { success: false };
    }

    const cfg = data.concat_json;
    const file1 = Array.isArray(cfg.file1) ? cfg.file1[0] : cfg.file1;
    const file2 = Array.isArray(cfg.file2) ? cfg.file2[0] : cfg.file2;
    const direction = cfg.concat_direction || 'vertical';
    
    console.log('🤖 AI CONCAT CONFIG EXTRACTED:', { file1, file2, direction });
    console.log('🔍 AI CONFIG DETAILS:', {
      cfg_file1: cfg.file1,
      cfg_file2: cfg.file2,
      cfg_file1_type: typeof cfg.file1,
      cfg_file2_type: typeof cfg.file2,
      cfg_file1_is_array: Array.isArray(cfg.file1),
      cfg_file2_is_array: Array.isArray(cfg.file2)
    });
    
    // Validate required fields
    if (!file1 || !file2) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: `❌ Invalid concat configuration: Missing file paths\n\nFile1: ${file1 || 'Missing'}\nFile2: ${file2 || 'Missing'}\n\nPlease ensure both files are specified in your request.`,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
      return { success: false };
    }
    
    // Map AI file paths to object_name values for UI dropdown compatibility
    let mappedFile1 = file1;
    let mappedFile2 = file2;
    
    try {
      console.log('🔄 Fetching frames to map AI file paths to object_name values...');
      const framesResponse = await fetch(`${VALIDATE_API}/list_saved_dataframes`);
      if (framesResponse.ok) {
        const framesData = await framesResponse.json();
        const frames = Array.isArray(framesData.files) ? framesData.files : [];
        
        console.log('📋 Available frames:', frames.map(f => ({ object_name: f.object_name, csv_name: f.csv_name })));
        
        // Map AI file paths to object_name values
        const mapFilePathToObjectName = (aiFilePath: string) => {
          if (!aiFilePath) return aiFilePath;
          
          // Try exact match first
          let exactMatch = frames.find(f => f.object_name === aiFilePath);
          if (exactMatch) {
            console.log(`✅ Exact match found for ${aiFilePath}: ${exactMatch.object_name}`);
            return exactMatch.object_name;
          }
          
          // Try matching by filename
          const aiFileName = aiFilePath.includes('/') ? aiFilePath.split('/').pop() : aiFilePath;
          let filenameMatch = frames.find(f => {
            const frameFileName = f.csv_name.split('/').pop() || f.csv_name;
            return frameFileName === aiFileName;
          });
          
          if (filenameMatch) {
            console.log(`✅ Filename match found for ${aiFilePath} -> ${filenameMatch.object_name}`);
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
            console.log(`✅ Partial match found for ${aiFilePath} -> ${partialMatch.object_name}`);
            return partialMatch.object_name;
          }
          
          console.log(`⚠️ No match found for ${aiFilePath}, using original value`);
          return aiFilePath;
        };
        
        mappedFile1 = mapFilePathToObjectName(file1);
        mappedFile2 = mapFilePathToObjectName(file2);
        
        console.log('🔧 File path mapping results:', {
          original_file1: file1,
          mapped_file1: mappedFile1,
          original_file2: file2,
          mapped_file2: mappedFile2
        });
      } else {
        console.warn('⚠️ Failed to fetch frames, using original file paths');
      }
    } catch (error) {
      console.error('❌ Error fetching frames for mapping:', error);
    }
    
    // Update atom settings with mapped file names
    updateAtomSettings(atomId, { 
      file1: mappedFile1,  // Use mapped values for UI
      file2: mappedFile2,  // Use mapped values for UI
      direction,
      aiConfig: cfg,
      aiMessage: data.message
    });
    
    console.log('🔧 Atom settings updated with mapped file names:', {
      atomId,
      file1: mappedFile1,
      file2: mappedFile2,
      direction,
      note: 'Mapped to object_name values for UI dropdown compatibility'
    });
    
    // 🔧 FIX: No need for duplicate message - smart_response already shown at the top
    
    // Automatically call perform endpoint
    try {
      const performEndpoint = `${CONCAT_API}/perform`;
      console.log('🚀 Calling perform endpoint with AI config:', { file1, file2, direction });
      console.log('🔍 Using original file paths for backend:', { file1, file2 });
      
      const getFilename = (filePath: string) => {
        if (!filePath) return "";
        return filePath.includes("/") ? filePath.split("/").pop() || filePath : filePath;
      };
      
      const payload = {
        file1: getFilename(file1),
        file2: getFilename(file2),
        concat_direction: direction,
      };
      
      console.log('📁 Sending filenames to backend:', payload);
      
      console.log('🔍 AI Config Debug:', {
        original_file1: file1,
        original_file2: file2,
        extracted_file1: getFilename(file1),
        extracted_file2: getFilename(file2),
        direction: direction
      });
      
      const res2 = await fetch(performEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (res2.ok) {
        const result = await res2.json();
        console.log('✅ Perform operation successful:', result);
        
        updateAtomSettings(atomId, {
          file1: mappedFile1,  // Use mapped values for UI
          file2: mappedFile2,  // Use mapped values for UI
          direction,
          concatResults: result,
          concatId: result.concat_id,
          operationCompleted: true
        });
        
        console.log('🔧 Final atom settings after successful operation:', {
          atomId,
          file1,
          file2,
          direction,
          concatId: result.concat_id,
          operationCompleted: true
        });
        
        const completionMsg: Message = {
          id: (Date.now() + 1).toString(),
          content: `🎉 Operation completed successfully!\n\nResult ID: ${result.concat_id}\nShape: ${result.result_shape}\nColumns: ${result.columns?.length || 0}`,
          sender: 'ai',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, completionMsg]);
        
      } else {
        console.error('❌ Perform operation failed:', res2.status, res2.statusText);
        const errorMsg: Message = {
          id: (Date.now() + 1).toString(),
          content: `❌ Operation failed: ${res2.status} ${res2.statusText}`,
          sender: 'ai',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMsg]);
        
        updateAtomSettings(atomId, {
          file1: mappedFile1,  // Use mapped values for UI
          file2: mappedFile2,  // Use mapped values for UI
          direction,
          operationCompleted: false
        });
      }
    } catch (error) {
      console.error('❌ Error calling perform endpoint:', error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        content: `❌ Error: ${(error as Error).message || 'Unknown error occurred'}`,
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
      
      updateAtomSettings(atomId, {
        file1: mappedFile1,  // Use mapped values for UI
        file2: mappedFile2,  // Use mapped values for UI
        direction,
        operationCompleted: false
      });
    }

    return { success: true };
  },

  handleFailure: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { setMessages, updateAtomSettings, atomId } = context;
    
    // 📝 Update card text box with response, reasoning, and smart_response even on failure
    const textBoxContent = formatAgentResponseForTextBox(data);
    console.log('📝 Formatted text box content (failure):', textBoxContent.substring(0, 200) + '...');
    
    // Store in atom settings for reference
    updateAtomSettings(atomId, {
      agentResponse: {
        response: data.response || data.data?.response || '',
        reasoning: data.reasoning || data.data?.reasoning || '',
        smart_response: data.smart_response || data.data?.smart_response || data.smartResponse || '',
        formattedText: textBoxContent
      }
    });
    
    // Update card's text box (this enables the text box icon on the card)
    await updateCardTextBox(atomId, textBoxContent);
    console.log('📝 Card text box updated with agent response fields (failure case)');
    
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
        if (data.file_analysis.concat_tips && data.file_analysis.concat_tips.length > 0) {
          aiText += `• Tips: ${data.file_analysis.concat_tips.join(', ')}\n`;
        }
      }
      
      if (data.next_steps && data.next_steps.length > 0) {
        aiText += `\n\n🎯 Next Steps:\n`;
        data.next_steps.forEach((step: string, index: number) => {
          aiText += `${index + 1}. ${step}\n`;
        });
      }
      
      if (data.recommended_operations && data.recommended_operations.length > 0) {
        aiText += `\n\n⚡ Recommended Operations:\n`;
        data.recommended_operations.forEach((op: string, index: number) => {
          aiText += `${index + 1}. ${op}\n`;
        });
      }
    } else {
      // Fallback to processSmartResponse for backward compatibility
      aiText = processSmartResponse(data);
    }
    
    // Create and add AI message (EXACTLY like DataFrame Operations - no conditional)
    const aiMsg = createMessage(aiText);
    setMessages(prev => [...prev, aiMsg]);
    
    // Store suggestions for potential use
    if (data.suggestions || data.next_steps || data.file_analysis) {
      updateAtomSettings(atomId, {
        aiSuggestions: data.suggestions || [],
        aiNextSteps: data.next_steps || [],
        recommendedOperations: data.recommended_operations || [],
        fileAnalysis: data.file_analysis || null,
        lastInteractionTime: Date.now()
      });
    }
    
    return { success: true };
  }
};
