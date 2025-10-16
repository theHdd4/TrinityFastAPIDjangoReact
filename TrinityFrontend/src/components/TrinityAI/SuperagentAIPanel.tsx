import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, X, Bot, User, Sparkles, RotateCcw, Clock, Settings, Paperclip, Mic, Plus, Trash2, MessageCircle, Minimize2, Maximize2 } from 'lucide-react';
import { TRINITY_AI_API } from '@/lib/api';
import { useLaboratoryStore } from '../LaboratoryMode/store/laboratoryStore';

// FastAPI base URL for laboratory card creation
const FAST_API_BASE_URL = import.meta.env.VITE_FASTAPI_BASE_URL || 'http://localhost:8001';

// Add CSS for fade-in animation and slow pulse
const fadeInStyle = `
  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .animate-fade-in {
    animation: fade-in 0.3s ease-out;
  }
  @keyframes slow-pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
  .animate-slow-pulse {
    animation: slow-pulse 2s ease-in-out infinite;
  }
`;

// Inject the CSS if not already present
if (typeof document !== 'undefined' && !document.querySelector('#trinity-ai-animations')) {
  const style = document.createElement('style');
  style.id = 'trinity-ai-animations';
  style.textContent = fadeInStyle;
  document.head.appendChild(style);
}

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

