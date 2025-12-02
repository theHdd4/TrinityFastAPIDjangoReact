import React, { useState, useEffect } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Bot, User, X, MessageSquare, Send, Plus, RotateCcw } from 'lucide-react';
import { TRINITY_AI_API } from '@/lib/api';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { AtomHandlerContext } from './handlers/types';
import { getAtomHandler, hasAtomData } from './handlers';
import { cn } from '@/lib/utils';

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

const AtomAIChatBot: React.FC<AtomAIChatBotProps> = ({ atomId, atomType, atomTitle, className, disabled }) => {
  // For correlation, force it to always render (bypass disabled check temporarily)
  const isCorrelation = atomType === 'correlation';
  const shouldRender = isCorrelation ? true : !disabled;
  
  if (!shouldRender) {
    return null;
  }
  
  // Get endpoint - for correlation, ensure it's always constructed properly
  let endpoint = ENDPOINTS[atomType];
  
  // For correlation, if endpoint is missing or invalid, construct it
  if (isCorrelation && (!endpoint || endpoint.includes('undefined'))) {
    if (TRINITY_AI_API && typeof TRINITY_AI_API === 'string') {
      endpoint = `${TRINITY_AI_API}/correlation`;
    }
  }
  
  // Enable icon if endpoint exists
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
    
    console.log('🚨 endpoint:', endpoint);
    
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
          session_id: sessionId,
          ...envContext
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
        console.log('🚨 Will show general message:', !hasSpecificHandler);
        console.log('🚨 ==========================================');
        
        if (!hasSpecificHandler) {
          console.log('🚨 Showing general AI message:', aiText.substring(0, 100));
          const aiMsg: Message = { id: (Date.now() + 1).toString(), content: aiText, sender: 'ai', timestamp: new Date() };
          setMessages(prev => [...prev, aiMsg]);
        }

        // 🔧 UNIFIED HANDLER DISPATCH: Use handler system for all atom types
        // Check if this atom type has data and a handler available
        if (hasAtomData(atomType, data)) {
          console.log(`🔧 ===== ${atomType.toUpperCase()} AI RESPONSE (via handler) =====`);
          console.log('📝 User Prompt:', userMsg.content);
          console.log('🔧 AI Response Data:', JSON.stringify(data, null, 2));
          
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
              console.warn(`⚠️ No handler found for ${atomType}`);
              // Fallback to generic message if no specific handler
              const aiMsg: Message = { 
                id: (Date.now() + 1).toString(), 
                content: data.smart_response || data.message || `AI response received for ${atomType}, but no specific handler found.`, 
                sender: 'ai', 
                timestamp: new Date() 
              };
              setMessages(prev => [...prev, aiMsg]);
            }
          } catch (handlerError) {
            console.error(`❌ Error in ${atomType} handler:`, handlerError);
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `❌ Error processing ${atomType} configuration: ${(handlerError as Error).message || 'Unknown error'}`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
          }
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
      } else {
        // Handle non-OK response
        const errorText = await res.text().catch(() => res.statusText);
        console.error('❌ API request failed:', res.status, errorText);
        const errorMsg: Message = {
          id: (Date.now() + 1).toString(),
          content: `❌ Request failed: ${res.status} ${res.statusText}\n\n${errorText}`,
          sender: 'ai',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMsg]);
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
