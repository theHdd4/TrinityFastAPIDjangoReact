import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, X, Bot, User, Sparkles, RotateCcw, Clock, Settings, Paperclip, Mic, Plus, Trash2, MessageCircle, Minimize2, Maximize2, Minus, Square, File, Zap } from 'lucide-react';
import { TRINITY_AI_API, VALIDATE_API } from '@/lib/api';
import { useLaboratoryStore } from '../LaboratoryMode/store/laboratoryStore';
import { StreamSequencePreview } from './StreamSequencePreview';
import { StreamAIProgressTracker } from './StreamAIProgressTracker';
import { WorkflowPreview } from './WorkflowPreview';
import { StepExecutionMonitor } from './StepExecutionMonitor';

// FastAPI base URL
const FASTAPI_BASE_URL = import.meta.env.VITE_FASTAPI_BASE_URL || 'http://localhost:8002';

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
if (typeof document !== 'undefined' && !document.querySelector('#stream-ai-animations')) {
  const style = document.createElement('style');
  style.id = 'stream-ai-animations';
  style.textContent = fadeInStyle;
  document.head.appendChild(style);
}

// Simple markdown parser for bold text
const parseMarkdown = (text: string): string => {
  if (!text) return '';
  
  let processedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  
  processedText = processedText.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  processedText = processedText.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
  processedText = processedText.replace(/\n/g, '<br>');
  
  return processedText;
};

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  sequence?: any;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

