import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, X, Bot, User, Sparkles, Plus, Trash2, MessageCircle, RotateCcw, Clock, Settings, Paperclip, Mic, Minus, Square, File, Play } from 'lucide-react';
import { TRINITY_AI_API, VALIDATE_API } from '@/lib/api';
import WorkflowOverwriteDialog from '@/components/WorkflowMode/components/WorkflowOverwriteDialog';

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
  molecules?: any[]; // Molecule composition suggestions
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

interface WorkflowAIBackgroundStatus {
  isProcessing: boolean;
  isCollapsed: boolean;
  hasSuggestedMolecules: boolean;
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
  onRenderWorkflow?: () => void; // Callback to render workflow
  onCheckCanvasHasMolecules?: () => boolean; // Check if canvas has molecules
  onGetAICreatedMolecules?: () => string[]; // Get AI-created molecule IDs
  onClearAIMolecules?: () => void; // Clear AI-created molecules
  onGetRightmostPosition?: () => number; // Get rightmost molecule position
  onBackgroundStatusChange?: (status: WorkflowAIBackgroundStatus) => void;
}

const WorkflowAIPanel: React.FC<WorkflowAIPanelProps> = ({ 
  isCollapsed, 
  onToggle,
  workflowContext,
  onMoleculeAdd,
  onRenderWorkflow,
  onCheckCanvasHasMolecules,
  onGetAICreatedMolecules,
  onClearAIMolecules,
  onGetRightmostPosition,
  onBackgroundStatusChange
}) => {
  // Chat management state
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [panelWidth, setPanelWidth] = useState(384); // Default 384px (w-96)
  const [isPanelFrozen, setIsPanelFrozen] = useState(true); // Default to frozen
  const [isResizing, setIsResizing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const currentChatIdRef = useRef<string>('');
  
  // WebSocket state for Workflow Agent
  const [wsConnected, setWsConnected] = useState(false);
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  
  // Suggested molecules from AI
  const [suggestedMolecules, setSuggestedMolecules] = useState<any[]>([]);
  
  // Dialog state for overwrite/append confirmation
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [pendingMolecules, setPendingMolecules] = useState<any[]>([]);
  const [pendingAction, setPendingAction] = useState<'create' | 'render' | null>(null);

  // Session ID management - one session per chat
  const [chatSessionIds, setChatSessionIds] = useState<Record<string, string>>({});
  
  // File attachment state
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [availableFiles, setAvailableFiles] = useState<Array<{object_name: string; csv_name?: string; arrow_name?: string}>>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Create new chat
  useEffect(() => {
    currentChatIdRef.current = currentChatId;
  }, [currentChatId]);

  const createNewChat = (): string => {
    const newChatId = `workflow_chat_${Date.now()}`;
    const newSessionId = `workflow_session_${Date.now()}`;
    const newChat: Chat = {
      id: newChatId,
      title: 'New Workflow',
      messages: [
        {
          id: '1',
          content: "Hello! I'm Workflow AI, your workflow composition assistant. I'll help you create molecules by grouping atoms together.",
          sender: 'ai',
          timestamp: new Date()
        }
      ],
      createdAt: new Date()
    };
    
    setChats(prev => [...prev, newChat]);
    setChatSessionIds(prev => ({ ...prev, [newChatId]: newSessionId }));
    setCurrentChatId(newChatId);
    currentChatIdRef.current = newChatId;
    setMessages(newChat.messages);

    return newChatId;
  };

  const ensureActiveChat = (): string | null => {
    if (currentChatId) {
      const existingChat = chats.find(chat => chat.id === currentChatId);
      if (existingChat) {
        return currentChatId;
      }
    }

    if (chats.length > 0) {
      const fallbackChat = chats[0];
      if (fallbackChat.id !== currentChatId) {
        setCurrentChatId(fallbackChat.id);
        currentChatIdRef.current = fallbackChat.id;
        setMessages(fallbackChat.messages);
      } else {
        currentChatIdRef.current = fallbackChat.id;
      }
      return fallbackChat.id;
    }

    const newChatId = createNewChat();
    currentChatIdRef.current = newChatId;
    return newChatId;
  };

  // Load chats from localStorage on mount - Workflow Mode specific
  useEffect(() => {
    const savedChats = localStorage.getItem('workflow-ai-chats');
    const savedCurrentChatId = localStorage.getItem('workflow-ai-current-chat-id');
    const savedSessionIds = localStorage.getItem('workflow-ai-session-ids');
    
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
        
        // Load saved session IDs
        if (savedSessionIds) {
          try {
            const parsedSessionIds = JSON.parse(savedSessionIds);
            setChatSessionIds(parsedSessionIds);
          } catch (e) {
            console.warn('Failed to load session IDs:', e);
          }
        }
        
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

  // Save session IDs to localStorage
  useEffect(() => {
    if (Object.keys(chatSessionIds).length > 0) {
      localStorage.setItem('workflow-ai-session-ids', JSON.stringify(chatSessionIds));
    }
  }, [chatSessionIds]);

  // Update messages when current chat changes
  useEffect(() => {
    const currentChat = chats.find(chat => chat.id === currentChatId);
    if (currentChat) {
      setMessages(currentChat.messages);
    }
  }, [currentChatId, chats]);

  // Keep reference to WebSocket for cleanup
  const wsRef = useRef<WebSocket | null>(null);
  
  // Update ref whenever wsConnection changes
  useEffect(() => {
    wsRef.current = wsConnection;
  }, [wsConnection]);

  const backgroundStatusRef = useRef<WorkflowAIBackgroundStatus | null>(null);

  useEffect(() => {
    if (!onBackgroundStatusChange) return;

    const status: WorkflowAIBackgroundStatus = {
      isProcessing: isLoading || (wsConnection !== null && wsConnected),
      isCollapsed,
      hasSuggestedMolecules: suggestedMolecules.length > 0
    };

    const prevStatus = backgroundStatusRef.current;
    if (
      prevStatus &&
      prevStatus.isProcessing === status.isProcessing &&
      prevStatus.isCollapsed === status.isCollapsed &&
      prevStatus.hasSuggestedMolecules === status.hasSuggestedMolecules
    ) {
      return;
    }

    backgroundStatusRef.current = status;
    onBackgroundStatusChange(status);
  }, [
    isCollapsed,
    isLoading,
    onBackgroundStatusChange,
    suggestedMolecules.length,
    wsConnected,
    wsConnection
  ]);

  // Debug: Log when isCollapsed changes
  useEffect(() => {
    console.log('🔄 isCollapsed changed:', isCollapsed, 'WebSocket state:', wsConnection ? 'exists' : 'null', wsConnected ? 'connected' : 'disconnected');
    console.log('📊 Active WebSocket:', wsConnection?.readyState === WebSocket.OPEN ? 'OPEN' : wsConnection ? 'CLOSED/CLOSING' : 'none');
  }, [isCollapsed]);

  // Cleanup WebSocket ONLY when component unmounts (NOT when collapsed/minimized)
  useEffect(() => {
    return () => {
      // Only cleanup on actual unmount, not on re-render or collapse
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('🧹 Component unmounting, closing WebSocket');
        wsRef.current.close();
      }
    };
  }, []); // Empty deps array means this only runs on mount/unmount

  // Resize functionality
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const newWidth = window.innerWidth - e.clientX;
      const minWidth = 300; // Minimum width
      const maxWidth = 800; // Maximum width
      
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
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
    };
  }, [isResizing]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isPanelFrozen) return; // Don't allow resizing when frozen
    e.preventDefault();
    setIsResizing(true);
  };

  // Calculate responsive font sizes based on panel width
  const baseFontSize = Math.max(12, Math.min(14, panelWidth * 0.035)); // Scales between 12px and 14px
  const smallFontSize = Math.max(10, Math.min(12, panelWidth * 0.03)); // Scales between 10px and 12px
  const headerFontSize = Math.max(16, Math.min(18, panelWidth * 0.045)); // Scales between 16px and 18px
  
  // Calculate responsive message bubble max width (70% of panel width, min 200px, max 500px)
  const messageBubbleMaxWidth = Math.max(200, Math.min(500, panelWidth * 0.7));
  const isChatReady = Boolean(currentChatId && chats.some(chat => chat.id === currentChatId));

  // Append a message to a specific chat and mirror it in the local messages state when applicable
  const appendMessageToChat = (chatId: string, message: Message) => {
    setChats(prevChats => {
      const chatExists = prevChats.some(chat => chat.id === chatId);
      if (!chatExists) {
        console.warn('⚠️ Tried to append message to missing chat:', chatId, '— creating recovery chat entry.');
        const recoveredChat: Chat = {
          id: chatId,
          title: 'Recovered Workflow',
          messages: [message],
          createdAt: new Date()
        };
        return [...prevChats, recoveredChat];
      }

      return prevChats.map(chat => 
        chat.id === chatId
          ? { ...chat, messages: [...chat.messages, message] }
          : chat
      );
    });

    if (chatId === currentChatIdRef.current) {
      setMessages(prev => [...prev, message]);
    }
  };

  // Handle send message - Call Workflow Agent API
  const handleSendMessage = async () => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || isLoading) return;

    const activeChatId = ensureActiveChat();
    if (!activeChatId) {
      console.warn('⚠️ Unable to send message — chat is still initializing.');
      return;
    }

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
    appendMessageToChat(activeChatId, userMessage);

    try {
      // Connect to Workflow Agent WebSocket
      const resolveWorkflowWsUrl = () => {
        try {
          const baseUrl = new URL(TRINITY_AI_API);
          const cleanedPath = baseUrl.pathname.replace(/\/$/, '');
          baseUrl.pathname = `${cleanedPath}/workflow/compose-ws`;
          baseUrl.protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
          return baseUrl.toString();
        } catch (error) {
          console.warn('Failed to build WebSocket URL from TRINITY_AI_API:', error);
          if (typeof window !== 'undefined') {
            const fallback = new URL(
              `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/trinityai/workflow/compose-ws`
            );
            return fallback.toString();
          }
          throw error;
        }
      };

      const wsUrl = resolveWorkflowWsUrl();

      console.log('🔗 Connecting to Workflow Agent:', wsUrl);
      const ws = new WebSocket(wsUrl);

      setWsConnection(ws);

      // Track all progress updates
      let progressContent = '⏳ Connecting to Workflow AI...';

      ws.onopen = () => {
        console.log('✅ Workflow WebSocket connected');
        setWsConnected(true);
        
        // Skip the connected message - user already sees their message being processed

        // Get session ID for current chat
        const sessionId = chatSessionIds[activeChatId] || `workflow_session_${Date.now()}`;
        
        // If no session ID exists for this chat, create and store it
        if (!chatSessionIds[activeChatId]) {
          setChatSessionIds(prev => ({ ...prev, [activeChatId]: sessionId }));
        }

        // Get environment context for dynamic path resolution (SAME AS SUPERAGENT)
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

        // Send request to Workflow Agent with persistent session ID and project context
        ws.send(JSON.stringify({
          message: currentInput,
          session_id: sessionId,
          workflow_context: workflowContext,
          client_name: envContext.client_name,
          app_name: envContext.app_name,
          project_name: envContext.project_name
        }));
      };

      // Track if we've already added the final response message
      let finalResponseAdded = false;

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('📨 Workflow Agent message:', data.type, data);

        switch (data.type) {
          case 'connected':
            console.log('✅ Workflow Agent connected');
            break;

          case 'thinking':
            // Skip thinking messages - just log
            console.log('💭 Agent is thinking:', data.message);
            break;

          case 'molecules_suggested':
            // Ignore interim suggestions in chat (cards will be added on final response)
            break;
          case 'message':
            // Ignore interim text updates; we only render on final 'response'
            break;
          case 'response':
            // Handle both success and failure cases
            if (!finalResponseAdded) {
              console.log('📨 Processing response:', { 
                success: data.success, 
                hasMolecules: !!data.workflow_composition?.molecules,
                smart_response: data.smart_response,
                reasoning: data.reasoning,
                suggestions: data.suggestions
              });
              
              // If success is FALSE, show guidance message and clear suggested molecules
              if (data.success === false) {
                setSuggestedMolecules([]); // Clear suggested molecules on failure
                
                let content = '';
                
                // Show answer first (direct response to the question), then smart_response (workflow guidance)
                if (data.answer && data.answer.trim()) {
                  content = data.answer;
                  
                  // Add smart_response below the answer if it exists
                  if (data.smart_response && data.smart_response.trim()) {
                    content += '\n\n' + data.smart_response;
                  }
                } else if (data.smart_response && data.smart_response.trim()) {
                  // If no answer, just show smart_response
                  content = data.smart_response;
                } else if (data.message && data.message.trim()) {
                  content = data.message;
                } else {
                  content = 'I need more information to help you.';
                }
                
                // Add suggestions if available
                if (data.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
                  content += `\n\n**💡 Suggestions:**\n${data.suggestions.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`;
                }
                
                const guidanceMessage: Message = {
                  id: `guidance_${Date.now()}`,
                  content: content,
                  sender: 'ai',
                  timestamp: new Date()
                };
                
                console.log('📝 Adding guidance message to chat:', content.substring(0, 100));
                appendMessageToChat(activeChatId, guidanceMessage);
                finalResponseAdded = true;
              } 
              // If success is TRUE, show smart_response (with or without molecules)
              else if (data.success === true) {
                const molecules = data.workflow_composition?.molecules || [];
                
                // Update suggested molecules state for persistent buttons
                if (molecules.length > 0) {
                  setSuggestedMolecules(molecules);
                }
                
                // Build content from smart_response (not from message field)
                let content = '';
                if (data.smart_response && data.smart_response.trim()) {
                  content = data.smart_response;
                } else if (data.message && data.message.trim()) {
                  content = data.message;
                }
                
                const responseMessage: Message = {
                  id: `response_${Date.now()}`,
                  content: content,
                  sender: 'ai',
                  timestamp: new Date(),
                  molecules: molecules.length > 0 ? molecules : undefined
                };

                console.log('✅ Adding molecule response to chat:', content.substring(0, 100));
                appendMessageToChat(activeChatId, responseMessage);
                
                finalResponseAdded = true;
              } else {
                console.warn('⚠️ Unknown response format:', data);
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

            appendMessageToChat(activeChatId, errorMessage);
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
        
        appendMessageToChat(activeChatId, errorMsg);
        
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
        appendMessageToChat(activeChatId, errorMessage);
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Auto-resize textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [inputValue]);

  // Handle stop/cancel request
  const handleStopRequest = () => {
    console.log('🛑 User requested to stop the ongoing workflow request');
    
    // Close WebSocket connection if active
    if (wsConnection && wsConnected) {
      console.log('🔌 Closing Workflow WebSocket connection');
      wsConnection.close();
      setWsConnected(false);
      setWsConnection(null);
    }
    
    // Reset loading state
    setIsLoading(false);
    
    // Add a cancellation message to the chat
    const cancelMessage: Message = {
      id: `cancel_${Date.now()}`,
      content: '⚠️ Request cancelled by user.',
      sender: 'ai',
      timestamp: new Date()
    };
    
    if (currentChatId) {
      appendMessageToChat(currentChatId, cancelMessage);
    }
    
    console.log('✅ Workflow request stopped successfully');
  };

  // Helper function to actually create molecules on canvas
  const createMoleculesOnCanvas = (molecules: any[], mode: 'overwrite' | 'append') => {
    if (!molecules || molecules.length === 0 || !onMoleculeAdd) return;

    console.log(`🎨 Creating molecules on canvas in ${mode} mode:`, molecules);

    // Calculate positions for molecules
    const moleculeWidth = 280;
    const moleculeHeight = 220;
    const padding = 60;
    const horizontalSpacing = 100;

    // Determine starting X position based on mode
    let startX = padding;
    if (mode === 'append' && onGetRightmostPosition) {
      const rightmostX = onGetRightmostPosition();
      startX = rightmostX > 0 ? rightmostX + horizontalSpacing : padding;
      console.log(`📍 Append mode: Starting at x=${startX} (rightmost was ${rightmostX})`);
    } else if (mode === 'overwrite') {
      console.log('🗑️ Overwrite mode: Clearing AI-created molecules first');
      if (onClearAIMolecules) {
        onClearAIMolecules();
      }
    }

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
          x: startX + (index * (moleculeWidth + horizontalSpacing)),
          y: padding
        },
        connections: index < molecules.length - 1 ? [
          {
            source: `ai-molecule-${Date.now()}-${index}`,
            target: `ai-molecule-${Date.now()}-${index + 1}`
          }
        ] : [],
        isAICreated: true // Mark as AI-created
      };

      console.log(`Creating molecule ${index + 1}:`, moleculeData);
      onMoleculeAdd(moleculeData);
    });

    // Show success message
    const successMessage: Message = {
      id: Date.now().toString(),
      content: `✅ Successfully ${mode === 'overwrite' ? 'replaced AI molecules with' : 'added'} ${molecules.length} molecules on the canvas! You can now:\n- Adjust their positions\n- Modify atom selections\n- Connect them in different ways\n- Click "Render Workflow" when ready`,
      sender: 'ai',
      timestamp: new Date()
    };

    if (currentChatId) {
      appendMessageToChat(currentChatId, successMessage);
    }
  };

  // Handle creating workflow molecules on canvas
  const handleCreateWorkflowMolecules = (molecules: any[]) => {
    if (!molecules || molecules.length === 0 || !onMoleculeAdd) return;

    // Check if canvas has any molecules
    const hasExistingMolecules = onCheckCanvasHasMolecules ? onCheckCanvasHasMolecules() : false;

    if (hasExistingMolecules) {
      // Show dialog to ask user
      console.log('⚠️ Canvas has existing molecules, showing dialog');
      setPendingMolecules(molecules);
      setPendingAction('create');
      setShowOverwriteDialog(true);
    } else {
      // No existing molecules, create directly
      console.log('✅ Canvas is empty, creating molecules directly');
      createMoleculesOnCanvas(molecules, 'append');
    }
  };

  // Handle create and render workflow - creates molecules first, then renders
  const handleCreateAndRenderWorkflow = (molecules: any[]) => {
    if (!molecules || molecules.length === 0 || !onMoleculeAdd || !onRenderWorkflow) return;

    // Check if canvas has any molecules
    const hasExistingMolecules = onCheckCanvasHasMolecules ? onCheckCanvasHasMolecules() : false;

    if (hasExistingMolecules) {
      // Show dialog to ask user
      console.log('⚠️ Canvas has existing molecules, showing dialog');
      setPendingMolecules(molecules);
      setPendingAction('render');
      setShowOverwriteDialog(true);
    } else {
      // No existing molecules, create and render directly
      console.log('✅ Canvas is empty, creating and rendering workflow directly');
      createAndRenderMolecules(molecules, 'append');
    }
  };

  // Helper function to create molecules and then render
  const createAndRenderMolecules = (molecules: any[], mode: 'overwrite' | 'append') => {
    console.log(`🎨 Creating and rendering workflow in ${mode} mode with`, molecules.length, 'molecules');
    
    // First create the molecules
    createMoleculesOnCanvas(molecules, mode);
    
    // Wait a bit for molecules to be added to canvas, then render workflow
    setTimeout(() => {
      console.log('🚀 Rendering workflow and navigating to Laboratory mode');
      if (onRenderWorkflow) {
        onRenderWorkflow();
      }
    }, 500); // 500ms delay to ensure molecules are created on canvas
  };

  // Dialog handlers
  const handleDialogOverwrite = () => {
    console.log('✅ User selected: Overwrite');
    setShowOverwriteDialog(false);
    
    if (pendingAction === 'create') {
      createMoleculesOnCanvas(pendingMolecules, 'overwrite');
    } else if (pendingAction === 'render') {
      createAndRenderMolecules(pendingMolecules, 'overwrite');
    }
    
    setPendingMolecules([]);
    setPendingAction(null);
  };

  const handleDialogAppend = () => {
    console.log('✅ User selected: Append');
    setShowOverwriteDialog(false);
    
    if (pendingAction === 'create') {
      createMoleculesOnCanvas(pendingMolecules, 'append');
    } else if (pendingAction === 'render') {
      createAndRenderMolecules(pendingMolecules, 'append');
    }
    
    setPendingMolecules([]);
    setPendingAction(null);
  };

  const handleDialogCancel = () => {
    console.log('❌ User cancelled');
    setShowOverwriteDialog(false);
    setPendingMolecules([]);
    setPendingAction(null);
  };

  // Execute workflow plan step by step
  const executeWorkflowPlan = (executionPlan: any[]) => {
    if (!executionPlan || executionPlan.length === 0 || !onMoleculeAdd) return;

    console.log('📋 Executing workflow plan with', executionPlan.length, 'steps');

    // Check if canvas has any molecules
    const hasExistingMolecules = onCheckCanvasHasMolecules ? onCheckCanvasHasMolecules() : false;
    
    const moleculeWidth = 280;
    const padding = 60;
    const horizontalSpacing = 100;
    
    // Determine starting X position
    let startX = padding;
    if (hasExistingMolecules && onGetRightmostPosition) {
      const rightmostX = onGetRightmostPosition();
      startX = rightmostX > 0 ? rightmostX + horizontalSpacing : padding;
      console.log(`📍 Appending to existing molecules: Starting at x=${startX}`);
    }
    
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
              x: startX + ((molNum - 1) * (moleculeWidth + horizontalSpacing)),
              y: padding
            },
            connections: [],
            isAICreated: true // Mark as AI-created
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
            
            if (currentChatId) {
              appendMessageToChat(currentChatId, successMessage);
            }
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

  // Fetch saved dataframes when attach button is clicked
  const handleAttachClick = async () => {
    setShowFilePicker(!showFilePicker);
    
    if (!showFilePicker && availableFiles.length === 0) {
      setLoadingFiles(true);
      try {
        let query = '';
        const envStr = localStorage.getItem('env');
        if (envStr) {
          try {
            const env = JSON.parse(envStr);
            query = '?' + new URLSearchParams({
              client_id: env.CLIENT_ID || '',
              app_id: env.APP_ID || '',
              project_id: env.PROJECT_ID || '',
              client_name: env.CLIENT_NAME || '',
              app_name: env.APP_NAME || '',
              project_name: env.PROJECT_NAME || ''
            }).toString();
          } catch (e) {
            console.error('Error parsing env:', e);
          }
        }
        
        const response = await fetch(`${VALIDATE_API}/list_saved_dataframes${query}`);
        const data = await response.json();
        
        // Filter to only show Arrow files
        const arrowFiles = Array.isArray(data.files) 
          ? data.files.filter((f: any) => f.object_name && f.object_name.endsWith('.arrow'))
          : [];
        
        setAvailableFiles(arrowFiles);
      } catch (error) {
        console.error('Error fetching files:', error);
        setAvailableFiles([]);
      } finally {
        setLoadingFiles(false);
      }
    }
  };

  // Attach file to input
  const handleFileSelect = (fileName: string) => {
    const displayName = fileName.split('/').pop() || fileName;
    const currentValue = inputValue;
    const newValue = currentValue ? `${currentValue} @${displayName}` : `@${displayName}`;
    setInputValue(newValue);
    setShowFilePicker(false);
  };

  // Don't unmount when collapsed - keep WebSocket connections and requests alive
  return (
    <div className={isCollapsed ? 'hidden' : ''} style={{ height: '100%' }}>
    <Card className="h-full bg-white backdrop-blur-xl shadow-[0_20px_70px_rgba(0,0,0,0.3)] border-2 border-gray-200 overflow-hidden flex flex-col relative ring-1 ring-gray-100" style={{ width: `${panelWidth}px` }}>
      {/* Resize Handle */}
      <div
        ref={resizeRef}
        onMouseDown={handleMouseDown}
        className={`absolute left-0 top-0 w-1 h-full transition-colors duration-200 z-50 ${
          isPanelFrozen 
            ? 'bg-gray-200 cursor-not-allowed' 
            : 'bg-gray-300 hover:bg-gray-400 cursor-col-resize'
        }`}
        style={{ marginLeft: '-2px' }}
        title={isPanelFrozen ? "Panel is frozen (resize disabled)" : "Drag to resize panel"}
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

      {/* Settings Sidebar */}
      {showSettings && (
        <div className="absolute left-0 top-0 w-80 h-full bg-white backdrop-blur-xl border-r-2 border-gray-200 z-50 flex flex-col shadow-xl">
          <div className="p-4 border-b-2 border-gray-200 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 font-inter" style={{ fontSize: `${baseFontSize}px` }}>Settings</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(false)}
                className="h-6 w-6 p-0 hover:bg-gray-100 text-gray-800 rounded-xl"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <ScrollArea className="flex-1 p-4 bg-gray-50/50">
            {/* Session ID Section */}
            <div className="mb-6 p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm">
              <h4 className="font-semibold text-gray-700 mb-2 font-inter" style={{ fontSize: `${baseFontSize}px` }}>Session Information</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 font-inter" style={{ fontSize: `${smallFontSize}px` }}>Chat ID:</span>
                </div>
                <div className="p-2 bg-gray-50 rounded-lg border border-gray-200 font-mono text-xs text-gray-800 break-all">
                  {currentChatId || 'No active chat'}
                </div>
              </div>
            </div>

            {/* Panel Settings */}
            <div className="space-y-3">
              <h4 className="font-semibold text-gray-700 mb-3 font-inter" style={{ fontSize: `${baseFontSize}px` }}>Panel Settings</h4>
              
              {/* Freeze Panel Toggle */}
              <div className="p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h5 className="font-semibold text-gray-800 font-inter" style={{ fontSize: `${baseFontSize}px` }}>Freeze Panel Size</h5>
                    <p className="text-gray-600 mt-1 font-inter" style={{ fontSize: `${smallFontSize}px` }}>
                      Lock panel width and prevent resizing
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer ml-3">
                    <input
                      type="checkbox"
                      checked={isPanelFrozen}
                      onChange={(e) => setIsPanelFrozen(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#41C185]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#41C185]"></div>
                  </label>
                </div>
              </div>

              {/* WebSocket Status */}
              <div className="p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm">
                <h5 className="font-semibold text-gray-800 mb-2 font-inter" style={{ fontSize: `${baseFontSize}px` }}>Connection Status</h5>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
                  <span className="text-gray-600 font-inter" style={{ fontSize: `${smallFontSize}px` }}>
                    {wsConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              </div>

              {/* Clear Chat History */}
              <div className="p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                <h5 className="font-semibold text-gray-800 mb-2 font-inter" style={{ fontSize: `${baseFontSize}px` }}>Data Management</h5>
                <Button
                  onClick={() => {
                    if (confirm('Are you sure you want to clear all chat history? This cannot be undone.')) {
                      localStorage.removeItem('workflow-ai-chats');
                      localStorage.removeItem('workflow-ai-current-chat-id');
                      localStorage.removeItem('workflow-ai-session-ids');
                      createNewChat();
                      setShowSettings(false);
                    }
                  }}
                  className="w-full bg-red-500 hover:bg-red-600 text-white font-inter"
                  style={{ fontSize: `${smallFontSize}px` }}
                >
                  Clear All Chat History
                </Button>
              </div>

              {/* Panel Width Info */}
              <div className="p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm">
                <h5 className="font-semibold text-gray-800 mb-2 font-inter" style={{ fontSize: `${baseFontSize}px` }}>Panel Width</h5>
                <div className="text-gray-600 font-inter" style={{ fontSize: `${smallFontSize}px` }}>
                  Current: {panelWidth}px
                </div>
                <p className="text-gray-500 mt-1 font-inter text-xs">
                  Drag the left edge to resize
                </p>
              </div>
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
            <h3 className="font-bold text-gray-800 tracking-tight font-inter" style={{ fontSize: `${headerFontSize}px` }}>Workflow AI</h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#50C878] rounded-full animate-pulse" />
              <p className="text-gray-600 font-medium font-inter" style={{ fontSize: `${smallFontSize}px` }}>Active • Workflow Designer</p>
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
              <div className={`flex-1 group ${
                message.sender === 'user' ? 'flex flex-col items-end' : ''
              }`} style={{ maxWidth: `${messageBubbleMaxWidth}px` }}>
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
                    <div 
                      className="leading-relaxed font-medium font-inter whitespace-pre-wrap"
                      style={{ fontSize: `${baseFontSize}px` }}
                      dangerouslySetInnerHTML={{ __html: parseMarkdown(message.content) }}
                    />
                       )}
                    
                    {/* Show molecules without buttons - buttons are now at bottom */}
                    {message.molecules && message.molecules.length > 0 && (
                         <div className={`space-y-3 p-4 bg-white/10 rounded-lg border-2 border-white/30 backdrop-blur-sm ${message.content ? 'mt-4' : ''}`}>
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-white font-inter">
                            💡 Suggested Molecules ({message.molecules.length})
                          </p>
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
                <p className="text-gray-600 mt-2 px-2 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-inter" style={{ fontSize: `${smallFontSize}px` }}>
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

      {/* Workflow Action Buttons - Shown when molecules are suggested */}
      {suggestedMolecules.length > 0 && (
        <div className="border-t-2 border-gray-200 bg-gradient-to-r from-[#FEEB99]/10 to-[#FFBD59]/10 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#FFBD59]" />
              <span className="text-sm font-semibold text-gray-800 font-inter">
                💡 {suggestedMolecules.length} Molecule{suggestedMolecules.length > 1 ? 's' : ''} Ready
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => handleCreateWorkflowMolecules(suggestedMolecules)}
                className="bg-[#FEEB99] hover:bg-[#FFBD59] text-gray-800 text-sm px-4 py-2 h-9 shadow-md font-semibold transition-all duration-200 hover:scale-105"
                size="sm"
              >
                ✨ Create
              </Button>
              {onRenderWorkflow && (
                <Button
                  onClick={() => handleCreateAndRenderWorkflow(suggestedMolecules)}
                  className="bg-[#FEEB99] hover:bg-[#FFBD59] text-gray-800 text-sm px-4 py-2 h-9 shadow-md font-semibold transition-all duration-200 hover:scale-105"
                  size="sm"
                >
                  <Play className="w-4 h-4 mr-1" />
                  Render
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t-2 border-gray-200 bg-gradient-to-b from-white to-gray-50 p-5 backdrop-blur-sm relative">
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
          <div className="relative">
            <Button 
              variant="ghost" 
              size="sm" 
              className={`h-10 w-10 p-0 hover:bg-gray-100 hover:text-gray-800 transition-all duration-200 rounded-xl hover:scale-110 shadow-sm hover:shadow-md ${showFilePicker ? 'bg-gray-100' : ''}`}
              onClick={handleAttachClick}
              title="Attach Saved DataFrames"
            >
              <Paperclip className="w-4 h-4" />
            </Button>
            
            {/* File Picker Dropdown */}
            {showFilePicker && (
              <div className="absolute bottom-full left-0 mb-2 w-96 bg-white rounded-xl shadow-xl border-2 border-gray-200 max-h-96 z-50 animate-fade-in flex flex-col">
                <div className="p-3 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-gray-800 text-sm font-inter flex items-center gap-2">
                      <File className="w-4 h-4" />
                      Saved DataFrames
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowFilePicker(false)}
                      className="h-6 w-6 p-0 hover:bg-gray-100 rounded-lg"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <div className="overflow-auto max-h-80 p-2" style={{ overflowX: 'auto', overflowY: 'auto' }}>
                  {loadingFiles ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                      <div className="w-6 h-6 border-2 border-gray-300 border-t-[#41C185] rounded-full animate-spin mb-2" />
                      <p className="text-xs">Loading files...</p>
                    </div>
                  ) : availableFiles.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <File className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-xs">No saved dataframes found</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {availableFiles.map((file, index) => {
                        const displayName = file.object_name.split('/').pop() || file.object_name;
                        return (
                          <button
                            key={index}
                            onClick={() => handleFileSelect(file.object_name)}
                            className="w-full text-left p-3 rounded-lg hover:bg-gray-50 transition-colors duration-150 group border border-transparent hover:border-[#41C185]/20 min-w-max"
                          >
                            <div className="flex items-center gap-2">
                              <File className="w-4 h-4 text-[#41C185] flex-shrink-0" />
                              <span className="text-sm font-medium text-gray-800 font-inter group-hover:text-[#41C185] whitespace-nowrap">
                                {displayName}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
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
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex items-end gap-3">
          <div className="relative flex-1">
            <Textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Type your message..."
              className="min-h-[48px] max-h-[200px] bg-white backdrop-blur-sm border-2 border-gray-200 hover:border-gray-300 focus:border-[#41C185] focus-visible:ring-2 focus-visible:ring-[#41C185]/20 rounded-2xl px-4 py-3 font-medium transition-all duration-200 shadow-sm placeholder:text-gray-500/60 font-inter resize-none overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400"
              style={{ 
                fontSize: `${baseFontSize}px`,
                scrollbarWidth: 'thin',
                scrollbarColor: '#d1d5db transparent'
              }}
              disabled={isLoading || !isChatReady}
              rows={1}
            />
          </div>
          {isLoading && (
            <Button
              onClick={handleStopRequest}
              className="h-12 w-12 bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30 hover:shadow-xl hover:shadow-red-500/40 transition-all duration-300 hover:scale-110 rounded-2xl animate-fade-in"
              size="icon"
              title="Stop Request"
            >
              <Square className="w-5 h-5 fill-current" />
            </Button>
          )}
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading || !isChatReady}
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
        {!isChatReady && (
          <p className="mt-3 text-xs text-gray-500 font-inter flex items-center gap-1">
            <Clock className="w-3 h-3 text-gray-400" />
            Preparing Workflow AI chat...
          </p>
        )}
      </div>
    </Card>
    
    {/* Overwrite/Append Dialog */}
    <WorkflowOverwriteDialog
      isOpen={showOverwriteDialog}
      onOverwrite={handleDialogOverwrite}
      onAppend={handleDialogAppend}
      onCancel={handleDialogCancel}
    />
    </div>
  );
};

export default WorkflowAIPanel;

