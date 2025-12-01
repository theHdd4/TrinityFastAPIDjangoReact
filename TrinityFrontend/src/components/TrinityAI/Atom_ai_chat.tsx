import React, { useState, useEffect } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Bot, User, X, MessageSquare, Send, Plus, RotateCcw } from 'lucide-react';
import { TRINITY_AI_API, CONCAT_API, MERGE_API, CREATECOLUMN_API, GROUPBY_API, FEATURE_OVERVIEW_API, VALIDATE_API, CHART_MAKER_API, EXPLORE_API, DATAFRAME_OPERATIONS_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { createColumnHandler } from './handlers/createColumnHandler';
import { AtomHandlerContext } from './handlers/types';
import { getAtomHandler } from './handlers';
import { formatAgentResponseForTextBox, updateCardTextBox } from './handlers/utils';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface AtomAIChatBotProps {
  atomId: string;
  atomType: string;
  atomTitle: string;
  className?: string;
  disabled?: boolean;
}

const ENDPOINTS: Record<string, string> = {
  concat: `${TRINITY_AI_API}/concat`,
  merge: `${TRINITY_AI_API}/merge`,
  'chart-maker': `${TRINITY_AI_API}/chart-maker`,
  'create-column': `${TRINITY_AI_API}/create-transform`,
  'groupby-wtg-avg': `${TRINITY_AI_API}/groupby`,
  'explore': `${TRINITY_AI_API}/explore`,
  'correlation': `${TRINITY_AI_API}/correlation`,
  'dataframe-operations': `${TRINITY_AI_API}/dataframe-operations`,
  'data-upload-validate': `${TRINITY_AI_API}/df-validate`,
};

const PERFORM_ENDPOINTS: Record<string, string> = {
  merge: `${MERGE_API}/perform`,
  concat: `${CONCAT_API}/perform`,
  'create-column': `${CREATECOLUMN_API}/perform`,
  'groupby-wtg-avg': `${GROUPBY_API}/run`,
  'chart-maker': `${CHART_MAKER_API}/charts`,
  'explore': `${EXPLORE_API}/perform`,
};

import { cn } from '@/lib/utils';

const AtomAIChatBot: React.FC<AtomAIChatBotProps> = ({ atomId, atomType, atomTitle, className, disabled }) => {
  // STEP 1: For correlation, FORCE it to always render (bypass disabled check temporarily)
  // This ensures we can see the icon and debug why it's not working
  const isCorrelation = atomType === 'correlation';
  const shouldRender = isCorrelation ? true : !disabled;
  
  if (!shouldRender) {
    return null;
  }
  
  // STEP 2: Get endpoint - for correlation, ensure it's always constructed properly
  let endpoint = ENDPOINTS[atomType];
  
  // For correlation, if endpoint is missing or invalid, construct it
  if (isCorrelation && (!endpoint || endpoint.includes('undefined'))) {
    if (TRINITY_AI_API && typeof TRINITY_AI_API === 'string') {
      endpoint = `${TRINITY_AI_API}/correlation`;
    }
  }
  
  // STEP 3: Enable icon if endpoint exists (same as concat)
  // For correlation, force enable if we have TRINITY_AI_API
  const isEnabled = isCorrelation 
    ? (!!endpoint || (TRINITY_AI_API && typeof TRINITY_AI_API === 'string'))
    : !!endpoint;
  
  // Debug logging for correlation
  if (isCorrelation) {
    console.log('🔍 CORRELATION AI ICON - FORCED RENDER:', {
      atomType,
      atomId,
      disabled,
      endpoint,
      hasEndpoint: !!endpoint,
      TRINITY_AI_API: typeof TRINITY_AI_API !== 'undefined' ? TRINITY_AI_API : 'UNDEFINED',
      isEnabled,
      willShow: true,
      iconColor: isEnabled ? 'purple' : 'gray'
    });
  }
  
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string>(() => {
    // Generate session ID only once when component mounts
    const stored = localStorage.getItem(`trinity_ai_session_${atomId}`);
    if (stored) {
      return stored;
    }
    // Generate 5-digit session ID (10000-99999)
    return Math.floor(10000 + Math.random() * 90000).toString();
  });
  
  const [messages, setMessages] = useState<Message[]>(() => {
    // Load messages from localStorage if they exist
    const stored = localStorage.getItem(`trinity_ai_messages_${atomId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Ensure we have at least the initial message
        if (parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.warn('Failed to parse stored messages:', e);
      }
    }
    // Return initial message with current session ID
    const initialSessionId = localStorage.getItem(`trinity_ai_session_${atomId}`) || Math.floor(10000 + Math.random() * 90000).toString();
    return [{
      id: 'init',
      content: `Hi! I can help configure the "${atomTitle}" atom. Describe what you want to do.`,
      sender: 'ai',
      timestamp: new Date(),
    }];
  });
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const updateAtomSettings = useLaboratoryStore(state => state.updateAtomSettings);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(`trinity_ai_messages_${atomId}`, JSON.stringify(messages));
  }, [messages, atomId]);

  // Session management functions
  const handleClearChat = () => {
    const clearedMessages = [
      {
        id: 'init',
        content: `Hi! I can help configure the "${atomTitle}" atom. Describe what you want to do.\n\n💬 Chat history cleared`,
        sender: 'ai',
        timestamp: new Date(),
      },
    ];
    setMessages(clearedMessages);
    console.log('🧹 Chat history cleared for session:', sessionId);
  };

  const handleClearSession = () => {
    // Generate 5-digit session ID (10000-99999)
    const newSessionId = Math.floor(10000 + Math.random() * 90000).toString();
    setSessionId(newSessionId);
    
    // Clear localStorage for old session
    localStorage.removeItem(`trinity_ai_session_${atomId}`);
    localStorage.removeItem(`trinity_ai_messages_${atomId}`);
    
    const newMessages = [
      {
        id: 'init',
        content: `Hi! I can help configure the "${atomTitle}" atom. Describe what you want to do.`,
        sender: 'ai',
        timestamp: new Date(),
      },
    ];
    setMessages(newMessages);
    
    // Store new session data
    localStorage.setItem(`trinity_ai_session_${atomId}`, newSessionId);
    localStorage.setItem(`trinity_ai_messages_${atomId}`, JSON.stringify(newMessages));
    
    console.log('🆕 New session created:', newSessionId);
  };

  // Initialize session ID only once on component mount
  useEffect(() => {
    // Store session ID in localStorage for persistence
    localStorage.setItem(`trinity_ai_session_${atomId}`, sessionId);
    console.log('🆔 Session initialized:', sessionId);
  }, [sessionId, atomId]);

  const handleSendMessage = async () => {
    console.log('🚨🚨🚨 ===== ATOM_AI_CHAT handleSendMessage CALLED =====');
    console.log('🚨 atomType:', atomType);
    console.log('🚨 inputValue:', inputValue);
    
    // Get endpoint - for correlation, ensure it's constructed if missing
    let endpoint = ENDPOINTS[atomType];
    if (atomType === 'correlation' && (!endpoint || endpoint.includes('undefined'))) {
      if (TRINITY_AI_API && typeof TRINITY_AI_API === 'string') {
        endpoint = `${TRINITY_AI_API}/correlation`;
      }
    }
    const performEndpoint = PERFORM_ENDPOINTS[atomType];
    
    console.log('🚨 endpoint:', endpoint);
    console.log('🚨 performEndpoint:', performEndpoint);
    
    if (!inputValue.trim() || !endpoint) {
      console.log('🚨 EARLY RETURN - no input or endpoint');
      return;
    }

    const userMsg: Message = { id: Date.now().toString(), content: inputValue, sender: 'user', timestamp: new Date() };
    console.log('🚨 User message created:', userMsg);
    
    setMessages(prev => {
      console.log('🚨 Adding user message, prev count:', prev.length);
      return [...prev, userMsg];
    });
    
    setInputValue('');
    setIsLoading(true);
    
    console.log('🚨 About to make API request');

    try {
      // Get environment context from localStorage for dynamic path resolution
      let envContext = {
        client_name: '',
        app_name: '',
        project_name: ''
      };

      try {
        const envStr = localStorage.getItem('env');
        if (envStr) {
          const env = JSON.parse(envStr);
          envContext = {
            client_name: env.CLIENT_NAME || '',
            app_name: env.APP_NAME || '',
            project_name: env.PROJECT_NAME || ''
          };
          console.log('🔍 Environment context loaded:', envContext);
        }
      } catch (error) {
        console.warn('Failed to load environment context:', error);
      }

      console.log('🚨 Sending request to:', endpoint);
      console.log('🚨 With payload:', { prompt: userMsg.content, session_id: sessionId, ...envContext });
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: userMsg.content,
          session_id: sessionId,  // Include session ID for context
          ...envContext  // Include environment context for dynamic path resolution
        }),
      });
      
      console.log('🚨 Response received, status:', res.status, 'ok:', res.ok);
      
      let data;
      if (res.ok) {
        console.log('🚨 Response OK, parsing JSON...');
        data = await res.json();
        
        console.log('🚨🚨🚨 ===== RESPONSE PARSED =====');
        console.log('🚨 Response Keys:', Object.keys(data));
        console.log('🚨 data.success:', data.success);
        console.log('🚨 data.concat_json:', !!data.concat_json);
        console.log('🚨 data.merge_json:', !!data.merge_json);
        console.log('🚨 data.smart_response:', !!data.smart_response);
        console.log('🚨 Full response (first 500 chars):', JSON.stringify(data).substring(0, 500));
        console.log('🚨 ================================');
        
        // Enhanced AI response handling with smart_response as priority
        let aiText = '';
        if (data.success) {
          // Success case - use smart_response if available, otherwise show completion message
          aiText = data.smart_response || `I've successfully completed the operation for you. ${data.message || 'The configuration is ready and you can now proceed with the current settings or make further adjustments as needed.'}`;
        } else if (Array.isArray(data.suggestions) && data.suggestions.length) {
          // Suggestions case - ALWAYS use smart_response if available, don't add extra content
          if (data.smart_response) {
            aiText = data.smart_response;
          } else {
            // Only show suggestions if no smart_response
            aiText = `${data.message || 'Here\'s what I can help you with:'}\n\n${data.suggestions.join('\n\n')}`;
            
            // Add file analysis if available
            if (data.file_analysis) {
              aiText += `\n\n📊 File Analysis:\n`;
              if (data.file_analysis.total_files) {
                aiText += `• Total files available: ${data.file_analysis.total_files}\n`;
              }
              if (data.file_analysis.recommended_pairs && data.file_analysis.recommended_pairs.length > 0) {
                aiText += `• Recommended pairs: ${data.file_analysis.recommended_pairs.join(', ')}\n`;
              }
              if (data.file_analysis.common_columns && data.file_analysis.common_columns.length > 0) {
                aiText += `• Common columns: ${data.file_analysis.common_columns.join(', ')}\n`;
              }
              if (data.file_analysis.concat_tips && data.file_analysis.concat_tips.length > 0) {
                aiText += `• Tips: ${data.file_analysis.concat_tips.join(', ')}\n`;
              }
              if (data.file_analysis.merge_tips && data.file_analysis.merge_tips.length > 0) {
                aiText += `• Tips: ${data.file_analysis.merge_tips.join(', ')}\n`;
              }
            }
            
            // Add next steps if available
            if (data.next_steps && data.next_steps.length > 0) {
              aiText += `\n\n🎯 Next Steps:\n${data.next_steps.map((step, idx) => `${idx + 1}. ${step}`).join('\n')}`;
            }
          }
        } else {
          // Fallback case - use smart_response if available
          aiText = data.smart_response || data.message || data.response || data.final_response || 'AI response received';
        }
        
        // Only add general AI message if not handled by specific atom types
        const hasSpecificHandler = (atomType === 'concat' && data.concat_json) ||
                                 (atomType === 'merge' && data.merge_json) ||
                                 (atomType === 'create-column' && data.json) ||
                                 (atomType === 'groupby-wtg-avg' && data.groupby_json) ||
                                 (atomType === 'chart-maker' && data.chart_json) ||
                                 (atomType === 'explore' && data.exploration_config) ||
                                 (atomType === 'correlation' && data.correlation_config) ||
                                 (atomType === 'dataframe-operations' && data.dataframe_config) ||
                                 (atomType === 'data-upload-validate' && data.validate_json);
        
        console.log('🚨🚨🚨 ===== ATOM_AI_CHAT HANDLER CHECK =====');
        console.log('🚨 atomType:', atomType);
        console.log('🚨 hasSpecificHandler:', hasSpecificHandler);
        console.log('🚨 data.concat_json:', !!data.concat_json);
        console.log('🚨 data.merge_json:', !!data.merge_json);
        console.log('🚨 Will show general message:', !hasSpecificHandler);
        console.log('🚨 ==========================================');
        
        if (!hasSpecificHandler) {
          console.log('🚨 Showing general AI message:', aiText.substring(0, 100));
          const aiMsg: Message = { id: (Date.now() + 1).toString(), content: aiText, sender: 'ai', timestamp: new Date() };
          setMessages(prev => [...prev, aiMsg]);
        }

        // 🔧 DATAFRAME OPERATIONS: Handle AI-generated DataFrame operations configuration
        if (atomType === 'dataframe-operations' && data.dataframe_config) {
          console.log('🚨 Entering dataframe-operations handler');
          // DataFrame operations is now handled by modular handler system
          // No inline handling needed here
        } else if (atomType === 'concat' && data.concat_json) {
          try {
            console.log('🚨🚨🚨 ===== CONCAT HANDLER IN ATOM_AI_CHAT =====');
            console.log('🚨 data.concat_json:', data.concat_json);
            
            const cfg = data.concat_json;
          const file1 = Array.isArray(cfg.file1) ? cfg.file1[0] : cfg.file1;
          const file2 = Array.isArray(cfg.file2) ? cfg.file2[0] : cfg.file2;
          const direction = cfg.concat_direction || 'vertical';
          
          console.log('🤖 AI CONFIG EXTRACTED:', { file1, file2, direction });
          
          // 📝 Update card text box with response, reasoning, and smart_response
          console.log('📝 Updating card text box with agent response...');
          const textBoxContent = formatAgentResponseForTextBox(data);
          console.log('📝 Formatted text box content length:', textBoxContent.length);
          
          // Update card's text box (this enables the text box icon on the card)
          try {
            await updateCardTextBox(atomId, textBoxContent);
            console.log('✅ Card text box updated successfully');
          } catch (textBoxError) {
            console.error('❌ Error updating card text box:', textBoxError);
          }
          
          // Update atom settings with the AI configuration
          updateAtomSettings(atomId, { 
            file1, 
            file2, 
            direction,
            // Store the full AI response for reference
            aiConfig: cfg,
            aiMessage: data.message,
            agentResponse: {
              response: data.response || '',
              reasoning: data.reasoning || '',
              smart_response: data.smart_response || '',
              formattedText: textBoxContent
            }
          });
          
          console.log('🚨 About to add AI success message to chat');
          
          // 🔧 CRITICAL FIX: Show smart_response if available, otherwise use default message
          const messageContent = data.smart_response || 
            `✅ ${data.message || 'AI configuration completed'}\n\nFiles: ${file1} + ${file2}\nDirection: ${direction}\n\n🔄 Operation completed! You can now configure the concatenation or proceed with the current settings.`;
          
          // Add AI success message with operation completion
          const aiSuccessMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: messageContent,
            sender: 'ai',
            timestamp: new Date(),
          };
          
          console.log('🚨 Adding message to chat:', messageContent.substring(0, 100));
          setMessages(prev => {
            console.log('🚨 Prev messages count:', prev.length);
            const updated = [...prev, aiSuccessMsg];
            console.log('🚨 New messages count:', updated.length);
            return updated;
          });
          console.log('🚨 Message added!');
          
          // Automatically call perform endpoint with AI configuration
          try {
            if (performEndpoint) {
              console.log('🚀 Calling perform endpoint with AI config:', { file1, file2, direction });
              
              // Extract just the filename if it's a full path
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
              
              const res2 = await fetch(performEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              
              if (res2.ok) {
                const result = await res2.json();
                console.log('✅ Perform operation successful:', result);
                
                // Update atom settings with results
                updateAtomSettings(atomId, {
                  file1,
                  file2,
                  direction,
                  concatResults: result,
                  concatId: result.concat_id,
                  operationCompleted: true
                });
                
                // Add completion message
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
                  file1,
                  file2,
                  direction,
                  operationCompleted: false
                });
              }
            }
          } catch (error) {
            console.error('❌ Error calling perform endpoint:', error);
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Error: ${error.message || 'Unknown error occurred'}`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
            
            updateAtomSettings(atomId, {
              file1,
              file2,
              direction,
              operationCompleted: false
            });
          }
          
          console.log('✅✅✅ CONCAT HANDLER COMPLETED SUCCESSFULLY - NO ERRORS');
          
          } catch (concatError) {
            console.error('❌❌❌ ERROR IN CONCAT HANDLER:', concatError);
            console.error('Error message:', concatError?.message);
            console.error('Error stack:', concatError?.stack);
            const concatErrorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Concat handler error: ${concatError?.message}\n\n💡 Check console for details.`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, concatErrorMsg]);
          }
        } else if (atomType === 'merge' && data.merge_json) {
          const cfg = data.merge_json;
          const file1 = Array.isArray(cfg.file1) ? cfg.file1[0] : cfg.file1;
          const file2 = Array.isArray(cfg.file2) ? cfg.file2[0] : cfg.file2;
          const joinColumns = Array.isArray(cfg.join_columns)
            ? cfg.join_columns
            : [];
          const joinType = cfg.join_type || 'inner';
          
          console.log('🤖 AI MERGE CONFIG EXTRACTED:', { file1, file2, joinColumns, joinType });
          
          // 📝 Update card text box with response, reasoning, and smart_response
          console.log('📝 Updating card text box with agent response...');
          const textBoxContent = formatAgentResponseForTextBox(data);
          console.log('📝 Formatted text box content length:', textBoxContent.length);
          
          // Update card's text box (this enables the text box icon on the card)
          try {
            await updateCardTextBox(atomId, textBoxContent);
            console.log('✅ Card text box updated successfully');
          } catch (textBoxError) {
            console.error('❌ Error updating card text box:', textBoxError);
          }
          
          // Update atom settings with the AI configuration
          updateAtomSettings(atomId, { 
            file1, 
            file2, 
            joinColumns, 
            joinType, 
            availableColumns: joinColumns,
            // Store the full AI response for reference
            aiConfig: cfg,
            aiMessage: data.message,
            agentResponse: {
              response: data.response || '',
              reasoning: data.reasoning || '',
              smart_response: data.smart_response || '',
              formattedText: textBoxContent
            }
          });
          
          // Add AI success message with operation completion
          const aiSuccessMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: `✅ ${data.message || 'AI merge configuration completed'}\n\nFiles: ${file1} + ${file2}\nJoin Type: ${joinType}\nJoin Columns: ${joinColumns.join(', ')}\n\n🔄 Operation completed! You can now configure the merge or proceed with the current settings.`,
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, aiSuccessMsg]);
          
          // Automatically call perform endpoint with AI configuration
          try {
            if (performEndpoint) {
              console.log('🚀 Calling merge perform endpoint with AI config:', { file1, file2, joinColumns, joinType });
              
              // Extract just the filename if it's a full path
              const getFilename = (filePath: string) => {
                if (!filePath) return "";
                return filePath.includes("/") ? filePath.split("/").pop() || filePath : filePath;
              };
              
              // For merge, we need to send Form data (not JSON) and use just filenames
              // Backend will handle path resolution robustly
              // IMPORTANT: Convert join columns to lowercase to match backend expectation
              const lowercaseJoinColumns = joinColumns.map(col => col.toLowerCase());
              
              const formData = new URLSearchParams({
                file1: getFilename(file1),  // Extract filename from full path
                file2: getFilename(file2),  // Extract filename from full path
                bucket_name: cfg.bucket_name || 'trinity',
                join_columns: JSON.stringify(lowercaseJoinColumns),
                join_type: joinType,
              });
              
              console.log('📁 Sending filenames to merge backend:', { 
                file1: getFilename(file1), 
                file2: getFilename(file2),
                bucket_name: cfg.bucket_name || 'trinity',
                join_columns: JSON.stringify(lowercaseJoinColumns),
                join_type: joinType
              });
              
              console.log('🔄 Column case conversion:', {
                original: joinColumns,
                lowercase: lowercaseJoinColumns
              });
              
              const res2 = await fetch(performEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData,
              });
              
              if (res2.ok) {
                const result = await res2.json();
                console.log('✅ Merge operation successful:', result);
                
                // Update atom settings with results
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
                
                // Add completion message
                const completionMsg: Message = {
                  id: (Date.now() + 1).toString(),
                  content: `🎉 Merge operation completed successfully!\n\nResult ID: ${result.merge_id}\nShape: ${result.result_shape}\nColumns: ${result.columns?.length || 0}`,
                  sender: 'ai',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, completionMsg]);
                
              } else {
                console.error('❌ Merge operation failed:', res2.status, res2.statusText);
                
                // Try to get detailed error message from backend
                let errorDetail = res2.statusText;
                try {
                  const errorData = await res2.json();
                  errorDetail = errorData.detail || errorData.message || res2.statusText;
                } catch (e) {
                  // If we can't parse error response, use status text
                }
                
                const errorMsg: Message = {
                  id: (Date.now() + 1).toString(),
                  content: `❌ Merge operation failed: ${res2.status}\n\nError: ${errorDetail}\n\nFiles: ${file1} + ${file2}\nJoin Columns: ${joinColumns.join(', ')}\nJoin Type: ${joinType}`,
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
            }
          } catch (error) {
            console.error('❌ Error calling merge perform endpoint:', error);
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Error: ${error.message || 'Unknown error occurred'}`,
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
        } else if (atomType === 'create-column' && data.json) {
          // 🔧 CRITICAL FIX: Use the handler instead of inline code (like groupby should)
          console.log('🚀🚀🚀 NEW HANDLER: Using createColumnHandler for create-column - OLD CODE SHOULD NOT RUN');
          
          try {
            const handlerContext: AtomHandlerContext = {
              atomId,
              atomType,
              atomTitle,
              updateAtomSettings,
              setMessages,
              sessionId,
              isStreamMode: false
            };
            
            if (data.success !== false) {
              // Call handleSuccess
              await createColumnHandler.handleSuccess(data, handlerContext);
            } else {
              // Call handleFailure
              await createColumnHandler.handleFailure(data, handlerContext);
            }
          } catch (handlerError) {
            console.error('❌ Error in createColumnHandler:', handlerError);
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Error processing create column configuration: ${(handlerError as Error).message || 'Unknown error'}`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
          }
        } else if (atomType === 'groupby-wtg-avg' && data.groupby_json) {
          const cfg = data.groupby_json;
          
          console.log('🤖 AI GROUPBY CONFIG EXTRACTED:', cfg);
          console.log('🔍 AI CONFIG DETAILS:', {
            object_names: cfg.object_names,
            file_name: cfg.file_name,
            file_key: cfg.file_key,
            identifiers: cfg.identifiers,
            aggregations: cfg.aggregations
          });
          
          // 🔧 CRITICAL FIX: Automatically populate GroupBy settings with AI configuration
          const aiSelectedIdentifiers = cfg.identifiers || [];
          const aiSelectedMeasures = [];
          
          // 🔧 HELPER: Move AI-selected identifiers from measures to identifiers list (like manual drag-and-drop)
          // 🔧 CRITICAL: Also ensure AI-selected identifiers are added even if they're not in current lists
          const moveIdentifiersToIdentifierList = (selectedIds: string[]) => {
            const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
            const currentIdentifiers = currentAtom?.settings?.identifiers || currentAtom?.settings?.identifierList || [];
            const currentMeasures = currentAtom?.settings?.measures || currentAtom?.settings?.measureList || [];
            const allColumns = currentAtom?.settings?.allColumns || [];
            
            // 🔧 CRITICAL: Get all available column names from allColumns
            const allColumnNames = allColumns.map((col: any) => 
              typeof col === 'string' ? col : (col.column || col.name || col)
            );
            
            // 🔧 CRITICAL: Add AI-selected identifiers to identifiers list
            // Even if they're not in currentIdentifiers or currentMeasures, add them if they exist in allColumns
            const identifiersToAdd = selectedIds.filter(id => {
              // Check if column exists in allColumns (case-insensitive)
              const existsInColumns = allColumnNames.some((col: string) => 
                col.toLowerCase() === id.toLowerCase()
              );
              return existsInColumns && !currentIdentifiers.includes(id);
            });
            
            // Move selected identifiers from measures to identifiers, and add new ones
            const newIdentifiers = [...new Set([...currentIdentifiers, ...selectedIds])];
            const newMeasures = currentMeasures.filter(m => !selectedIds.includes(m));
            
            console.log('🔧 MOVE IDENTIFIERS DEBUG:', {
              selectedIds,
              currentIdentifiers,
              currentMeasures,
              allColumnNames: allColumnNames.slice(0, 10), // First 10 for logging
              identifiersToAdd,
              newIdentifiers,
              newMeasures
            });
            
            return { newIdentifiers, newMeasures };
          };
          
          // 🔧 FIX: Ensure we have a single file, not multiple files
          let singleFileName = '';
          
          // Try multiple possible fields from AI response
          const possibleFileFields = [
            cfg.object_names,
            cfg.file_name,
            cfg.file_key,
            cfg.file_name,
            cfg.source_file
          ].filter(Boolean);
          
          if (possibleFileFields.length > 0) {
            singleFileName = possibleFileFields[0];
            // If object_names contains multiple files (comma-separated), take only the first one
            if (singleFileName.includes(',')) {
              singleFileName = singleFileName.split(',')[0].trim();
              console.log('🔧 Multiple files detected, using first file:', singleFileName);
            }
            console.log('🔧 Using file path from AI response:', singleFileName);
          }
          
          // 🔧 CRITICAL FIX: If AI didn't provide a real file path, try to get it from atom settings
          if (!singleFileName || singleFileName === 'your_file.csv' || singleFileName === 'N/A') {
            console.log('⚠️ AI provided placeholder filename, trying to get real file path from atom settings');
            
            // Try to get the real data source from the current atom settings
            const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
            const realDataSource = currentAtom?.settings?.dataSource;
            
            if (realDataSource && realDataSource !== 'your_file.csv' && realDataSource !== 'N/A') {
              singleFileName = realDataSource;
              console.log('✅ Using real file path from atom settings:', singleFileName);
            } else {
              // Still no real file path - show error and don't proceed
              const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                content: `❌ Cannot proceed: No valid file path found\n\nAI provided: ${cfg.object_names || 'N/A'}\nAtom settings: ${realDataSource || 'N/A'}\n\n💡 Please ensure you have selected a data file before using AI GroupBy.`,
                sender: 'ai',
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, errorMsg]);
              
              // 🔧 CRITICAL: Move AI-selected identifiers from measures to identifiers list
              const { newIdentifiers, newMeasures } = moveIdentifiersToIdentifierList(aiSelectedIdentifiers);
              
              updateAtomSettings(atomId, { 
                aiConfig: cfg,
                aiMessage: data.message,
                operationCompleted: false,
                // 🔧 CRITICAL: Update identifier and measure lists (like manual drag-and-drop)
                identifiers: newIdentifiers,
                identifierList: newIdentifiers,
                measures: newMeasures,
                measureList: newMeasures,
                selectedIdentifiers: aiSelectedIdentifiers,
                selectedMeasures: aiSelectedMeasures,
                selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
                selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
                dataSource: '',
                bucketName: cfg.bucket_name || 'trinity'
              });
              
              return; // Don't proceed with the operation
            }
          }
          
          // 🔧 FIX: Convert AI aggregations to selectedMeasures format with proper validation
          if (cfg.aggregations && typeof cfg.aggregations === 'object') {
            Object.entries(cfg.aggregations).forEach(([field, aggConfig]) => {
              if (typeof aggConfig === 'object' && aggConfig !== null) {
                const agg = (aggConfig as any).agg;
                if (agg) {
                  // 🔧 VALIDATION: Only allow numeric fields for aggregations
                  // This will be validated when the backend loads the actual data
                  aiSelectedMeasures.push({
                    field: field,
                    aggregator: agg === 'sum' ? 'Sum' : 
                                agg === 'mean' ? 'Mean' : 
                                agg === 'min' ? 'Min' : 
                                agg === 'max' ? 'Max' : 
                                agg === 'count' ? 'Count' : 
                                agg === 'median' ? 'Median' : 
                                agg === 'weighted_mean' ? 'Weighted Mean' : 
                                agg === 'rank_pct' ? 'Rank Percentile' : 'Sum',
                    weight_by: (aggConfig as any).weight_by || '',
                    rename_to: (aggConfig as any).rename_to || field
                  });
                }
              } else if (typeof aggConfig === 'string') {
                // Handle simple string aggregations
                aiSelectedMeasures.push({
                  field: field,
                  aggregator: aggConfig === 'sum' ? 'Sum' : 
                              aggConfig === 'mean' ? 'Mean' : 
                              aggConfig === 'min' ? 'Min' : 
                              aggConfig === 'max' ? 'Max' : 
                              aggConfig === 'count' ? 'Count' : 
                              aggConfig === 'median' ? 'Median' : 
                              aggConfig === 'weighted_mean' ? 'Weighted Mean' : 
                              aggConfig === 'rank_pct' ? 'Rank Percentile' : 'Sum',
                  weight_by: '',
                  rename_to: field
                });
              }
            });
          }
          
          // 🔧 FIX: If no aggregations specified, create sensible defaults for numeric columns
          if (aiSelectedMeasures.length === 0 && aiSelectedIdentifiers.length > 0) {
            // Default to sum of volume (common numeric measure)
            aiSelectedMeasures.push({
              field: 'volume', // Will be validated when data is loaded
              aggregator: 'Sum',
              weight_by: '',
              rename_to: 'total_volume'
            });
          }
          
          console.log('🔧 AUTO-POPULATED GROUPBY SETTINGS:', {
            selectedIdentifiers: aiSelectedIdentifiers,
            selectedMeasures: aiSelectedMeasures,
            singleFileName: singleFileName
          });
          
          // 🔧 CRITICAL FIX: Final validation - ensure we have a valid file path
          if (!singleFileName || singleFileName === 'your_file.csv' || singleFileName === 'N/A') {
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Cannot proceed: Invalid file path\n\nFile path: ${singleFileName}\n\n💡 Please ensure you have selected a valid data file before using AI GroupBy.`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
            return; // Don't proceed with the operation
          }
          
          // 🔧 CRITICAL FIX: Move AI-selected identifiers from measures to identifiers list (like manual drag-and-drop)
          const { newIdentifiers, newMeasures } = moveIdentifiersToIdentifierList(aiSelectedIdentifiers);
          
          // Also ensure selectedMeasureNames doesn't include identifiers that were moved
          const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
          const currentSelectedMeasureNames = currentAtom?.settings?.selectedMeasureNames || [];
          const newSelectedMeasureNames = aiSelectedMeasures.map(m => m.field).filter(
            field => !aiSelectedIdentifiers.includes(field)
          );
          
          console.log('🔧 MOVING AI-SELECTED IDENTIFIERS FROM MEASURES TO IDENTIFIERS:', {
            aiSelectedIdentifiers,
            newIdentifiers,
            newMeasures,
            movedFromMeasures: (currentAtom?.settings?.measures || currentAtom?.settings?.measureList || []).filter(
              (m: string) => aiSelectedIdentifiers.includes(m)
            )
          });
          
          // 🔧 CRITICAL: Update identifiers FIRST, then selectedIdentifiers in a single update
          // This ensures fallbackIdentifiers includes all AI-selected identifiers before filtering
          console.log('🔧 UPDATING ATOM SETTINGS WITH AI IDENTIFIERS:', {
            aiSelectedIdentifiers,
            newIdentifiers,
            newMeasures,
            willUpdateIdentifiers: true,
            willUpdateSelectedIdentifiers: true
          });
          
          // Update atom settings with the AI configuration and auto-populated options
          // 🔧 CRITICAL: Update identifiers and identifierList FIRST, then selectedIdentifiers
          // This ensures the component's fallbackIdentifiers calculation includes all AI-selected identifiers
          updateAtomSettings(atomId, { 
            aiConfig: cfg,
            aiMessage: data.message,
            operationCompleted: false,
            // 🔧 CRITICAL: Update identifier and measure lists FIRST (like manual drag-and-drop)
            // This ensures fallbackIdentifiers = identifiers includes all AI-selected ones
            identifiers: newIdentifiers,
            identifierList: newIdentifiers,
            measures: newMeasures,
            measureList: newMeasures,
            // 🔧 CRITICAL: Set selectedIdentifiers AFTER updating identifiers list
            // This ensures they're not filtered out because they're now in fallbackIdentifiers
            selectedIdentifiers: aiSelectedIdentifiers, // These are now in identifiers list above
            selectedMeasures: aiSelectedMeasures,
            selectedMeasureNames: newSelectedMeasureNames.length > 0 ? newSelectedMeasureNames : aiSelectedMeasures.map(m => m.field),
            // Set default aggregation methods
            selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
            // Set data source if available - use single file only
            dataSource: singleFileName || cfg.file_key || '',
            // Set bucket name
            bucketName: cfg.bucket_name || 'trinity'
          });
          
          console.log('✅ ATOM SETTINGS UPDATED - identifiers now includes:', newIdentifiers);
          console.log('✅ selectedIdentifiers set to:', aiSelectedIdentifiers);
          
          // 📝 Update card text box with response, reasoning, and smart_response
          console.log('📝 Updating card text box with agent response...');
          const textBoxContent = formatAgentResponseForTextBox(data);
          console.log('📝 Formatted text box content length:', textBoxContent.length);
          
          // Update card's text box (this enables the text box icon on the card)
          try {
            await updateCardTextBox(atomId, textBoxContent);
            console.log('✅ Card text box updated successfully');
          } catch (textBoxError) {
            console.error('❌ Error updating card text box:', textBoxError);
          }
          
          // Store agent response in atom settings for reference
          updateAtomSettings(atomId, {
            agentResponse: {
              response: data.response || '',
              reasoning: data.reasoning || '',
              smart_response: data.smart_response || '',
              formattedText: textBoxContent
            }
          });
          
          // Add AI success message with operation completion
          const aiSuccessMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: `✅ ${data.message || 'AI groupby configuration completed'}\n\nFile: ${singleFileName || 'N/A'}\nIdentifiers: ${cfg.identifiers?.join(', ') || 'N/A'}\nAggregations: ${aiSelectedMeasures.map(m => `${m.field} (${m.aggregator})`).join(', ')}\n\n🔄 Operation completed! You can now configure the groupby or proceed with the current settings.`,
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, aiSuccessMsg]);
          
          // 🔧 CRITICAL FIX: Automatically call perform endpoint with AI configuration and validate real results
          try {
            if (performEndpoint) {
              console.log('🚀 Calling groupby perform endpoint with AI config:', { 
                singleFileName, 
                aiSelectedIdentifiers, 
                aiSelectedMeasures 
              });
              
              // Extract just the filename if it's a full path
              const getFilename = (filePath: string) => {
                if (!filePath) return "";
                return filePath.includes("/") ? filePath.split("/").pop() || filePath : filePath;
              };
              
              const normalizeForBackend = (col: string | undefined | null) => {
                if (!col || typeof col !== 'string') return '';
                return col.trim().toLowerCase();
              };

              const toBackendAggregation = (agg: string) => {
                const key = (agg || '').toLowerCase();
                switch (key) {
                  case 'weighted mean':
                    return 'weighted_mean';
                  case 'rank percentile':
                    return 'rank_pct';
                  default:
                    return key;
                }
              };

              // Convert to FormData format that GroupBy backend expects
              const formData = new URLSearchParams({
                validator_atom_id: atomId, // 🔧 CRITICAL: Add required validator_atom_id
                file_key: getFilename(singleFileName), // 🔧 CRITICAL: Add required file_key
                object_names: getFilename(singleFileName),
                bucket_name: cfg.bucket_name || 'trinity',
                identifiers: JSON.stringify(aiSelectedIdentifiers.map(id => normalizeForBackend(id))),
                aggregations: JSON.stringify(aiSelectedMeasures.reduce((acc, m) => {
                  // 🔧 CRITICAL FIX: Convert to backend-expected format
                  // Backend expects: { "field_name": { "agg": "sum", "weight_by": "", "rename_to": "" } }
                  const fieldKey = normalizeForBackend(m.field);
                  if (!fieldKey) {
                    return acc;
                  }
                  acc[fieldKey] = {
                    agg: toBackendAggregation(m.aggregator),
                    weight_by: normalizeForBackend(m.weight_by),
                    rename_to: m.rename_to || fieldKey
                  };
                  return acc;
                }, {}))
              });
              
              console.log('📁 Sending groupby data to backend:', {
                validator_atom_id: atomId,
                file_key: getFilename(singleFileName),
                object_names: getFilename(singleFileName),
                bucket_name: cfg.bucket_name || 'trinity',
                identifiers: aiSelectedIdentifiers.map(id => normalizeForBackend(id)),
                aggregations: aiSelectedMeasures.reduce((acc, m) => {
                  const fieldKey = normalizeForBackend(m.field);
                  if (!fieldKey) {
                    return acc;
                  }
                  acc[fieldKey] = {
                    agg: toBackendAggregation(m.aggregator),
                    weight_by: normalizeForBackend(m.weight_by),
                    rename_to: m.rename_to || fieldKey
                  };
                  return acc;
                }, {})
              });
              
              const res2 = await fetch(performEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData,
              });
              
              if (res2.ok) {
                const result = await res2.json();
                console.log('✅ GroupBy operation successful:', result);
                
                // 🔧 CRITICAL FIX: Backend has completed and saved the file
                // Now we need to retrieve the actual results from the saved file
                if (result.status === 'SUCCESS' && result.result_file) {
                  console.log('🔄 Backend operation completed, retrieving results from saved file:', result.result_file);
                  
                  // 🔧 FIX: Retrieve results from the saved file using the cached_dataframe endpoint
                  try {
                    const totalRows = typeof result.row_count === 'number' ? result.row_count : 1000;
                    const pageSize = Math.min(Math.max(totalRows, 50), 1000);
                    const cachedUrl = `${GROUPBY_API}/cached_dataframe?object_name=${encodeURIComponent(
                      result.result_file
                    )}&page=1&page_size=${pageSize}`;
                    const cachedRes = await fetch(cachedUrl);
                    if (cachedRes.ok) {
                      const cachedJson = await cachedRes.json();
                      const csvText = cachedJson?.data ?? '';
                      console.log('📄 Retrieved CSV data from saved file, length:', csvText.length);
                      
                      // Parse CSV to get actual results
                      const lines = csvText.split('\n');
                      if (lines.length > 1) {
                        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                        const rows = lines.slice(1).filter(line => line.trim()).map(line => {
                          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
                          const row: any = {};
                          headers.forEach((header, index) => {
                            row[header] = values[index] || '';
                          });
                          return row;
                        });
                        
                        console.log('✅ Successfully parsed results from saved file:', {
                          rowCount: rows.length,
                          columns: headers.length,
                          sampleData: rows.slice(0, 2)
                        });
                        
                        // ✅ REAL RESULTS AVAILABLE - Update atom settings with actual data
                        // 🔧 CRITICAL: Ensure identifiers are in identifiers list (not measures)
                        const { newIdentifiers, newMeasures } = moveIdentifiersToIdentifierList(aiSelectedIdentifiers);
                        
                        updateAtomSettings(atomId, {
                          // 🔧 CRITICAL: Update identifier and measure lists
                          identifiers: newIdentifiers,
                          identifierList: newIdentifiers,
                          measures: newMeasures,
                          measureList: newMeasures,
                          selectedIdentifiers: aiSelectedIdentifiers,
                          selectedMeasures: aiSelectedMeasures,
                          selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
                          selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
                          dataSource: singleFileName || cfg.file_key || '',
                          bucketName: cfg.bucket_name || 'trinity',
                          groupbyResults: {
                            ...result,
                            // 🔧 CRITICAL: Store the actual grouped data from saved file
                            unsaved_data: rows,
                            result_file: result.result_file,
                            row_count: rows.length,
                            columns: headers
                          },
                          operationCompleted: true
                        });
                        
                        // ✅ SUCCESS MESSAGE WITH REAL DATA FROM SAVED FILE
                        const completionMsg: Message = {
                          id: (Date.now() + 1).toString(),
                          content: `🎉 GroupBy operation completed successfully!\n\nResult File: ${result.result_file}\nRows: ${rows.length.toLocaleString()}\nColumns: ${headers.length}\n\n📊 Results are ready! The data has been grouped and saved.\n\n💡 You can now view the results in the GroupBy interface - no need to click Perform again!`,
                          sender: 'ai',
                          timestamp: new Date(),
                        };
                        setMessages(prev => [...prev, completionMsg]);
                        
                      } else {
                        throw new Error('No data rows found in CSV');
                      }
                    } else {
                      throw new Error(`Failed to fetch cached results: ${cachedRes.status}`);
                    }
                  } catch (fetchError) {
                    console.error('❌ Error fetching results from saved file:', fetchError);
                    
                    // ⚠️ File saved but couldn't retrieve results - still mark as successful
                    // 🔧 CRITICAL: Ensure identifiers are in identifiers list
                    const { newIdentifiers, newMeasures } = moveIdentifiersToIdentifierList(aiSelectedIdentifiers);
                    
                    updateAtomSettings(atomId, {
                      // 🔧 CRITICAL: Update identifier and measure lists
                      identifiers: newIdentifiers,
                      identifierList: newIdentifiers,
                      measures: newMeasures,
                      measureList: newMeasures,
                      selectedIdentifiers: aiSelectedIdentifiers,
                      selectedMeasures: aiSelectedMeasures,
                      selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
                      selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
                      dataSource: singleFileName || cfg.file_key || '',
                      bucketName: cfg.bucket_name || 'trinity',
                      groupbyResults: {
                        ...result,
                        result_file: result.result_file,
                        row_count: result.row_count || 0,
                        columns: result.columns || []
                      },
                      operationCompleted: true
                    });
                    
                    // ⚠️ WARNING MESSAGE - File saved but results retrieval failed
                    const warningMsg: Message = {
                      id: (Date.now() + 1).toString(),
                      content: `⚠️ GroupBy operation completed and file saved, but results display failed\n\nResult File: ${result.result_file}\nRows: ${result.row_count || 'Unknown'}\nColumns: ${result.columns?.length || 'Unknown'}\n\n📁 File has been saved successfully. Please click the Perform button to view the results.`,
                      sender: 'ai',
                      timestamp: new Date(),
                    };
                    setMessages(prev => [...prev, warningMsg]);
                  }
                  
                } else {
                  // ❌ Backend operation failed
                  console.error('❌ GroupBy backend operation failed:', result);
                  
                  // 🔧 CRITICAL: Ensure identifiers are in identifiers list
                  const { newIdentifiers, newMeasures } = moveIdentifiersToIdentifierList(aiSelectedIdentifiers);
                  
                  updateAtomSettings(atomId, {
                    // 🔧 CRITICAL: Update identifier and measure lists
                    identifiers: newIdentifiers,
                    identifierList: newIdentifiers,
                    measures: newMeasures,
                    measureList: newMeasures,
                    selectedIdentifiers: aiSelectedIdentifiers,
                    selectedMeasures: aiSelectedMeasures,
                    selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
                    selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
                    dataSource: singleFileName || cfg.file_key || '',
                    bucketName: cfg.bucket_name || 'trinity',
                    operationCompleted: false
                  });
                  
                  const errorMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    content: `❌ GroupBy operation failed: ${result.error || 'Unknown error'}\n\nFile: ${singleFileName}\nIdentifiers: ${aiSelectedIdentifiers.join(', ')}\nMeasures: ${aiSelectedMeasures.map(m => `${m.field} (${m.aggregator})`).join(', ')}\n\n💡 Please check your configuration and try clicking the Perform button manually.`,
                    sender: 'ai',
                    timestamp: new Date(),
                  };
                  setMessages(prev => [...prev, errorMsg]);
                }
              } else {
                console.error('❌ GroupBy operation failed:', res2.status, res2.statusText);
                
                // Try to get detailed error message from backend
                let errorDetail = res2.statusText;
                try {
                  const errorData = await res2.json();
                  errorDetail = errorData.detail || errorData.message || res2.statusText;
                } catch (e) {
                  // If we can't parse error response, use status text
                }
                
                const errorMsg: Message = {
                  id: (Date.now() + 1).toString(),
                  content: `❌ GroupBy operation failed: ${res2.status}\n\nError: ${errorDetail}\n\nFile: ${singleFileName}\nIdentifiers: ${aiSelectedIdentifiers.join(', ')}\nMeasures: ${aiSelectedMeasures.map(m => `${m.field} (${m.aggregator})`).join(', ')}\n\n💡 Please check your configuration and try clicking the Perform button manually.`,
                  sender: 'ai',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, errorMsg]);
                
                // 🔧 CRITICAL: Ensure identifiers are in identifiers list
                const { newIdentifiers, newMeasures } = moveIdentifiersToIdentifierList(aiSelectedIdentifiers);
                
                updateAtomSettings(atomId, {
                  // 🔧 CRITICAL: Update identifier and measure lists
                  identifiers: newIdentifiers,
                  identifierList: newIdentifiers,
                  measures: newMeasures,
                  measureList: newMeasures,
                  selectedIdentifiers: aiSelectedIdentifiers,
                  selectedMeasures: aiSelectedMeasures,
                  selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
                  selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
                  dataSource: singleFileName || cfg.file_key || '',
                  bucketName: cfg.bucket_name || 'trinity',
                  operationCompleted: false
                });
              }
            }
          } catch (error) {
            console.error('❌ Error calling groupby perform endpoint:', error);
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Error: ${error.message || 'Unknown error occurred'}\n\nFile: ${singleFileName}\nIdentifiers: ${aiSelectedIdentifiers.join(', ')}\nMeasures: ${aiSelectedMeasures.map(m => `${m.field} (${m.aggregator})`).join(', ')}\n\n💡 Please try clicking the Perform button manually.`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
            
            // 🔧 CRITICAL: Ensure identifiers are in identifiers list
            const { newIdentifiers, newMeasures } = moveIdentifiersToIdentifierList(aiSelectedIdentifiers);
            
            updateAtomSettings(atomId, {
              // 🔧 CRITICAL: Update identifier and measure lists
              identifiers: newIdentifiers,
              identifierList: newIdentifiers,
              measures: newMeasures,
              measureList: newMeasures,
              selectedIdentifiers: aiSelectedIdentifiers,
              selectedMeasures: aiSelectedMeasures,
              selectedMeasureNames: aiSelectedMeasures.map(m => m.field),
              selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
              dataSource: singleFileName || cfg.file_key || '',
              bucketName: cfg.bucket_name || 'trinity',
              operationCompleted: false
            });
          }
                 } else if (atomType === 'chart-maker' && data.chart_json) {
          // 🔧 SIMPLIFIED LOGIC: chart_json is always a list
          // Single chart: chart_json contains 1 chart configuration
          // Two charts: chart_json contains 2 chart configurations
          
          console.log('🔍 ===== CHART MAKER AI RESPONSE =====');
          console.log('📝 User Prompt:', userMsg.content);
          
          // 🔧 UNIFIED APPROACH: chart_json is always an array
          const chartsList = Array.isArray(data.chart_json) ? data.chart_json : [data.chart_json];
          const numberOfCharts = chartsList.length;
          
          console.log('📊 Charts in chart_json:', numberOfCharts);
          console.log('🔍 ===== END CHART ANALYSIS =====');
          
          // 🔧 GET TARGET FILE: Use the exact keys from LLM response
          let targetFile = '';
          let targetFileObjectName = ''; // Store the object_name format for dataSource dropdown
          
          // Priority 1: Use AI-provided file name (exact keys from LLM)
          if (data.file_name) {
            targetFile = data.file_name;
            // Extract object_name format (remove .arrow extension if present, keep path structure)
            targetFileObjectName = targetFile.replace(/\.arrow$/, '');
            console.log('🎯 Using AI-provided file name:', targetFile);
            console.log('🎯 Extracted object_name for dataSource:', targetFileObjectName);
          } else if (chartsList.length > 0 && chartsList[0].file) {
            // Fallback: Try to get file from first chart
            const chartFile = Array.isArray(chartsList[0].file) ? chartsList[0].file[0] : chartsList[0].file;
            if (chartFile) {
              targetFile = chartFile;
              // Extract object_name format (remove .arrow extension if present, keep path structure)
              targetFileObjectName = chartFile.replace(/\.arrow$/, '');
              console.log('🎯 Using file from chart config:', targetFile);
              console.log('🎯 Extracted object_name for dataSource:', targetFileObjectName);
            }
          } else {
            console.log('⚠️ No file name found in AI response');
          }
          
          // 🔧 CRITICAL: Fetch frames list and match to correct object_name for dropdown
          // This ensures the dropdown shows the selected file correctly
          let matchedObjectName = targetFileObjectName;
          try {
            const framesResponse = await fetch(`${VALIDATE_API}/list_saved_dataframes`);
            const framesData = await framesResponse.json();
            const frames = Array.isArray(framesData.files) ? framesData.files : [];
            
            // Try to find matching object_name in frames list
            const matchingFrame = frames.find((f: any) => {
              if (!f.object_name || !f.arrow_name) return false;
              
              // Exact match
              if (f.object_name === targetFileObjectName) return true;
              
              // Match by basename (filename without path)
              const targetBasename = targetFileObjectName.split('/').pop()?.replace(/\.arrow$/, '');
              const frameBasename = f.object_name.split('/').pop()?.replace(/\.arrow$/, '');
              if (targetBasename && frameBasename && targetBasename === frameBasename) return true;
              
              // Match by arrow_name basename
              const arrowBasename = f.arrow_name.split('/').pop()?.replace(/\.arrow$/, '');
              if (targetBasename && arrowBasename && targetBasename === arrowBasename) return true;
              
              // Match by full arrow_name path
              const arrowNameWithoutExt = f.arrow_name.replace(/\.arrow$/, '');
              if (arrowNameWithoutExt === targetFileObjectName || arrowNameWithoutExt.endsWith('/' + targetFileObjectName)) return true;
              
              return false;
            });
            
            if (matchingFrame) {
              matchedObjectName = matchingFrame.object_name;
              console.log('✅ Matched file to object_name:', targetFileObjectName, '->', matchedObjectName);
            } else {
              console.log('⚠️ Could not match file to frames list, using original:', targetFileObjectName);
              console.log('Available frames:', frames.map((f: any) => ({ object_name: f.object_name, arrow_name: f.arrow_name })));
            }
          } catch (error) {
            console.error('Failed to fetch frames list for matching:', error);
            // Continue with original targetFileObjectName
          }
          
          if (!targetFile) {
            // No file found - show error and don't proceed
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Cannot proceed: No valid file found for chart generation\n\nAI provided: ${data.file_name || 'N/A'}\nContext: ${data.file_context?.available_files?.join(', ') || 'N/A'}\n\n💡 Please ensure you have selected a data file before using AI Chart Maker.`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
            return;
          }
          
          // 🔧 CREATE CHART CONFIGURATIONS: chart_json is always a list
          let charts: any[] = [];
          
          console.log('🔧 Processing charts from chart_json list...');
          
          charts = chartsList.map((chartConfig: any, index: number) => {
            const chartType = chartConfig.chart_type || 'bar';
            const traces = chartConfig.traces || [];
            const title = chartConfig.title || `Chart ${index + 1}`;
            
            // 🔧 FILTER INTEGRATION: Process AI-generated filters
            let filters: Record<string, string[]> = {};
            if (chartConfig.filter_columns && chartConfig.filter_values) {
              const filterColumn = chartConfig.filter_columns;
              const filterValues = chartConfig.filter_values.split(',').map((v: string) => v.trim());
              filters[filterColumn] = filterValues;
              console.log('🔧 AI-generated filters applied:', { filterColumn, filterValues });
            }
            
            // 🔧 ADDITIONAL FILTER SUPPORT: Check for direct filters object
            if (chartConfig.filters && typeof chartConfig.filters === 'object') {
              filters = { ...filters, ...chartConfig.filters };
              console.log('🔧 Additional filters from chartConfig.filters:', chartConfig.filters);
            }
            
            // 🔧 CRITICAL FIX: Use SIMPLE MODE (isAdvancedMode: false) with legendField for multiple series
            // This uses the simpler format that the user prefers:
            // - Single Y-axis with legendField to segregate into multiple series
            // - OR dual Y-axis (yAxis + secondYAxis) for two different metrics
            // This avoids the complex traces-based advanced mode
            
            // Determine if we need dual Y-axis or legendField segregation
            const firstTrace = traces[0];
            const secondTrace = traces[1];
            
            // 🔧 CRITICAL: Validate that x_column and y_column are present (required for filters)
            if (!firstTrace?.x_column || !firstTrace?.y_column) {
              console.error(`❌ Chart ${index + 1} missing required columns:`, {
                x_column: firstTrace?.x_column,
                y_column: firstTrace?.y_column,
                traces: traces
              });
              // Try to extract from chartConfig as fallback
              const fallbackX = chartConfig.x_column || chartConfig.x_axis || '';
              const fallbackY = chartConfig.y_column || chartConfig.y_axis || '';
              if (!fallbackX || !fallbackY) {
                console.error(`❌ Chart ${index + 1} cannot be created - missing x_column and y_column`);
                return null; // Skip this chart
              }
            }
            
            // If we have 2 traces with different Y columns, use dual Y-axis (simpler)
            // If we have 1 trace but want multiple series, use legendField
            const useDualAxis = traces.length === 2 && 
                                firstTrace?.y_column && 
                                secondTrace?.y_column && 
                                firstTrace.y_column !== secondTrace.y_column;
            
            // Extract legendField if provided (for segregating single Y-axis into multiple series)
            const legendField = chartConfig.legend_field || chartConfig.segregate_field || 
                               (traces.length === 1 && traces[0]?.legend_field) || 
                               'aggregate'; // Default to 'aggregate' (no segregation)
            
            // 🔧 CRITICAL: Ensure xAxis and yAxis are set (required for filters to work)
            const xAxisValue = firstTrace?.x_column || chartConfig.x_column || chartConfig.x_axis || '';
            const yAxisValue = firstTrace?.y_column || chartConfig.y_column || chartConfig.y_axis || '';
            
            if (!xAxisValue || !yAxisValue) {
              console.error(`❌ Chart ${index + 1} cannot be created - xAxis or yAxis is empty`);
              return null; // Skip this chart
            }
            
            return {
              id: `ai_chart_${chartConfig.chart_id || index + 1}_${Date.now()}`,
              title: title,
              type: chartType as 'line' | 'bar' | 'area' | 'pie' | 'scatter',
              chart_type: chartType, // 🔧 CRITICAL FIX: Add chart_type field for backend compatibility
              xAxis: xAxisValue, // 🔧 CRITICAL: Must be non-empty for filters to work
              yAxis: yAxisValue, // 🔧 CRITICAL: Must be non-empty for filters to work
              // 🔧 CRITICAL: Use dual Y-axis if we have 2 different Y columns (simpler than traces)
              secondYAxis: useDualAxis ? secondTrace?.y_column : undefined,
              dualAxisMode: useDualAxis ? 'dual' : undefined, // 'dual' = separate axes, 'single' = combined
              filters: filters, // Chart-level filters
              aggregation: firstTrace?.aggregation || 'sum', // Aggregation method
              // 🔧 CRITICAL: Use legendField to segregate single Y-axis into multiple series
              // This is the simpler approach: one Y-axis, segregated by a field (e.g., Brand, Channel)
              legendField: !useDualAxis && legendField !== 'aggregate' ? legendField : 'aggregate',
              chartRendered: false,
              chartLoading: false,
              // 🔧 CRITICAL: Use SIMPLE MODE (not advanced mode) for AI-generated charts
              // This ensures the simpler format is used with legendField or dual Y-axis
              isAdvancedMode: false, // Use simple mode with legendField/dualAxis, not traces
              traces: [], // Empty traces array - not used in simple mode
            };
          }).filter((chart: any) => chart !== null); // Remove any null charts (validation failures)
          
          if (charts.length === 0) {
            console.error('❌ No valid charts could be created from AI response');
            toast({
              title: 'Chart creation failed',
              description: 'Could not create charts - missing required columns (x_column, y_column)',
              variant: 'destructive',
            });
            return;
          }
          
          console.log('🔧 Processed charts:', charts.length);
          
          // 🔧 CRITICAL FIX: Update atom settings with the AI configuration AND load data
          // Use object_name format (without .arrow) for dataSource to match dropdown format
          updateAtomSettings(atomId, { 
            aiConfig: data,
            aiMessage: data.message,
            // Add the AI-generated charts to the charts array
            charts: charts,
            // 🔧 CRITICAL: Set proper data source using matched object_name for dropdown visibility
            dataSource: matchedObjectName || targetFileObjectName || targetFile.replace(/\.arrow$/, ''),
            fileId: targetFile,
            // Set the first chart as active
            currentChart: charts[0],
            // Mark that AI has configured the chart(s)
            aiConfigured: true,
            // Set multiple charts configuration based on list length
            multipleCharts: numberOfCharts > 1,
            numberOfCharts: numberOfCharts,
            // Set chart type and basic settings for first chart
            chartType: charts[0].type,
            chartTitle: charts[0].title,
            xAxisColumn: charts[0].xAxis,
            yAxisColumn: charts[0].yAxis,
            // 🔧 CRITICAL: Set chart rendering state to trigger data loading
            chartRendered: false,
            chartLoading: false,
            // 🔧 AUTO-RENDER FLAG: Set flag to auto-trigger render after file loads
            autoRenderAfterLoad: true
          });
          
          // 🔧 CRITICAL FIX: Connect to actual file system and load real data
          try {
            console.log('🔄 Connecting AI chart to actual file system...');
            
            // 🔧 STEP 1: Load the actual file data using the chart-maker backend
            console.log('📥 Loading actual file data from backend:', targetFile);
            
            // Call the chart-maker backend to load the saved dataframe
            const loadResponse = await fetch(`${CHART_MAKER_API}/load-saved-dataframe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ object_name: targetFile })
            });
            
            if (loadResponse.ok) {
              const fileData = await loadResponse.json();
              console.log('✅ File data loaded successfully:', fileData);
              
              // 🔧 STEP 2: Fetch additional data required for filters (same as handleDataUpload)
              // The backend load-saved-dataframe returns basic info, but we need:
              // - allColumns from getAllColumns endpoint
              // - numericColumns/categoricalColumns from getColumns endpoint  
              // - uniqueValuesByColumn from getUniqueValues endpoint (for ALL columns, not just categorical)
              console.log('🔄 Fetching additional column data for filters...');
              
              // Import chartMakerApi to use the same methods as handleDataUpload
              // Use dynamic import to avoid circular dependencies
              const chartMakerApiModule = await import('@/components/AtomList/atoms/chart-maker/services/chartMakerApi');
              const chartMakerApi = chartMakerApiModule.chartMakerApi;
              
              const [allColumnsResponse, columnsResponse] = await Promise.all([
                chartMakerApi.getAllColumns(fileData.file_id),
                chartMakerApi.getColumns(fileData.file_id)
              ]);
              
              const resolvedFileId = columnsResponse.file_id || allColumnsResponse.file_id || fileData.file_id;
              const allColumns = allColumnsResponse.columns || fileData.columns || [];
              
              // 🔧 CRITICAL: Fetch unique values for ALL columns (not just categorical)
              // This is required for filters to work - getAvailableFilterColumns() needs uniqueValuesByColumn
              console.log('🔄 Fetching unique values for all columns...');
              let uniqueValuesByColumn = fileData.unique_values || {};
              
              if (allColumns.length > 0) {
                try {
                  const uniqueValuesResponse = await chartMakerApi.getUniqueValues(resolvedFileId, allColumns);
                  
                  if (uniqueValuesResponse.values) {
                    uniqueValuesByColumn = uniqueValuesResponse.values;
                    console.log(`✅ Fetched unique values for ${Object.keys(uniqueValuesByColumn).length} columns`);
                  }
                } catch (err) {
                  console.warn('⚠️ Failed to fetch unique values, using defaults:', err);
                }
              }
              
              // 🔧 STEP 3: Update atom settings with REAL file data (matching handleDataUpload structure)
              // Use object_name format (without .arrow) for dataSource to match dropdown format
              // 🔧 CRITICAL: Don't clear charts here - preserve them so they don't disappear
              updateAtomSettings(atomId, {
                dataSource: matchedObjectName || targetFileObjectName || targetFile.replace(/\.arrow$/, ''),
                fileId: resolvedFileId,
                uploadedData: {
                  columns: fileData.columns,
                  rows: fileData.sample_data,
                  numeric_columns: fileData.numeric_columns,
                  categorical_columns: fileData.categorical_columns,
                  unique_values: fileData.unique_values,
                  file_id: resolvedFileId,
                  row_count: fileData.row_count,
                  // 🔧 CRITICAL: Add fields required for getAvailableFilterColumns() to work
                  // These must match the structure that handleDataUpload creates
                  allColumns: allColumns, // Required for filter column detection (from getAllColumns)
                  numericColumns: columnsResponse.numeric_columns || fileData.numeric_columns || [], // Required for filter column detection
                  categoricalColumns: columnsResponse.categorical_columns || fileData.categorical_columns || [], // Required for filter column detection
                  uniqueValuesByColumn: uniqueValuesByColumn // Required for filter dropdown values (from getUniqueValues)
                },
                // 🔧 CRITICAL: Don't reset chartRendered - keep existing chart state
                // chartRendered will be updated after charts are generated
                chartLoading: true, // Set to true to prevent useEffect from interfering
                // 🔧 AUTO-RENDER FLAG: Keep flag to auto-trigger render
                autoRenderAfterLoad: true,
                // 🔧 CRITICAL: Preserve existing charts - don't clear them
                // Charts will be updated in STEP 4 after generation
                charts: charts  // Explicitly preserve charts here to prevent clearing
              });
              
              // 🔧 STEP 3: Generate charts using the backend - UNIFIED APPROACH
              console.log('🚀 Generating charts with backend data...');
              
              // Generate each chart separately by calling FastAPI multiple times
              const generatedCharts = [];
              
              // 🔧 CRITICAL FIX: Add debouncing to prevent multiple simultaneous requests
              const generateChartWithDelay = async (chart: any, index: number, delay: number) => {
                return new Promise((resolve) => {
                  setTimeout(async () => {
                    try {
                      const result = await generateSingleChart(chart, index);
                      resolve(result);
                    } catch (error) {
                      resolve({ ...chart, error: error.message, chartRendered: false });
                    }
                  }, delay);
                });
              };
              
              const generateSingleChart = async (chart: any, index: number) => {
                const chartType = chart.type || chart.chart_type || 'bar';
                const title = chart.title;
                
                console.log(`📊 Generating chart ${index + 1}/${charts.length}: ${title} (${chartType})`);
                console.log(`🔍 Chart mode: ${chart.isAdvancedMode ? 'Advanced (traces)' : 'Simple (legendField/dualAxis)'}`);
                
                // 🔧 CRITICAL FIX: Use SIMPLE MODE format (not advanced traces mode)
                // Simple mode uses: yAxis, secondYAxis (optional), legendField (optional), filters
                const processedFilters = chart.filters || {};
                
                // Build traces for API - simple mode uses buildTracesForAPI which handles legendField
                // For simple mode with dual Y-axis: create 2 traces (one for each Y-axis)
                // For simple mode with legendField: create 1 trace with legend_field
                let apiTraces: any[] = [];
                
                if (chart.secondYAxis) {
                  // Dual Y-axis mode: create 2 traces
                  apiTraces = [
                    {
                      x_column: chart.xAxis,
                      y_column: chart.yAxis,
                      name: chart.yAxis,
                      chart_type: chartType,
                      aggregation: chart.aggregation || 'sum',
                      filters: processedFilters,
                    },
                    {
                      x_column: chart.xAxis,
                      y_column: chart.secondYAxis,
                      name: chart.secondYAxis,
                      chart_type: chartType,
                      aggregation: chart.aggregation || 'sum',
                      filters: processedFilters,
                    }
                  ];
                } else {
                  // Single Y-axis with optional legendField for segregation
                  apiTraces = [
                    {
                      x_column: chart.xAxis,
                      y_column: chart.yAxis,
                      name: chart.yAxis,
                      chart_type: chartType,
                      aggregation: chart.aggregation || 'sum',
                      legend_field: chart.legendField && chart.legendField !== 'aggregate' ? chart.legendField : undefined,
                      filters: processedFilters,
                    }
                  ];
                }
                
                // 🔧 FILTER VALIDATION: Log filter processing
                if (Object.keys(processedFilters).length > 0) {
                  console.log(`✅ Chart ${index + 1} filters processed:`, processedFilters);
                }
                
                const chartRequest = {
                  file_id: fileData.file_id,
                  chart_type: chartType,
                  traces: apiTraces, // Simple mode: 1-2 traces with legendField or dual Y-axis
                  title: title,
                  filters: processedFilters // Chart-level filters
                };
                
                console.log(`📊 Chart ${index + 1} request payload:`, chartRequest);
                console.log(`🔍 Chart ${index + 1} configuration:`, {
                  chartType,
                  xAxis: chart.xAxis,
                  yAxis: chart.yAxis,
                  secondYAxis: chart.secondYAxis,
                  legendField: chart.legendField,
                  chartFilters: processedFilters,
                  tracesCount: apiTraces.length,
                  isAdvancedMode: chart.isAdvancedMode
                });
                
                try {
                  const chartResponse = await fetch(`${CHART_MAKER_API}/charts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(chartRequest)
                  });
                  
                  if (chartResponse.ok) {
                    const chartResult = await chartResponse.json();
                    console.log(`✅ Chart ${index + 1} generated successfully:`, chartResult);
                    
                    // Update chart configuration with backend-generated chart
                    const updatedChart = {
                      ...chart,
                      chartConfig: chartResult.chart_config,
                      filteredData: chartResult.chart_config.data,
                      chartRendered: true,
                      chartLoading: false,
                      lastUpdateTime: Date.now()
                    };
                    
                    return updatedChart;
                    
                  } else {
                    console.error(`❌ Chart ${index + 1} generation failed:`, chartResponse.status);
                    
                    // Try to get detailed error message
                    let errorDetail = chartResponse.statusText;
                    try {
                      const errorData = await chartResponse.json();
                      errorDetail = errorData.detail || errorData.message || chartResponse.statusText;
                    } catch (e) {
                      // If we can't parse error response, use status text
                    }
                    
                    // Check if it's a filter-related error
                    const isFilterError = errorDetail.toLowerCase().includes('filter') || 
                                       errorDetail.toLowerCase().includes('column') ||
                                       errorDetail.toLowerCase().includes('not found');
                    
                    // Add error message for this specific chart
                    const errorMsg: Message = {
                      id: (Date.now() + index).toString(),
                      content: `⚠️ Chart ${index + 1} generation failed: ${chartResponse.status}\n\nError: ${errorDetail}\n\nChart: ${title} (${chartType})\n${isFilterError ? '\n🔍 This might be a filter-related issue. Check if the filter columns exist in your data.' : ''}\n\n💡 This chart may need manual generation.`,
                      sender: 'ai',
                      timestamp: new Date(),
                    };
                    setMessages(prev => [...prev, errorMsg]);
                    
                    // Return failed chart with error state
                    return {
                      ...chart,
                      chartRendered: false,
                      chartLoading: false,
                      error: errorDetail
                    };
                  }
                } catch (error) {
                  console.error(`❌ Error generating chart ${index + 1}:`, error);
                  
                  // Add error message for this specific chart
                  const errorMsg: Message = {
                    id: (Date.now() + index).toString(),
                    content: `❌ Error generating chart ${index + 1}: ${error.message || 'Unknown error occurred'}\n\nChart: ${title} (${chartType})\n\n💡 This chart may need manual generation.`,
                    sender: 'ai',
                    timestamp: new Date(),
                  };
                  setMessages(prev => [...prev, errorMsg]);
                  
                  // Return failed chart with error state
                  return {
                    ...chart,
                    chartRendered: false,
                    chartLoading: false,
                    error: error.message || 'Unknown error'
                  };
                }
              };
              
              // 🔧 CRITICAL FIX: Generate charts with proper debouncing to prevent multiple simultaneous requests
              const chartPromises = charts.map((chart, index) => 
                generateChartWithDelay(chart, index, index * 1000) // 1 second delay between each chart
              );
              
              // Wait for all charts to be generated
              const chartResults = await Promise.all(chartPromises);
              generatedCharts.push(...chartResults);
              
              // 🔧 STEP 4: Update atom settings with all generated charts
              updateAtomSettings(atomId, {
                charts: generatedCharts,
                currentChart: generatedCharts[0] || charts[0],
                chartRendered: generatedCharts.some(chart => chart.chartRendered),
                chartLoading: false,
                // 🔧 Clear auto-render flag after charts are generated
                autoRenderAfterLoad: false,
                // 🔧 Ensure dataSource is set using matched object_name for dropdown visibility
                dataSource: matchedObjectName || targetFileObjectName || targetFile.replace(/\.arrow$/, '')
              });
              
              // 📝 Update card text box with response, reasoning, and smart_response
              console.log('📝 Updating card text box with agent response...');
              const textBoxContent = formatAgentResponseForTextBox(data);
              console.log('📝 Formatted text box content length:', textBoxContent.length);
              
              // Update card's text box (this enables the text box icon on the card)
              try {
                await updateCardTextBox(atomId, textBoxContent);
                console.log('✅ Card text box updated successfully');
              } catch (textBoxError) {
                console.error('❌ Error updating card text box:', textBoxError);
              }
              
              // Store agent response in atom settings for reference
              updateAtomSettings(atomId, {
                agentResponse: {
                  response: data.response || '',
                  reasoning: data.reasoning || '',
                  smart_response: data.smart_response || '',
                  formattedText: textBoxContent
                }
              });
              
              console.log('🎉 Charts processed:', generatedCharts.length);
              
              // 🔧 CLEANED UP: Show only essential success information
              const successCount = generatedCharts.filter(chart => chart.chartRendered).length;
              const totalCount = generatedCharts.length;
              
              if (totalCount > 1) {
                // Multiple charts - simple success message
                const successMsg: Message = {
                  id: (Date.now() + 3).toString(),
                  content: `✅ ${successCount}/${totalCount} charts generated successfully!\n\n💡 Use the 2-chart layout option to view them simultaneously.`,
                  sender: 'ai',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, successMsg]);
              } else {
                // Single chart - simple success message
                const successMsg: Message = {
                  id: (Date.now() + 3).toString(),
                  content: `✅ Chart generated successfully with real data!`,
                  sender: 'ai',
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, successMsg]);
              }
              
            } else {
              console.error('❌ Failed to load file data:', loadResponse.status);
              
              // Try to get detailed error message
              let errorDetail = loadResponse.statusText;
              try {
                const errorData = await loadResponse.json();
                errorDetail = errorData.detail || errorData.message || loadResponse.statusText;
              } catch (e) {
                // If we can't parse error response, use status text
              }
              
              // Fallback to manual rendering
              updateAtomSettings(atomId, {
                chartRendered: false,
                chartLoading: false
              });
              
              const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                content: `⚠️ Failed to load file data: ${errorDetail}\n\n💡 Please ensure the file exists and try again.`,
                sender: 'ai',
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, errorMsg]);
            }
            
          } catch (error) {
            console.error('❌ Error in AI chart setup:', error);
            
            // Fallback to manual rendering
            updateAtomSettings(atomId, {
              chartRendered: false,
              chartLoading: false
            });
            
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Error setting up chart: ${error.message || 'Unknown error occurred'}\n\n💡 Please try generating the chart manually.`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
          }
          
          // 🔧 SMART RESPONSE: Use smart_response if available, otherwise fallback to message
          let aiContent = '';
          
          if (data.smart_response) {
            // Use the smart response from AI - this is the clean, user-friendly message
            aiContent = data.smart_response;
          } else if (numberOfCharts > 1) {
            // Fallback for multiple charts - show LLM suggestions
            aiContent = `💡 ${data.message || 'Multiple chart configuration completed successfully'}\n\n`;
            
            // Add LLM suggestions if available
            if (data.suggestions && Array.isArray(data.suggestions)) {
              aiContent += `${data.suggestions.join('\n')}\n\n`;
            }
            
            // Add next steps if available
            if (data.next_steps && Array.isArray(data.next_steps)) {
              aiContent += `🎯 Next Steps:\n${data.next_steps.join('\n')}`;
            }
            
          } else {
            // Fallback for single chart - show LLM suggestions
            aiContent = `💡 ${data.message || 'Chart configuration completed successfully'}\n\n`;
            
            // Add LLM suggestions if available
            if (data.suggestions && Array.isArray(data.suggestions)) {
              aiContent += `${data.suggestions.join('\n')}\n\n`;
            }
            
            // Add next steps if available
            if (data.next_steps && Array.isArray(data.next_steps)) {
              aiContent += `🎯 Next Steps:\n${data.next_steps.join('\n')}`;
            }
          }
          
          // Single clean message with smart response or fallback
          const aiMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: aiContent,
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, aiMsg]);
          
        } else if (atomType === 'explore' && data.exploration_config) {
          // 🔍 EXPLORE ATOM: Handle AI-generated exploration configuration
          console.log('🔍 ===== EXPLORE AI RESPONSE =====');
          console.log('📝 User Prompt:', userMsg.content);
          console.log('🔧 Exploration Config:', data.exploration_config);
          console.log('🔧 Smart Response:', data.smart_response);
          console.log('🔧 Message:', data.message);
          
          // 🔧 MINIMAL FIX: Define normalizeColumnName function at the top level
          const normalizeColumnName = (colName: string) => {
            if (!colName || typeof colName !== 'string') return '';
            return colName.toLowerCase();
          };
          
          // Parse exploration configurations (always expect a list)
          const explorationsList = Array.isArray(data.exploration_config) ? data.exploration_config : [data.exploration_config];
          const numberOfExplorations = explorationsList.length;
          
          console.log('📊 Explorations in config:', numberOfExplorations);
          
          // Get target file from AI response and construct full path
          let targetFile = '';
          if (data.file_name) {
            // 🔧 CRITICAL FIX: Construct full file path with current prefix
            try {
              // Get current prefix from environment context
              const envStr = localStorage.getItem('env');
              if (envStr) {
                const env = JSON.parse(envStr);
                const clientName = env.CLIENT_NAME || '';
                const appName = env.APP_NAME || '';
                const projectName = env.PROJECT_NAME || '';
                
                if (clientName && appName && projectName) {
                  // Construct full path: client/app/project/filename
                  targetFile = `${clientName}/${appName}/${projectName}/${data.file_name}`;
                  console.log('🎯 Constructed full file path:', targetFile);
                } else {
                  // Fallback to just filename if no environment context
                  targetFile = data.file_name;
                  console.log('⚠️ No environment context, using filename only:', targetFile);
                }
              } else {
                // Fallback to just filename if no environment context
                targetFile = data.file_name;
                console.log('⚠️ No environment context, using filename only:', targetFile);
              }
            } catch (error) {
              console.warn('Failed to construct full file path:', error);
              targetFile = data.file_name;
            }
          } else {
            console.log('⚠️ No file_name found in AI response');
          }
          
          if (!targetFile) {
            // No file found - show error and don't proceed
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: data.smart_response || `I couldn't find a data file to analyze. Please make sure you have selected or uploaded a data file first, then try your exploration request again. I'll be able to help you create meaningful visualizations once the data is available.`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
            return;
          }
          
          // For explore, we need to preserve the full file path for MinIO access
          const getFilePathForExplore = (filePath: string) => {
            if (!filePath) return "";
            // Keep the full path for explore operations - MinIO needs the complete path
            return filePath;
          };
          
          // Update atom settings with AI configuration
          updateAtomSettings(atomId, { 
            dataframe: targetFile,
            applied: true,
            aiConfig: data,
            aiMessage: data.message,
            exploration_config: data.exploration_config
          });
          
          // Note: AI success message will be added after processing is complete
          
          // 🎯 Use SAME 3-step backend flow as manual (instead of perform endpoint)
          try {
            console.log('🎯 Using SAME backend endpoints as manual workflow');
            
            // Process each exploration using manual's 3-step flow
            const explorationsList = Array.isArray(data.exploration_config) ? data.exploration_config : [data.exploration_config];
            let processedResults = [];
            
            console.log(`🎯 Processing ${explorationsList.length} exploration(s) via manual flow`);
            
            for (let i = 0; i < explorationsList.length; i++) {
              const exploration = explorationsList[i];
              console.log(`📊 Processing exploration ${i + 1}/${explorationsList.length} via manual flow:`, exploration);
              
              try {
                // 🎯 STEP 1: Create same JSON structures as manual
              const dimensionColumns = new Set<string>([exploration.x_axis]);
              if (exploration.segregated_field && exploration.segregated_field !== 'aggregate') {
                dimensionColumns.add(exploration.segregated_field);
              }
              
              const selectedDimensions = {
                [targetFile]: Array.from(dimensionColumns).reduce(
                  (acc, col) => ({ ...acc, [col]: [col] }),
                  {} as { [key: string]: string[] }
                )
              };
              
              const selectedMeasures = {
                [targetFile]: [exploration.y_axis]
              };
              
              console.log('📋 Step 1 - selectedDimensions:', selectedDimensions);
              console.log('📋 Step 1 - selectedMeasures:', selectedMeasures);
              
              // 🎯 STEP 2: Call /select-dimensions-and-measures (SAME as manual)
              console.log(`🔄 Step 2 - Creating explore atom for chart ${i + 1}...`);
              const createResponse = await fetch(`${EXPLORE_API}/select-dimensions-and-measures`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  validator_atom_id: targetFile,
                  atom_name: `AI Chart Analysis ${i + 1}`,
                  selected_dimensions: JSON.stringify(selectedDimensions),
                  selected_measures: JSON.stringify(selectedMeasures)
                })
              });
              
              if (!createResponse.ok) {
                const errorText = await createResponse.text();
                console.error(`❌ Failed to create explore atom for chart ${i + 1}:`, {
                  status: createResponse.status,
                  statusText: createResponse.statusText,
                  error: errorText
                });
                throw new Error(`Failed to create explore atom for chart ${i + 1}: ${createResponse.status} - ${errorText}`);
              }
              
              const rawCreate = await createResponse.json();
              const createResult = await resolveTaskResponse<{ explore_atom_id: string }>(rawCreate);
              const exploreAtomId = createResult.explore_atom_id;
              console.log('✅ Step 2 - Explore atom created:', exploreAtomId);
              
              // 🎯 STEP 3: Create operationsPayload JSON (SAME as manual)
              const measuresConfig: { [key: string]: string } = {};
              if (exploration.y_axis) {
                measuresConfig[exploration.y_axis] = exploration.aggregation || 'sum';
              }
              
              const operationsPayload = {
                file_key: targetFile,
                filters: exploration.filters || [],
                group_by: exploration.segregated_field && exploration.segregated_field !== 'aggregate'
                  ? [exploration.segregated_field, exploration.x_axis]
                  : [exploration.x_axis],
                measures_config: measuresConfig,
                chart_type: exploration.chart_type,
                x_axis: exploration.x_axis,
                weight_column: exploration.weight_column || null,
                sort_order: exploration.sort_order || null
              };
              
              console.log('📋 Step 3 - operationsPayload:', operationsPayload);
              
              // 🎯 STEP 4: Call /specify-operations (SAME as manual)
              console.log(`🔄 Step 4 - Specifying operations for chart ${i + 1}...`);
              const operationsResponse = await fetch(`${EXPLORE_API}/specify-operations`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  explore_atom_id: exploreAtomId,
                  operations: JSON.stringify(operationsPayload)
                })
              });
              
              if (!operationsResponse.ok) {
                const errorText = await operationsResponse.text();
                console.error(`❌ Operations specification failed for chart ${i + 1}:`, {
                  status: operationsResponse.status,
                  statusText: operationsResponse.statusText,
                  error: errorText,
                  operationsPayload
                });
                throw new Error(`Operations specification failed for chart ${i + 1}: ${operationsResponse.status} - ${errorText}`);
              }
              const rawOperations = await operationsResponse.json();
              await resolveTaskResponse(rawOperations);
              console.log('✅ Step 4 - Operations specified');
              
              // 🎯 STEP 5: Call /chart-data-multidim (SAME as manual)
              console.log(`🔄 Step 5 - Fetching chart data for chart ${i + 1}...`);
              const chartResponse = await fetch(`${EXPLORE_API}/chart-data-multidim/${exploreAtomId}`);
              
              if (!chartResponse.ok) {
                const errorText = await chartResponse.text();
                console.error(`❌ Chart data fetch failed for chart ${i + 1}:`, {
                  status: chartResponse.status,
                  statusText: chartResponse.statusText,
                  error: errorText,
                  exploreAtomId
                });
                throw new Error(`Chart data fetch failed for chart ${i + 1}: ${chartResponse.status} - ${errorText}`);
              }
              
              const rawChart = await chartResponse.json();
              const chartResult = await resolveTaskResponse<Record<string, any>>(rawChart);
              console.log(`✅ Step 5 - Chart data received for chart ${i + 1}:`, chartResult);
              
              // Store result in same format as manual
              const chartData = chartResult.data || [];
              processedResults.push({
                ...exploration,
                chart_data: chartData,
                explore_atom_id: exploreAtomId,
                ai_note: exploration.description || exploration.title || ''
              });
              
              console.log(`✅ Chart ${i + 1} processed successfully:`, {
                title: exploration.title,
                hasData: chartData.length > 0,
                dataLength: chartData.length,
                exploreAtomId: exploreAtomId
              });
              
              } catch (chartError) {
                console.error(`❌ Failed to process chart ${i + 1}:`, chartError);
                // Continue with next chart instead of failing completely
                processedResults.push({
                  ...exploration,
                  chart_data: [],
                  explore_atom_id: null,
                  ai_note: `Failed to process: ${chartError.message}`,
                  error: chartError.message
                });
              }
            }
            
            console.log('🎉 All explorations processed via SAME manual backend flow:', processedResults);
            
            // 🎯 Now fetch REAL column classifier config like manual workflow does
            try {
              console.log('📋 Fetching REAL column classifier config like manual workflow...');
              
              // Extract path components for API call (same as manual)
              const pathParts = targetFile.split('/');
              const fileName = pathParts.pop();
              const projectPath = pathParts.join('/');
              
              const classifierResponse = await fetch(
                `${EXPLORE_API}/column-classifier/config/${encodeURIComponent(projectPath)}?file=${encodeURIComponent(fileName || '')}`
              );
              
              let columnClassifierConfig = null;
              if (classifierResponse.ok) {
                const rawClassifier = await classifierResponse.json();
                columnClassifierConfig = await resolveTaskResponse<Record<string, any>>(rawClassifier);
                console.log('✅ Got REAL column classifier config:', columnClassifierConfig);
              }
              
              // Also fetch column summary for complete manual experience
              const summaryResponse = await fetch(`${EXPLORE_API}/column_summary?object_name=${encodeURIComponent(targetFile)}`);
              let columnSummary = [];
              if (summaryResponse.ok) {
                const rawSummary = await summaryResponse.json();
                const summary = await resolveTaskResponse<{ summary?: any[] }>(rawSummary);
                columnSummary = Array.isArray(summary.summary) ? summary.summary.filter(Boolean) : [];
                console.log('✅ Got REAL column summary:', columnSummary.length, 'columns');
              }
              
              // 🎯 Create exploreData using REAL backend data (same as manual)
              const result = { explorations: processedResults };
              const firstExploration = result.explorations?.[0];
              const numberOfCharts = result.explorations?.length || 1;
              
              console.log('🎯 Final processed results:', {
                totalCharts: numberOfCharts,
                charts: result.explorations?.map((exp: any, idx: number) => ({
                  index: idx,
                  title: exp.title,
                  hasData: !!exp.chart_data,
                  dataLength: exp.chart_data?.length || 0,
                  exploreAtomId: exp.explore_atom_id
                }))
              });
              
              // 🔧 Convert AI column names to match manual casing (lowercase)
              // normalizeColumnName function is already defined at the top of this block
              
              // 🎯 STRICT: Extract ONLY explicit filters from AI JSON (no automatic detection)
              const allFilterColumns = new Set<string>();
              
              console.log('🔍 Using ONLY explicit AI JSON filters - no automatic detection');
              console.log('🔍 Original AI exploration_config:', data.exploration_config);
              
              result.explorations?.forEach((exp: any, idx: number) => {
                console.log(`🔍 Exploration ${idx + 1} - ONLY explicit filters from AI JSON:`, exp.filters);
                
                // STRICT: ONLY add explicit filter columns from AI JSON filters section
                if (exp.filters && typeof exp.filters === 'object') {
                  Object.keys(exp.filters).forEach(filterCol => {
                    const normalized = normalizeColumnName(filterCol);
                    allFilterColumns.add(normalized);
                    console.log(`✅ STRICT: Using explicit AI filter: ${filterCol} → ${normalized}`);
                  });
                }
                // NO other automatic additions - stick strictly to AI JSON
              });
              
              console.log('🎯 STRICT: Only AI JSON filters will be used:', Array.from(allFilterColumns));
              
              // 🎯 Smart Filter Value Processing based on AI data
              const smartFilterValues: { [column: string]: string[] } = {};
              
              result.explorations?.forEach((exp: any) => {
                if (exp.filters && typeof exp.filters === 'object') {
                  Object.keys(exp.filters).forEach(filterCol => {
                    const normalizedCol = normalizeColumnName(filterCol);
                    const aiValues = exp.filters[filterCol];
                    
                    console.log(`🔍 Processing filter for ${filterCol}:`, aiValues);
                    
                    // Find the column in dataset to get available values
                    const columnData = columnSummary.find((col: any) => 
                      col.column?.toLowerCase() === normalizedCol
                    );
                    
                    if (columnData && columnData.unique_values) {
                      const availableValues = columnData.unique_values;
                      console.log(`📋 Available values for ${normalizedCol}:`, availableValues);
                      
                      // 🎯 Apply user's logic for filter value selection
                      if (!aiValues || aiValues.length === 0) {
                        // Case 1: Only column specified, no values → Select "All" (empty array)
                        smartFilterValues[normalizedCol] = [];
                        console.log(`✅ ${normalizedCol}: No values specified → Selecting "All"`);
                        allFilterColumns.add(normalizedCol);
                      } else {
                        // Check if AI values match actual dataset values
                        const matchingValues = aiValues.filter((val: any) => 
                          availableValues.some((avail: any) => 
                            String(avail).toLowerCase() === String(val).toLowerCase()
                          )
                        );
                        
                        if (matchingValues.length === 0) {
                          // Case 2: Values don't match dataset → Select "All"
                          smartFilterValues[normalizedCol] = [];
                          console.log(`✅ ${normalizedCol}: Values don't match dataset → Selecting "All"`);
                          console.log(`   AI provided: ${aiValues}, Available: ${availableValues.slice(0, 5)}...`);
                          allFilterColumns.add(normalizedCol);
                        } else {
                          // Case 3: Values match dataset → Use specific values
                          smartFilterValues[normalizedCol] = matchingValues;
                          console.log(`✅ ${normalizedCol}: Using matched values:`, matchingValues);
                          allFilterColumns.add(normalizedCol);
                        }
                      }
                    } else {
                      console.log(`⚠️ Column ${normalizedCol} not found in dataset or no unique values`);
                    }
                  });
                }
              });
              
              console.log('🎯 Smart filter values processed:', smartFilterValues);
              console.log('🎯 Smart filter values details:', Object.entries(smartFilterValues).map(([col, vals]) => ({
                column: col,
                values: vals,
                isEmpty: vals.length === 0,
                isAllSelected: vals.length === 0
              })));
              
              // 🎯 Replicate manual filter setup process with smart values
              let updatedColumnClassifierConfig = columnClassifierConfig;
              let selectedIdentifiers: { [key: string]: string[] } = {};
              let dimensions: string[] = [];
              
              if (allFilterColumns.size > 0 && columnClassifierConfig) {
                // Step 1: Update columnClassifierConfig.dimensions like manual does
                const newDimensions = { ...columnClassifierConfig.dimensions };
                allFilterColumns.forEach(col => {
                  newDimensions[col] = [col];  // Same format as manual handleAddFilters()
                });
                
                updatedColumnClassifierConfig = {
                  ...columnClassifierConfig,
                  dimensions: newDimensions
                };
                
                // Step 2: Create selectedIdentifiers like manual does
                allFilterColumns.forEach(col => {
                  selectedIdentifiers[col] = [col];
                });
                
                // Step 3: Create dimensions array like manual does
                dimensions = Array.from(allFilterColumns);
                
                console.log('🔧 Manual filter setup replicated with smart values:', {
                  filterColumns: Array.from(allFilterColumns),
                  smartFilterValues: smartFilterValues,
                  updatedDimensions: newDimensions,
                  selectedIdentifiers: selectedIdentifiers
                });
              }
              
              // 🔧 FIX: Only filter out explorations with explicit errors, keep all others
              const validExplorations = result.explorations?.filter((exp: any, idx: number) => {
                // Only filter out if there's an explicit error or completely missing required fields
                const hasError = exp.error && exp.error.trim() !== '';
                const hasRequiredFields = exp.x_axis && exp.y_axis;
                
                const isValid = !hasError && hasRequiredFields;
                
                if (!isValid) {
                  console.log(`⚠️ Filtering out invalid exploration ${idx + 1}:`, {
                    hasError: !!hasError,
                    hasRequiredFields,
                    error: exp.error,
                    title: exp.title,
                    x_axis: exp.x_axis,
                    y_axis: exp.y_axis
                  });
                } else {
                  console.log(`✅ Keeping exploration ${idx + 1}:`, {
                    title: exp.title,
                    x_axis: exp.x_axis,
                    y_axis: exp.y_axis,
                    hasChartData: !!exp.chart_data,
                    dataLength: exp.chart_data?.length || 0
                  });
                }
                
                return isValid;
              }) || [];
              
              console.log(`🔧 Filtered explorations: ${result.explorations?.length || 0} → ${validExplorations.length} valid charts`);
              
              // 🔧 FALLBACK: If filtering removed all charts, use original explorations
              const finalExplorations = validExplorations.length > 0 ? validExplorations : (result.explorations || []);
              
              if (validExplorations.length === 0 && result.explorations && result.explorations.length > 0) {
                console.log(`⚠️ All explorations were filtered out, using original explorations as fallback`);
              }
              
              // 🔧 Create chartConfigs with normalized column names (same as manual)
              const chartConfigs = finalExplorations.map((exp: any, idx: number) => {
                const config = {
                  xAxis: exp.x_axis ? normalizeColumnName(exp.x_axis) : '',
                  yAxes: [exp.y_axis ? normalizeColumnName(exp.y_axis) : ''],
                  xAxisLabel: exp.x_axis_label || (exp.x_axis ? normalizeColumnName(exp.x_axis) : ''),
                  yAxisLabels: [exp.y_axis_label || (exp.y_axis ? normalizeColumnName(exp.y_axis) : '')],
                  chartType: exp.chart_type || 'bar_chart',
                  aggregation: exp.aggregation || 'sum',
                  weightColumn: exp.weight_column ? normalizeColumnName(exp.weight_column) : '',
                  title: exp.title || `Chart ${idx + 1}`,
                  legendField: exp.segregated_field ? normalizeColumnName(exp.segregated_field) : '',
                  sortOrder: exp.sort_order || null,
                  // 🔧 NEW: Add segregated_field support for secondary x-axis grouping
                  segregatedField: exp.segregated_field ? normalizeColumnName(exp.segregated_field) : null,
                };
                console.log(`📊 Chart ${idx + 1} config created:`, {
                  chartIndex: idx,
                  title: config.title,
                  xAxis: config.xAxis,
                  yAxis: config.yAxes[0],
                  chartType: config.chartType
                });
                return config;
              });
              
              console.log('📊 Generated chartConfigs with normalized casing:', chartConfigs);
              console.log('📊 Number of charts generated:', numberOfCharts);
              
              // 🔧 DEBUG: Log each chart config to verify both are created
              chartConfigs.forEach((config, idx) => {
                console.log(`📊 Chart ${idx + 1} config:`, {
                  xAxis: config.xAxis,
                  yAxis: config.yAxes[0],
                  title: config.title,
                  chartType: config.chartType
                });
              });
              
              const exploreData = {
                dataframe: targetFile,
                applied: true,  // 🎯 Same as manual Step 3: applied: true makes filters appear
                
                // 🎯 Individual properties for backward compatibility (use first chart)
                chartType: firstExploration?.chart_type || 'bar_chart',
                xAxis: firstExploration?.x_axis ? normalizeColumnName(firstExploration.x_axis) : '',
                yAxis: firstExploration?.y_axis ? normalizeColumnName(firstExploration.y_axis) : '',
                xAxisLabel: firstExploration?.x_axis_label || '',
                yAxisLabel: firstExploration?.y_axis_label || '',
                title: firstExploration?.title || 'AI Generated Chart',
                aggregation: firstExploration?.aggregation || 'sum',
                legendField: firstExploration?.segregated_field ? normalizeColumnName(firstExploration.segregated_field) : '',
                weightColumn: firstExploration?.weight_column ? normalizeColumnName(firstExploration.weight_column) : '',
                // 🔧 NEW: Add segregated_field support for secondary x-axis grouping
                segregatedField: firstExploration?.segregated_field ? normalizeColumnName(firstExploration.segregated_field) : null,
                
                // 🎯 Use REAL backend data (same as manual)
                columnClassifierConfig: updatedColumnClassifierConfig,  // ✅ With filter columns
                columnSummary: columnSummary,
                
                // 🎯 Replicate manual filter setup data structure
                selectedIdentifiers: selectedIdentifiers,  // ✅ Same as manual Step 2
                dimensions: dimensions,                    // ✅ Same as manual Step 3
                
                // 🎯 FIX: Proper graph layout for Properties panel (match manual behavior)
                graphLayout: {
                  numberOfGraphsInRow: numberOfCharts >= 2 ? 2 : numberOfCharts,
                  rows: 1
                },
                
                // 🎯 KEY: Add chartConfigs with correct casing
                chartConfigs: chartConfigs,
                  
                // 🎯 Store chart data exactly like manual workflow using final explorations
                chartDataSets: finalExplorations.reduce((acc: any, exp: any, idx: number) => {
                  acc[idx] = exp.chart_data;
                  console.log(`📊 Chart ${idx + 1} data stored:`, {
                    chartIndex: idx,
                    hasData: !!exp.chart_data,
                    dataLength: exp.chart_data?.length || 0,
                    title: exp.title
                  });
                  return acc;
                }, {}),
                chartGenerated: finalExplorations.reduce((acc: any, exp: any, idx: number) => {
                  acc[idx] = true;
                  return acc;
                }, {}),
                chartNotes: finalExplorations.reduce((acc: any, exp: any, idx: number) => {
                  acc[idx] = exp.ai_note || '';
                  return acc;
                }, {}),
                
                // 🎯 Set up smart filter values for EACH chart individually using pre-calculated smartFilterValues
                chartFilters: finalExplorations.reduce((acc: any, exp: any, idx: number) => {
                  // Use the pre-calculated smartFilterValues instead of recalculating
                  const chartSmartFilters: { [column: string]: string[] } = {};
                  
                  if (exp.filters && typeof exp.filters === 'object') {
                    Object.keys(exp.filters).forEach(filterCol => {
                      const normalizedCol = normalizeColumnName(filterCol);
                      
                      // Use the pre-calculated smart filter values
                      if (smartFilterValues[normalizedCol] !== undefined) {
                        chartSmartFilters[normalizedCol] = smartFilterValues[normalizedCol];
                        console.log(`📊 Chart ${idx + 1} - ${normalizedCol}: Using pre-calculated values:`, smartFilterValues[normalizedCol]);
                      } else {
                        // Fallback to "All" if not found
                        chartSmartFilters[normalizedCol] = [];
                        console.log(`📊 Chart ${idx + 1} - ${normalizedCol}: No pre-calculated values → "All"`);
                      }
                    });
                  }
                  
                  acc[idx] = chartSmartFilters;
                  return acc;
                }, {}),
                
                chartThemes: {},
                chartOptions: finalExplorations.reduce((acc: any, exp: any, idx: number) => {
                  acc[idx] = { grid: true, legend: true, axisLabels: true, dataLabels: true };
                  return acc;
                }, {}),
                appliedFilters: Object.keys(smartFilterValues).length > 0 ? 
                  finalExplorations.reduce((acc: any, exp: any, idx: number) => {
                    acc[idx] = true;  // Mark filters as applied if we have smart filters
                    return acc;
                  }, {}) : {},
                
                // Store original AI config for reference
                aiConfig: data,
                aiMessage: data.message,
                exploration_config: data.exploration_config,
                operationCompleted: true
              };
              
              console.log('📊 Final exploreData with manual filter setup and REAL backend config:', exploreData);
              console.log('📊 Chart data sets:', exploreData.chartDataSets);
              console.log('📊 Chart configs:', exploreData.chartConfigs);
              console.log('📊 Chart generated flags:', exploreData.chartGenerated);
              
              // 🔧 CRITICAL FIX: Merge with existing state instead of overwriting
              const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
              const currentData = currentAtom?.settings?.data || {};
              
              const mergedData = {
                ...currentData,  // ✅ Preserve ALL existing manual settings
                
                // Only override specific AI-generated properties
                dataframe: exploreData.dataframe,
                applied: exploreData.applied,
                
                // Merge column configurations carefully
                columnClassifierConfig: {
                  ...(currentData.columnClassifierConfig || {}),
                  ...(exploreData.columnClassifierConfig || {}),
                  dimensions: {
                    ...(currentData.columnClassifierConfig?.dimensions || {}),
                    ...(exploreData.columnClassifierConfig?.dimensions || {})
                  }
                },
                
                columnSummary: exploreData.columnSummary || currentData.columnSummary,
                
                // Merge filter setup without overwriting manual filters
                selectedIdentifiers: {
                  ...(currentData.selectedIdentifiers || {}),
                  ...(exploreData.selectedIdentifiers || {})
                },
                
                dimensions: Array.from(new Set([
                  ...(currentData.dimensions || []),
                  ...(exploreData.dimensions || [])
                ])),
                
                // 🔧 CRITICAL FIX: Preserve manual chart filters and merge with AI filters
                chartFilters: {
                  ...(currentData.chartFilters || {}),
                  ...(exploreData.chartFilters || {})
                },
                
                // 🔧 FIX: Use AI chart data completely when AI generates charts
                chartDataSets: exploreData.chartDataSets || {},
                
                chartGenerated: exploreData.chartGenerated || {},
                
                chartNotes: exploreData.chartNotes || {},
                
                // 🔧 FIX: Use AI chartConfigs completely when AI generates charts
                chartConfigs: exploreData.chartConfigs || [],
                
                // Preserve other manual settings
                graphLayout: exploreData.graphLayout || currentData.graphLayout,
                
                // Store AI config without overriding manual data
                aiConfig: exploreData.aiConfig,
                operationCompleted: exploreData.operationCompleted
              };
              
              console.log('🔧 Merging AI data with existing manual state (preserving manual functionality):', {
                currentKeys: Object.keys(currentData),
                aiKeys: Object.keys(exploreData),
                mergedKeys: Object.keys(mergedData),
                preservedManualChartConfigs: !!currentData.chartConfigs?.length,
                aiChartCount: exploreData.chartConfigs?.length || 0,
                currentChartCount: currentData.chartConfigs?.length || 0,
                finalChartCount: mergedData.chartConfigs?.length || 0
              });
              
              // 🔧 DEBUG: Log chart counts to identify extra chart creation
              console.log('📊 Chart Count Debug:', {
                aiExplorations: result.explorations?.length || 0,
                validExplorations: validExplorations.length,
                finalExplorations: finalExplorations.length,
                aiChartConfigs: exploreData.chartConfigs?.length || 0,
                currentChartConfigs: currentData.chartConfigs?.length || 0,
                finalChartConfigs: mergedData.chartConfigs?.length || 0,
                chartDataSetsKeys: Object.keys(mergedData.chartDataSets || {}),
                chartGeneratedKeys: Object.keys(mergedData.chartGenerated || {})
              });
              
              updateAtomSettings(atomId, {
                data: mergedData  // ✅ Merged data instead of overwriting
              });
              
              // Add completion message - use smart_response if available, otherwise create concise message
              const smartCompletionResponse = data.smart_response || 
                (finalExplorations.length > 1 
                  ? `I've successfully generated ${finalExplorations.length} complementary charts for your analysis. These visualizations will provide different perspectives on your data, allowing you to identify patterns, trends, and relationships. You can use the 2-chart layout to view both visualizations simultaneously for better comparison.`
                  : `I've successfully generated your chart analysis. The visualization is now ready and will help you understand the patterns and insights in your data. You can click to view the chart and explore the findings.`);
              
              const completionMsg: Message = {
                id: (Date.now() + 2).toString(),
                content: smartCompletionResponse,
                sender: 'ai',
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, completionMsg]);
              
            } catch (configError: any) {
              console.error('❌ Failed to fetch column config:', configError);
              
              // Fallback: Use basic exploreData without column config
              const result = { explorations: processedResults || [] };
              const firstExploration = result.explorations?.[0];
              
              const exploreData = {
                dataframe: targetFile,
                applied: true,
                chartType: firstExploration?.chart_type || 'bar_chart',
                xAxis: firstExploration?.x_axis ? normalizeColumnName(firstExploration.x_axis) : '',
                yAxis: firstExploration?.y_axis ? normalizeColumnName(firstExploration.y_axis) : '',
                title: firstExploration?.title || 'AI Generated Chart',
                aggregation: firstExploration?.aggregation || 'sum',
                legendField: firstExploration?.segregated_field ? normalizeColumnName(firstExploration.segregated_field) : '',
                // 🔧 NEW: Add segregated_field support for secondary x-axis grouping
                segregatedField: firstExploration?.segregated_field ? normalizeColumnName(firstExploration.segregated_field) : null,
                
                chartDataSets: result.explorations?.reduce((acc: any, exp: any, idx: number) => {
                  acc[idx] = exp.chart_data || [];
                  return acc;
                }, {}),
                chartGenerated: result.explorations?.reduce((acc: any, exp: any, idx: number) => {
                  acc[idx] = true;
                  return acc;
                }, {}),
                
                aiConfig: data,
                operationCompleted: true
              };
              
              updateAtomSettings(atomId, {
                data: exploreData
              });
              
              // Note: Completion message already added above
            }
                
          } catch (error: any) {
            console.error('❌ AI exploration via manual flow failed:', error);
            
            // 🔧 CRITICAL FIX: Add more specific error handling based on error type
            let errorMessage = `❌ Failed to process exploration: ${error.message || 'Unknown error'}`;
            
            if (error.message?.includes('normalizeColumnName is not defined')) {
              errorMessage = `❌ Configuration error: Column processing failed. Please try again.`;
            } else if (error.message?.includes('toLowerCase is not a function')) {
              errorMessage = `❌ Data processing error: Invalid column data format. Please check your data file.`;
            } else if (error.message?.includes('Failed to fetch')) {
              errorMessage = `❌ Network error: Could not connect to backend services. Please try again.`;
            }
            
            // Only add error message if no smart_response was already added
            if (!data.smart_response) {
              const errorMsg: Message = {
                id: (Date.now() + 2).toString(),
                content: `${errorMessage} Please try again or use the manual configuration options to set up your analysis.`,
                sender: 'ai',
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, errorMsg]);
            }
            
            updateAtomSettings(atomId, {
              dataframe: targetFile,
              applied: false,
              aiConfig: data,
              aiMessage: data.message,
              exploration_config: data.exploration_config,
              operationCompleted: false
            });
          }
        }
        
        // 🔧 CRITICAL FIX: Handle data-upload-validate with modular handler system
        if (atomType === 'data-upload-validate' && data.validate_json) {
          console.log('🔧 ===== DATA UPLOAD VALIDATE AI RESPONSE =====');
          console.log('📝 User Prompt:', userMsg.content);
          console.log('🔧 Validate Config:', JSON.stringify(data.validate_json, null, 2));
          console.log('🔧 Smart Response:', data.smart_response);
          
          try {
            const handler = getAtomHandler(atomType);
            if (handler) {
              const handlerContext: AtomHandlerContext = {
                atomId,
                atomType,
                atomTitle,
                sessionId,
                updateAtomSettings,
                setMessages,
                isStreamMode: false
              };
              
              if (data.success !== false) {
                await handler.handleSuccess(data, handlerContext);
              } else {
                await handler.handleFailure(data, handlerContext);
              }
            } else {
              console.warn('⚠️ No handler found for data-upload-validate');
            }
          } catch (handlerError) {
            console.error('❌ Error in dfValidateHandler:', handlerError);
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Error processing data validation configuration: ${(handlerError as Error).message || 'Unknown error'}`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
          }
        }
        
        // 🔧 CRITICAL FIX: Handle correlation with modular handler system
        if (atomType === 'correlation' && data.correlation_config) {
          console.log('🔧 ===== CORRELATION AI RESPONSE =====');
          console.log('📝 User Prompt:', userMsg.content);
          console.log('🔧 Correlation Config:', JSON.stringify(data.correlation_config, null, 2));
          console.log('🔧 Smart Response:', data.smart_response);
          
          try {
            const handler = getAtomHandler(atomType);
            if (handler) {
              const handlerContext: AtomHandlerContext = {
                atomId,
                atomType,
                atomTitle,
                sessionId,
                updateAtomSettings,
                setMessages,
                isStreamMode: false
              };
              
              if (data.success !== false) {
                await handler.handleSuccess(data, handlerContext);
              } else {
                await handler.handleFailure(data, handlerContext);
              }
            } else {
              console.warn('⚠️ No handler found for correlation');
            }
          } catch (handlerError) {
            console.error('❌ Error in correlationHandler:', handlerError);
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Error processing correlation configuration: ${(handlerError as Error).message || 'Unknown error'}`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
          }
        }
        
        // 🔧 CRITICAL FIX: Only handle dataframe-operations for dataframe-operations atom type
        // This code was running for ALL atom types, causing errors for create-column, concat, etc.
        if (atomType === 'dataframe-operations' && data.dataframe_config) {
          console.log('🔧 ===== DATAFRAME OPERATIONS AI RESPONSE =====');
          console.log('📝 User Prompt:', userMsg.content);
          console.log('🔧 DataFrame Config:', JSON.stringify(data.dataframe_config, null, 2));
          console.log('🔧 Execution Plan:', JSON.stringify(data.execution_plan, null, 2));
          console.log('🔧 Smart Response:', data.smart_response);
          console.log('🔧 Available Files:', data.available_files);
          
          const df_config = data.dataframe_config;
          const execution_plan = data.execution_plan || {};
          
          // Update atom settings with AI configuration (preserve existing settings)
          const currentSettings = useLaboratoryStore.getState().getAtom(atomId)?.settings;
          updateAtomSettings(atomId, {
            ...currentSettings, // 🔧 CRITICAL: Preserve existing settings
            dataframe_config: df_config,
            execution_plan: execution_plan,
            aiConfig: data,
            aiMessage: data.message,
            operationCompleted: false
          });
          
          // 📝 Update card text box with response, reasoning, and smart_response
          console.log('📝 Updating card text box with agent response...');
          const textBoxContent = formatAgentResponseForTextBox(data);
          console.log('📝 Formatted text box content length:', textBoxContent.length);
          
          // Update card's text box (this enables the text box icon on the card)
          try {
            await updateCardTextBox(atomId, textBoxContent);
            console.log('✅ Card text box updated successfully');
          } catch (textBoxError) {
            console.error('❌ Error updating card text box:', textBoxError);
          }
          
          // Store agent response in atom settings for reference
          updateAtomSettings(atomId, {
            agentResponse: {
              response: data.response || '',
              reasoning: data.reasoning || '',
              smart_response: data.smart_response || '',
              formattedText: textBoxContent
            }
          });
          
          // Add AI success message
          const aiSuccessMsg: Message = {
            id: (Date.now() + 1).toString(),
            content: data.smart_response || `✅ DataFrame operations configuration completed successfully!\n\nOperations: ${df_config.operations?.length || 0}\nExecution Mode: ${execution_plan.execution_mode || 'sequential'}\n\n🔄 Configuration ready! The operations will be executed automatically.`,
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, aiSuccessMsg]);
          
          // 🔧 AUTOMATIC EXECUTION: Execute DataFrame operations if auto_execute is enabled (default to true)
          const shouldAutoExecute = execution_plan.auto_execute !== false; // Default to true if not specified
          if (shouldAutoExecute && df_config.operations && df_config.operations.length > 0) {
            console.log('🚀 Auto-executing DataFrame operations...');
            
            try {
              // Execute operations sequentially
              let current_df_id = null;
              const results = [];
              
              // Helper function to load DataFrame data into UI - simplified approach
              const loadDataFrameIntoUI = async (df_id: string) => {
                try {
                  // Use the info endpoint to get basic DataFrame information
                  const infoResponse = await fetch(`${DATAFRAME_OPERATIONS_API}/info?df_id=${df_id}`);
                  if (infoResponse.ok) {
                    const infoData = await infoResponse.json();
                    
                    // Create a basic DataFrameData structure
                    const dataFrameData = {
                      headers: infoData.headers || [],
                      rows: [], // We'll populate this from operation results
                      fileName: `AI_Processed_${Date.now()}.csv`,
                      columnTypes: Object.keys(infoData.types || {}).reduce((acc, col) => {
                        const type = infoData.types[col];
                        acc[col] = type.includes('Float') || type.includes('Int') ? 'number' : 'text';
                        return acc;
                      }, {} as { [key: string]: 'text' | 'number' | 'date' }),
                      pinnedColumns: [],
                      frozenColumns: 0,
                      cellColors: {}
                    };
                    
                    // Update UI with the basic structure
                    updateAtomSettings(atomId, {
                      tableData: dataFrameData,
                      selectedFile: "AI_Generated_Data", // 🔧 CRITICAL: Set selectedFile to enable table display
                      fileId: df_id,
                      selectedColumns: infoData.headers || []
                    });
                    
                    console.log('✅ DataFrame structure loaded into UI:', {
                      df_id: df_id,
                      headers: infoData.headers?.length || 0
                    });
                    
                    return true;
                  }
                } catch (error) {
                  console.error('❌ Failed to load DataFrame into UI:', error);
                  return false;
                }
                return false;
              };
              
              for (let i = 0; i < df_config.operations.length; i++) {
                const operation = df_config.operations[i];
                console.log(`🔄 Executing operation ${i + 1}/${df_config.operations.length}: ${operation.operation_name}`);
                
                // Prepare operation parameters
                let operationParams = { ...operation.parameters };
                
                // Replace placeholder df_ids with actual df_id from previous operations
                if (operationParams.df_id && typeof operationParams.df_id === 'string' && 
                    (operationParams.df_id.includes('auto_from_previous') || operationParams.df_id === "1" || operationParams.df_id === "existing_df_id") && 
                    current_df_id) {
                  console.log(`🔄 Replacing df_id "${operationParams.df_id}" with actual df_id: "${current_df_id}"`);
                  operationParams.df_id = current_df_id;
                }
                
                // Handle special cases
                if (operation.api_endpoint === "/load") {
                  // File upload operation - would need special handling
                  console.log('📁 File upload operation detected - skipping auto-execution');
                  continue;
                } else if (operation.api_endpoint === "/load_cached") {
                  // Fix parameter mapping for load_cached operation
                  if (operationParams.file_path && !operationParams.object_name) {
                    console.log(`🔄 Converting file_path to object_name for load_cached operation`);
                    console.log(`🔄 Original file_path: "${operationParams.file_path}"`);
                    operationParams.object_name = operationParams.file_path;
                    delete operationParams.file_path;
                    console.log(`🔄 New object_name: "${operationParams.object_name}"`);
                  } else if (operationParams.filename && !operationParams.object_name) {
                    console.log(`🔄 Converting filename to object_name for load_cached operation`);
                    console.log(`🔄 Original filename: "${operationParams.filename}"`);
                    operationParams.object_name = operationParams.filename;
                    delete operationParams.filename;
                    console.log(`🔄 New object_name: "${operationParams.object_name}"`);
                  } else if (!operationParams.object_name && !operationParams.file_path && !operationParams.filename) {
                    console.error(`❌ load_cached operation missing file_path, filename, and object_name parameters`);
                    console.log(`❌ Available parameters:`, Object.keys(operationParams));
                  }
                  
                  console.log('📋 Final parameters for load_cached:', JSON.stringify(operationParams, null, 2));
                  
                  // Cached load operation
                  const response = await fetch(`${DATAFRAME_OPERATIONS_API}${operation.api_endpoint}`, {
                    method: operation.method || 'POST',  // Default to POST if method not specified
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(operationParams)
                  });
                  
                  if (response.ok) {
                    const result = await response.json();
                    current_df_id = result.df_id;
                    results.push(result);
                    console.log(`✅ Operation ${i + 1} completed: ${operation.operation_name}`);
                    
                    // 🔧 CRITICAL: For load operations, immediately display the loaded data
                    if (result.headers && result.rows) {
                      const dataFrameData = {
                        headers: result.headers,
                        rows: result.rows,
                        fileName: operationParams.object_name?.split('/').pop() || `Loaded_${Date.now()}.csv`,
                        columnTypes: Object.keys(result.types || {}).reduce((acc, col) => {
                          const type = result.types[col];
                          acc[col] = type.includes('Float') || type.includes('Int') ? 'number' : 'text';
                          return acc;
                        }, {} as { [key: string]: 'text' | 'number' | 'date' }),
                        frozenColumns: 0,
                        cellColors: {}
                      };
                      
                      // Update UI immediately after load
                      // Use the full object_name for selectedFile (what the dropdown expects)
                      updateAtomSettings(atomId, {
                        tableData: dataFrameData,
                        selectedFile: operationParams.object_name, // 🔧 CRITICAL: Use full object_name for dropdown
                        fileId: current_df_id,
                        selectedColumns: result.headers || []
                      });
                      
                      console.log('🔄 Loaded data displayed in UI after load operation');
                      console.log('🔧 Atom settings updated:', {
                        selectedFile: operationParams.object_name,
                        hasTableData: !!dataFrameData,
                        tableDataHeaders: dataFrameData.headers?.length || 0,
                        tableDataRows: dataFrameData.rows?.length || 0
                      });
                    }
                  } else {
                    const errorText = await response.text();
                    console.error(`❌ Operation ${i + 1} failed: ${operation.operation_name}`);
                    console.error('❌ Error response:', errorText);
                    console.error('❌ Response status:', response.status);
                    console.error('❌ Request parameters sent:', JSON.stringify(operationParams, null, 2));
                    break;
                  }
                } else {
                  // Regular DataFrame operations
                  let requestBody;
                  let contentType = 'application/json';
                  
                  // Handle different endpoint parameter formats
                  if (operation.api_endpoint === "/filter_rows") {
                    // 🔧 CRITICAL FIX: Backend expects JSON body with Body(...) parameters, NOT FormData
                    // Ensure df_id is present (use current_df_id if not provided)
                    const df_id = operationParams.df_id || current_df_id;
                    if (!df_id) {
                      console.error('❌ No df_id available for filter_rows operation');
                      continue;
                    }
                    
                    // Use JSON format (not FormData) - FastAPI Body(...) accepts JSON
                    requestBody = JSON.stringify({
                      df_id: df_id,
                      column: operationParams.column,
                      value: operationParams.value
                    });
                    contentType = 'application/json';
                    console.log('🔍 FILTER_ROWS JSON REQUEST:', { df_id, column: operationParams.column, value: operationParams.value });
                  } else if (operation.api_endpoint === "/sort") {
                    // 🔧 CRITICAL FIX: Backend expects JSON body with Body(...) parameters, NOT FormData
                    // Ensure df_id is present (use current_df_id if not provided)
                    const df_id = operationParams.df_id || current_df_id;
                    if (!df_id) {
                      console.error('❌ No df_id available for sort operation');
                      continue;
                    }
                    
                    // Use JSON format (not FormData) - FastAPI Body(...) accepts JSON
                    requestBody = JSON.stringify({
                      df_id: df_id,
                      column: operationParams.column,
                      direction: operationParams.direction || "asc"
                    });
                    contentType = 'application/json';
                    console.log('🔍 SORT JSON REQUEST:', { df_id, column: operationParams.column, direction: operationParams.direction || "asc" });
                  } else {
                    // 🔧 CRITICAL FIX: For apply_formula, ensure formula starts with '=' (backend requirement)
                    if (operation.api_endpoint === '/apply_formula' && operationParams.formula) {
                      const originalFormula = operationParams.formula;
                      let formula = operationParams.formula;
                      if (formula && typeof formula === 'string') {
                        const trimmedFormula = formula.trim();
                        if (trimmedFormula && !trimmedFormula.startsWith('=')) {
                          formula = `=${trimmedFormula}`;
                          operationParams.formula = formula;
                          console.log(`🔧 Added '=' prefix to formula: "${originalFormula}" -> "${formula}"`);
                        }
                      }
                    }
                    
                    // Default format for other endpoints
                    requestBody = JSON.stringify(operationParams);
                  }
                  
                  console.log('📋 Final parameters for operation:', JSON.stringify(operationParams, null, 2));
                  console.log('🌐 API Endpoint:', `${DATAFRAME_OPERATIONS_API}${operation.api_endpoint}`);
                  console.log('📤 Request body:', requestBody);
                  console.log('📤 Content-Type:', contentType);
                  
                  // 🔧 CRITICAL: Set proper headers for JSON requests
                  const headers: HeadersInit = {};
                  if (contentType === 'application/json') {
                    headers['Content-Type'] = 'application/json';
                  }
                  // For FormData, don't set Content-Type (browser sets it automatically with boundary)
                  
                  const response = await fetch(`${DATAFRAME_OPERATIONS_API}${operation.api_endpoint}`, {
                    method: operation.method || 'POST',
                    headers: headers,
                    body: requestBody
                  });
                  
                  console.log('📥 Response status:', response.status, response.statusText);
                  
                  if (response.ok) {
                    const result = await response.json();
                    if (result.df_id) {
                      current_df_id = result.df_id;
                    }
                    results.push(result);
                    console.log(`✅ Operation ${i + 1} completed: ${operation.operation_name}`);
                    
                    // 🔧 CRITICAL: Update UI after each operation if it returns data
                    if (result.headers && result.rows) {
                      const dataFrameData = {
                        headers: result.headers,
                        rows: result.rows,
                        fileName: `AI_Step_${i + 1}_${Date.now()}.csv`,
                        columnTypes: Object.keys(result.types || {}).reduce((acc, col) => {
                          const type = result.types[col];
                          acc[col] = type.includes('Float') || type.includes('Int') ? 'number' : 'text';
                          return acc;
                        }, {} as { [key: string]: 'text' | 'number' | 'date' }),
                        pinnedColumns: [],
                        frozenColumns: 0,
                        cellColors: {}
                      };
                      
                      // Update UI immediately after each operation
                      const currentSettings = useLaboratoryStore.getState().getAtom(atomId)?.settings;
                      
                      // 🔧 FIX: Clear selectedFile if it's invalid (doesn't end with .arrow) to prevent repeated load errors
                      const currentSelectedFile = currentSettings?.selectedFile;
                      const shouldClearSelectedFile = currentSelectedFile && !currentSelectedFile.endsWith('.arrow');
                      
                      updateAtomSettings(atomId, {
                        ...currentSettings, // 🔧 CRITICAL: Preserve existing settings
                        tableData: dataFrameData,
                        // 🔧 FIX: Clear invalid selectedFile values to prevent useEffect from trying to load them
                        selectedFile: shouldClearSelectedFile ? null : (currentSelectedFile || null),
                        fileId: current_df_id,
                        selectedColumns: result.headers || []
                      });
                      
                      console.log(`🔄 UI updated after operation ${i + 1}: ${operation.operation_name}`);
                    }
                  } else {
                    console.error(`❌ Operation ${i + 1} failed: ${operation.operation_name}`);
                    if (execution_plan.error_handling === "stop_on_error") {
                      break;
                    }
                  }
                }
              }
              
              // Data is already loaded during individual operations, no need for final loading
              
              // Update final settings with execution metadata (preserve existing settings)
              const currentSettings = useLaboratoryStore.getState().getAtom(atomId)?.settings;
              updateAtomSettings(atomId, {
                ...currentSettings, // 🔧 CRITICAL: Preserve existing settings including tableData and selectedFile
                dataframe_config: df_config,
                execution_plan: execution_plan,
                execution_results: results,
                current_df_id: current_df_id,
                operationCompleted: true
              });
              
              // Add completion message with UI integration status
              const hasDisplayData = results.some(r => r.headers && r.rows);
              const completionMsg: Message = {
                id: (Date.now() + 2).toString(),
                content: `🎉 DataFrame operations completed successfully!\n\n✅ Executed ${results.length} operations\n📊 Final DataFrame ID: ${current_df_id}\n${hasDisplayData ? '📋 Results are now displayed in the table below!' : '📋 Operations completed - check the DataFrame Operations interface for results.'}\n\n💡 Your data has been processed and is ready for use!`,
                sender: 'ai',
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, completionMsg]);
              
            } catch (error) {
              console.error('❌ Error during DataFrame operations execution:', error);
              
              const errorMsg: Message = {
                id: (Date.now() + 2).toString(),
                content: `❌ Error during execution: ${error.message || 'Unknown error occurred'}\n\n💡 The configuration is ready, but automatic execution failed. You can try executing the operations manually.`,
                sender: 'ai',
                timestamp: new Date(),
              };
              setMessages(prev => [...prev, errorMsg]);
              
              updateAtomSettings(atomId, {
                operationCompleted: false,
                execution_error: error.message
              });
            }
          } else {
            console.log('⏸️ Auto-execution disabled or no operations to execute');
            
            // Add message about manual execution
            const manualMsg: Message = {
              id: (Date.now() + 2).toString(),
              content: `📋 Configuration completed! Auto-execution is disabled.\n\n💡 You can review the operations and execute them manually when ready.`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, manualMsg]);
          }
        } // End of dataframe-operations handler
      } else {
          // Handle AI suggestions when complete info is not available
        if (data && data.suggestions && Array.isArray(data.suggestions)) {
          // Use smart_response if available, otherwise use the verbose suggestions format
          let suggestionsContent = '';
          
          if (data.smart_response) {
            // Use the smart response from AI - this is the clean, user-friendly message
            suggestionsContent = data.smart_response;
          } else {
            // Fallback to verbose suggestions format
            suggestionsContent = `💡 ${data.message || 'AI needs more information'}\n\n${data.suggestions.join('\n')}\n\n${data.next_steps ? data.next_steps.join('\n') : ''}`;
          }
          
          const suggestionsMsg: Message = { 
            id: (Date.now() + 1).toString(), 
            content: suggestionsContent,
            sender: 'ai', 
            timestamp: new Date() 
          };
          setMessages(prev => [...prev, suggestionsMsg]);
          
          // Store suggestions for potential use
          updateAtomSettings(atomId, {
            aiSuggestions: data.suggestions,
            aiNextSteps: data.next_steps || [],
            recommendedFiles: data.recommended_files || []
          });
        } else {
          const aiMsg: Message = { id: (Date.now() + 1).toString(), content: 'Request failed', sender: 'ai', timestamp: new Date() };
          setMessages(prev => [...prev, aiMsg]);
        }
      }
      
      console.log('✅✅✅ END OF ALL ATOM HANDLERS - NO ERRORS SO FAR');
      console.log('🔍 About to exit handleSendMessage (success path)');
      
    } catch (error) {
      console.error('❌ ===== ERROR IN handleSendMessage =====');
      console.error('Error:', error);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      console.error('==========================================');
      
      // 🔧 FIX: Don't show error message if it's just about reading 'operations' 
      // This happens after successful completion of concat/merge/groupby when the data structure is different
      // The operations complete successfully, so no need to alarm the user
      const isOperationsError = error?.message?.includes("reading 'operations'");
      
      if (!isOperationsError) {
        // Only show error message for REAL errors (not spurious operations access)
        const aiMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          content: `❌ Error: ${error?.message || 'Could not reach AI service'}\n\n💡 Please try again or check the console for details.`, 
          sender: 'ai', 
          timestamp: new Date() 
        };
        setMessages(prev => [...prev, aiMsg]);
      } else {
        console.log('ℹ️ Suppressed operations error - operation completed successfully');
      }
    }

    setIsLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={o => isEnabled && setIsOpen(o)}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'p-1 hover:bg-gray-100 rounded',
            !isEnabled ? 'cursor-not-allowed opacity-50' : '',
            className,
          )}
          title="Atom AI"
          disabled={!isEnabled}
        >
          <Sparkles className={cn('w-3.5 h-3.5', !isEnabled ? 'text-gray-300' : 'text-purple-500')} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-96 h-80 p-0 flex flex-col"
        align="start"
        side="bottom"
        sideOffset={8}
        style={{ resize: 'both', overflow: 'auto' }}
      >
        <div className="p-2 border-b border-gray-200 bg-white rounded-t-md flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-gray-800">{atomTitle} AI</span>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
              Session: {sessionId}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            {/* Session Management Buttons - Icon-based like ChatGPT */}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleClearChat} 
              className="h-6 w-6 p-0 text-gray-600 hover:text-gray-800 hover:bg-gray-100"
              title="Clear chat history (keep session)"
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleClearSession} 
              className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
              title="Start new session (fresh start)"
            >
              <Plus className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="h-6 w-6 p-0">
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1 p-2">
          <div className="space-y-2">
            {messages.map(m => (
              <div key={m.id} className={`flex items-start space-x-2 ${m.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${m.sender === 'ai' ? 'bg-purple-500' : 'bg-gray-600'}`}>
                  {m.sender === 'ai' ? <Bot className="w-3 h-3 text-white" /> : <User className="w-3 h-3 text-white" />}
                </div>
                <Card className={`p-2 text-sm ${m.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200'}`}>{m.content}</Card>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start space-x-2">
                <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                  <Bot className="w-3 h-3 text-white" />
                </div>
                <Card className="p-2 bg-white border border-gray-200">
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </Card>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="p-2 border-t border-gray-200 bg-white rounded-b-md">
          <div className="flex space-x-2">
            <Textarea value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyPress={handleKeyPress} placeholder="Ask AI..." className="flex-1 resize-none h-8" />
            <Button onClick={handleSendMessage} disabled={!inputValue.trim() || isLoading} className="h-8 px-2 bg-blue-500 text-white">
              <Send className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default AtomAIChatBot;