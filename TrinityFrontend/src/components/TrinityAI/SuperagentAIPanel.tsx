import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, X, Bot, User, Sparkles, RotateCcw, Clock, Settings, Paperclip, Mic, Plus, Trash2, MessageCircle, Minimize2, Maximize2, Minus } from 'lucide-react';
import { TRINITY_AI_API } from '@/lib/api';
import { useLaboratoryStore } from '../LaboratoryMode/store/laboratoryStore';
import WorkflowProgress from './WorkflowProgress';
import { getAtomHandler, hasAtomHandler } from './handlers';

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

// Simple markdown parser for bold text
const parseMarkdown = (text: string): string => {
  if (!text) return '';
  
  // First, escape HTML to prevent XSS attacks
  let processedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  
  // Replace **text** with <strong>text</strong>
  processedText = processedText.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Replace *text* with <em>text</em> (italic)
  processedText = processedText.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
  
  // Convert newlines to <br>
  processedText = processedText.replace(/\n/g, '<br>');
  
  return processedText;
};

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  workflowProgress?: {
    totalSteps: number;
    completedSteps: number;
    currentStep: number;
    steps: Array<{
      step: number;
      agent: string;
      action?: string;
      status: 'pending' | 'running' | 'completed' | 'failed';
      summary?: string;
      error?: string;
    }>;
  };
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
  mode?: 'laboratory' | 'workflow';
  workflowContext?: {
    workflowName?: string;
    canvasMolecules?: any[];
    customMolecules?: any[];
  };
}

