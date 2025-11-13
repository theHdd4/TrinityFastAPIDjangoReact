/// <reference types="vite/client" />
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, X, User, Sparkles, Bot, Plus, Trash2, Settings, Paperclip, Mic, Minus, Square, File, RotateCcw, Clock, MessageCircle } from 'lucide-react';
import { VALIDATE_API } from '@/lib/api';
import { useLaboratoryStore } from '../LaboratoryMode/store/laboratoryStore';
import { getAtomHandler, hasAtomHandler } from '../TrinityAI/handlers';
import StreamWorkflowPreview from './StreamWorkflowPreview';
import StreamStepMonitor from './StreamStepMonitor';
import StreamStepApproval from './StreamStepApproval';
import { autoSaveStepResult } from '../TrinityAI/handlers/utils';
import { listMemoryChats, saveMemoryChat, deleteMemoryChat } from '@/lib/trinityMemory';
import type { MemoryChatResponse } from '@/lib/trinityMemory';
import { AgentModeProvider, useAgentMode } from './context/AgentModeContext';

const BRAND_GREEN = '#50C878';
const BRAND_PURPLE = '#7C3AED';

// FastAPI base URL - use same logic as api.ts for port detection
const isDevStack = typeof window !== 'undefined' && window.location.port === '8081';
const aiPort = import.meta.env.VITE_AI_PORT || (isDevStack ? '8005' : '8002');
const hostIp = import.meta.env.VITE_HOST_IP || 'localhost';
const FASTAPI_BASE_URL = import.meta.env.VITE_FASTAPI_BASE_URL || `http://${hostIp}:${aiPort}`;
const MEMORY_API_BASE = `${(FASTAPI_BASE_URL || '').replace(/\/$/, '')}/trinityai`;

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

// Simple markdown parser
const parseMarkdown = (text: string): string => {
  if (!text) return '';
  let processedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
  return processedText;
};

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  type?: 'text' | 'workflow_preview' | 'workflow_monitor' | 'step_approval';
  data?: any; // For storing workflow/step data
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  sessionId?: string; // Backend session ID for this chat
}

interface TrinityAIBackgroundStatus {
  isProcessing: boolean;
  isCollapsed: boolean;
  hasActiveWorkflow: boolean;
}

interface TrinityAIPanelProps {
  isCollapsed: boolean;
  onToggle: () => void;
  onBackgroundStatusChange?: (status: TrinityAIBackgroundStatus) => void;
}

