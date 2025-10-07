import React, { useState, useEffect } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Bot, User, X, MessageSquare, Send, Plus, RotateCcw } from 'lucide-react';
import { TRINITY_AI_API } from '@/lib/api';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { atomHandlers, hasAtomData, AtomHandlerContext, Message } from './handlers';
import { cn } from '@/lib/utils';

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
  'dataframe-operations': `${TRINITY_AI_API}/dataframe-operations`,
};

const AtomAIChatBot: React.FC<AtomAIChatBotProps> = ({ atomId, atomType, atomTitle, className, disabled }) => {
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
    const endpoint = ENDPOINTS[atomType];
    if (!inputValue.trim() || !endpoint) return;

    const userMsg: Message = { id: Date.now().toString(), content: inputValue, sender: 'user', timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

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

      const requestPayload = { 
        prompt: userMsg.content,
        session_id: sessionId,
        ...envContext
      };
      
      console.log('🔍 FRONTEND - SENDING REQUEST TO MERGE API:');
      console.log('='.repeat(80));
      console.log('Endpoint:', endpoint);
      console.log('Payload:', JSON.stringify(requestPayload, null, 2));
      console.log('='.repeat(80));
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      if (res.ok) {
        const data = await res.json();
        console.log('🔍 FRONTEND - RECEIVED RESPONSE FROM MERGE API:');
        console.log('='.repeat(80));
        console.log('Status:', res.status);
        console.log('Response:', JSON.stringify(data, null, 2));
        console.log('='.repeat(80));
        console.log(`📥 Received AI response for ${atomType}:`, data);
        
        // Enhanced AI response handling with smart_response as priority (SAME AS OLD FILE)
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
        
        // Check if we have specific handlers (SAME LOGIC AS OLD FILE)
        const hasSpecificHandler = (atomType === 'concat' && data.concat_json) ||
                                 (atomType === 'merge' && data.merge_json) ||
                                 (atomType === 'create-column' && data.json) ||
                                 (atomType === 'groupby-wtg-avg' && data.groupby_json) ||
                                 (atomType === 'chart-maker' && data.chart_json) ||
                                 (atomType === 'explore' && data.exploration_config) ||
                                 (atomType === 'dataframe-operations' && data.dataframe_config);
        
        console.log('🔍 hasSpecificHandler check:', {
          atomType,
          hasSpecificHandler,
          hasDataJson: !!data.json,
          hasConcatJson: !!data.concat_json,
          hasMergeJson: !!data.merge_json,
          dataKeys: Object.keys(data),
          dataSuccess: data.success
        });
        
        // Create handler context for modular handlers
        const handlerContext: AtomHandlerContext = {
          atomId,
          atomType,
          atomTitle,
          sessionId,
          updateAtomSettings,
          setMessages
        };

        // Get the handler for this atom type
        const handler = atomHandlers[atomType];
        
        // 🔧 FIX: Only show general message if NO handler exists at all
        // Otherwise, let the handler (handleSuccess or handleFailure) show the message
        if (!handler && !hasSpecificHandler) {
          const aiMsg: Message = { id: (Date.now() + 1).toString(), content: aiText, sender: 'ai', timestamp: new Date() };
          setMessages(prev => [...prev, aiMsg]);
          
          // Store suggestions for potential use
          if (data.suggestions || data.next_steps) {
            updateAtomSettings(atomId, {
              aiSuggestions: data.suggestions || [],
              aiNextSteps: data.next_steps || [],
              recommendedFiles: data.recommended_files || []
            });
          }
        }

        // 🔧 FIX: Don't display smart_response here - let handlers manage ALL message display
        // This prevents duplicate messages across all atom types
        console.log('🔍 Smart response available:', !!data.smart_response);

        // Use modular handlers for BOTH UI updates AND message display
        if (handler && data.success && hasSpecificHandler) {
          // 🔧 Call handleSuccess for UI population AND message display
          console.log(`🎯 Using modular handler for ${atomType} (success=true)`);
          console.log(`🔍 Handler data:`, { atomType, hasData: !!data.json, data });
          try {
            await handler.handleSuccess(data, handlerContext);
            console.log(`✅ Handler completed for ${atomType}`);
          } catch (error) {
            console.error(`❌ Handler error for ${atomType}:`, error);
            const errorMsg: Message = {
              id: (Date.now() + 1).toString(),
              content: `Error processing ${atomTitle}: ${(error as Error).message || 'Unknown error'}`,
              sender: 'ai',
              timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMsg]);
          }
        } else if (handler && !data.success) {
          // 🔧 Call handleFailure for UI updates AND message display
          console.log(`💡 Calling handleFailure for ${atomType} (success=false)`);
          try {
            await handler.handleFailure(data, handlerContext);
            console.log(`✅ HandleFailure completed for ${atomType}`);
          } catch (error) {
            console.error(`❌ HandleFailure error for ${atomType}:`, error);
          }
        } else if (hasSpecificHandler) {
          console.log(`🔧 Using inline handler for ${atomType} (no modular handler available)`);
          // This is where we would fall back to old inline logic if needed
        }
      } else {
        // Handle API response error
          const aiMsg: Message = {
            id: (Date.now() + 1).toString(),
          content: 'Request failed - please try again', 
            sender: 'ai',
          timestamp: new Date() 
          };
          setMessages(prev => [...prev, aiMsg]);
              }
            } catch (error) {
      console.error('AI request failed:', error);
      const aiMsg: Message = { 
              id: (Date.now() + 1).toString(),
        content: 'Could not reach AI service', 
            sender: 'ai', 
            timestamp: new Date() 
          };
      setMessages(prev => [...prev, aiMsg]);
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
    <Popover open={isOpen} onOpenChange={o => !disabled && setIsOpen(o)}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'p-1 hover:bg-gray-100 rounded',
            disabled ? 'cursor-not-allowed opacity-50' : '',
            className,
          )}
          title="Atom AI"
          disabled={disabled}
        >
          <Sparkles className={cn('w-3.5 h-3.5', disabled ? 'text-gray-300' : 'text-purple-500')} />
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