const SuperagentAIPanel: React.FC<SuperagentAIPanelProps> = ({ 
  isCollapsed, 
  onToggle, 
  mode = 'laboratory',
  workflowContext 
}) => {
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
  
  // WebSocket connection state
  const [wsConnected, setWsConnected] = useState(false);
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [workflowProgress, setWorkflowProgress] = useState<any>(null);
  const [workflowSteps, setWorkflowSteps] = useState<Array<{
    step: number;
    agent: string;
    action?: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    summary?: string;
    error?: string;
  }>>([]);
  
  // Function to refresh Laboratory canvas after card creation
  const refreshLaboratoryCanvas = async () => {
    try {
      console.log('🔄 Refreshing Laboratory canvas after card creation...');
      
      // Get current project from localStorage
      const currentProjectStr = localStorage.getItem('current-project');
      if (!currentProjectStr) {
        console.warn('⚠️ No current project found - cards will be visible after page refresh');
        return;
      }
      
      try {
        const currentProject = JSON.parse(currentProjectStr);
        const projectId = currentProject.id;
        
        console.log(`🔍 Fetching updated laboratory config for project: ${projectId}`);
        
        // Fetch updated project state from registry API (Django backend)
        const REGISTRY_API = import.meta.env.VITE_REGISTRY_API || '/api/registry';
        const response = await fetch(`${REGISTRY_API}/projects/${projectId}/`, {
          credentials: 'include'
        });
        
        if (response.status === 404) {
          console.warn('⚠️ Project not found in registry (404)');
          console.log('💡 The card was created but project state may not be synced yet.');
          console.log('💡 Cards will appear after you refresh the page or navigate to Laboratory mode.');
          return;
        }
        
        if (!response.ok) {
          throw new Error(`Failed to fetch project: ${response.status} ${response.statusText}`);
        }
        
        const projectData = await response.json();
        
        // Update laboratory store with new cards
        if (projectData?.state?.laboratory_config?.cards) {
          const { setCards } = useLaboratoryStore.getState();
          const updatedCards = projectData.state.laboratory_config.cards;
          
          console.log(`✅ Updating laboratory store with ${updatedCards.length} cards`);
          setCards(updatedCards);
          
          // Also update localStorage for persistence
          const STORAGE_KEY = 'laboratory-layout';
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCards));
          
          console.log('✅ Laboratory canvas refreshed successfully');
        } else {
          console.warn('⚠️ No laboratory_config found in project state');
          console.log('💡 The project exists but has no laboratory configuration yet.');
          console.log('💡 Cards will be visible after you navigate to Laboratory mode.');
        }
      } catch (parseError) {
        console.error('❌ Error parsing project data:', parseError);
        console.log('💡 The card was created. Please refresh the page to see it.');
      }
      
    } catch (error) {
      console.error('❌ Failed to refresh Laboratory canvas:', error);
      console.log('💡 The card was created successfully but canvas refresh failed.');
      console.log('💡 The card will appear when you:');
      console.log('   1. Refresh the page (F5), or');
      console.log('   2. Navigate to Laboratory mode, or');
      console.log('   3. Reload the project');
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

  // Keep reference to WebSocket for cleanup
  const wsRef = useRef<WebSocket | null>(null);
  
  // Update ref whenever wsConnection changes
  useEffect(() => {
    wsRef.current = wsConnection;
  }, [wsConnection]);

  // Debug: Log when isCollapsed changes
  useEffect(() => {
    console.log('🔄 SuperAgent isCollapsed changed:', isCollapsed, 'WebSocket state:', wsConnection ? 'exists' : 'null', wsConnected ? 'connected' : 'disconnected');
    console.log('📊 Active WebSocket:', wsConnection?.readyState === WebSocket.OPEN ? 'OPEN' : wsConnection ? 'CLOSED/CLOSING' : 'none');
  }, [isCollapsed]);

  // Cleanup WebSocket ONLY when component unmounts (NOT when collapsed/minimized)
  useEffect(() => {
    return () => {
      // Only cleanup on actual unmount, not on re-render or collapse
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('🧹 SuperAgent unmounting, closing WebSocket');
        wsRef.current.close();
      }
    };
  }, []); // Empty deps array means this only runs on mount/unmount

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
          
          // Execute workflow using WebSocket for real-time updates
          if (workflowJSON && workflowJSON.workflow && workflowJSON.workflow.length > 0) {
            console.log('🚀 Connecting via WebSocket for real-time workflow execution...');
            
            // Create a progress message that will update in real-time
            const progressMessageId = `progress_${Date.now()}`;
            const initialProgressMessage: Message = {
              id: progressMessageId,
              content: smartResponse + '\n\n⏳ Connecting to workflow executor...',
              sender: 'ai',
              timestamp: new Date()
            };
            
            // Add initial progress message to chat
            const messagesWithProgress = [...updatedMessages, initialProgressMessage];
            updateCurrentChat(messagesWithProgress);
            
            try {
              // Create WebSocket connection with configurable URL
              const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
              // Use environment variable or fallback to current hostname
              const wsHost = import.meta.env.VITE_TRINITY_AI_WS_HOST || window.location.hostname;
              
              // Determine port based on environment
              // For domain access (trinity.quantmatrixai.com), use same port as page (default 80/443)
              // This allows routing through Cloudflare → Traefik → trinity-ai service
              let wsPort = '';
              if (import.meta.env.VITE_TRINITY_AI_WS_PORT) {
                // Explicit environment variable takes precedence
                wsPort = `:${import.meta.env.VITE_TRINITY_AI_WS_PORT}`;
              } else if (window.location.port === '8081') {
                // Dev stack specific port
                wsPort = ':8005';
              } else if (window.location.port === '8080') {
                // Production stack local access
                wsPort = ':8080';
              } else if (window.location.port) {
                // Use whatever port the page was loaded from
                wsPort = `:${window.location.port}`;
              }
              // If no port (domain access), wsPort remains empty (uses default 80/443 based on protocol)
              
              const wsUrl = `${wsProtocol}//${wsHost}${wsPort}/trinityai/superagent/orchestrate-ws`;
              
              console.log('🔗 Connecting to:', wsUrl);
              const ws = new WebSocket(wsUrl);
              
              setWsConnection(ws);
              
              // Track workflow progress
              let progressContent = smartResponse;
              let createdCards: string[] = [];
              
              // Handle WebSocket messages
              ws.onopen = () => {
                console.log('✅ WebSocket connected');
                setWsConnected(true);
                
                // Update progress message
                progressContent += '\n\n✅ Connected! Starting workflow execution...';
                updateProgressMessage(progressMessageId, progressContent);
                
                // Get environment context for dynamic path resolution
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
                    console.log('🔍 Environment context loaded for workflow:', envContext);
                  }
                } catch (error) {
                  console.warn('Failed to load environment context:', error);
                }
                
                // Send workflow request with project context and mode
                ws.send(JSON.stringify({
                  message: currentInput,
                  workflow_json: workflowJSON,
                  session_id: `session_${Date.now()}`,
                  client_name: envContext.client_name,
                  app_name: envContext.app_name,
                  project_name: envContext.project_name,
                  mode: mode,
                  workflow_context: workflowContext
                }));
              };
              
              // Update progress message helper
              const updateProgressMessage = (messageId: string, content: string) => {
                setChats(prevChats => {
                  return prevChats.map(chat => {
                    if (chat.id === currentChatId) {
                      const updatedMessages = chat.messages.map(msg => {
                        if (msg.id === messageId) {
                          return { ...msg, content };
                        }
                        return msg;
                      });
                      return { ...chat, messages: updatedMessages };
                    }
                    return chat;
                  });
                });
              };
              
              ws.onmessage = async (event) => {
                const data = JSON.parse(event.data);
                console.log('📨 WebSocket message:', data.type, data);
                
                switch (data.type) {
                  case 'connected':
                    console.log('✅ WebSocket connection established');
                    break;
                    
                  case 'workflow_started':
                    console.log(`🚀 Workflow started: ${data.total_steps} steps`);
                    progressContent += `\n\n🚀 Workflow started: ${data.total_steps} steps`;
                    updateProgressMessage(progressMessageId, progressContent);
                    setWorkflowProgress({ total_steps: data.total_steps, completed_steps: 0 });
                    break;
                    
                  case 'step_started':
                    console.log(`📍 Step ${data.step}/${data.total_steps} started: ${data.agent}`);
                    progressContent += `\n\n📍 Step ${data.step}/${data.total_steps}: ${data.agent}`;
                    if (data.action) {
                      progressContent += ` (${data.action})`;
                    }
                    updateProgressMessage(progressMessageId, progressContent);
                    setWorkflowProgress(prev => ({ 
                      ...prev, 
                      current_step: data.step 
                    }));
                    break;
                    
                  case 'step_completed':
                    console.log(`✅ Step ${data.step} completed: ${data.summary}`);
                    console.log('📦 Full step result data:', data);
                    progressContent += `\n   ✅ ${data.summary}`;
                    updateProgressMessage(progressMessageId, progressContent);
                    setWorkflowProgress(prev => ({ 
                      ...prev, 
                      completed_steps: (prev?.completed_steps || 0) + 1 
                    }));
                    
                    // If this is an AGENT_EXECUTION step, update atom settings with results
                    if (data.action === 'AGENT_EXECUTION' && data.result) {
                      try {
                        console.log('🔍 AGENT_EXECUTION detected, checking for card to update...');
                        console.log('🔍 Created cards:', createdCards);
                        console.log('🔍 Result data:', data.result);
                        
                        // Find the card that was created (should be the last card in createdCards)
                        if (createdCards.length > 0) {
                          const cardId = createdCards[createdCards.length - 1];
                          const { cards, updateAtomSettings } = useLaboratoryStore.getState();
                          const card = cards.find(c => c.id === cardId);
                          
                          if (card && card.atoms.length > 0) {
                            const atomId = card.atoms[0].id;
                            const atomType = card.atoms[0].atomId;
                            const agentResult = data.result;
                            
                            console.log('🔧 Processing agent result for atom:', {
                              cardId,
                              atomId,
                              atomType,
                              agent: data.agent,
                              hasHandler: hasAtomHandler(atomType)
                            });
                            
                            // Use existing atom handlers (same path as individual atom AI)
                            const handler = getAtomHandler(atomType);
                            
                            if (handler && handler.handleSuccess) {
                              console.log(`✅ Using existing ${atomType} handler to process results`);
                              
                              // Create handler context (same as individual atom AI uses)
                              const dummyMessages: any[] = [];
                              const handlerContext = {
                                atomId,
                                atomType,
                                atomTitle: card.atoms[0].atomId || 'Unknown',
                                updateAtomSettings,
                                setMessages: (setter: any) => {
                                  // Handler may add messages, we'll ignore them since we show progress in main chat
                                  if (typeof setter === 'function') {
                                    const newMsgs = setter(dummyMessages);
                                    console.log('Handler generated messages:', newMsgs);
                                  }
                                },
                                sessionId: `session_${Date.now()}`
                              };
                              
                              // Call the handler (same as individual atom AI)
                              const handlerResult = await handler.handleSuccess(agentResult, handlerContext);
                              
                              if (handlerResult.success) {
                                console.log('✅ Atom configured successfully via handler');
                                
                                // Get file info from result for progress message
                                let configInfo = '';
                                if (atomType === 'concat' && agentResult.concat_json) {
                                  const cfg = agentResult.concat_json;
                                  const file1 = Array.isArray(cfg.file1) ? cfg.file1[0] : cfg.file1;
                                  const file2 = Array.isArray(cfg.file2) ? cfg.file2[0] : cfg.file2;
                                  const f1Name = file1 ? file1.split('/').pop() : '';
                                  const f2Name = file2 ? file2.split('/').pop() : '';
                                  configInfo = `${f1Name} + ${f2Name}`;
                                } else if (atomType === 'merge' && agentResult.merge_json) {
                                  const cfg = agentResult.merge_json;
                                  const file1 = Array.isArray(cfg.file1) ? cfg.file1[0] : cfg.file1;
                                  const file2 = Array.isArray(cfg.file2) ? cfg.file2[0] : cfg.file2;
                                  const f1Name = file1 ? file1.split('/').pop() : '';
                                  const f2Name = file2 ? file2.split('/').pop() : '';
                                  configInfo = `${f1Name} + ${f2Name}`;
                                }
                                
                                progressContent += `\n   🎨 Configured: ${configInfo}`;
                                updateProgressMessage(progressMessageId, progressContent);
                                
                                // Update localStorage
                                const STORAGE_KEY = 'laboratory-layout';
                                const updatedCards = useLaboratoryStore.getState().cards;
                                localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCards));
                              } else {
                                console.warn('⚠️ Handler returned failure:', handlerResult.error);
                              }
                            } else {
                              console.warn(`⚠️ No handler found for atom type: ${atomType}`);
                              console.log('💡 Atom result keys:', Object.keys(agentResult));
                            }
                          } else {
                            console.warn('⚠️ Card not found or has no atoms');
                          }
                        } else {
                          console.warn('⚠️ No created cards to update');
                        }
                      } catch (err) {
                        console.error('❌ Failed to update atom settings:', err);
                        console.error('Error details:', err);
                      }
                    }
                    break;
                    
                  case 'step_failed':
                    console.log(`❌ Step ${data.step} failed: ${data.error}`);
                    progressContent += `\n   ❌ Failed: ${data.error}`;
                    updateProgressMessage(progressMessageId, progressContent);
                    break;
                    
                  case 'card_created':
                    console.log(`🎉 Card created: ${data.card_id}`);
                    createdCards.push(data.card_id);
                    progressContent += `\n   🎉 Card created: ${data.card_id}`;
                    updateProgressMessage(progressMessageId, progressContent);
                    
                    // Add card directly to laboratory store using same logic as drag-and-drop
                    if (data.card_data) {
                      try {
                        const { setCards } = useLaboratoryStore.getState();
                        const currentCards = useLaboratoryStore.getState().cards || [];
                        
                        // Import atom data to get proper titles and metadata
                        const { atoms: allAtoms } = await import('@/components/AtomList/data');
                        
                        console.log('🔍 Building card with proper atom metadata...');
                        console.log('🔍 Card data from API:', data.card_data);
                        
                        // Build card structure compatible with laboratory store (same as drag-and-drop)
                        const newCard = {
                          id: data.card_data.id,
                          atoms: (data.card_data.atoms || []).map((atom: any) => {
                            const atomId = atom.atomId;
                            const atomInfo = allAtoms.find((a: any) => a.id === atomId);
                            
                            console.log(`🔍 Building atom: ${atomId}`, {
                              atomId,
                              foundInfo: !!atomInfo,
                              title: atomInfo?.title,
                              category: atomInfo?.category,
                              color: atomInfo?.color
                            });
                            
                            const builtAtom = {
                              id: atom.id,
                              atomId: atomId,
                              title: atomInfo?.title || atomId,  // e.g., "Concat", "Merge"
                              category: atomInfo?.category || 'Atom',
                              color: atomInfo?.color || 'bg-gray-400',
                              source: atom.source || 'ai',
                              llm: atom.llm,
                              settings: atom.settings || {},
                            };
                            
                            console.log('✅ Built atom:', builtAtom);
                            return builtAtom;
                          }),
                          isExhibited: data.card_data.isExhibited || false,
                          moleculeId: data.card_data.moleculeId,
                          moleculeTitle: data.card_data.moleculeTitle,
                        };
                        
                        console.log('🎨 Final card structure:', newCard);
                        console.log('🔍 Card title will be:', newCard.moleculeTitle || newCard.atoms[0]?.title);
                        
                        // Add to store
                        setCards([...currentCards, newCard]);
                        
                        // Also update localStorage
                        const STORAGE_KEY = 'laboratory-layout';
                        localStorage.setItem(STORAGE_KEY, JSON.stringify([...currentCards, newCard]));
                        
                        console.log('✅ Card added to laboratory store with proper atom metadata');
                      } catch (err) {
                        console.error('❌ Failed to add card to store:', err);
                      }
                    }
                    break;
                    
                  case 'workflow_completed':
                    console.log('✅ Workflow completed:', data);
                    progressContent += `\n\n✅ Workflow completed!`;
                    progressContent += `\n📊 Executed ${data.steps_executed}/${data.total_steps} steps`;
                    if (data.execution_time) {
                      progressContent += ` in ${data.execution_time.toFixed(2)}s`;
                    }
                    
                    if (data.final_response) {
                      progressContent += `\n\n${data.final_response}`;
                    }
                    
                    updateProgressMessage(progressMessageId, progressContent);
                    
                    // Cards are already added to store via card_created events
                    if (createdCards.length > 0) {
                      console.log(`✅ ${createdCards.length} card(s) added to Laboratory canvas`);
                      progressContent += `\n\n✅ ${createdCards.length} card(s) visible in Laboratory`;
                      updateProgressMessage(progressMessageId, progressContent);
                    }
                    
                    setWorkflowProgress(null);
                    setWsConnected(false);
                    ws.close();
                    break;
                    
                  case 'error':
                    console.error('❌ WebSocket error:', data.message);
                    progressContent += `\n\n❌ Error: ${data.message}`;
                    updateProgressMessage(progressMessageId, progressContent);
                    setWorkflowProgress(null);
                    setWsConnected(false);
                    ws.close();
                    break;
                }
              };
              
              ws.onerror = (error) => {
                console.error('❌ WebSocket error:', error);
                progressContent += `\n\n❌ WebSocket connection error`;
                updateProgressMessage(progressMessageId, progressContent);
                setWorkflowProgress(null);
                setWsConnected(false);
              };
              
              ws.onclose = () => {
                console.log('🔌 WebSocket closed');
                setWsConnected(false);
                setWsConnection(null);
              };
              
            } catch (wsError) {
              console.error('WebSocket connection error:', wsError);
              const errorContent = smartResponse + `\n\n❌ Failed to connect via WebSocket: ${wsError instanceof Error ? wsError.message : 'Unknown error'}`;
              
              // Update the progress message with error
              setChats(prevChats => {
                return prevChats.map(chat => {
                  if (chat.id === currentChatId) {
                    const updatedMessages = chat.messages.map(msg => {
                      if (msg.id === progressMessageId) {
                        return { ...msg, content: errorContent };
                      }
                      return msg;
                    });
                    return { ...chat, messages: updatedMessages };
                  }
                  return chat;
                });
              });
              
              setWorkflowProgress(null);
            }
            
            // Skip adding a separate AI message since we're using the progress message
            setIsLoading(false);
            return;
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

  // Calculate responsive font sizes based on panel width
  const baseFontSize = Math.max(12, Math.min(14, panelWidth * 0.035)); // Scales between 12px and 14px
  const smallFontSize = Math.max(10, Math.min(12, panelWidth * 0.03)); // Scales between 10px and 12px
  const headerFontSize = Math.max(16, Math.min(18, panelWidth * 0.045)); // Scales between 16px and 18px
  
  // Calculate responsive message bubble max width for SuperAgent (can expand more - 75% of panel width, min 250px, max 650px)
  const messageBubbleMaxWidth = Math.max(250, Math.min(650, panelWidth * 0.75));

  // Don't unmount when collapsed - keep WebSocket connections and requests alive
  return (
    <div className={isCollapsed ? 'hidden' : ''} style={{ height: '100%' }}>
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
              <h3 className="font-semibold text-gray-800 font-inter" style={{ fontSize: `${baseFontSize}px` }}>Chat History</h3>
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
                  <div className="font-medium truncate font-inter" style={{ fontSize: `${baseFontSize}px` }}>{chat.title}</div>
                  <div className={`mt-1 font-inter ${
                    chat.id === currentChatId ? 'text-[#41C185]/70' : 'text-gray-600'
                  }`} style={{ fontSize: `${smallFontSize}px` }}>
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
            <h3 className="font-bold text-gray-800 tracking-tight font-inter" style={{ fontSize: `${headerFontSize}px` }}>Trinity AI</h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#50C878] rounded-full animate-pulse" />
              <p className="text-gray-600 font-medium font-inter" style={{ fontSize: `${smallFontSize}px` }}>Active • Ready to help</p>
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
            className="h-9 w-9 p-0 hover:bg-blue-100 hover:text-blue-500 transition-all duration-200 rounded-xl"
            onClick={onToggle}
            title="Minimize Panel"
          >
            <Minus className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 hover:bg-red-100 hover:text-red-500 transition-all duration-200 rounded-xl"
            onClick={() => {
              // Cancel any ongoing requests
              if (wsConnection && wsConnected) {
                wsConnection.close();
                setWsConnected(false);
              }
              setIsLoading(false);
              onToggle();
            }}
            title="Close Panel (Cancel Requests)"
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
              <div className={`flex-1 group ${
                message.sender === 'user' ? 'flex flex-col items-end' : ''
              }`} style={{ maxWidth: `${messageBubbleMaxWidth}px` }}>
                <div className={`rounded-3xl px-5 py-3.5 shadow-lg border-2 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] ${
                  message.sender === 'ai'
                    ? 'bg-[#50C878] text-white border-[#50C878]/30 rounded-tl-md backdrop-blur-sm'
                    : 'bg-[#458EE2] text-white border-[#458EE2]/30 rounded-tr-md backdrop-blur-sm'
                  }`}>
                    <div
                      className="leading-relaxed font-medium font-inter"
                      style={{ fontSize: `${baseFontSize}px` }}
                      dangerouslySetInnerHTML={{
                        __html: parseMarkdown(message.content)
                      }}
                    />
                  </div>
                  <p className="text-gray-600 mt-2 px-2 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-inter" style={{ fontSize: `${smallFontSize}px` }}>
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
              className="h-12 bg-white backdrop-blur-sm border-2 border-gray-200 hover:border-gray-300 focus:border-[#41C185] focus-visible:ring-2 focus-visible:ring-[#41C185]/20 rounded-2xl px-4 font-medium transition-all duration-200 shadow-sm placeholder:text-gray-500/60 font-inter"
              style={{ fontSize: `${baseFontSize}px` }}
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
    </div>
  );
};

export default SuperagentAIPanel;