const TrinityAIPanelInner: React.FC<TrinityAIPanelProps> = ({ isCollapsed, onToggle, onBackgroundStatusChange }) => {
  // Chat management
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [panelWidth, setPanelWidth] = useState(384); // Default 384px (w-96)
  const [isPanelFrozen, setIsPanelFrozen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [baseFontSize] = useState(14);
  const [smallFontSize] = useState(12);
  const isCompact = panelWidth <= 420;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const backgroundStatusRef = useRef<TrinityAIBackgroundStatus | null>(null);
  
  // WebSocket connection
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [availableFiles, setAvailableFiles] = useState<any[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [showWorkflowPreview, setShowWorkflowPreview] = useState(false);
  const [showStepApproval, setShowStepApproval] = useState(false);
  const [workflowPlan, setWorkflowPlan] = useState<any>(null);
  const [executionSteps, setExecutionSteps] = useState<any[]>([]);
  
  // Workflow state (for current active workflow only)
  const [currentWorkflowMessageId, setCurrentWorkflowMessageId] = useState<string | null>(null);
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [completedStepNumber, setCompletedStepNumber] = useState(0);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const autoRunRef = useRef(false);
  const memoryPersistSkipRef = useRef(true);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [isMemoryLoading, setIsMemoryLoading] = useState(true);
  const { isAgentMode, setAgentMode } = useAgentMode();
  const agentModeTrackerRef = useRef<{ workflowSequences: Set<string>; stepMessageIds: Set<string> }>({
    workflowSequences: new Set<string>(),
    stepMessageIds: new Set<string>()
  });
  const agentModeEnabledRef = useRef(isAgentMode);
  
  // Laboratory store
  const { setCards, updateCard } = useLaboratoryStore();

  const safeSetLocalStorage = useCallback((key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn(`⚠️ LocalStorage setItem failed for key "${key}"`, error);
    }
  }, []);

  const startAutoRun = useCallback(() => {
    if (!autoRunRef.current) {
      console.log('⏩ [Auto-run] Activating auto-run mode');
      autoRunRef.current = true;
      setIsAutoRunning(true);
    }
  }, []);

  const stopAutoRun = useCallback(() => {
    if (autoRunRef.current || isAutoRunning) {
      console.log('⏹️ [Auto-run] Stopping auto-run mode');
      autoRunRef.current = false;
      setIsAutoRunning(false);
    }
  }, [isAutoRunning]);

  const queueAutoApprove = useCallback((
    stepNumber: number,
    sequenceId?: string,
    attempt: number = 1
  ) => {
    if (!autoRunRef.current) {
      return;
    }

    const socket = wsRef.current;

    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        console.log(`⏩ [Auto-run] Approving step ${stepNumber} (sequence ${sequenceId || 'n/a'}, attempt ${attempt})`);
        socket.send(JSON.stringify({
          type: 'approve_step',
          step_number: stepNumber
        }));
        console.log(`✅ [Auto-run] Sent approve_step for step ${stepNumber}`);

        const autoApproveMsg: Message = {
          id: `auto-approve-${stepNumber}-${Date.now()}`,
          content: `⏩ Auto-approved step ${stepNumber}. Continuing workflow...`,
          sender: 'ai',
          timestamp: new Date()
        };

        setMessages(prev => [...prev, autoApproveMsg]);
        setIsLoading(true);
      } catch (err) {
        console.error(`❌ [Auto-run] Failed to approve step ${stepNumber}:`, err);
        if (attempt < 3) {
          window.setTimeout(() => queueAutoApprove(stepNumber, sequenceId, attempt + 1), 200);
        } else {
          stopAutoRun();
        }
      }
    } else {
      if (attempt < 3) {
        console.warn(`⚠️ [Auto-run] Socket not ready for step ${stepNumber}. Retrying... (attempt ${attempt})`);
        window.setTimeout(() => queueAutoApprove(stepNumber, sequenceId, attempt + 1), 200);
      } else {
        console.warn(`⚠️ [Auto-run] Socket unavailable after ${attempt} attempts. Stopping auto-run.`);
        stopAutoRun();
      }
    }
  }, [setMessages, stopAutoRun]);

  useEffect(() => {
    agentModeEnabledRef.current = isAgentMode;
    if (isAgentMode) {
      autoRunRef.current = true;
    } else {
      agentModeTrackerRef.current.workflowSequences.clear();
      agentModeTrackerRef.current.stepMessageIds.clear();
      stopAutoRun();
    }
  }, [isAgentMode]);

  useEffect(() => {
    if (!isAgentMode) {
      return;
    }

    const connection = wsConnection;
    if (!connection || connection.readyState !== WebSocket.OPEN) {
      return;
    }

    const tracker = agentModeTrackerRef.current;

    const pendingPreviews = messages.filter((msg) => {
      if (msg.type !== 'workflow_preview') {
        return false;
      }
      const sequenceKey = msg.data?.sequence_id ?? msg.id;
      return !tracker.workflowSequences.has(sequenceKey);
    });

    if (pendingPreviews.length > 0) {
      pendingPreviews.forEach((msg) => {
        const sequenceId = msg.data?.sequence_id ?? msg.id;
        tracker.workflowSequences.add(sequenceId);
        if (!autoRunRef.current) {
          autoRunRef.current = true;
        }
        if (!isAutoRunning) {
          setIsAutoRunning(true);
        }
        setIsLoading(true);
        connection.send(
          JSON.stringify({
            type: 'approve_plan'
          })
        );
      });
    }

    const pendingSteps = messages.filter(
      (msg) =>
        msg.type === 'step_approval' &&
        !tracker.stepMessageIds.has(msg.id) &&
        typeof msg.data?.stepNumber === 'number'
    );

    pendingSteps.forEach((msg) => {
      tracker.stepMessageIds.add(msg.id);
      if (!autoRunRef.current) {
        autoRunRef.current = true;
      }
      if (!isAutoRunning) {
        setIsAutoRunning(true);
      }
      if (connection.readyState === WebSocket.OPEN) {
        setIsLoading(true);
        connection.send(
          JSON.stringify({
            type: 'approve_step',
            step_number: msg.data?.stepNumber
          })
        );
      }
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    });
  }, [isAgentMode, isAutoRunning, messages, wsConnection]);
  
  const toSerializableMessage = useCallback((msg: Message) => ({
    ...msg,
    timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp,
  }), []);

  const createNewChat = useCallback(async () => {
    const newChatId = `stream_chat_${Date.now()}`;
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const createdAt = new Date();

    const initialMessage: Message = {
      id: `welcome-${Date.now()}`,
      content: "Hello! I'm Trinity AI. Describe your data analysis task and I'll execute it step-by-step with intelligent workflow generation.",
      sender: 'ai',
      timestamp: createdAt,
    };

    const newChat: Chat = {
      id: newChatId,
      title: 'New Trinity AI Chat',
      messages: [initialMessage],
      createdAt,
      sessionId: newSessionId,
    };

    memoryPersistSkipRef.current = true;
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newChatId);
    setMessages([initialMessage]);
    setCurrentSessionId(newSessionId);

    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.close();
      setWsConnection(null);
    }
    setCurrentWorkflowMessageId(null);

    try {
      const result = await saveMemoryChat(MEMORY_API_BASE, newChatId, {
        messages: newChat.messages.map(toSerializableMessage),
        metadata: {
          title: newChat.title,
          createdAt: createdAt.toISOString(),
          sessionId: newSessionId,
        },
        append: false,
      });
      memoryPersistSkipRef.current = true;
      if (result === null) {
        setMemoryError('Memory service unavailable - chat not persisted.');
      } else {
        setMemoryError(null);
      }
    } catch (error) {
      console.error('Failed to persist new chat:', error);
      setMemoryError('Unable to save chat history to server.');
    }
  }, [MEMORY_API_BASE, toSerializableMessage, wsConnection]);

  const mapRecordToChat = useCallback((record: MemoryChatResponse): Chat => {
    const metadata = record.metadata || {};
    const createdAt = metadata.createdAt ? new Date(metadata.createdAt) : new Date(record.updatedAt);
    const sessionId =
      metadata.sessionId ||
      `session_${createdAt.getTime()}_${Math.random().toString(36).substr(2, 9)}`;

    const messages = (record.messages || []).map((msg, index) => ({
      ...msg,
      id: msg.id || `mem-${record.chatId}-${index}`,
      timestamp:
        msg.timestamp instanceof Date
          ? msg.timestamp
          : msg.timestamp
          ? new Date(msg.timestamp as string)
          : new Date(createdAt.getTime() + index),
    })) as Message[];

    return {
      id: record.chatId,
      title: (metadata.title as string) || 'Trinity AI Chat',
      messages,
      createdAt,
      sessionId,
    };
  }, []);

  const persistChatToMemory = useCallback(async (chat: Chat) => {
    try {
      const result = await saveMemoryChat(MEMORY_API_BASE, chat.id, {
        messages: chat.messages.map(toSerializableMessage),
        metadata: {
          title: chat.title,
          createdAt: chat.createdAt.toISOString(),
          sessionId: chat.sessionId,
        },
        append: false,
      });
      if (result === null) {
        setMemoryError('Memory service unavailable - chat not persisted.');
      } else {
        setMemoryError(null);
      }
    } catch (error) {
      console.error('Failed to sync chat history:', error);
      setMemoryError('Unable to sync chat history to server.');
    }
  }, [MEMORY_API_BASE, toSerializableMessage]);
  
  useEffect(() => {
    // Set initial welcome message immediately so UI is never blank
    const initialMessage: Message = {
      id: '1',
      content: "Hello! I'm Trinity AI. Describe your data analysis task and I'll execute it step-by-step with intelligent workflow generation.",
      sender: 'ai',
      timestamp: new Date()
    };
    
    // Only set if messages are empty (first load)
    setMessages(prev => {
      if (prev.length === 0) {
        return [initialMessage];
      }
      return prev;
    });

    const loadChats = async () => {
      setIsMemoryLoading(true);
      try {
        const records: MemoryChatResponse[] = await listMemoryChats(MEMORY_API_BASE);

        if (records.length > 0) {
          const mappedChats: Chat[] = records.map(record => mapRecordToChat(record));
          memoryPersistSkipRef.current = true;
          setChats(mappedChats);

          const activeChat = mappedChats[0];
          setCurrentChatId(activeChat.id);
          // Only update messages if the loaded chat has messages
          if (activeChat.messages && activeChat.messages.length > 0) {
            setMessages(activeChat.messages);
          }
          setCurrentSessionId(activeChat.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
          memoryPersistSkipRef.current = true;
        } else {
          // Create new chat but don't wait - messages already set above
          createNewChat().catch(err => {
            console.error('Failed to create new chat:', err);
            // Messages already set, so UI won't be blank
          });
        }
        setMemoryError(null);
      } catch (error) {
        console.error('Failed to load remote chat history:', error);
        setMemoryError('Unable to load saved chat history. Starting a new chat.');
        // Don't await - messages already set above
        createNewChat().catch(err => {
          console.error('Failed to create new chat after error:', err);
          // Messages already set, so UI won't be blank
        });
      } finally {
        setIsInitialized(true);
        setIsMemoryLoading(false);
      }
    };

    loadChats();
  }, [MEMORY_API_BASE, createNewChat, mapRecordToChat]);
  
  // Save messages to current chat (UI state only - memory sync happens separately)
  useEffect(() => {
    if (currentChatId && messages.length > 0) {
      setChats(prev => prev.map(chat => 
        chat.id === currentChatId 
          ? { 
              ...chat, 
              messages, 
              title: messages.find(m => m.sender === 'user')?.content.slice(0, 30) + '...' || chat.title,
              sessionId: currentSessionId || chat.sessionId,
            }
          : chat
      ));
    }
  }, [messages, currentChatId, currentSessionId]);

  // Sync to MinIO memory (non-blocking, doesn't affect UI)
  useEffect(() => {
    if (!isInitialized || !currentChatId || messages.length === 0) return;
    if (memoryPersistSkipRef.current) {
      memoryPersistSkipRef.current = false;
      return;
    }
    const chat = chats.find(c => c.id === currentChatId);
    if (!chat) return;
    persistChatToMemory(chat);
  }, [chats, currentChatId, isInitialized, persistChatToMemory]);
  
  // Switch to a different chat
  const switchToChat = (chatId: string) => {
    setCurrentChatId(chatId);
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      memoryPersistSkipRef.current = true;
      // Ensure messages are never empty - use chat messages or fallback to initial message
      const chatMessages = chat.messages && chat.messages.length > 0 
        ? chat.messages 
        : [{
            id: '1',
            content: "Hello! I'm Trinity AI. Describe your data analysis task and I'll execute it step-by-step with intelligent workflow generation.",
            sender: 'ai' as const,
            timestamp: new Date()
          }];
      setMessages(chatMessages);
      setCurrentSessionId(chat.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
      
      // Close existing WebSocket and reset workflow state when switching chats
      if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.close();
        setWsConnection(null);
      }
      setCurrentWorkflowMessageId(null);
      setIsLoading(false);
    }
    setShowChatHistory(false);
  };
  
  const deleteCurrentChat = useCallback(async () => {
    if (!currentChatId) return;

    try {
      await deleteMemoryChat(MEMORY_API_BASE, currentChatId);
      setMemoryError(null);
    } catch (error) {
      console.error('Failed to delete chat history:', error);
      setMemoryError('Unable to delete chat history from server.');
    }

    const remainingChats = chats.filter(chat => chat.id !== currentChatId);
    if (remainingChats.length === 0) {
      await createNewChat();
      return;
    }

    memoryPersistSkipRef.current = true;
    setChats(remainingChats);
    const nextChat = remainingChats[0];
    setCurrentChatId(nextChat.id);
    // Ensure messages are never empty - use chat messages or fallback to initial message
    const nextMessages = nextChat.messages && nextChat.messages.length > 0 
      ? nextChat.messages 
      : [{
          id: '1',
          content: "Hello! I'm Trinity AI. Describe your data analysis task and I'll execute it step-by-step with intelligent workflow generation.",
          sender: 'ai' as const,
          timestamp: new Date()
        }];
    setMessages(nextMessages);
    setCurrentSessionId(nextChat.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  }, [MEMORY_API_BASE, chats, createNewChat, currentChatId]);

  const clearAllChats = useCallback(async () => {
    if (chats.length === 0) {
      await createNewChat();
      return;
    }

    try {
      const results = await Promise.allSettled(
        chats.map(chat => deleteMemoryChat(MEMORY_API_BASE, chat.id))
      );
      const failed = results.find(result => result.status === 'rejected');
      if (failed && failed.status === 'rejected') {
        throw failed.reason;
      }
      setChats([]);
      memoryPersistSkipRef.current = true;
      await createNewChat();
      setMemoryError(null);
    } catch (error) {
      console.error('Failed to clear chat history:', error);
      setMemoryError('Unable to clear chat history from server.');
    }
  }, [MEMORY_API_BASE, chats, createNewChat]);

  const handleCopyChatId = useCallback(async () => {
    if (!currentChatId || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(currentChatId);
    } catch (error) {
      console.error('Failed to copy chat ID:', error);
    }
  }, [currentChatId]);
  
  // Resize handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      setPanelWidth(Math.max(320, Math.min(800, newWidth)));
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
    };
    
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);
  
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isPanelFrozen) return;
    e.preventDefault();
    setIsResizing(true);
  };
  
  // Update wsRef whenever wsConnection changes
  useEffect(() => {
    wsRef.current = wsConnection;
  }, [wsConnection]);

  useEffect(() => {
    if (!onBackgroundStatusChange) return;

    const hasActiveWorkflow = Boolean(wsConnection && currentWorkflowMessageId);
    const status: TrinityAIBackgroundStatus = {
      isProcessing: isLoading || hasActiveWorkflow,
      isCollapsed,
      hasActiveWorkflow
    };

    const prevStatus = backgroundStatusRef.current;
    if (
      prevStatus &&
      prevStatus.isProcessing === status.isProcessing &&
      prevStatus.isCollapsed === status.isCollapsed &&
      prevStatus.hasActiveWorkflow === status.hasActiveWorkflow
    ) {
      return;
    }

    backgroundStatusRef.current = status;
    onBackgroundStatusChange(status);
  }, [isCollapsed, isLoading, onBackgroundStatusChange, wsConnection, currentWorkflowMessageId]);
  
  // Cleanup WebSocket ONLY on unmount, NOT on collapse
  useEffect(() => {
    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('🧹 Trinity AI unmounting, closing WebSocket');
        wsRef.current.close();
      }
    };
  }, []);
  
  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Handle workflow approval
  const handleAcceptWorkflow = () => {
    console.log('✅ User accepted workflow');
    
    // Send approval message to backend via WebSocket
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        type: 'approve_plan',
        session_id: currentSessionId,
        chat_id: currentChatId
      }));
      
      setShowWorkflowPreview(false);
      setIsLoading(true);
      
      const acceptMsg: Message = {
        id: `accept-${Date.now()}`,
        content: '✅ Workflow approved! Starting execution...',
        sender: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, acceptMsg]);
    } else {
      console.error('❌ WebSocket not connected');
    }
  };
  
  // Handle workflow rejection
  const handleRejectWorkflow = () => {
    console.log('❌ User rejected workflow');
    
    // Send rejection message to backend via WebSocket
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        type: 'reject_plan',
        session_id: currentSessionId,
        chat_id: currentChatId
      }));
      
      // Close WebSocket after rejection
      wsConnection.close();
      setWsConnection(null);
    }
    
    setShowWorkflowPreview(false);
    setWorkflowPlan(null);
    setExecutionSteps([]);
    setIsLoading(false);
    
    const rejectMsg: Message = {
      id: `reject-${Date.now()}`,
      content: '❌ Workflow rejected. Please describe your task differently or try again.',
      sender: 'ai',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, rejectMsg]);
  };
  
  // Handle step approval (Accept/Reject/Add)
  const handleStepAccept = () => {
    console.log('✅ User accepted step, continuing to next step');
    
    // Send approval to continue to next step
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        type: 'approve_step',
        step_number: completedStepNumber,
        session_id: currentSessionId,
        chat_id: currentChatId
      }));
      
      setShowStepApproval(false);
      setIsLoading(true);
    }
  };
  
  const handleStepReject = () => {
    console.log('❌ User rejected workflow at step', completedStepNumber);
    
    // Send rejection
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        type: 'reject_workflow',
        step_number: completedStepNumber,
        session_id: currentSessionId,
        chat_id: currentChatId
      }));
      
      wsConnection.close();
      setWsConnection(null);
    }
    
    setShowStepApproval(false);
    setIsLoading(false);
    
    const rejectMsg: Message = {
      id: `step-reject-${Date.now()}`,
      content: `❌ Workflow rejected at step ${completedStepNumber}. You can start a new workflow.`,
      sender: 'ai',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, rejectMsg]);
  };
  
  const handleStepAdd = (additionalInfo: string) => {
    console.log('➕ User added info at step', completedStepNumber, ':', additionalInfo);
    
    // Send ADD message with additional information
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        type: 'add_info',
        step_number: completedStepNumber,
        additional_info: additionalInfo,
        original_prompt: originalPrompt,
        session_id: currentSessionId,
        chat_id: currentChatId
      }));
      
      setShowStepApproval(false);
      setIsLoading(true);
      
      const addMsg: Message = {
        id: `add-info-${Date.now()}`,
        content: `➕ Processing additional information: "${additionalInfo}"...`,
        sender: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, addMsg]);
    }
  };
  
  // Handle attach button click - load files when needed (EXACT Trinity AI pattern)
  const handleAttachClick = async () => {
    setShowFilePicker(!showFilePicker);
    
    // Always refresh files when opening picker (not just first time)
    if (!showFilePicker) {
      setLoadingFiles(true);
      try {
        let query = '';
        const envStr = localStorage.getItem('env');
        console.log('📂 Loading files from localStorage env:', envStr);
        
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
            console.log('📂 Query string:', query);
          } catch (e) {
            console.error('Error parsing env:', e);
          }
        }
        
        const url = `${VALIDATE_API}/list_saved_dataframes${query}`;
        console.log('📂 Fetching from:', url);
        
        const response = await fetch(url);
        const data = await response.json();
        console.log('📂 Response data:', data);
        
        // Filter to only show Arrow files
        const arrowFiles = Array.isArray(data.files) 
          ? data.files.filter((f: any) => f.object_name && f.object_name.endsWith('.arrow'))
          : [];
        console.log('📂 Arrow files found:', arrowFiles.length, arrowFiles);
        
        setAvailableFiles(arrowFiles);
      } catch (error) {
        console.error('❌ Error loading files:', error);
      } finally {
        setLoadingFiles(false);
      }
    }
  };
  
  // Load available files (called when needed)
  const loadAvailableFiles = async (): Promise<string[]> => {
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
      
      const url = `${VALIDATE_API}/list_saved_dataframes${query}`;
      const response = await fetch(url);
      const data = await response.json();
      
      const arrowFiles = Array.isArray(data.files) 
        ? data.files.filter((f: any) => f.object_name && f.object_name.endsWith('.arrow'))
        : [];
      
      // Update state
      setAvailableFiles(arrowFiles);
      
      // Return file names for WebSocket
      return arrowFiles.map((f: any) => f.object_name);
    } catch (error) {
      console.error('Error loading files:', error);
      return [];
    }
  };
  
  // WebSocket message handler (EXACT SuperAgent pattern)
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;
    
    // CRITICAL: Close any existing WebSocket before creating new one
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      console.log('🔌 Closing existing WebSocket before new prompt');
      wsConnection.close();
      setWsConnection(null);
    }
    
    // Reset workflow tracking for new prompt
    setCurrentWorkflowMessageId(null);
    
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: inputValue,
      sender: 'user',
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    
    // Create progress message
    const progressMessageId = `progress-${Date.now()}`;
    const progressMessage: Message = {
      id: progressMessageId,
      content: '🔄 Analyzing request and generating workflow plan...',
      sender: 'ai',
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, progressMessage]);
    
    try {
      // Load available files before sending (so backend can skip data-upload-validate)
      const fileNames = await loadAvailableFiles();
      console.log('📂 Loaded files for workflow:', fileNames);
      
      // Get project context
      const currentProjectStr = localStorage.getItem('current-project');
      let projectContext = {};
      if (currentProjectStr) {
        const project = JSON.parse(currentProjectStr);
        projectContext = {
          client_name: project.client_name || 'default',
          app_name: project.app_name || 'default',
          project_name: project.project_name || 'default'
        };
      }
      
      // Create WebSocket connection
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.hostname;
      const wsPort = window.location.port ? `:${window.location.port}` : '';
      const wsUrl = `${wsProtocol}//${wsHost}${wsPort}/streamai/execute-ws`;
      
      console.log('🔗 Connecting to Trinity AI WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);
      
      setWsConnection(ws);
      
      let progressContent = progressMessage.content;
      let createdCards: string[] = [];
      
      // Update progress helper
      const updateProgress = (content: string) => {
        progressContent += content;
        setMessages(prev => prev.map(msg => 
          msg.id === progressMessageId ? { ...msg, content: progressContent } : msg
        ));
      };
      
      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        updateProgress('\n\n✅ Connected! Generating plan...');
        
        // Store original prompt for ADD functionality
        setOriginalPrompt(userMessage.content);
        
        // Send initial message with available files
        ws.send(JSON.stringify({
          message: userMessage.content,
          available_files: fileNames,  // Use freshly loaded files
          project_context: projectContext,
          user_id: 'current_user',
          session_id: currentSessionId,  // Send session ID for chat context
          chat_id: currentChatId
        }));
      };
      
      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('📨 WebSocket event:', data.type, data);
        
        switch (data.type) {
          case 'connected':
            console.log('✅ Trinity AI connected');
            break;
            
          case 'plan_generated':
            console.log('📋 Plan generated:', data.plan);
            
            setIsLoading(false);
            stopAutoRun();
            
            // Add workflow preview as a message bubble
            const workflowPreviewMsg: Message = {
              id: `workflow-preview-${Date.now()}`,
              content: '', // Content rendered by component
              sender: 'ai',
              timestamp: new Date(),
              type: 'workflow_preview',
              data: {
                plan: data.plan,
                sequence_id: data.sequence_id,
                steps: data.plan.workflow_steps.map((step: any) => ({
                  ...step,
                  status: 'pending'
                }))
              }
            };
            
            // Store this workflow message ID for tracking updates
            const thisWorkflowId = workflowPreviewMsg.id;
            console.log(`📝 Created workflow message: ${thisWorkflowId}`);
            
            setMessages(prev => [...prev, workflowPreviewMsg]);
            setCurrentWorkflowMessageId(thisWorkflowId);
            
            // Store workflow ID on the WebSocket object for event routing
            if (ws) {
              (ws as any)._workflowMessageId = thisWorkflowId;
            }
            break;
            
          case 'workflow_started':
            console.log('🚀 Workflow started for sequence:', data.sequence_id);
            
            // Find and update the correct workflow message by sequence_id
            setMessages(prev => prev.map(msg => 
              msg.type === 'workflow_preview' && msg.data?.sequence_id === data.sequence_id
                ? { 
                    ...msg, 
                    type: 'workflow_monitor' as const,
                    data: {
                      ...msg.data,
                      currentStep: 0  // Initialize currentStep
                    }
                  }
                : msg
            ));
            break;
            
          case 'plan_updated':
            console.log('🔄 Plan updated:', data);
            
            // Update execution steps with new remaining steps
            const updatedFromStep = data.updated_from_step || 1;
            setExecutionSteps(prev => {
              const currentSteps = prev.slice(0, updatedFromStep - 1); // Keep completed steps
              const newSteps = data.plan.workflow_steps.slice(updatedFromStep - 1).map((step: any) => ({
                ...step,
                status: 'pending'
              }));
              return [...currentSteps, ...newSteps];
            });
            
            // Update workflow plan
            setWorkflowPlan(data.plan);
            
            // Add message about plan update
            const updateMsg: Message = {
              id: `plan-updated-${Date.now()}`,
              content: `🔄 Workflow updated from step ${updatedFromStep}. Continuing with refined steps...`,
              sender: 'ai',
              timestamp: new Date()
            };
            setMessages(prev => [...prev, updateMsg]);
            break;
            
          case 'step_started':
            console.log('📍 Step started:', data.step, data.atom_id, 'for sequence:', data.sequence_id);
            
            // Find and update the correct workflow message by sequence_id
            setMessages(prev => prev.map(msg => 
              msg.type === 'workflow_monitor' && msg.data?.sequence_id === data.sequence_id
                ? {
                    ...msg,
                    data: {
                      ...msg.data,
                      currentStep: data.step,
                      steps: msg.data.steps.map((s: any) => 
                        s.step_number === data.step 
                          ? { ...s, status: 'running' }
                          : s
                      )
                    }
                  }
                : msg
            ));
            break;
            
          case 'card_created':
            console.log('🎴 Card created:', data.card_id);
            createdCards.push(data.card_id);
            
            // Add empty card to Laboratory store
            const newCard = {
              id: data.card_id,
              atoms: [],
              isExhibited: false
            };
            
            const {cards} = useLaboratoryStore.getState();
            const updatedCards = [...cards, newCard];
            setCards(updatedCards);
                  safeSetLocalStorage('laboratory-layout', JSON.stringify(updatedCards));
            setCards([...updatedCards]);  // Force refresh
            
            updateProgress(`\n   📊 Card created`);
            break;
            
          case 'agent_executed':
            console.log('⚙️ Agent executed:', data);
            
            // Add atom to card and process results with handler
            if (createdCards.length > 0) {
              const cardId = createdCards[createdCards.length - 1];
              const {cards: currentCards} = useLaboratoryStore.getState();
              const card = currentCards.find(c => c.id === cardId);
              
              if (card) {
                const stepAlias = data.output_alias;
                // Import atom info
                const {atoms: allAtoms} = await import('@/components/AtomList/data');
                const atomInfo = allAtoms.find((a: any) => a.id === data.atom_id);
                
                // Create atom instance
                const atomInstanceId = `${data.atom_id}-${Date.now()}`;
                const newAtom = {
                  id: atomInstanceId,
                  atomId: data.atom_id,
                  title: atomInfo?.title || data.atom_id,
                  category: atomInfo?.category || 'Atom',
                  color: atomInfo?.color || 'bg-gray-400',
                  source: 'ai' as const,
                  llm: 'stream_ai',
                  settings: {}
                };
                
                // Add atom to card
                updateCard(cardId, {atoms: [newAtom]});
                
                // Call atom handler to process results (CRITICAL!)
                const handler = getAtomHandler(data.atom_id);
                if (handler && handler.handleSuccess) {
                  console.log(`✅ Calling ${data.atom_id} handler.handleSuccess`);
                  
                const handlerContext = {
                  atomId: atomInstanceId,
                  atomType: data.atom_id,
                  atomTitle: atomInfo?.title || data.atom_id,
                  updateAtomSettings: (id: string, settings: any) => {
                    useLaboratoryStore.getState().updateAtomSettings(id, settings);
                  },
                  setMessages: (updater: (prev: any[]) => any[]) => {
                    setMessages(prev => {
                      const next = updater(prev);
                      if (!Array.isArray(next)) {
                        console.warn('Handler setMessages updater did not return an array. Skipping message update.');
                        return prev;
                      }
                      return next.map(msg => ({
                        ...msg,
                        timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp),
                      }));
                    });
                  },
                  sessionId: data.sequence_id,
                  isStreamMode: false,
                  stepAlias,
                };
                  
                  // 🔧 CRITICAL FIX: Handle different response structures
                  // Chart-maker agent returns response directly, not wrapped in 'result' field
                  // Other agents may wrap in 'result' field
                  const handlerData = data.result || data.data || data;
                  console.log('🔍 Handler data structure:', {
                    hasResult: !!data.result,
                    hasData: !!data.data,
                    usingData: handlerData === data.result ? 'result' : handlerData === data.data ? 'data' : 'direct'
                  });
                  
                  // 🔧 CRITICAL FIX: Await handler completion and ensure state is updated
                  await handler.handleSuccess(handlerData, handlerContext);
                  
                  console.log('✅ Handler completed, verifying atom state...');
                  
                  // 🔧 CRITICAL FIX: Verify atom exists and has settings
                  const verifyAtom = useLaboratoryStore.getState().getAtom(atomInstanceId);
                  console.log('🔍 Atom verification:', {
                    atomExists: !!verifyAtom,
                    hasSettings: !!verifyAtom?.settings,
                    settingsKeys: verifyAtom?.settings ? Object.keys(verifyAtom.settings) : [],
                    hasFileId: !!(verifyAtom?.settings as any)?.fileId,
                    hasUploadedData: !!(verifyAtom?.settings as any)?.uploadedData,
                    chartsCount: (verifyAtom?.settings as any)?.charts?.length || 0
                  });

                  try {
                    await autoSaveStepResult({
                      atomType: data.atom_id,
                      atomId: atomInstanceId,
                      stepAlias,
                      result: data.result,
                      updateAtomSettings: handlerContext.updateAtomSettings,
                      setMessages,
                      isStreamMode: handlerContext.isStreamMode,
                    });
                  } catch (autoSaveError) {
                    console.error('❌ Auto-save error:', autoSaveError);
                  }
                  
                  // 🔧 CRITICAL FIX: Force React to re-render by updating cards state
                  // This ensures the UI updates even when called from central AI
                  const cards = useLaboratoryStore.getState().cards;
                  safeSetLocalStorage('laboratory-layout', JSON.stringify(cards));
                  
                  // Force multiple state updates to ensure React detects changes
                  setCards([...cards]);
                  
                  // 🔧 CRITICAL FIX: Force re-render after a short delay to ensure async operations complete
                  setTimeout(() => {
                    const updatedCards = useLaboratoryStore.getState().cards;
                    setCards([...updatedCards]);
                    
                    // Force another update to trigger component re-render
                    setTimeout(() => {
                      const finalCards = useLaboratoryStore.getState().cards;
                      setCards([...finalCards]);
                      console.log('🔄 Final React re-render triggered for chart-maker atom');
                    }, 200);
                  }, 100);
                  
                  console.log('✅ Handler processed results - card updated!');
                  updateProgress('\n   ✅ Results ready in Laboratory Mode');
                } else {
                  console.warn(`⚠️ No handler for ${data.atom_id}`);
                }
              }
            }
            break;
            
          case 'step_completed':
            console.log('✅ Step completed:', data.step, 'for sequence:', data.sequence_id);
            console.log('⏩ Auto-run status:', { autoRunEnabled: autoRunRef.current, isAutoRunning, isLoading });
            
            const totalSteps = typeof data.total_steps === 'number'
              ? data.total_steps
              : (executionSteps.length || (workflowPlan?.total_steps ?? data.step));
            const hasNextStep = data.step < totalSteps;
            const shouldAutoApprove = autoRunRef.current && hasNextStep;

            try {
              setMessages(prev => {
                const updated = prev.map(msg => 
                  msg.type === 'workflow_monitor' && msg.data?.sequence_id === data.sequence_id
                    ? {
                        ...msg,
                        data: {
                          ...msg.data,
                          steps: msg.data.steps.map((s: any) => 
                            s.step_number === data.step 
                              ? { ...s, status: 'completed', summary: data.summary || 'Step completed successfully' }
                              : s
                          )
                        }
                      }
                    : msg
                );
                
                const workflowMsg = updated.find(m => 
                  m.type === 'workflow_monitor' && m.data?.sequence_id === data.sequence_id
                );
                
                if (workflowMsg && hasNextStep) {
                  setCompletedStepNumber(data.step);
                  
                  if (autoRunRef.current) {
                    console.log('⏩ Auto-run detected completed step', data.step, '- skipping approval card');
                    return updated;
                  }
                  
                  console.log(`⏸️ Adding step approval for step ${data.step} (sequence: ${data.sequence_id})`);
                  const stepInfo = workflowMsg.data.steps.find((s: any) => s.step_number === data.step);
                  const approvalMsg: Message = {
                    id: `step-approval-${data.sequence_id}-${data.step}-${Date.now()}`,
                    content: '',
                    sender: 'ai',
                    timestamp: new Date(),
                    type: 'step_approval',
                    data: {
                      stepNumber: data.step,
                      totalSteps: workflowMsg.data.steps.length,
                      stepDescription: stepInfo?.description || '',
                      stepPrompt: stepInfo?.prompt || '',
                      filesUsed: stepInfo?.files_used || [],
                      inputs: stepInfo?.inputs || [],
                      outputAlias: stepInfo?.output_alias || '',
                      sequence_id: data.sequence_id
                    }
                  };
                  return [...updated, approvalMsg];
                }
                
                return updated;
              });
            } catch (error) {
              console.error('❌ Error updating step completion state:', error);
            } finally {
              if (shouldAutoApprove) {
                console.log('⏩ Auto-run enqueueing queueAutoApprove for step', data.step);
                queueAutoApprove(data.step, data.sequence_id);
              } else if (autoRunRef.current && !hasNextStep) {
                setIsLoading(false);
              } else {
                setIsLoading(false);
              }
            }
            break;
            
          case 'workflow_completed':
            updateProgress('\n\n🎉 Workflow complete!');
            setIsLoading(false);
            stopAutoRun();
            if (agentModeEnabledRef.current) {
              autoRunRef.current = true;
            }
            ws.close();
            break;

          case 'workflow_rejected':
            stopAutoRun();
            setIsLoading(false);
            updateProgress(`\n\n❌ Workflow stopped: ${data?.message || 'Rejected by backend'}`);
            if (agentModeEnabledRef.current) {
              autoRunRef.current = true;
            }
            break;
            
          case 'error':
            updateProgress(`\n\n❌ Error: ${data.error}`);
            setIsLoading(false);
            stopAutoRun();
            if (agentModeEnabledRef.current) {
              autoRunRef.current = true;
            }
            ws.close();
            break;
        }
      };
      
      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        updateProgress('\n\n❌ Connection error');
        setIsLoading(false);
        stopAutoRun();
      };
      
      ws.onclose = () => {
        console.log('🔌 WebSocket closed');
        stopAutoRun();
        setWsConnection(null);
      };
      
    } catch (error) {
      console.error('Error:', error);
      setIsLoading(false);
    }
  };
  
  // Don't unmount when collapsed - keep WebSocket connections and requests alive
  // Show loading during initialization
  if (!isInitialized) {
    return null;
  }

  return (
    <div className={isCollapsed ? 'hidden' : ''} style={{ height: '100%' }}>
    <Card className="h-full bg-white backdrop-blur-xl shadow-[0_20px_70px_rgba(0,0,0,0.3)] border-2 border-gray-200 overflow-hidden flex flex-col relative ring-1 ring-gray-100" style={{ width: `${panelWidth}px` }}>
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
          
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-6">
              {/* Panel Settings */}
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-700 mb-3 font-inter" style={{ fontSize: `${baseFontSize}px` }}>Panel Settings</h4>
                
                {/* Freeze Panel Toggle */}
                <div className="p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h5 className="font-semibold text-gray-800 font-inter mb-1" style={{ fontSize: `${baseFontSize}px` }}>Freeze Panel Size</h5>
                      <p className="text-gray-600 font-inter text-xs">Lock panel width and prevent resizing</p>
                    </div>
                    <button
                      onClick={() => setIsPanelFrozen(!isPanelFrozen)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        isPanelFrozen ? '' : 'bg-gray-300'
                      }`}
                      style={isPanelFrozen ? { backgroundColor: BRAND_GREEN } : undefined}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isPanelFrozen ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                </div>
                
                {/* WebSocket Connection Status */}
                <div className="p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm">
                  <h5 className="font-semibold text-gray-800 mb-2 font-inter" style={{ fontSize: `${baseFontSize}px` }}>Connection Status</h5>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full ${wsConnection ? 'animate-pulse' : ''}`}
                      style={{ backgroundColor: wsConnection ? BRAND_GREEN : '#D1D5DB' }}
                    ></div>
                    <span className="text-gray-600 font-inter" style={{ fontSize: `${smallFontSize}px` }}>
                      {wsConnection ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                  {currentWorkflowMessageId && (
                    <div className="mt-2">
                      <p className="text-gray-600 font-inter text-xs">
                        Active workflow in progress
                      </p>
                    </div>
                  )}
                </div>

                {/* Chat Persistence */}
                <div className="p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm">
                  <h5 className="font-semibold text-gray-800 mb-2 font-inter" style={{ fontSize: `${baseFontSize}px` }}>Chat Persistence</h5>
                  <p className="text-gray-600 font-inter text-xs mb-2">
                    Chats are stored securely in MinIO so you can resume conversations across sessions.
                  </p>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 font-inter">Current Chat ID</p>
                      <p className="text-sm font-mono text-gray-800 truncate">{currentChatId || '—'}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2 h-8 px-2 text-[#458EE2] hover:text-[#356CB0]"
                      onClick={handleCopyChatId}
                      disabled={!currentChatId}
                    >
                      Copy
                    </Button>
                  </div>
                  <div className="flex items-center justify-between mt-3 text-xs text-gray-600 font-inter">
                    <span>{isMemoryLoading ? 'Loading chat history…' : `Stored chats: ${chats.length}`}</span>
                    {memoryError ? (
                      <span className="text-red-500 font-medium">Sync issue</span>
                    ) : (
                      <span className="text-[#41C185] font-medium">Syncing</span>
                    )}
                  </div>
                  {memoryError && (
                    <p className="mt-2 text-xs text-red-500 font-inter">{memoryError}</p>
                  )}
                </div>
                
                {/* Panel Width Info */}
                <div className="p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm">
                  <h5 className="font-semibold text-gray-800 mb-2 font-inter" style={{ fontSize: `${baseFontSize}px` }}>Panel Width</h5>
                  <div className="text-gray-600 font-inter" style={{ fontSize: `${smallFontSize}px` }}>
                    Current: {panelWidth}px
                  </div>
                  <p className="text-gray-500 font-inter text-xs mt-1">
                    Drag the left edge to resize (when not frozen)
                  </p>
                </div>
                
                {/* Clear Chat History */}
                <div className="p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                  <h5 className="font-semibold text-gray-800 mb-2 font-inter" style={{ fontSize: `${baseFontSize}px` }}>Data Management</h5>
                  <Button
                    onClick={async () => {
                      if (confirm('Are you sure you want to clear all chat history? This cannot be undone.')) {
                        await clearAllChats();
                        setShowSettings(false);
                      }
                    }}
                    disabled={isMemoryLoading}
                    className="w-full bg-red-500 hover:bg-red-600 text-white font-inter"
                    style={{ fontSize: `${smallFontSize}px` }}
                  >
                    Clear All Chat History
                  </Button>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      )}
      
      {/* Chat History Sidebar */}
      {showChatHistory && (
        <div className="absolute right-0 top-0 w-80 h-full bg-white backdrop-blur-xl border-l-2 border-gray-200 z-50 flex flex-col shadow-xl">
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
          
          <div className="p-4 border-b border-gray-200">
            <Button
              onClick={() => void createNewChat()}
              className="w-full text-white font-semibold font-inter rounded-xl shadow-md transition-all duration-200"
              style={{ fontSize: `${smallFontSize}px`, backgroundColor: BRAND_GREEN }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3AB077')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BRAND_GREEN)}
            >
              <Plus className="w-4 h-4 mr-2" />
              New Chat
            </Button>
          </div>
          
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2">
              {chats.length === 0 ? (
                <div className="text-center py-8">
                  <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-inter text-sm">No chat history yet</p>
                </div>
              ) : (
                chats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => switchToChat(chat.id)}
                    className={`p-3 rounded-xl cursor-pointer transition-all duration-200 border-2 ${
                      chat.id === currentChatId
                        ? 'shadow-md'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                    }`}
                    style={
                      chat.id === currentChatId
                        ? {
                            backgroundColor: `${BRAND_GREEN}1A`,
                            borderColor: BRAND_GREEN,
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-800 font-inter text-sm truncate">
                          {chat.title}
                        </h4>
                        <p className="text-gray-500 font-inter text-xs mt-1">
                          {new Date(chat.createdAt).toLocaleDateString()} • {chat.messages.length} messages
                        </p>
                      </div>
                      {chat.id === currentChatId && (
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
                          style={{ backgroundColor: BRAND_GREEN }}
                        />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          
          <div className="p-4 border-t-2 border-gray-200 bg-gray-50">
            <div className="text-center">
              <p className="text-gray-500 font-inter text-xs">
                {chats.length} {chats.length === 1 ? 'chat' : 'chats'} saved
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Resize Handle */}
      <div
        ref={resizeRef}
        onMouseDown={handleMouseDown}
        className={`absolute left-0 top-0 w-1 h-full z-40 transition-colors ${
          isPanelFrozen 
            ? 'cursor-not-allowed opacity-30' 
            : 'cursor-col-resize hover:w-2'
        }`}
        style={{ 
          background: isResizing ? `${BRAND_PURPLE}40` : 'transparent',
          width: isResizing ? '4px' : '4px'
        }}
        title={isPanelFrozen ? "Panel is frozen (resize disabled)" : "Drag to resize panel"}
      />
      
      {/* Header */}
      <div className={`flex items-center justify-between p-5 border-b-2 border-gray-200 cursor-grab active:cursor-grabbing bg-gradient-to-r from-[#F4E9FF] via-white to-white backdrop-blur-sm relative overflow-hidden group ${showChatHistory || showSettings ? 'z-40' : 'z-10'}`}>
        {/* Animated background effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#F4E9FF]/0 via-[#F4E9FF]/60 to-[#F4E9FF]/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
        
        <div className="flex items-center space-x-4 relative z-10">
          <div className="relative">
            <div className={`${isCompact ? 'w-9 h-9' : 'w-10 h-10'} rounded-2xl bg-white flex items-center justify-center shadow-lg shadow-gray-200/30 border-2 border-gray-200/20 transition-all duration-300 group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-gray-200/40`}>
              <Sparkles className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} animate-slow-pulse`} style={{ color: BRAND_PURPLE }} />
            </div>
            {/* Online indicator */}
            <div
              className={`absolute -bottom-0.5 -right-0.5 ${isCompact ? 'w-2.5 h-2.5' : 'w-3 h-3'} rounded-full border-2 border-white shadow-lg`}
              style={{ backgroundColor: BRAND_GREEN }}
            >
              <div
                className="absolute inset-0 rounded-full animate-ping opacity-75"
                style={{ backgroundColor: BRAND_GREEN }}
              />
            </div>
          </div>
          <div>
            <h3 className={`font-bold text-gray-800 tracking-tight font-inter ${isCompact ? 'text-base' : 'text-lg'} whitespace-nowrap`}>Trinity AI</h3>
          </div>
        </div>
        <div className="flex items-center gap-5 relative z-10">
          <div className="flex flex-col items-center gap-1 min-w-[72px]">
            <button
              type="button"
              role="switch"
              aria-checked={isAgentMode}
              aria-label="Toggle Agent Mode"
              onClick={() => setAgentMode(!isAgentMode)}
              className={`relative inline-flex items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isAgentMode ? 'bg-[#41C185] focus:ring-[#41C185]/40' : 'bg-gray-300 focus:ring-gray-400/40'
              } ${isCompact ? 'h-6 w-11' : 'h-7 w-12'}`}
            >
              <span
                className={`absolute inset-0 rounded-full transition-opacity duration-300 ${
                  isAgentMode ? 'bg-[#41C185]/30' : 'bg-transparent'
                }`}
              />
              <span
                className={`relative inline-block transform rounded-full bg-white shadow-md transition-transform duration-300 ${isCompact ? 'h-4 w-4' : 'h-5 w-5'} ${
                  isAgentMode ? (isCompact ? 'translate-x-5' : 'translate-x-6') : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`font-semibold text-gray-600 font-inter tracking-wide uppercase text-center ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>
              {isAgentMode ? 'Agent Mode' : 'Agent Mode Off'}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <Button
              variant="ghost"
              size="sm"
              className={`${isCompact ? 'h-7 w-7' : 'h-8 w-8'} p-0 transition-all duration-200 rounded-xl`}
              style={{ color: showChatHistory ? BRAND_GREEN : undefined }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `${BRAND_GREEN}20`)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
              onClick={() => setShowChatHistory(!showChatHistory)}
              title="Chat History"
            >
              <Clock className={isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`${isCompact ? 'h-7 w-7' : 'h-8 w-8'} p-0 hover:bg-gray-100 hover:text-gray-800 transition-all duration-200 rounded-xl`}
              onClick={deleteCurrentChat}
              title="Delete Current Chat"
            >
              <Trash2 className={isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`${isCompact ? 'h-7 w-7' : 'h-8 w-8'} p-0 transition-all duration-200 rounded-xl`}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `${BRAND_GREEN}20`)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
              onClick={() => void createNewChat()}
              title="New Chat"
            >
              <Plus className={isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`${isCompact ? 'h-7 w-7' : 'h-8 w-8'} p-0 hover:bg-blue-100 hover:text-blue-500 transition-all duration-200 rounded-xl`}
              onClick={onToggle}
              title="Minimize Panel"
            >
              <Minus className={isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`${isCompact ? 'h-7 w-7' : 'h-8 w-8'} p-0 hover:bg-red-100 hover:text-red-500 transition-all duration-200 rounded-xl`}
              onClick={() => {
                // Cancel any ongoing requests
                if (wsConnection) {
                  wsConnection.close();
                }
                setIsLoading(false);
                onToggle();
              }}
              title="Close Panel (Cancel Requests)"
            >
              <X className={isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Messages */}
      <ScrollArea className="flex-1 p-6">
        <div className="space-y-6">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 animate-fade-in ${
                msg.sender === 'user' ? 'flex-row-reverse' : ''
              }`}
            >
              {/* Avatar - Hide for workflow components to save space */}
              {(!msg.type || msg.type === 'text') && (
                <div
                  className={`${isCompact ? 'w-8 h-8' : 'w-10 h-10'} rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg transition-all duration-300 hover:scale-110 border-2 ${
                    msg.sender === 'ai' ? '' : 'bg-[#458EE2] border-[#458EE2]/30 shadow-[#458EE2]/20'
                  }`}
                  style={
                    msg.sender === 'ai'
                      ? {
                          backgroundColor: BRAND_GREEN,
                          borderColor: `${BRAND_GREEN}4D`,
                          boxShadow: `0 10px 20px -10px ${BRAND_GREEN}66`,
                        }
                      : undefined
                  }
                >
                  {msg.sender === 'ai' ? (
                    <Bot className={isCompact ? 'w-4 h-4 text-white' : 'w-5 h-5 text-white'} />
                  ) : (
                    <User className={isCompact ? 'w-4 h-4 text-white' : 'w-5 h-5 text-white'} />
                  )}
                </div>
              )}

              {/* Message Bubble or Component */}
              <div
                className={`flex-1 group ${
                  msg.sender === 'user' ? 'flex flex-col items-end' : ''
                } ${msg.type && msg.type !== 'text' ? 'w-full' : 'max-w-full'}`}
                style={{
                  marginLeft: msg.type && msg.type !== 'text' ? '0' : undefined
                }}
              >
                {/* Regular text message */}
                {(!msg.type || msg.type === 'text') && (
                  <>
                    <div
                      className={`rounded-3xl ${isCompact ? 'px-4 py-3' : 'px-5 py-3.5'} shadow-lg border-2 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] max-w-full ${
                        msg.sender === 'ai'
                          ? 'text-white rounded-tl-md backdrop-blur-sm'
                          : 'bg-[#458EE2] text-white border-[#458EE2]/30 rounded-tr-md backdrop-blur-sm'
                      }`}
                      style={
                        msg.sender === 'ai'
                          ? {
                              backgroundColor: BRAND_GREEN,
                              borderColor: `${BRAND_GREEN}4D`,
                              boxShadow: `0 15px 30px -12px ${BRAND_GREEN}66`,
                            }
                          : undefined
                      }
                    >
                      <div
                        className={`leading-relaxed font-medium font-inter break-words ${isCompact ? 'text-[13px]' : 'text-sm'}`}
                        dangerouslySetInnerHTML={{
                          __html: parseMarkdown(msg.content)
                        }}
                      />
                    </div>
                    <p className={`text-gray-600 mt-2 px-2 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-inter ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </>
                )}
                
                {/* Workflow Preview Component */}
                {msg.type === 'workflow_preview' && msg.data && (
                  <div className="mt-2 w-full">
                    <StreamWorkflowPreview
                      workflow={msg.data.plan}
                      onAccept={() => {
                        stopAutoRun();
                        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
                          wsConnection.send(JSON.stringify({ type: 'approve_plan' }));
                          setIsLoading(true);
                        }
                      }}
                      onReject={() => {
                        stopAutoRun();
                        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
                          wsConnection.send(JSON.stringify({ type: 'reject_plan' }));
                          wsConnection.close();
                          setWsConnection(null);
                        }
                        setIsLoading(false);
                      }}
                      onAdd={(info) => {
                        stopAutoRun();
                        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
                          wsConnection.send(JSON.stringify({
                            type: 'add_info',
                            step_number: 0,
                            additional_info: info,
                            original_prompt: originalPrompt
                          }));
                          setIsLoading(true);
                        }
                      }}
                      onRunAll={() => {
                        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
                          startAutoRun();
                          wsConnection.send(JSON.stringify({ type: 'approve_plan' }));
                          setIsLoading(true);
                          const autoRunMsg: Message = {
                            id: `auto-run-${Date.now()}`,
                            content: '⏩ Accepting workflow and auto-running all steps...',
                            sender: 'ai',
                            timestamp: new Date()
                          };
                          setMessages(prev => [...prev, autoRunMsg]);
                        }
                      }}
                      isAutoRunning={isAutoRunning}
                    />
                  </div>
                )}
                
                {/* Workflow Monitor Component */}
                {msg.type === 'workflow_monitor' && msg.data && (
                  <div className="mt-2 w-full">
                    <StreamStepMonitor
                      steps={msg.data.steps}
                      currentStep={msg.data.currentStep || 0}
                      totalSteps={msg.data.steps.length}
                    />
                  </div>
                )}
                
                {/* Step Approval Component */}
                {msg.type === 'step_approval' && msg.data && (
                  <div className="mt-2 w-full">
                    <StreamStepApproval
                      stepNumber={msg.data.stepNumber}
                      totalSteps={msg.data.totalSteps}
                      stepDescription={msg.data.stepDescription}
                      stepPrompt={msg.data.stepPrompt}
                      filesUsed={msg.data.filesUsed}
                      inputs={msg.data.inputs}
                      outputAlias={msg.data.outputAlias}
                      onAccept={() => {
                        stopAutoRun();
                        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
                          wsConnection.send(JSON.stringify({
                            type: 'approve_step',
                            step_number: msg.data.stepNumber
                          }));
                          // Remove this approval message
                          setMessages(prev => prev.filter(m => m.id !== msg.id));
                          setIsLoading(true);
                        }
                      }}
                      onReject={() => {
                        stopAutoRun();
                        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
                          wsConnection.send(JSON.stringify({
                            type: 'reject_workflow',
                            step_number: msg.data.stepNumber
                          }));
                          wsConnection.close();
                          setWsConnection(null);
                        }
                        // Remove this approval message
                        setMessages(prev => prev.filter(m => m.id !== msg.id));
                        setIsLoading(false);
                      }}
                      onAdd={(info) => {
                        stopAutoRun();
                        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
                          wsConnection.send(JSON.stringify({
                            type: 'add_info',
                            step_number: msg.data.stepNumber,
                            additional_info: info,
                            original_prompt: originalPrompt
                          }));
                          // Remove this approval message
                          setMessages(prev => prev.filter(m => m.id !== msg.id));
                          setIsLoading(true);
                        }
                      }}
                      onRunAll={() => {
                        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
                          startAutoRun();
                          setMessages(prev => prev.filter(m => m.id !== msg.id));
                          queueAutoApprove(msg.data.stepNumber, msg.data.sequence_id);
                          const autoRunMsg: Message = {
                            id: `auto-run-${Date.now()}`,
                            content: `⏩ Auto-running remaining steps from step ${msg.data.stepNumber + 1}...`,
                            sender: 'ai',
                            timestamp: new Date()
                          };
                          setMessages(prev => [...prev, autoRunMsg]);
                          setIsLoading(true);
                        }
                      }}
                      isAutoRunning={isAutoRunning}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Typing Indicator */}
          {isLoading && (
            <div className="flex items-start gap-3 animate-fade-in">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg border-2"
                style={{
                  backgroundColor: BRAND_GREEN,
                  borderColor: `${BRAND_GREEN}4D`,
                  boxShadow: `0 10px 25px -10px ${BRAND_GREEN}66`,
                }}
              >
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div
                className="text-white rounded-3xl rounded-tl-md px-5 py-3.5 shadow-lg border-2 backdrop-blur-sm"
                style={{
                  backgroundColor: BRAND_GREEN,
                  borderColor: `${BRAND_GREEN}4D`,
                  boxShadow: `0 15px 30px -12px ${BRAND_GREEN}66`,
                }}
              >
                <div className="flex space-x-1.5">
                  <div className="w-2.5 h-2.5 bg-white/70 rounded-full animate-bounce shadow-sm" />
                  <div className="w-2.5 h-2.5 bg-white/70 rounded-full animate-bounce shadow-sm" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2.5 h-2.5 bg-white/70 rounded-full animate-bounce shadow-sm" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
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
            onClick={() => {
              setMessages([{
                id: '1',
                content: "Hello! I'm Trinity AI. Describe your data analysis task and I'll execute it step-by-step with intelligent workflow generation.",
                sender: 'ai',
                timestamp: new Date()
              }]);
            }}
            title="Reset Chat"
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
                      <div
                        className="w-6 h-6 border-2 border-gray-300 rounded-full animate-spin mb-2"
                        style={{ borderTopColor: BRAND_GREEN }}
                      />
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
                            onClick={() => {
                              setInputValue(prev => prev ? `${prev} @${displayName}` : `@${displayName}`);
                              setShowFilePicker(false);
                            }}
                            className="w-full text-left p-3 rounded-lg hover:bg-gray-50 transition-colors duration-150 group border border-transparent hover:border-[#50C878]/20 min-w-max"
                          >
                            <div className="flex items-center gap-2">
                              <File className="w-4 h-4 text-[#50C878] flex-shrink-0" />
                              <span className="text-sm font-medium text-gray-800 font-inter group-hover:text-[#50C878] whitespace-nowrap">
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
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Type your message..."
              className="min-h-[48px] max-h-[200px] bg-white backdrop-blur-sm border-2 border-gray-200 hover:border-gray-300 focus:border-[#50C878] focus-visible:ring-2 focus-visible:ring-[#50C878]/20 rounded-2xl px-4 py-3 font-medium transition-all duration-200 shadow-sm placeholder:text-gray-500/60 font-inter resize-none overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400"
              style={{ 
                fontSize: '14px',
                scrollbarWidth: 'thin',
                scrollbarColor: '#d1d5db transparent'
              }}
              disabled={isLoading}
              rows={1}
            />
          </div>
          {isLoading && (
            <Button
              onClick={() => {
                if (wsConnection) {
                  wsConnection.close();
                }
                setIsLoading(false);
              }}
              className="h-12 w-12 bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30 hover:shadow-xl hover:shadow-red-500/40 transition-all duration-300 hover:scale-110 rounded-2xl animate-fade-in"
              size="icon"
              title="Stop Request"
            >
              <Square className="w-5 h-5 fill-current" />
            </Button>
          )}
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

export const TrinityAIPanel: React.FC<TrinityAIPanelProps> = (props) => (
  <AgentModeProvider>
    <TrinityAIPanelInner {...props} />
  </AgentModeProvider>
);

export default TrinityAIPanel;

