import { EXPLORE_API } from '@/lib/api';
import { AtomHandler, AtomHandlerContext, AtomHandlerResponse, Message } from './types';
import { 
  getEnvironmentContext, 
  getFilename, 
  createMessage, 
  createSuccessMessage, 
  createErrorMessage,
  processSmartResponse,
  validateFileInput 
} from './utils';

export const exploreHandler: AtomHandler = {
  handleSuccess: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { atomId, updateAtomSettings, setMessages, sessionId } = context;
    
    if (!data.exploration_config) {
      return { success: false, error: 'No exploration configuration found in AI response' };
    }

    console.log('🔍 ===== EXPLORE AI RESPONSE =====');
    console.log('📝 User Prompt received for session:', sessionId);
    console.log('🔧 Exploration Config:', data.exploration_config);
    
    // Parse exploration configurations (always expect a list)
    const explorationsList = Array.isArray(data.exploration_config) ? data.exploration_config : [data.exploration_config];
    const numberOfExplorations = explorationsList.length;
    
    console.log('📊 Explorations in config:', numberOfExplorations);
    
    // Get target file from AI response and construct full path
    let targetFile = '';
    if (data.file_name) {
      const envContext = getEnvironmentContext();
      targetFile = envContext.client_name && envContext.app_name && envContext.project_name
        ? `${envContext.client_name}/${envContext.app_name}/${envContext.project_name}/${data.file_name}`
        : data.file_name;
      console.log('🎯 Constructed full file path:', targetFile);
    } else {
      console.log('⚠️ No file_name found in AI response');
    }
    
    // Validate target file
    const fileValidation = validateFileInput(targetFile, 'AI Explore');
    if (!fileValidation.isValid) {
      const errorMsg = createMessage(
        data.smart_response || `I couldn't find a data file to analyze. Please make sure you have selected or uploaded a data file first, then try your exploration request again. I'll be able to help you create meaningful visualizations once the data is available.`
      );
      setMessages(prev => [...prev, errorMsg]);
      return { success: false, error: 'Invalid file input' };
    }
    
    // Update atom settings with AI configuration
    updateAtomSettings(atomId, { 
      dataframe: targetFile,
      applied: true,
      aiConfig: data,
      aiMessage: data.message,
      exploration_config: data.exploration_config,
      envContext: getEnvironmentContext(),
      lastUpdateTime: Date.now()
    });
    
    // Add AI success message
    const successDetails = {
      'File': targetFile,
      'Explorations': numberOfExplorations.toString(),
      'Session': sessionId
    };
    const successMsg = createSuccessMessage('AI exploration configuration completed', successDetails);
    successMsg.content += '\n\n📊 Exploration configured! You can now proceed with the analysis.';
    setMessages(prev => [...prev, successMsg]);

    return { success: true };
  },

  handleFailure: async (data: any, context: AtomHandlerContext): Promise<AtomHandlerResponse> => {
    const { setMessages, updateAtomSettings, atomId } = context;
    
    // Process smart response with enhanced logic
    const aiText = processSmartResponse(data);
    
    // Create and add AI message
    const aiMsg = createMessage(aiText);
    setMessages(prev => [...prev, aiMsg]);
    
    // Store suggestions for potential use
    if (data.suggestions || data.next_steps || data.file_analysis) {
      updateAtomSettings(atomId, {
        aiSuggestions: data.suggestions || [],
        aiNextSteps: data.next_steps || [],
        recommendedChartTypes: data.recommended_chart_types || [],
        recommendedColumns: data.recommended_columns || [],
        fileAnalysis: data.file_analysis || null,
        lastInteractionTime: Date.now()
      });
    }
    
    return { success: true };
  }
};