interface SuperagentAIPanelProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const SuperagentAIPanel: React.FC<SuperagentAIPanelProps> = ({ isCollapsed, onToggle }) => {
  // Chat management state
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [panelWidth, setPanelWidth] = useState(384); // Default 384px (w-96)
  const [isResizing, setIsResizing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  
  // Laboratory store for refreshing canvas
  const { setCards } = useLaboratoryStore();
  
  // Function to refresh Laboratory canvas after card creation
  const refreshLaboratoryCanvas = async () => {
    try {
      console.log('🔄 Refreshing Laboratory canvas after card creation...');
      
      // Method 1: Try to reload the page to refresh Laboratory configuration
      console.log('🔄 Reloading page to refresh Laboratory configuration...');
      window.location.reload();
      
    } catch (error) {
      console.error('❌ Failed to refresh Laboratory canvas:', error);
    }
  };

  // Chat management functions
  const createNewChat = () => {
    const newChatId = `chat_${Date.now()}`;
    const newChat: Chat = {
      id: newChatId,
      title: 'New Chat',
      messages: [
        {
          id: '1',
          content: "Hello! I'm Trinity AI, your intelligent assistant. How can I help you today?",
          sender: 'ai',
          timestamp: new Date()
        }
      ],
      createdAt: new Date()
    };
    
    setChats(prev => [...prev, newChat]);
    setCurrentChatId(newChatId);
  };

  // Load chat data from localStorage on mount
  useEffect(() => {
    const savedChats = localStorage.getItem('trinity-ai-chats');
    const savedCurrentChatId = localStorage.getItem('trinity-ai-current-chat-id');
    
    if (savedChats) {
      try {
        const parsedChats = JSON.parse(savedChats);
        // Convert timestamp strings back to Date objects
        const chatsWithDates = parsedChats.map((chat: any) => ({
          ...chat,
          createdAt: new Date(chat.createdAt),
          messages: chat.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        }));
        setChats(chatsWithDates);
        
        if (savedCurrentChatId && chatsWithDates.find(chat => chat.id === savedCurrentChatId)) {
          setCurrentChatId(savedCurrentChatId);
        } else if (chatsWithDates.length > 0) {
          setCurrentChatId(chatsWithDates[0].id);
        }
      } catch (error) {
        console.error('Error loading chat data:', error);
        createNewChat();
      }
    } else {
      createNewChat();
    }
  }, []);

  // Save chat data to localStorage whenever chats change
  useEffect(() => {
    if (chats.length > 0) {
      localStorage.setItem('trinity-ai-chats', JSON.stringify(chats));
    }
  }, [chats]);

  // Save current chat ID to localStorage whenever it changes
  useEffect(() => {
    if (currentChatId) {
      localStorage.setItem('trinity-ai-current-chat-id', currentChatId);
    }
  }, [currentChatId]);

  // Update messages when current chat changes
  useEffect(() => {
    const currentChat = chats.find(chat => chat.id === currentChatId);
    if (currentChat) {
      setMessages(currentChat.messages);
    }
  }, [currentChatId, chats]);

  // Resize functionality
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const newWidth = window.innerWidth - e.clientX;
      const minWidth = 300; // Minimum width
      const maxWidth = window.innerWidth * 0.6; // Maximum 60% of screen width
      
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const updateCurrentChat = (updatedMessages: Message[]) => {
    setChats(prev => prev.map(chat => 
      chat.id === currentChatId 
        ? { ...chat, messages: updatedMessages }
        : chat
    ));
  };

  const deleteCurrentChat = () => {
    if (chats.length <= 1) {
      // If this is the only chat, create a new one instead of deleting
      createNewChat();
    } else {
      // Remove current chat and switch to the first available chat
      const remainingChats = chats.filter(chat => chat.id !== currentChatId);
      setChats(remainingChats);
      setCurrentChatId(remainingChats[0].id);
    }
  };

  const startNewChat = () => {
    createNewChat();
  };

  const switchToChat = (chatId: string) => {
    setCurrentChatId(chatId);
    setShowChatHistory(false);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      sender: 'user',
      timestamp: new Date()
    };

    const currentInput = inputValue;
    setInputValue('');
    setIsLoading(true);

    // Update chat with user message
    const updatedMessages = [...messages, userMessage];
    updateCurrentChat(updatedMessages);

    try {
      // Call the SuperAgent API - simple request
      const response = await fetch(`${TRINITY_AI_API}/superagent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: currentInput
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Check if response contains workflow JSON
      let workflowJSON = null;
      let smartResponse = data.response || 'I received your message but couldn\'t generate a proper response.';
      
      try {
        // Try to extract JSON from response
        const responseText = data.response || '';
        const jsonStart = responseText.indexOf('{');
        
        if (jsonStart !== -1) {
          const jsonText = responseText.substring(jsonStart);
          workflowJSON = JSON.parse(jsonText);
          
          // Extract smart_response (text before JSON)
          smartResponse = responseText.substring(0, jsonStart).trim();
          
          console.log('🎯 Workflow JSON detected:', workflowJSON);
          console.log('💬 Smart Response:', smartResponse);
          
          // Execute workflow using LangChain orchestrator (backend handles execution)
          if (workflowJSON && workflowJSON.workflow && workflowJSON.workflow.length > 0) {
            console.log('🚀 Calling orchestration endpoint to execute workflow...');
            
            // Call the orchestrate endpoint which uses LangChain to execute steps
            try {
              const orchestrateResponse = await fetch(`${TRINITY_AI_API}/superagent/orchestrate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: currentInput }),
                signal: AbortSignal.timeout(180000) // 3 minute timeout
              });
              
              if (orchestrateResponse.ok) {
                const orchestrateData = await orchestrateResponse.json();
                console.log('✅ Orchestration complete:', orchestrateData);
                
                // Handle partial success - show cards even if workflow doesn't complete fully
                if (orchestrateData.success) {
                  smartResponse += `\n\n✅ Workflow executed successfully!`;
                  
                  // Add execution details
                  if (orchestrateData.steps_executed) {
                    smartResponse += `\n📊 Executed ${orchestrateData.steps_executed} steps in ${orchestrateData.execution_time?.toFixed(2) || '?'}s`;
                  }
                  
                  // Show final response from workflow
                  if (orchestrateData.final_response) {
                    smartResponse += `\n\n${orchestrateData.final_response}`;
                  }
                  
                  // Refresh Laboratory canvas if workflow was successful
                  await refreshLaboratoryCanvas();
                } else {
                  // Check for partial success - cards created even if later steps failed
                  if (orchestrateData.steps_results && orchestrateData.steps_results.length > 0) {
                    const cardCreationSteps = orchestrateData.steps_results.filter((step: any) => 
                      step.action === 'CARD_CREATION' && step.success
                    );
                    
                    if (cardCreationSteps.length > 0) {
                      smartResponse += `\n\n✅ Card(s) created successfully! (${cardCreationSteps.length} card${cardCreationSteps.length > 1 ? 's' : ''})`;
                      cardCreationSteps.forEach((step: any, index: number) => {
                        const cardId = step.result?.id || 'unknown';
                        smartResponse += `\n📋 Card ${index + 1}: ${cardId}`;
                      });
                      
                      // Refresh Laboratory canvas after successful card creation
                      await refreshLaboratoryCanvas();
                    }
                  }
                  
                  smartResponse += `\n\n⚠️ Workflow encountered issues after card creation.`;
                  if (orchestrateData.errors && orchestrateData.errors.length > 0) {
                    smartResponse += `\n\nErrors: ${orchestrateData.errors.join(', ')}`;
                  }
                }
              } else {
                console.error('Orchestration endpoint failed:', orchestrateResponse.status);
                smartResponse += `\n\n⚠️ Workflow execution failed (HTTP ${orchestrateResponse.status})`;
              }
            } catch (orchestrateError) {
              console.error('Orchestration error:', orchestrateError);
              smartResponse += `\n\n⚠️ Workflow execution failed: ${orchestrateError instanceof Error ? orchestrateError.message : 'Unknown error'}`;
            }
          }
        }
      } catch (parseError) {
        console.log('No workflow JSON in response, showing as regular message');
      }
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: smartResponse,
        sender: 'ai',
        timestamp: new Date()
      };
      
      // Update chat with AI response
      const finalMessages = [...updatedMessages, aiMessage];
      updateCurrentChat(finalMessages);

      // Update chat title based on first user message
      if (updatedMessages.length === 2) { // Only user message + initial AI greeting
        setChats(prev => prev.map(chat => 
          chat.id === currentChatId 
            ? { ...chat, title: currentInput.substring(0, 30) + (currentInput.length > 30 ? '...' : '') }
            : chat
        ));
      }
    } catch (error) {
      console.error('SuperAgent API error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'I apologize, but I\'m having trouble processing your request right now. Please try again.',
        sender: 'ai',
        timestamp: new Date()
      };
      
      // Update chat with error message
      const finalMessages = [...updatedMessages, errorMessage];
      updateCurrentChat(finalMessages);
    }

    setIsLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };


  // Don't return null when collapsed - preserve state
  if (isCollapsed) {
    return null;
  }

  return (
    <Card className="h-full bg-white backdrop-blur-xl shadow-[0_20px_70px_rgba(0,0,0,0.3)] border-2 border-gray-200 overflow-hidden flex flex-col relative ring-1 ring-gray-100" style={{ width: `${panelWidth}px` }}>
      {/* Resize Handle */}
      <div
        ref={resizeRef}
        onMouseDown={handleMouseDown}
        className="absolute left-0 top-0 w-1 h-full bg-gray-300 hover:bg-gray-400 cursor-col-resize transition-colors duration-200 z-50"
        style={{ marginLeft: '-2px' }}
      />
      {/* Chat History Sidebar */}
      {showChatHistory && (
        <div className="absolute left-0 top-0 w-64 h-full bg-white backdrop-blur-xl border-r-2 border-gray-200 z-50 flex flex-col shadow-xl">
          <div className="p-4 border-b-2 border-gray-200 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800 font-inter">Chat History</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowChatHistory(false)}
                className="h-6 w-6 p-0 hover:bg-gray-100 text-gray-800 rounded-xl"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <ScrollArea className="flex-1 p-2 bg-gray-50/50">
            <div className="space-y-2">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => switchToChat(chat.id)}
                  className={`p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                    chat.id === currentChatId
                      ? 'bg-[#41C185]/10 text-[#41C185] shadow-lg border-2 border-[#41C185]/20'
                      : 'bg-white hover:bg-gray-50 hover:text-gray-800 hover:border-2 hover:border-gray-200'
                  }`}
                >
                  <div className="text-sm font-medium truncate font-inter">{chat.title}</div>
                  <div className={`text-xs mt-1 font-inter ${
                    chat.id === currentChatId ? 'text-[#41C185]/70' : 'text-gray-600'
                  }`}>
                    {chat.messages.length - 1} messages
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
      {/* Header */}
      <div className={`flex items-center justify-between p-5 border-b-2 border-gray-200 cursor-grab active:cursor-grabbing bg-gradient-to-r from-gray-50 to-white backdrop-blur-sm relative overflow-hidden group ${showChatHistory ? 'z-40' : 'z-10'}`}>
        {/* Animated background effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-gray-50/0 via-gray-100/50 to-gray-50/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
        
        <div className="flex items-center space-x-4 relative z-10">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-gray-200/30 border-2 border-gray-200/20 transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-gray-200/40">
              <Sparkles className="w-6 h-6 text-purple-500 animate-slow-pulse" />
            </div>
            {/* Online indicator */}
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[#50C878] rounded-full border-2 border-white shadow-lg">
              <div className="absolute inset-0 bg-[#50C878] rounded-full animate-ping opacity-75" />
            </div>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800 tracking-tight font-inter">Trinity AI</h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#50C878] rounded-full animate-pulse" />
              <p className="text-xs text-gray-600 font-medium font-inter">Active • Ready to help</p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-1 relative z-10">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 hover:bg-gray-100 hover:text-gray-800 transition-all duration-200 rounded-xl"
            onClick={deleteCurrentChat}
            title="Delete Chat"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 hover:bg-gray-100 hover:text-gray-800 transition-all duration-200 rounded-xl"
            onClick={startNewChat}
            title="New Chat"
          >
            <Plus className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 hover:bg-red-100 hover:text-red-500 transition-all duration-200 rounded-xl"
            onClick={onToggle}
            title="Close Panel"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Chat Messages */}
      <ScrollArea className="h-[480px] bg-white">
        <div className="p-6 space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start gap-3 animate-fade-in ${
                message.sender === 'user' ? 'flex-row-reverse' : ''
              }`}
            >
              {/* Avatar */}
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg transition-all duration-300 hover:scale-110 ${
                message.sender === 'ai' 
                  ? 'bg-[#50C878] border-2 border-[#50C878]/30 shadow-[#50C878]/20' 
                  : 'bg-[#458EE2] border-2 border-[#458EE2]/30 shadow-[#458EE2]/20'
              }`}>
                {message.sender === 'ai' ? (
                  <Bot className="w-5 h-5 text-white" />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
              </div>

              {/* Message Bubble */}
              <div className={`flex-1 max-w-[300px] group ${
                message.sender === 'user' ? 'flex flex-col items-end' : ''
              }`}>
                <div className={`rounded-3xl px-5 py-3.5 shadow-lg border-2 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] ${
                  message.sender === 'ai'
                    ? 'bg-[#50C878] text-white border-[#50C878]/30 rounded-tl-md backdrop-blur-sm'
                    : 'bg-[#458EE2] text-white border-[#458EE2]/30 rounded-tr-md backdrop-blur-sm'
                }`}>
                  <div
                    className="text-sm leading-relaxed font-medium font-inter"
                    dangerouslySetInnerHTML={{
                      __html: message.content.replace(/\n/g, '<br>')
                    }}
                  />
                </div>
                <p className="text-xs text-gray-600 mt-2 px-2 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-inter">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}

          {/* Typing Indicator */}
          {isLoading && (
            <div className="flex items-start gap-3 animate-fade-in">
              <div className="w-10 h-10 rounded-2xl bg-[#50C878] border-2 border-[#50C878]/30 flex items-center justify-center shadow-lg shadow-[#50C878]/20">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="bg-[#50C878] text-white rounded-3xl rounded-tl-md px-5 py-3.5 shadow-lg border-2 border-[#50C878]/30 backdrop-blur-sm">
                <div className="flex space-x-1.5">
                  <div className="w-2.5 h-2.5 bg-white/70 rounded-full animate-bounce shadow-sm" />
                  <div className="w-2.5 h-2.5 bg-white/70 rounded-full animate-bounce shadow-sm" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2.5 h-2.5 bg-white/70 rounded-full animate-bounce shadow-sm" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          )}
          
          {/* Scroll anchor - placed at the end to scroll to bottom */}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t-2 border-gray-200 bg-gradient-to-b from-white to-gray-50 p-5 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-10 w-10 p-0 hover:bg-gray-100 hover:text-gray-800 transition-all duration-200 rounded-xl hover:scale-110 shadow-sm hover:shadow-md"
            onClick={() => setShowChatHistory(!showChatHistory)}
            title="Chat History"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-10 w-10 p-0 hover:bg-gray-100 hover:text-gray-800 transition-all duration-200 rounded-xl hover:scale-110 shadow-sm hover:shadow-md"
            title="Attach"
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-10 w-10 p-0 hover:bg-gray-100 hover:text-gray-800 transition-all duration-200 rounded-xl hover:scale-110 shadow-sm hover:shadow-md"
            title="Voice Input"
          >
            <Mic className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-10 w-10 p-0 hover:bg-gray-100 hover:text-gray-800 transition-all duration-200 rounded-xl hover:scale-110 shadow-sm hover:shadow-md"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="h-12 bg-white backdrop-blur-sm border-2 border-gray-200 hover:border-gray-300 focus:border-[#41C185] focus-visible:ring-2 focus-visible:ring-[#41C185]/20 rounded-2xl px-4 text-sm font-medium transition-all duration-200 shadow-sm placeholder:text-gray-500/60 font-inter"
              disabled={isLoading}
            />
          </div>
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="h-12 w-12 bg-[#FEEB99] hover:bg-[#FFBD59] text-gray-800 shadow-lg shadow-[#FFBD59]/30 hover:shadow-xl hover:shadow-[#FFBD59]/40 transition-all duration-300 hover:scale-110 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            size="icon"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-gray-800/30 border-t-gray-800 rounded-full animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default SuperagentAIPanel;
