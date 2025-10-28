import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, X, Bot, User, Sparkles, Plus, Trash2, MessageCircle, RotateCcw, Clock, Settings, Paperclip, Mic } from 'lucide-react';

// Workflow Mode AI Panel - Completely separate from SuperAgent
// Does NOT execute - only suggests molecule compositions

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
if (typeof document !== 'undefined' && !document.querySelector('#workflow-ai-animations')) {
  const style = document.createElement('style');
  style.id = 'workflow-ai-animations';
  style.textContent = fadeInStyle;
  document.head.appendChild(style);
}

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  molecules?: any[]; // Molecule composition suggestions
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

interface WorkflowAIPanelProps {
  isCollapsed: boolean;
  onToggle: () => void;
  workflowContext?: {
    workflowName?: string;
    canvasMolecules?: any[];
    customMolecules?: any[];
  };
  onMoleculeAdd?: (molecule: any) => void; // Callback to create molecules on canvas
}

const WorkflowAIPanel: React.FC<WorkflowAIPanelProps> = ({ 
  isCollapsed, 
  onToggle,
  workflowContext,
  onMoleculeAdd
}) => {
  // Chat management state
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // WebSocket state for Workflow Agent
  const [wsConnected, setWsConnected] = useState(false);
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  
  // Suggested molecules from AI
  const [suggestedMolecules, setSuggestedMolecules] = useState<any[]>([]);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Create new chat
  const createNewChat = () => {
    const newChatId = `workflow_chat_${Date.now()}`;
    const newChat: Chat = {
      id: newChatId,
      title: 'New Workflow',
      messages: [
        {
          id: '1',
          content: "Hello! I'm Workflow AI, your workflow composition assistant. I'll help you create molecules by grouping atoms together.\n\n**I can help you create workflows for:**\n- **MMM (Marketing Mix Modeling)** - Measure marketing effectiveness\n- **Churn Prediction** - Identify at-risk customers\n- **Demand Forecasting** - Forecast sales and inventory\n- **Price Optimization** - Optimize pricing strategy\n- **Customer LTV** - Predict lifetime value\n- **Sales Dashboard** - Create KPI dashboards\n\nWhat type of workflow would you like to build?",
          sender: 'ai',
          timestamp: new Date()
        }
      ],
      createdAt: new Date()
    };
    
    setChats(prev => [...prev, newChat]);
    setCurrentChatId(newChatId);
  };

  // Load chats from localStorage on mount - Workflow Mode specific
  useEffect(() => {
    const savedChats = localStorage.getItem('workflow-ai-chats');
    const savedCurrentChatId = localStorage.getItem('workflow-ai-current-chat-id');
    
    if (savedChats) {
      try {
        const parsedChats = JSON.parse(savedChats);
        const chatsWithDates = parsedChats.map((chat: any) => ({
          ...chat,
          createdAt: new Date(chat.createdAt),
          messages: chat.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }))
        }));
        setChats(chatsWithDates);
        
        if (savedCurrentChatId && chatsWithDates.find((chat: Chat) => chat.id === savedCurrentChatId)) {
          setCurrentChatId(savedCurrentChatId);
        } else if (chatsWithDates.length > 0) {
          setCurrentChatId(chatsWithDates[0].id);
        }
      } catch (error) {
        console.error('Error loading workflow chats:', error);
        createNewChat();
      }
    } else {
      createNewChat();
    }
  }, []);

  // Save chats to localStorage
  useEffect(() => {
    if (chats.length > 0) {
      localStorage.setItem('workflow-ai-chats', JSON.stringify(chats));
    }
  }, [chats]);

  // Save current chat ID
  useEffect(() => {
    if (currentChatId) {
      localStorage.setItem('workflow-ai-current-chat-id', currentChatId);
    }
  }, [currentChatId]);

  // Update messages when current chat changes
  useEffect(() => {
    const currentChat = chats.find(chat => chat.id === currentChatId);
    if (currentChat) {
      setMessages(currentChat.messages);
    }
  }, [currentChatId, chats]);

  // Update current chat messages
  const updateCurrentChat = (newMessages: Message[]) => {
    setChats(prev => prev.map(chat => 
      chat.id === currentChatId 
        ? { ...chat, messages: newMessages }
        : chat
    ));
    setMessages(newMessages);
  };

  // Handle send message - Call Workflow Agent API
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const currentInput = inputValue;
    setInputValue('');
    setIsLoading(true);

    // Add user message using setChats to ensure we get the latest state
    const userMessage: Message = {
      id: `user_${Date.now()}`,
      content: currentInput,
      sender: 'user',
      timestamp: new Date()
    };

    // Add user message to chat
    setChats(prevChats => {
      return prevChats.map(chat => {
        if (chat.id === currentChatId) {
          return { ...chat, messages: [...chat.messages, userMessage] };
        }
        return chat;
      });
    });

    try {
      // Connect to Workflow Agent WebSocket
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = import.meta.env.VITE_TRINITY_AI_WS_HOST || window.location.hostname;
      const isDevStack = window.location.port === '8081';
      const wsPort = import.meta.env.VITE_TRINITY_AI_WS_PORT || (isDevStack ? '8005' : '8002');
      const wsUrl = `${wsProtocol}//${wsHost}:${wsPort}/trinityai/workflow/compose-ws`;

      console.log('🔗 Connecting to Workflow Agent:', wsUrl);
      const ws = new WebSocket(wsUrl);

      setWsConnection(ws);

      // Track all progress updates
      let progressContent = '⏳ Connecting to Workflow AI...';

      ws.onopen = () => {
        console.log('✅ Workflow WebSocket connected');
        setWsConnected(true);
        
        // Add connected message
        const connectedMessage: Message = {
          id: `connected_${Date.now()}`,
          content: '✅ Connected to Workflow AI! Analyzing your request...',
        sender: 'ai',
        timestamp: new Date()
      };

        setChats(prevChats => {
          return prevChats.map(chat => {
            if (chat.id === currentChatId) {
              return { ...chat, messages: [...chat.messages, connectedMessage] };
            }
            return chat;
          });
        });

        // Send request to Workflow Agent
        ws.send(JSON.stringify({
          message: currentInput,
          session_id: `workflow_session_${Date.now()}`,
          workflow_context: workflowContext
        }));
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('📨 Workflow Agent message:', data.type, data);

        switch (data.type) {
          case 'connected':
            console.log('✅ Workflow Agent connected');
            break;

          case 'thinking':
            // Add thinking message to chat
            const thinkingMessage: Message = {
              id: `thinking_${Date.now()}`,
              content: data.message,
              sender: 'ai',
              timestamp: new Date()
            };
            setChats(prevChats => {
              return prevChats.map(chat => {
                if (chat.id === currentChatId) {
                  return { ...chat, messages: [...chat.messages, thinkingMessage] };
                }
                return chat;
              });
            });
            break;

          case 'molecules_suggested':
            // Store suggested molecules
            if (data.molecules) {
              setSuggestedMolecules(data.molecules);
            }
            
            // Add ONLY the molecule cards message (skip the text description)
            const moleculeSuggestionsMessage: Message = {
              id: `molecules_suggested_${Date.now()}`,
              content: '', // Empty content - we only want to show the molecule cards
              sender: 'ai',
              timestamp: new Date(),
              molecules: data.molecules
            };
            setChats(prevChats => {
              return prevChats.map(chat => {
                if (chat.id === currentChatId) {
                  return { ...chat, messages: [...chat.messages, moleculeSuggestionsMessage] };
                }
                return chat;
              });
            });
            break;

          case 'message':
            // Only add AI message if it has molecules to display, otherwise skip the text
            const aiMessage: Message = {
              id: `ai_response_${Date.now()}`,
              content: data.content || data.message || 'Response received',
              sender: 'ai',
              timestamp: new Date(),
              molecules: data.molecules || suggestedMolecules
            };

            // Only add message if it has molecules, otherwise it's just redundant text
            if (aiMessage.molecules && aiMessage.molecules.length > 0) {
              // Message with molecules will be displayed as cards
            setChats(prevChats => {
              return prevChats.map(chat => {
                if (chat.id === currentChatId) {
                    return { ...chat, messages: [...chat.messages, aiMessage] };
                }
                return chat;
              });
            });
            } else {
              // If no molecules, don't show the redundant text
              console.log('📝 Skipping text-only message, showing molecule cards instead');
            }
            break;

          case 'response':
            // Full response with workflow composition
            if (data.workflow_composition && data.success) {
              console.log('✅ Workflow composition received:', data.workflow_composition);
              
              // Store molecules from workflow composition
              const molecules = data.workflow_composition.molecules || [];
              if (molecules.length > 0) {
                setSuggestedMolecules(molecules);
                
                // DO NOT auto-create molecules - user must click "Create" button
                console.log('📋 Molecules received, waiting for user to click "Create" button');
              }
            }
            break;

          case 'complete':
            console.log('✅ Workflow composition complete');
            setIsLoading(false);
            ws.close();
            break;

          case 'error':
            console.error('❌ Workflow Agent error:', data.error);
            const errorMessage: Message = {
              id: `error_${Date.now()}`,
              content: `❌ Error: ${data.message || data.error || 'Unknown error'}`,
              sender: 'ai',
              timestamp: new Date()
            };

            setChats(prevChats => {
              return prevChats.map(chat => {
                if (chat.id === currentChatId) {
                  return { ...chat, messages: [...chat.messages, errorMessage] };
                }
                return chat;
              });
            });
            setIsLoading(false);
            ws.close();
            break;
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        
        // Add error message
        const errorMsg: Message = {
          id: `error_${Date.now()}`,
          content: '❌ Connection error occurred. Please try again.',
          sender: 'ai',
          timestamp: new Date()
        };
        
        setChats(prevChats => {
          return prevChats.map(chat => {
            if (chat.id === currentChatId) {
              return { ...chat, messages: [...chat.messages, errorMsg] };
            }
            return chat;
          });
        });
        
        setIsLoading(false);
      };

      ws.onclose = () => {
        console.log('🔌 Workflow WebSocket closed');
        setWsConnected(false);
        setWsConnection(null);
      };

    } catch (error) {
      console.error('Workflow Agent API error:', error);
      const errorMessage: Message = {
          id: `error_${Date.now()}`,
        content: 'I apologize, but I\'m having trouble connecting to the Workflow Agent. Please try again.',
        sender: 'ai',
        timestamp: new Date()
      };
      
        // Add error message to chat
        setChats(prevChats => {
          return prevChats.map(chat => {
            if (chat.id === currentChatId) {
              return { ...chat, messages: [...chat.messages, errorMessage] };
            }
            return chat;
          });
        });
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle creating workflow molecules on canvas
  const handleCreateWorkflowMolecules = (molecules: any[]) => {
    if (!molecules || molecules.length === 0 || !onMoleculeAdd) return;

    console.log('🎨 Creating molecules on canvas:', molecules);

    // Calculate positions for molecules
    const moleculeWidth = 280;
    const moleculeHeight = 220;
    const padding = 60;
    const horizontalSpacing = 100;

    molecules.forEach((mol, index) => {
      const moleculeData = {
        id: `ai-molecule-${Date.now()}-${index}`,
        type: 'custom',
        title: mol.molecule_name || `Molecule ${mol.molecule_number}`,
        subtitle: mol.purpose || '',
        tag: mol.molecule_number ? `Step ${mol.molecule_number}` : '',
        atoms: mol.atoms?.map((atom: any) => atom.id) || [],
        atomOrder: mol.atoms?.map((atom: any) => atom.id) || [],
        selectedAtoms: mol.atoms?.reduce((acc: any, atom: any) => {
          acc[atom.id] = true;
          return acc;
        }, {}) || {},
        position: {
          x: padding + (index * (moleculeWidth + horizontalSpacing)),
          y: padding
        },
        connections: index < molecules.length - 1 ? [
          {
            source: `ai-molecule-${Date.now()}-${index}`,
            target: `ai-molecule-${Date.now()}-${index + 1}`
          }
        ] : []
      };

      console.log(`Creating molecule ${index + 1}:`, moleculeData);
      onMoleculeAdd(moleculeData);
    });

    // Show success message
    const successMessage: Message = {
      id: Date.now().toString(),
      content: `✅ Successfully created ${molecules.length} molecules on the canvas! You can now:\n- Adjust their positions\n- Modify atom selections\n- Connect them in different ways\n- Click "Render Workflow" when ready`,
      sender: 'ai',
      timestamp: new Date()
    };

    // Get current messages from state and add success message
    setChats(prevChats => {
      return prevChats.map(chat => {
        if (chat.id === currentChatId) {
          return { ...chat, messages: [...chat.messages, successMessage] };
        }
        return chat;
      });
    });
  };

  // Execute workflow plan step by step
  const executeWorkflowPlan = (executionPlan: any[]) => {
    if (!executionPlan || executionPlan.length === 0 || !onMoleculeAdd) return;

    console.log('📋 Executing workflow plan with', executionPlan.length, 'steps');

    const moleculeWidth = 280;
    const padding = 60;
    const horizontalSpacing = 100;
    
    const moleculeInstances = new Map<number, any>();
    
    executionPlan.forEach((step, index) => {
      setTimeout(() => {
        if (step.action === 'create_molecule') {
          const molNum = step.molecule_number;
          const moleculeData = {
            id: `ai-molecule-${Date.now()}-${molNum}`,
            type: 'custom',
            title: step.molecule_name || `Molecule ${molNum}`,
            subtitle: step.purpose || '',
            tag: `Step ${molNum}`,
            atoms: [],
            atomOrder: [],
            selectedAtoms: {},
            position: {
              x: padding + ((molNum - 1) * (moleculeWidth + horizontalSpacing)),
              y: padding
            },
            connections: []
          };
          
          moleculeInstances.set(molNum, moleculeData);
          console.log(`🔄 Step ${step.step}: Creating molecule ${molNum}`);
          onMoleculeAdd(moleculeData);
          
        } else if (step.action === 'add_atom') {
          const molNum = step.molecule_number;
          const molecule = moleculeInstances.get(molNum);
          
          if (molecule) {
            // Add atom to the molecule
            molecule.atoms.push(step.atom_id);
            molecule.atomOrder.push(step.atom_id);
            molecule.selectedAtoms[step.atom_id] = true;
            
            console.log(`🔄 Step ${step.step}: Adding atom ${step.atom_title} to molecule ${molNum}`);
            onMoleculeAdd(molecule);
          }
        }
        
        // If this is the last step, show success message
        if (index === executionPlan.length - 1) {
          setTimeout(() => {
            const totalMolecules = new Set(executionPlan.filter(s => s.action === 'create_molecule').map(s => s.molecule_number)).size;
            const successMessage: Message = {
              id: `success_${Date.now()}`,
              content: `✅ Successfully created ${totalMolecules} molecules with all atoms on the canvas!\n\n**Workflow created automatically!**\nYou can now:\n- Adjust molecule positions\n- Modify atom selections\n- Connect molecules differently\n- Click "Render Workflow" when ready`,
              sender: 'ai',
              timestamp: new Date()
            };
            
            // Get current messages from state and add success message
            setChats(prevChats => {
              return prevChats.map(chat => {
                if (chat.id === currentChatId) {
                  return { ...chat, messages: [...chat.messages, successMessage] };
                }
                return chat;
              });
            });
          }, 1000);
        }
      }, index * 300); // Delay each step by 300ms to create animation effect
    });
  };

  const deleteChat = (chatId: string) => {
    setChats(prev => prev.filter(chat => chat.id !== chatId));
    if (chatId === currentChatId && chats.length > 1) {
      const remainingChats = chats.filter(chat => chat.id !== chatId);
      setCurrentChatId(remainingChats[0].id);
    }
  };

  if (isCollapsed) {
    return null;
  }

  return (
    <Card className="h-full bg-white backdrop-blur-xl shadow-[0_20px_70px_rgba(0,0,0,0.3)] border-2 border-gray-200 overflow-hidden flex flex-col relative ring-1 ring-gray-100">
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
                  onClick={() => {
                    setCurrentChatId(chat.id);
                    setShowChatHistory(false);
                  }}
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
            <h3 className="text-lg font-bold text-gray-800 tracking-tight font-inter">Workflow AI</h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#50C878] rounded-full animate-pulse" />
              <p className="text-xs text-gray-600 font-medium font-inter">Active • Workflow Designer</p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-1 relative z-10">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 hover:bg-gray-100 hover:text-gray-800 transition-all duration-200 rounded-xl"
            onClick={() => {
              if (chats.length > 1) {
                deleteChat(currentChatId);
              } else {
                createNewChat();
              }
            }}
            title="Delete Chat"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 hover:bg-gray-100 hover:text-gray-800 transition-all duration-200 rounded-xl"
            onClick={createNewChat}
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
               {/* Only show avatar if there's content OR molecules */}
               {(message.content || (message.molecules && message.molecules.length > 0)) && (
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
               )}

              {/* Message Bubble */}
              <div className={`flex-1 max-w-[300px] group ${
                message.sender === 'user' ? 'flex flex-col items-end' : ''
              }`}>
                 {/* Only render bubble if there's content OR molecules */}
                 {(message.content || (message.molecules && message.molecules.length > 0)) && (
                <div className={`rounded-3xl px-5 py-3.5 shadow-lg border-2 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] ${
                  message.sender === 'ai'
                    ? 'bg-[#50C878] text-white border-[#50C878]/30 rounded-tl-md backdrop-blur-sm'
                    : 'bg-[#458EE2] text-white border-[#458EE2]/30 rounded-tr-md backdrop-blur-sm'
                }`}>
                  <div className="flex-1">
                       {/* Only show content if it's not empty */}
                       {message.content && (
                    <div className="text-sm leading-relaxed font-medium font-inter whitespace-pre-wrap">
                      {message.content}
                    </div>
                       )}
                    
                    {/* Show molecules with Create button if present */}
                    {message.molecules && message.molecules.length > 0 && (
                         <div className={`space-y-3 p-4 bg-white/10 rounded-lg border-2 border-white/30 backdrop-blur-sm ${message.content ? 'mt-4' : ''}`}>
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-white font-inter">
                            💡 Suggested Molecules ({message.molecules.length})
                          </p>
                          <Button
                            onClick={() => handleCreateWorkflowMolecules(message.molecules)}
                            className="bg-[#FEEB99] hover:bg-[#FFBD59] text-gray-800 text-xs px-3 py-1 h-7 shadow-md"
                            size="sm"
                          >
                            ✨ Create
                          </Button>
                        </div>
                        
                        {message.molecules.map((mol: any, idx: number) => (
                          <div key={idx} className="bg-white/20 backdrop-blur-sm p-2 rounded-lg border-2 border-white/30 shadow-sm">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <p className="text-xs font-bold text-white font-inter">
                                  Molecule {mol.molecule_number}: {mol.molecule_name}
                                </p>
                                <p className="text-xs text-white/80 font-inter mt-1">
                                  {mol.purpose}
                                </p>
                              </div>
                              <span className="text-xs font-semibold text-white bg-white/20 px-2 py-1 rounded-full">
                                {mol.atoms?.length || 0} atoms
                              </span>
                            </div>
                            
                            {/* Show atoms in this molecule */}
                            <div className="mt-2 space-y-1">
                              {mol.atoms?.map((atom: any, atomIdx: number) => (
                                <div key={atomIdx} className="flex items-center gap-2 text-xs text-white/90 bg-white/10 px-2 py-1 rounded">
                                  <span className="font-semibold text-white">{atom.order}.</span>
                                  <span className="font-medium">{atom.title}</span>
                                  {atom.required && <span className="text-white">✓</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                 )}
                 {(message.content || (message.molecules && message.molecules.length > 0)) && (
                   <p className="text-xs text-gray-600 mt-2 px-2 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-inter">
                     {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                   </p>
                 )}
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

export default WorkflowAIPanel;