interface StreamAIPanelProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export const StreamAIPanel: React.FC<StreamAIPanelProps> = ({ isCollapsed, onToggle }) => {
  // Chat management state
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [panelWidth, setPanelWidth] = useState(384);
  const [isPanelFrozen, setIsPanelFrozen] = useState(true);
  const [isResizing, setIsResizing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  
  // Stream AI specific state
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<any>(null);
  
  // Two-Phase Workflow state
  const [workflowPhase, setWorkflowPhase] = useState<'idle' | 'plan_generated' | 'executing' | 'completed'>('idle');
  const [workflowPlan, setWorkflowPlan] = useState<any>(null);
  const [executionState, setExecutionState] = useState<any>(null);
  const [sequenceId, setSequenceId] = useState<string | null>(null);
  
  // File attachment state
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [availableFiles, setAvailableFiles] = useState<Array<{object_name: string; csv_name?: string; arrow_name?: string}>>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Font sizes
  const baseFontSize = 14;
  const smallFontSize = 12;
  const headerFontSize = 18;
  const messageBubbleMaxWidth = panelWidth - 140;

  // Create new chat
  const createNewChat = () => {
    const newChatId = `chat_${Date.now()}`;
    const newChat: Chat = {
      id: newChatId,
      title: 'New Chat',
      messages: [
        {
          id: '1',
          content: "Hello! I'm Stream AI, your intelligent sequential execution assistant. I can generate and execute multi-atom workflows based on your natural language descriptions. How can I help you today?",
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
    const savedChats = localStorage.getItem('stream-ai-chats');
    const savedCurrentChatId = localStorage.getItem('stream-ai-current-chat-id');
    
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

  // Save chat data to localStorage
  useEffect(() => {
    if (chats.length > 0) {
      localStorage.setItem('stream-ai-chats', JSON.stringify(chats));
    }
  }, [chats]);

  useEffect(() => {
    if (currentChatId) {
      localStorage.setItem('stream-ai-current-chat-id', currentChatId);
    }
  }, [currentChatId]);

  // Update messages when current chat changes
  useEffect(() => {
    const currentChat = chats.find(chat => chat.id === currentChatId);
    if (currentChat) {
      setMessages(currentChat.messages);
    }
  }, [currentChatId, chats]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load available files on mount
  useEffect(() => {
    const loadFiles = async () => {
      try {
        console.log('🔄 Stream AI: Loading available files...');
        const currentProjectStr = localStorage.getItem('current-project');
        let query = '';
        
        if (currentProjectStr) {
          try {
            const currentProject = JSON.parse(currentProjectStr);
            const client = currentProject.client_name || '';
            const app = currentProject.app_name || '';
            const project = currentProject.project_name || '';
            console.log('📁 Project context:', { client, app, project });
            query = `?client_name=${encodeURIComponent(client)}&app_name=${encodeURIComponent(app)}&project_name=${encodeURIComponent(project)}`;
          } catch (e) {
            console.error('Error parsing project:', e);
          }
        } else {
          console.warn('⚠️ No current-project in localStorage');
        }
        
        console.log(`📡 Fetching files from: ${VALIDATE_API}/list_saved_dataframes${query}`);
        const response = await fetch(`${VALIDATE_API}/list_saved_dataframes${query}`);
        
        if (!response.ok) {
          console.error(`❌ API error: ${response.status} ${response.statusText}`);
          setAvailableFiles([]);
          return;
        }
        
        const data = await response.json();
        console.log('📦 API response:', data);
        
        // Filter to only show Arrow files
        const arrowFiles = Array.isArray(data.files) 
          ? data.files.filter((f: any) => f.object_name && f.object_name.endsWith('.arrow'))
          : [];
        
        setAvailableFiles(arrowFiles);
        console.log(`✅ Stream AI: Loaded ${arrowFiles.length} available files`);
        if (arrowFiles.length > 0) {
          console.log('📄 Files:', arrowFiles.slice(0, 5).map(f => f.object_name.split('/').pop()));
        }
      } catch (error) {
        console.error('❌ Error loading files:', error);
        setAvailableFiles([]);
      }
    };

    loadFiles();
  }, []);

  // Handle file attachment
  const handleAttachClick = async () => {
    if (showFilePicker) {
      setShowFilePicker(false);
      return;
    }
    
    setShowFilePicker(true);
    setLoadingFiles(true);
    
    try {
      // Get current project context from localStorage
      const currentProjectStr = localStorage.getItem('current-project');
      let query = '';
      
      if (currentProjectStr) {
        try {
          const currentProject = JSON.parse(currentProjectStr);
          const client = currentProject.client_name || '';
          const app = currentProject.app_name || '';
          const project = currentProject.project_name || '';
          query = `?client_name=${encodeURIComponent(client)}&app_name=${encodeURIComponent(app)}&project_name=${encodeURIComponent(project)}`;
        } catch (e) {
          console.error('Error parsing project:', e);
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
  };

  const handleFileSelect = (filename: string) => {
    const displayName = filename.split('/').pop() || filename;
    setInputValue(prev => prev ? `${prev} @${displayName}` : `@${displayName}`);
    setShowFilePicker(false);
  };

  // Send message to Stream AI - Two-Phase Workflow
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: inputValue,
      sender: 'user',
      timestamp: new Date()
    };

    // Update current chat with new message
    setChats(prevChats => 
      prevChats.map(chat => 
        chat.id === currentChatId
          ? { ...chat, messages: [...chat.messages, userMessage] }
          : chat
      )
    );

    setInputValue('');
    setIsLoading(true);

    try {
      // Get project context
      const currentProjectStr = localStorage.getItem('current-project');
      let projectContext = {};
      if (currentProjectStr) {
        try {
          const currentProject = JSON.parse(currentProjectStr);
          projectContext = {
            client_name: currentProject.client_name || 'default',
            app_name: currentProject.app_name || 'default',
            project_name: currentProject.project_name || 'default'
          };
        } catch (e) {
          console.error('Error parsing project:', e);
        }
      }

      // Phase 1: Generate Plan
      const planResponse = await fetch(`${FASTAPI_BASE_URL}/streamai/generate-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage.content,
          available_files: availableFiles.map(f => f.object_name),
          project_context: projectContext,
          user_id: 'current_user'
        })
      });

      const planData = await planResponse.json();

      if (planData.success) {
        // Store plan and show preview
        setWorkflowPlan(planData.plan);
        setSequenceId(planData.sequence_id);
        setWorkflowPhase('plan_generated');

        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          content: `I've analyzed your request and generated a ${planData.plan.total_steps}-step workflow. Please review the plan below and approve to start execution.`,
          sender: 'ai',
          timestamp: new Date()
        };

        // Update current chat with AI response
        setChats(prevChats => 
          prevChats.map(chat => 
            chat.id === currentChatId
              ? { ...chat, messages: [...chat.messages, assistantMessage] }
              : chat
          )
        );
      } else {
        throw new Error(planData.message || 'Failed to generate plan');
      }

    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        content: 'Sorry, I encountered an error generating the workflow plan. Please try again.',
        sender: 'ai',
        timestamp: new Date()
      };
      setChats(prevChats => 
        prevChats.map(chat => 
          chat.id === currentChatId
            ? { ...chat, messages: [...chat.messages, errorMessage] }
            : chat
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Approve workflow plan and start execution (Phase 2)
  const handleApproveWorkflow = async () => {
    if (!sequenceId) return;

    setIsLoading(true);
    setWorkflowPhase('executing');

    try {
      // Get project context
      const currentProjectStr = localStorage.getItem('current-project');
      let projectContext = {};
      if (currentProjectStr) {
        try {
          const currentProject = JSON.parse(currentProjectStr);
          projectContext = {
            client_name: currentProject.client_name || 'default',
            app_name: currentProject.app_name || 'default',
            project_name: currentProject.project_name || 'default'
          };
        } catch (e) {
          console.error('Error parsing project:', e);
        }
      }

      // Start execution
      const response = await fetch(`${FASTAPI_BASE_URL}/streamai/start-execution`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sequence_id: sequenceId,
          project_context: projectContext,
          user_id: 'current_user'
        })
      });

      const data = await response.json();

      if (data.success) {
        console.log('✅ Start execution response:', data);
        
        // Fetch full execution status
        const statusResponse = await fetch(`${FASTAPI_BASE_URL}/streamai/execution-status?sequence_id=${sequenceId}`);
        const statusData = await statusResponse.json();
        
        console.log('📊 Execution status:', statusData);
        console.log('📦 Completed steps:', statusData.completed_steps);
        
        setExecutionState(statusData);
        
        // Add card to Laboratory Mode store
        if (statusData.completed_steps && statusData.completed_steps.length > 0) {
          const lastStep = statusData.completed_steps[statusData.completed_steps.length - 1];
          console.log('🎯 Last step:', lastStep);
          console.log('🎴 Card ID:', lastStep.card_id);
          console.log('⚛️ Atom ID:', lastStep.atom_id);
          
          if (lastStep.card_id) {
            await addCardToLaboratory(lastStep.card_id, lastStep.atom_id, lastStep.execution_result);
          }
        } else {
          console.warn('⚠️ No completed steps found in execution status');
        }
        
        // Add a message about viewing results in Laboratory Mode
        const infoMessage: Message = {
          id: `info-${Date.now()}`,
          content: `✅ Step 1 executed successfully! A Laboratory card has been created. Switch to **Laboratory Mode** to see the results and interact with the card.`,
          sender: 'ai',
          timestamp: new Date()
        };

        setChats(prevChats => 
          prevChats.map(chat => 
            chat.id === currentChatId
              ? { ...chat, messages: [...chat.messages, infoMessage] }
              : chat
          )
        );
      } else {
        throw new Error(data.message || 'Failed to start execution');
      }
    } catch (error) {
      console.error('Error starting execution:', error);
      alert('Failed to start execution. Please try again.');
      setWorkflowPhase('plan_generated');
    } finally {
      setIsLoading(false);
    }
  };

  // Approve current step and continue to next
  const handleApproveStep = async () => {
    if (!sequenceId) return;

    setIsLoading(true);

    try {
      const response = await fetch(`${FASTAPI_BASE_URL}/streamai/approve-step`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sequence_id: sequenceId
        })
      });

      const data = await response.json();

      if (data.success) {
        // Fetch updated execution status
        const statusResponse = await fetch(`${FASTAPI_BASE_URL}/streamai/execution-status?sequence_id=${sequenceId}`);
        const statusData = await statusResponse.json();
        
        setExecutionState(statusData);
        
        // Add the newly created card to Laboratory store
        if (statusData.completed_steps && statusData.completed_steps.length > 0) {
          const lastStep = statusData.completed_steps[statusData.completed_steps.length - 1];
          if (lastStep.card_id) {
            await addCardToLaboratory(lastStep.card_id, lastStep.atom_id, lastStep.execution_result);
          }
        }

        // Check if workflow is completed
        if (statusData.status === 'completed') {
          setWorkflowPhase('completed');
          
          // Add completion message
          const completionMessage: Message = {
            id: `completion-${Date.now()}`,
            content: `🎉 Workflow completed successfully! All ${statusData.total_steps} steps have been executed. Check Laboratory Mode to view all the cards.`,
            sender: 'ai',
            timestamp: new Date()
          };

          setChats(prevChats => 
            prevChats.map(chat => 
              chat.id === currentChatId
                ? { ...chat, messages: [...chat.messages, completionMessage] }
                : chat
            )
          );
        }
      } else {
        throw new Error(data.message || 'Failed to approve step');
      }
    } catch (error) {
      console.error('Error approving step:', error);
      alert('Failed to approve step. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Cancel workflow execution
  const handleCancelWorkflow = async () => {
    if (!sequenceId) return;

    try {
      await fetch(`${FASTAPI_BASE_URL}/streamai/cancel-execution?sequence_id=${sequenceId}`, {
        method: 'POST'
      });

      setWorkflowPhase('idle');
      setWorkflowPlan(null);
      setExecutionState(null);
      setSequenceId(null);
    } catch (error) {
      console.error('Error cancelling workflow:', error);
    }
  };

  // Execute sequence
  const handleExecuteSequence = async (sequence: any) => {
    setIsExecuting(true);
    setExecutionProgress({
      type: 'sequence_start',
      total_atoms: sequence.total_atoms
    });

    try {
      const response = await fetch(`${FASTAPI_BASE_URL}/streamai/execute-sequence`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sequence: sequence,
          session_id: currentSession
        })
      });

      const data = await response.json();

      if (data.success) {
        const resultMessage: Message = {
          id: `result-${Date.now()}`,
          content: `✅ Sequence executed successfully! Completed ${data.execution_result.completed_atoms}/${data.execution_result.total_atoms} atoms.`,
          sender: 'ai',
          timestamp: new Date()
        };
        
        setChats(prevChats => 
          prevChats.map(chat => 
            chat.id === currentChatId
              ? { ...chat, messages: [...chat.messages, resultMessage] }
              : chat
          )
        );
        
        setExecutionProgress({
          type: 'sequence_complete',
          completed_atoms: data.execution_result.completed_atoms,
          failed_atoms: data.execution_result.failed_atoms,
          total_atoms: data.execution_result.total_atoms
        });
      } else {
        throw new Error(data.error || 'Execution failed');
      }

    } catch (error) {
      console.error('Error executing sequence:', error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        content: `❌ Error executing sequence: ${error instanceof Error ? error.message : 'Unknown error'}`,
        sender: 'ai',
        timestamp: new Date()
      };
      setChats(prevChats => 
        prevChats.map(chat => 
          chat.id === currentChatId
            ? { ...chat, messages: [...chat.messages, errorMessage] }
            : chat
        )
      );
    } finally {
      setIsExecuting(false);
      setTimeout(() => {
        setExecutionProgress(null);
      }, 3000);
    }
  };

  // Add card to Laboratory Mode store (exactly like SuperAgent does)
  const addCardToLaboratory = async (cardId: string, atomId: string, executionResult: any) => {
    try {
      console.log('🎴 ===== ADDING CARD TO LABORATORY =====');
      console.log('Card ID:', cardId);
      console.log('Atom ID:', atomId);
      console.log('Execution Result:', executionResult);
      
      // Get Laboratory store
      const { setCards, cards, updateCard } = useLaboratoryStore.getState();
      
      // Load atom info from AtomList data
      const { atoms: allAtoms } = await import('@/components/AtomList/data');
      const atomInfo = allAtoms.find((a: any) => a.id === atomId);
      
      console.log('🔍 Atom info:', atomInfo);
      
      // Generate atom instance ID
      const atomInstanceId = `${atomId}-${Date.now()}`;
      
      // Create atom with settings (exactly like SuperAgent)
      const newAtom = {
        id: atomInstanceId,
        atomId: atomId,
        title: atomInfo?.title || atomId,
        category: atomInfo?.category || getCategoryForAtom(atomId),
        color: atomInfo?.color || getColorForAtom(atomId),
        source: 'ai' as const,
        llm: 'stream_ai',
        settings: executionResult  // merge_json, groupby_json, etc.
      };
      
      console.log('✅ Created atom:', newAtom);
      
      // Create or update card
      const existingCard = cards.find(c => c.id === cardId);
      
      if (existingCard) {
        // Update existing card
        console.log('📝 Updating existing card');
        updateCard(cardId, {
          atoms: [newAtom]
        });
      } else {
        // Create new card
        console.log('🆕 Creating new card');
        const newCard = {
          id: cardId,
          atoms: [newAtom],
          isExhibited: false
        };
        
        const updatedCards = [...cards, newCard];
        setCards(updatedCards);
        
        // Save to localStorage (like SuperAgent)
        const STORAGE_KEY = 'laboratory-layout';
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCards));
        console.log('💾 Saved to localStorage');
        
        // Force canvas refresh (like SuperAgent)
        useLaboratoryStore.getState().setCards([...updatedCards]);
        console.log('🔄 Triggered canvas refresh');
      }
      
      console.log('✅ Card added to Laboratory store:', cardId);
      console.log('📊 Total cards now:', useLaboratoryStore.getState().cards.length);
    } catch (error) {
      console.error('❌ Failed to add card to Laboratory:', error);
    }
  };
  
  // Helper functions for atom categorization
  const getCategoryForAtom = (atomId: string): string => {
    const categoryMap: Record<string, string> = {
      'merge': 'Data Processing',
      'concat': 'Data Processing',
      'groupby-wtg-avg': 'Data Processing',
      'dataframe-operations': 'Data Processing',
      'chart-maker': 'Visualization',
      'correlation': 'Analytics',
      'explore': 'Analytics',
      'feature-overview': 'Data Processing',
      'create-column': 'Data Processing'
    };
    return categoryMap[atomId] || 'Data Processing';
  };
  
  const getColorForAtom = (atomId: string): string => {
    const colorMap: Record<string, string> = {
      'merge': '#41C185',
      'concat': '#41C185',
      'groupby-wtg-avg': '#41C185',
      'dataframe-operations': '#41C185',
      'chart-maker': '#E94B8B',
      'correlation': '#9B59D0',
      'explore': '#9B59D0',
      'feature-overview': '#41C185',
      'create-column': '#41C185'
    };
    return colorMap[atomId] || '#41C185';
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startNewChat = () => {
    createNewChat();
    setShowChatHistory(false);
  };

  const switchChat = (chatId: string) => {
    setCurrentChatId(chatId);
    setShowChatHistory(false);
  };

  const deleteCurrentChat = () => {
    if (chats.length === 1) {
      createNewChat();
    } else {
      setChats(prev => prev.filter(chat => chat.id !== currentChatId));
      if (chats.length > 1) {
        const remainingChats = chats.filter(chat => chat.id !== currentChatId);
        setCurrentChatId(remainingChats[0].id);
      }
    }
  };

  if (isCollapsed) {
    return null;
  }

  return (
    <div 
      className="h-full bg-white border-l-2 border-gray-200 flex flex-col shadow-2xl relative z-30 transition-all duration-300"
      style={{ width: `${panelWidth}px` }}
    >
      {/* Chat History Sidebar */}
      {showChatHistory && (
        <div className="absolute left-0 top-0 bottom-0 w-full bg-white shadow-2xl z-50 border-r-2 border-gray-200 flex flex-col">
          <div className="p-5 border-b-2 border-gray-200 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
            <h4 className="font-bold text-gray-800 font-inter" style={{ fontSize: `${headerFontSize}px` }}>Chat History</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowChatHistory(false)}
              className="h-9 w-9 p-0 hover:bg-gray-100 rounded-xl"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2">
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => switchChat(chat.id)}
                  className={`w-full text-left p-4 rounded-xl transition-all duration-200 border-2 ${
                    chat.id === currentChatId
                      ? 'bg-[#41C185] text-white border-[#41C185] shadow-lg'
                      : 'bg-white hover:bg-gray-50 border-gray-200 hover:border-[#41C185]/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <MessageCircle className="w-4 h-4" />
                    <span className="font-semibold font-inter text-sm">{chat.title}</span>
                  </div>
                  <p className={`text-xs font-inter ${
                    chat.id === currentChatId ? 'text-white/80' : 'text-gray-500'
                  }`}>
                    {chat.messages.length} messages • {chat.createdAt.toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute left-0 top-0 bottom-0 w-full bg-white shadow-2xl z-50 border-r-2 border-gray-200 flex flex-col">
          <div className="p-5 border-b-2 border-gray-200 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
            <h4 className="font-bold text-gray-800 font-inter" style={{ fontSize: `${headerFontSize}px` }}>Settings</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(false)}
              className="h-9 w-9 p-0 hover:bg-gray-100 rounded-xl"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-4">
              <div className="p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm">
                <h5 className="font-semibold text-gray-800 mb-2 font-inter" style={{ fontSize: `${baseFontSize}px` }}>Panel Settings</h5>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 font-inter">Panel Width</span>
                    <span className="text-sm font-semibold text-gray-800 font-inter">{panelWidth}px</span>
                  </div>
                  <p className="text-xs text-gray-500 font-inter">Drag the left edge to resize</p>
                </div>
              </div>

              <div className="p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                <h5 className="font-semibold text-gray-800 mb-2 font-inter" style={{ fontSize: `${baseFontSize}px` }}>Data Management</h5>
                <Button
                  onClick={() => {
                    if (confirm('Are you sure you want to clear all chat history? This cannot be undone.')) {
                      localStorage.removeItem('stream-ai-chats');
                      localStorage.removeItem('stream-ai-current-chat-id');
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
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Header */}
      <div className={`flex items-center justify-between p-5 border-b-2 border-gray-200 cursor-grab active:cursor-grabbing bg-gradient-to-r from-gray-50 to-white backdrop-blur-sm relative overflow-hidden group ${showChatHistory || showSettings ? 'z-40' : 'z-10'}`}>
        <div className="absolute inset-0 bg-gradient-to-r from-gray-50/0 via-gray-100/50 to-gray-50/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
        
        <div className="flex items-center space-x-4 relative z-10">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-gray-200/30 border-2 border-gray-200/20 transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-gray-200/40">
              <Zap className="w-6 h-6 text-[#41C185] animate-slow-pulse" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[#41C185] rounded-full border-2 border-white shadow-lg">
              <div className="absolute inset-0 bg-[#41C185] rounded-full animate-ping opacity-75" />
            </div>
          </div>
          <div>
            <h3 className="font-bold text-gray-800 tracking-tight font-inter" style={{ fontSize: `${headerFontSize}px` }}>Stream AI</h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#41C185] rounded-full animate-pulse" />
              <p className="text-gray-600 font-medium font-inter" style={{ fontSize: `${smallFontSize}px` }}>Active • Sequential Execution</p>
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
              setIsLoading(false);
              onToggle();
            }}
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
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg transition-all duration-300 hover:scale-110 ${
                message.sender === 'ai' 
                  ? 'bg-[#41C185] border-2 border-[#41C185]/30 shadow-[#41C185]/20' 
                  : 'bg-[#458EE2] border-2 border-[#458EE2]/30 shadow-[#458EE2]/20'
              }`}>
                {message.sender === 'ai' ? (
                  <Zap className="w-5 h-5 text-white" />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
              </div>

              <div className={`flex-1 group ${
                message.sender === 'user' ? 'flex flex-col items-end' : ''
              }`} style={{ maxWidth: `${messageBubbleMaxWidth}px` }}>
                <div className={`rounded-3xl px-5 py-3.5 shadow-lg border-2 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] ${
                  message.sender === 'ai'
                    ? 'bg-[#41C185] text-white border-[#41C185]/30 rounded-tl-md backdrop-blur-sm'
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
                  
                  {message.sequence && (
                    <div className="mt-3 w-full">
                      <StreamSequencePreview
                        sequence={message.sequence}
                        onExecute={() => handleExecuteSequence(message.sequence)}
                        isExecuting={isExecuting}
                      />
                    </div>
                  )}
                  
                  <p className="text-gray-600 mt-2 px-2 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-inter" style={{ fontSize: `${smallFontSize}px` }}>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}

          {/* Typing Indicator */}
          {isLoading && (
            <div className="flex items-start gap-3 animate-fade-in">
              <div className="w-10 h-10 rounded-2xl bg-[#41C185] border-2 border-[#41C185]/30 flex items-center justify-center shadow-lg shadow-[#41C185]/20">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div className="bg-[#41C185] text-white rounded-3xl rounded-tl-md px-5 py-3.5 shadow-lg border-2 border-[#41C185]/30 backdrop-blur-sm">
                <div className="flex space-x-1.5">
                  <div className="w-2.5 h-2.5 bg-white/70 rounded-full animate-bounce shadow-sm" />
                  <div className="w-2.5 h-2.5 bg-white/70 rounded-full animate-bounce shadow-sm" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2.5 h-2.5 bg-white/70 rounded-full animate-bounce shadow-sm" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          )}
          
          {/* Execution Progress */}
          {executionProgress && (
            <div className="animate-fade-in p-4 bg-gradient-to-r from-[#41C185]/10 to-[#458EE2]/10 rounded-2xl border-2 border-[#41C185]/20">
              <StreamAIProgressTracker progress={executionProgress} />
            </div>
          )}
          
          {/* Two-Phase Workflow Components */}
          {workflowPhase === 'plan_generated' && workflowPlan && (
            <div className="animate-fade-in">
              <WorkflowPreview
                plan={workflowPlan}
                onApprove={handleApproveWorkflow}
                onCancel={handleCancelWorkflow}
              />
            </div>
          )}
          
          {workflowPhase === 'executing' && executionState && (
            <div className="animate-fade-in">
              <StepExecutionMonitor
                execution={executionState}
                onApprove={handleApproveStep}
                onCancel={handleCancelWorkflow}
              />
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

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
                <div className="overflow-auto max-h-80 p-2">
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
              placeholder="Describe your data analysis task..."
              className="min-h-[48px] max-h-[200px] bg-white backdrop-blur-sm border-2 border-gray-200 hover:border-gray-300 focus:border-[#41C185] focus-visible:ring-2 focus-visible:ring-[#41C185]/20 rounded-2xl px-4 py-3 font-medium transition-all duration-200 shadow-sm placeholder:text-gray-500/60 font-inter resize-none overflow-y-auto"
              style={{ fontSize: `${baseFontSize}px` }}
              disabled={isLoading || isExecuting}
              rows={1}
            />
          </div>
          {isLoading ? (
            <Button
              onClick={() => setIsLoading(false)}
              className="h-12 w-12 bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30 hover:shadow-xl hover:shadow-red-500/40 transition-all duration-300 hover:scale-110 rounded-2xl animate-fade-in"
              size="icon"
              title="Stop Request"
            >
              <Square className="w-5 h-5 fill-current" />
            </Button>
          ) : (
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isExecuting}
              className="h-12 w-12 bg-[#41C185] hover:bg-[#3AB077] text-white shadow-lg shadow-[#41C185]/30 hover:shadow-xl hover:shadow-[#41C185]/40 transition-all duration-300 hover:scale-110 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              size="icon"
              title="Send Message"
            >
              <Send className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StreamAIPanel;
