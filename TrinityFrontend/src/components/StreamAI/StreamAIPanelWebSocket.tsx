/// <reference types="vite/client" />
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Send, X, User, Sparkles, Bot, Plus, Trash2, Settings, Paperclip, Mic, Minus, Square, File, RotateCcw, Clock, MessageCircle, ChevronUp, ChevronDown, Plug, Wrench, Brain } from 'lucide-react';
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
import VoiceInputButton from './VoiceInputButton';
import ChatInterface from './ChatInterface';

const BRAND_GREEN = '#50C878';
const BRAND_PURPLE = '#7C3AED';

// FastAPI base URL - use same logic as api.ts for port detection and domain routing
const isDevStack = typeof window !== 'undefined' && window.location.port === '8081';
const aiPort = import.meta.env.VITE_AI_PORT || (isDevStack ? '8005' : '8002');
const hostIp = import.meta.env.VITE_HOST_IP || 'localhost';

// Helper function to check if hostname is a domain name (not an IP address)
const isDomainName = (hostname: string): boolean => {
  if (!hostname) return false;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return false;
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipPattern.test(hostname)) return false;
  return true;
};

// Detect protocol from current page
const getProtocol = () => {
  if (typeof window !== 'undefined') {
    return window.location.protocol === 'https:' ? 'https:' : 'http:';
  }
  return 'http:';
};

const protocol = getProtocol();

// Construct FastAPI base URL with domain detection (same logic as api.ts)
let FASTAPI_BASE_URL = import.meta.env.VITE_FASTAPI_BASE_URL;

if (!FASTAPI_BASE_URL) {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    
    // If accessing via domain name, use the same domain (without port) for reverse proxy
    if (isDomainName(hostname)) {
      // Use domain without port - requests will go through reverse proxy at /trinityai
      FASTAPI_BASE_URL = window.location.origin;
    } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // Use localhost with port for local development
      FASTAPI_BASE_URL = `${protocol}//${hostname}:${aiPort}`;
    } else {
      // Use IP address with port for direct IP access
      FASTAPI_BASE_URL = `${protocol}//${hostIp}:${aiPort}`;
    }
  } else {
    // Server-side fallback
    FASTAPI_BASE_URL = `http://${hostIp}:${aiPort}`;
  }
}

// CRITICAL: If accessing via domain name, ALWAYS use the same domain (without port) for reverse proxy
// This overrides any hardcoded VITE_FASTAPI_BASE_URL or IP-based configuration
if (typeof window !== 'undefined' && isDomainName(window.location.hostname)) {
  const currentOrigin = window.location.origin;
  if (FASTAPI_BASE_URL !== currentOrigin) {
    console.warn(`[StreamAI] DOMAIN ACCESS DETECTED: Overriding FASTAPI_BASE_URL`);
    console.warn(`  From: ${FASTAPI_BASE_URL}`);
    console.warn(`  To: ${currentOrigin}`);
    console.warn(`  This enables reverse proxy routing via /trinityai`);
    FASTAPI_BASE_URL = currentOrigin;
  }
}

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
  requestId?: string;
  expectedFields?: string[];
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  sessionId?: string; // Backend session ID for this chat
  pendingClarification?: ClarificationRequest | null;
}

interface ClarificationRequest {
  requestId: string;
  message: string;
  expected_fields?: string[];
  payload?: Record<string, any>;
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
  layout?: 'vertical' | 'horizontal'; // New prop for layout direction
  onClose?: () => void; // Callback for completely hiding the panel (X button)
}

const TrinityAIPanelInner: React.FC<TrinityAIPanelProps> = ({ isCollapsed, onToggle, onBackgroundStatusChange, layout: layoutProp, onClose }) => {
  // Chat management
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false); // For collapsible chat history in horizontal mode
  const [selectedAgent, setSelectedAgent] = useState('Default'); // For agent selection dropdown
  const [panelWidth, setPanelWidth] = useState(320); // Default 320px (w-80) - reduced from 384px
  const [panelHeight, setPanelHeight] = useState(500); // Default height for horizontal mode
  const [isPanelFrozen, setIsPanelFrozen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  // Layout preference: 'vertical' (default) or 'horizontal'
  const [preferredLayout, setPreferredLayout] = useState<'vertical' | 'horizontal'>(() => {
    const saved = localStorage.getItem('trinity_ai_layout_preference');
    return (saved === 'horizontal' || saved === 'vertical') ? saved : 'vertical';
  });
  
  // Use preferred layout from settings if layout prop not provided
  const layout = layoutProp || preferredLayout;
  
  // Auto-size defaults to true when layout is horizontal
  const [autoSize, setAutoSize] = useState(() => {
    const initialLayout = layoutProp || preferredLayout;
    return initialLayout === 'horizontal';
  }); // Auto-size horizontal panel based on canvas area
  const [canvasAreaWidth, setCanvasAreaWidth] = useState<number | null>(null); // Canvas area width for auto-sizing
  const [canvasAreaLeft, setCanvasAreaLeft] = useState<number | null>(null); // Canvas area left position for auto-sizing
  
  // Auto-enable autoSize when layout changes to horizontal
  useEffect(() => {
    if (layout === 'horizontal') {
      setAutoSize(true);
    }
  }, [layout]);
  
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
  const { setCards, updateCard, isLaboratorySession } = useLaboratoryStore();

  // Clarification state (laboratory-only)
  const [clarificationRequest, setClarificationRequest] = useState<ClarificationRequest | null>(null);
  const [clarificationValues, setClarificationValues] = useState<Record<string, string>>({});
  const [isPaused, setIsPaused] = useState(false);

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

    const pendingClarification: ClarificationRequest | null = metadata.pendingClarification
      ? metadata.pendingClarification
      : null;

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
      pendingClarification,
    };
  }, []);

  const persistChatToMemory = useCallback(async (chat: Chat): Promise<MemoryChatResponse | null> => {
    try {
      console.log(`💾 Persisting chat ${chat.id} with ${chat.messages.length} messages to memory/Redis`);
      const result = await saveMemoryChat(MEMORY_API_BASE, chat.id, {
        messages: chat.messages.map(toSerializableMessage),
        metadata: {
          title: chat.title,
          createdAt: chat.createdAt.toISOString(),
          sessionId: chat.sessionId,
          pendingClarification: chat.pendingClarification || undefined,
        },
        append: false, // Replace all messages to ensure consistency
      });
      if (result === null) {
        console.warn('⚠️ Memory service returned null for chat:', chat.id);
        setMemoryError('Memory service unavailable - chat not persisted.');
        return null;
      } else {
        console.log(`✅ Chat ${chat.id} persisted successfully with ${result.totalMessages} messages`);
        setMemoryError(null);
        return result;
      }
    } catch (error) {
      console.error('❌ Failed to sync chat history:', error);
      setMemoryError('Unable to sync chat history to server.');
      throw error; // Re-throw so caller knows it failed
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
          // Filter out incomplete/partial chats - validate each chat
          const validChats: Chat[] = [];
          for (const record of records) {
            try {
              // Validate chat structure
              if (!record.chatId || typeof record.chatId !== 'string') {
                console.warn('Skipping chat with invalid ID:', record);
                continue;
              }
              if (!Array.isArray(record.messages)) {
                console.warn('Skipping chat with invalid messages:', record.chatId);
                continue;
              }
              const mappedChat = mapRecordToChat(record);
              // Additional validation: ensure chat has valid structure
              if (!mappedChat.id || !Array.isArray(mappedChat.messages)) {
                console.warn('Skipping chat with invalid structure:', record.chatId);
                continue;
              }
              validChats.push(mappedChat);
            } catch (error) {
              console.warn('Skipping invalid chat record:', error, record);
              continue;
            }
          }
          
          if (validChats.length > 0) {
            memoryPersistSkipRef.current = true;
            setChats(validChats);

            const activeChat = validChats[0];
            setCurrentChatId(activeChat.id);
            // Only update messages if the loaded chat has messages
            if (activeChat.messages && activeChat.messages.length > 0) {
              setMessages(activeChat.messages);
            }
            setCurrentSessionId(activeChat.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
            memoryPersistSkipRef.current = true;
          } else {
            // All chats were invalid, create new one
            createNewChat().catch(err => {
              console.error('Failed to create new chat:', err);
            });
          }
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
  // This is a backup sync - primary persistence happens in handleSendMessage
  useEffect(() => {
    if (!isInitialized || !currentChatId || messages.length === 0) return;
    if (memoryPersistSkipRef.current) {
      memoryPersistSkipRef.current = false;
      return;
    }
    
    // Use current messages state directly to avoid stale data
    const chat = chats.find(c => c.id === currentChatId);
    if (!chat) {
      // 🔧 CRITICAL FIX: Don't create a new chat if websocket just closed after insights
      // Check if this is happening right after a websocket close (insights were just added)
      // If messages contain insights (workflow_insight type or "Workflow Insights" content),
      // this means we're updating an existing chat, not creating a new one
      const hasInsightMessage = messages.some(m => 
        m.content.includes('Workflow Insights') || 
        m.content.includes('📊 **Workflow Insights**') ||
        m.id?.includes('insight-')
      );
      
      // CRITICAL FIX: Only create a new chat if currentChatId is valid and we have messages
      // Don't create a new chat if we're just updating an existing one (e.g., after insight)
      // Check if messages already contain user messages - if so, this is likely an update, not a new chat
      const hasUserMessages = messages.some(m => m.sender === 'user');
      
      // If we have insight messages but no chat exists, this is likely a race condition
      // where the chat state hasn't updated yet. Skip creating a new chat in this case.
      if (hasInsightMessage && hasUserMessages) {
        console.warn('⚠️ Chat not found but messages contain insights - likely race condition, skipping new chat creation');
        return;
      }
      
      if (!hasUserMessages) {
        // No user messages yet, this might be initial state - don't create chat yet
        return;
      }
      
      // Chat doesn't exist, create it with current messages
      const newChat: Chat = {
        id: currentChatId,
        title: messages.find(m => m.sender === 'user')?.content.slice(0, 30) + '...' || 'Trinity AI Chat',
        messages: messages,
        createdAt: new Date(),
        sessionId: currentSessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };
      setChats(prev => [newChat, ...prev]);
      persistChatToMemory(newChat).catch(err => 
        console.error('Failed to persist new chat in sync effect:', err)
      );
      return;
    }
    
    // Ensure chat has latest messages
    const updatedChat: Chat = {
      ...chat,
      messages: messages, // Use current messages state
    };
    
    // Only persist if messages have changed
    if (updatedChat.messages.length !== chat.messages.length || 
        updatedChat.messages[updatedChat.messages.length - 1]?.id !== chat.messages[chat.messages.length - 1]?.id) {
      persistChatToMemory(updatedChat).catch(err => 
        console.error('Failed to persist chat in sync effect:', err)
      );
    }
  }, [messages, currentChatId, isInitialized, persistChatToMemory, chats, currentSessionId]);
  
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

      if (chat.pendingClarification && isLaboratorySession) {
        setClarificationRequest(chat.pendingClarification);
        const initialValues = (chat.pendingClarification.expected_fields || []).reduce((acc, field) => {
          acc[field] = '';
          return acc;
        }, {} as Record<string, string>);
        setClarificationValues(initialValues);
        setIsPaused(true);
      } else {
        setClarificationRequest(null);
        setClarificationValues({});
        setIsPaused(false);
      }

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
      return; // Don't proceed with UI update if deletion failed
    }

    // Reload chats from server to ensure consistency
    try {
      const records: MemoryChatResponse[] = await listMemoryChats(MEMORY_API_BASE);
      const mappedChats: Chat[] = records.map(record => mapRecordToChat(record));
      
      if (mappedChats.length === 0) {
        await createNewChat();
        return;
      }

      memoryPersistSkipRef.current = true;
      setChats(mappedChats);
      const nextChat = mappedChats[0];
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
    } catch (error) {
      console.error('Failed to reload chats after deletion:', error);
      // Fallback to local state update
      const remainingChats = chats.filter(chat => chat.id !== currentChatId);
      if (remainingChats.length === 0) {
        await createNewChat();
        return;
      }
      memoryPersistSkipRef.current = true;
      setChats(remainingChats);
      const nextChat = remainingChats[0];
      setCurrentChatId(nextChat.id);
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
    }
  }, [MEMORY_API_BASE, chats, createNewChat, currentChatId, mapRecordToChat]);

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
      
      // Reload chats from server to ensure consistency
      const records: MemoryChatResponse[] = await listMemoryChats(MEMORY_API_BASE);
      const mappedChats: Chat[] = records.map(record => mapRecordToChat(record));
      
      setChats(mappedChats);
      memoryPersistSkipRef.current = true;
      
      if (mappedChats.length === 0) {
        await createNewChat();
      } else {
        // Switch to first remaining chat
        const firstChat = mappedChats[0];
        setCurrentChatId(firstChat.id);
        const firstMessages = firstChat.messages && firstChat.messages.length > 0 
          ? firstChat.messages 
          : [{
              id: '1',
              content: "Hello! I'm Trinity AI. Describe your data analysis task and I'll execute it step-by-step with intelligent workflow generation.",
              sender: 'ai' as const,
              timestamp: new Date()
            }];
        setMessages(firstMessages);
        setCurrentSessionId(firstChat.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
      }
      setMemoryError(null);
    } catch (error) {
      console.error('Failed to clear chat history:', error);
      setMemoryError('Unable to clear chat history from server.');
    }
  }, [MEMORY_API_BASE, chats, createNewChat, mapRecordToChat]);

  const handleCopyChatId = useCallback(async () => {
    if (!currentChatId || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(currentChatId);
    } catch (error) {
      console.error('Failed to copy chat ID:', error);
    }
  }, [currentChatId]);
  
  // Resize handlers - for vertical mode (width)
  useEffect(() => {
    if (layout === 'horizontal') return; // Skip for horizontal mode
    
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
  }, [isResizing, layout]);
  
  // Resize handlers - for horizontal mode (height)
  useEffect(() => {
    if (layout !== 'horizontal') return; // Only for horizontal mode
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newHeight = window.innerHeight - e.clientY;
      setPanelHeight(Math.max(300, Math.min(800, newHeight)));
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
  }, [isResizing, layout]);

  // Auto-size: Observe canvas area width and position changes for horizontal layout
  useEffect(() => {
    if (layout !== 'horizontal' || !autoSize) {
      setCanvasAreaWidth(null);
      setCanvasAreaLeft(null);
      return;
    }

    const updateCanvasDimensions = () => {
      // First, try to find an actual card element to measure its real width
      const firstCard = document.querySelector('[data-card-id]');
      if (firstCard) {
        const cardRect = firstCard.getBoundingClientRect();
        // Use the actual card width (includes border, matches visual appearance)
        setCanvasAreaWidth(cardRect.width);
        setCanvasAreaLeft(cardRect.left);
        return;
      }

      // Fallback: measure cards container and calculate card width
      const cardsContainer = document.querySelector('[data-lab-cards-container="true"]');
      if (cardsContainer) {
        const containerRect = cardsContainer.getBoundingClientRect();
        // Cards are w-full within container, so they match container width
        // Container already has p-6 padding, so this is the actual card width
        setCanvasAreaWidth(containerRect.width);
        setCanvasAreaLeft(containerRect.left);
        return;
      }

      // Final fallback: canvas area with padding adjustment
      const canvasElement = document.querySelector('[data-lab-canvas="true"]');
      if (!canvasElement) return;

      const rect = canvasElement.getBoundingClientRect();
      // Account for padding (p-6 = 24px on each side)
      const padding = 48; // 24px left + 24px right
      setCanvasAreaWidth(rect.width - padding);
      setCanvasAreaLeft(rect.left + 24); // Add left padding
    };

    // Try to find a card element first (most accurate measurement)
    let targetElement = document.querySelector('[data-card-id]');
    
    // Fallback to cards container if no card found
    if (!targetElement) {
      targetElement = document.querySelector('[data-lab-cards-container="true"]');
    }
    
    // Final fallback to canvas element
    if (!targetElement) {
      targetElement = document.querySelector('[data-lab-canvas="true"]');
    }

    if (!targetElement) {
      // Retry after a short delay if element not found
      const timeoutId = setTimeout(() => {
        updateCanvasDimensions();
      }, 100);
      return () => clearTimeout(timeoutId);
    }

    // Initial measurement
    updateCanvasDimensions();

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasDimensions();
    });

    // Also listen to window resize and scroll to update position
    const handleResize = () => updateCanvasDimensions();
    const handleScroll = () => updateCanvasDimensions();

    resizeObserver.observe(targetElement);
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [layout, autoSize]);
  
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
  
  // Auto-resize textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const newHeight = Math.min(scrollHeight, 200);
      // Use setProperty with important to ensure it overrides CSS classes
      textarea.style.setProperty('height', `${newHeight}px`, 'important');
    }
  }, [inputValue]);
  
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

  const sendClarificationEnvelope = useCallback(async (
    payload: { message: string; values?: Record<string, string> }
  ) => {
    if (!clarificationRequest) return;

    const envelope = {
      type: 'clarification_response',
      requestId: clarificationRequest.requestId,
      message: payload.message,
      values: payload.values && Object.keys(payload.values).length > 0 ? payload.values : undefined,
      session_id: currentSessionId,
      chat_id: currentChatId,
    };

    try {
      if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify(envelope));
      } else {
        await fetch(`${FASTAPI_BASE_URL}/trinityai/clarification/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(envelope),
        });
      }
      setIsLoading(true);
    } catch (error) {
      console.error('Failed to send clarification response:', error);
      const errorMsg: Message = {
        id: `clarification-error-${Date.now()}`,
        content: '❌ Failed to send clarification. Please try again.',
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
      setIsLoading(false);
    }
  }, [FASTAPI_BASE_URL, clarificationRequest, currentChatId, currentSessionId, wsConnection]);

  const handleClarificationSubmit = useCallback(async () => {
    if (!clarificationRequest) return;

    const responseSummary = clarificationRequest.expected_fields?.length
      ? clarificationRequest.expected_fields
          .map((field) => `${field}: ${clarificationValues[field] || ''}`)
          .join('\n')
      : clarificationValues.__freeform || 'Providing clarification to continue.';

    const userMsg: Message = {
      id: `clarification-response-${Date.now()}`,
      content: responseSummary,
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    await sendClarificationEnvelope({
      message: responseSummary,
      values: clarificationValues,
    });
  }, [clarificationRequest, clarificationValues, sendClarificationEnvelope]);

  const handleClarificationCancel = useCallback(async () => {
    const cancelMessage = 'User skipped clarification. Continue with best effort.';
    await sendClarificationEnvelope({ message: cancelMessage, values: {} });
  }, [sendClarificationEnvelope]);

  const handleIncomingClarification = useCallback(
    (request: ClarificationRequest) => {
      if (!isLaboratorySession) {
        console.warn('Ignoring clarification request because session is not laboratory mode');
        return;
      }

      stopAutoRun();
      setIsPaused(true);
      setClarificationRequest(request);
      const initialValues = (request.expected_fields || []).reduce((acc, field) => {
        acc[field] = '';
        return acc;
      }, {} as Record<string, string>);
      setClarificationValues(initialValues);

      const clarificationMessage: Message = {
        id: `clarification-${Date.now()}`,
        content: request.message || 'The assistant needs clarification before proceeding.',
        sender: 'ai',
        timestamp: new Date(),
        type: 'text',
        requestId: request.requestId,
        expectedFields: request.expected_fields,
      };

      setMessages(prev => {
        const withoutProgress = prev.filter(msg => !msg.id.startsWith('progress-'));
        return [...withoutProgress, clarificationMessage];
      });

      setChats(prev => prev.map(chat =>
        chat.id === currentChatId
          ? { ...chat, pendingClarification: request }
          : chat
      ));

      const currentChat = chats.find(c => c.id === currentChatId);
      if (currentChat) {
        const updatedChat: Chat = {
          ...currentChat,
          pendingClarification: request,
          messages: currentChat.messages.some(m => m.id === clarificationMessage.id)
            ? currentChat.messages
            : [...currentChat.messages, clarificationMessage],
        };
        persistChatToMemory(updatedChat).catch(err =>
          console.error('Failed to persist clarification request:', err)
        );
      }
    },
    [chats, currentChatId, isLaboratorySession, persistChatToMemory, stopAutoRun]
  );
  
  // WebSocket message handler (EXACT SuperAgent pattern)
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading || isPaused) return;
    
    // Store input value immediately to prevent loss
    const messageContent = inputValue.trim();
    
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
      content: messageContent,
      sender: 'user',
      timestamp: new Date()
    };
    
    // CRITICAL: Add message to state IMMEDIATELY before any async operations
    setMessages(prev => {
      const updated = [...prev, userMessage];
      return updated;
    });
    
    // CRITICAL: Clear input immediately to prevent double-sending
    setInputValue('');
    
    // CRITICAL: Persist user message to memory IMMEDIATELY before WebSocket connection
    // This ensures the message is never lost even if connection fails
    // Use a function to get the latest messages state to avoid stale closures
    try {
      // Get the latest messages from state (includes the user message we just added)
      const latestMessages = [...messages, userMessage];
      
      // Get current chat or create one if it doesn't exist
      let currentChat = chats.find(c => c.id === currentChatId);
      if (!currentChat) {
        // Chat doesn't exist, create it
        const newChatId = currentChatId || `stream_chat_${Date.now()}`;
        const newSessionId = currentSessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        currentChat = {
          id: newChatId,
          title: 'New Trinity AI Chat',
          messages: latestMessages,
          createdAt: new Date(),
          sessionId: newSessionId,
        };
        setCurrentChatId(newChatId);
        setCurrentSessionId(newSessionId);
        setChats(prev => [currentChat!, ...prev]);
      }
      
      // Build updated chat with latest messages
      const updatedChat: Chat = {
        ...currentChat,
        messages: latestMessages, // Use latest messages including the new user message
        title: latestMessages.find(m => m.sender === 'user')?.content.slice(0, 30) + '...' || currentChat.title,
      };
      
      // Update chats state immediately
      setChats(prev => prev.map(chat => 
        chat.id === currentChatId ? updatedChat : chat
      ));
      
      // Persist immediately with await to ensure it completes
      memoryPersistSkipRef.current = false; // Allow persistence
      const persistResult = await persistChatToMemory(updatedChat);
      
      if (persistResult === null) {
        console.warn('⚠️ Memory service returned null, message may not be persisted');
      } else {
        console.log('✅ User message persisted to memory/Redis before WebSocket connection');
      }
    } catch (persistError) {
      console.error('⚠️ Failed to persist user message immediately:', persistError);
      // CRITICAL: Even if persistence fails, try again with a retry mechanism
      // Store in a queue for retry
      setTimeout(async () => {
        try {
          const retryChat = chats.find(c => c.id === currentChatId);
          if (retryChat) {
            const retryMessages = [...retryChat.messages];
            if (!retryMessages.some(m => m.id === userMessage.id)) {
              retryMessages.push(userMessage);
            }
            const retryUpdatedChat: Chat = {
              ...retryChat,
              messages: retryMessages,
            };
            memoryPersistSkipRef.current = false;
            await persistChatToMemory(retryUpdatedChat);
            console.log('✅ User message persisted on retry');
          }
        } catch (retryError) {
          console.error('❌ Retry persistence also failed:', retryError);
        }
      }, 1000);
    }
    
    setIsLoading(true);
    
    // Create progress message - will be updated by status events
    const progressMessageId = `progress-${Date.now()}`;
    const progressMessage: Message = {
      id: progressMessageId,
      content: '🔄 Analyzing the query...',
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
        
        try {
          // Send initial message with available files
          ws.send(JSON.stringify({
            message: userMessage.content,
            available_files: fileNames,  // Use freshly loaded files
            project_context: projectContext,
            user_id: 'current_user',
            session_id: currentSessionId,  // Send session ID for chat context
            chat_id: currentChatId
          }));
          console.log('✅ Message sent to WebSocket');
        } catch (sendError) {
          console.error('❌ Failed to send message to WebSocket:', sendError);
          // Message is already in state and persisted, so user won't lose it
          const sendErrorMsg: Message = {
            id: `send-error-${Date.now()}`,
            content: '❌ Failed to send message. Your message has been saved. Please try again.',
            sender: 'ai',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, sendErrorMsg]);
          setIsLoading(false);
        }
      };
      
      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('📨 WebSocket event:', data.type, data);

        if (data.status === 'resumed') {
          setIsPaused(false);
          setClarificationRequest(null);
          setClarificationValues({});

          const resumedMsg: Message = {
            id: `resumed-${Date.now()}`,
            content: '✅ Resumed after clarification.',
            sender: 'ai',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, resumedMsg]);
          setChats(prev => prev.map(chat =>
            chat.id === currentChatId
              ? { ...chat, pendingClarification: null }
              : chat
          ));

          const chat = chats.find(c => c.id === currentChatId);
          if (chat) {
            const updatedChat: Chat = { ...chat, pendingClarification: null, messages: [...chat.messages, resumedMsg] };
            persistChatToMemory(updatedChat).catch(err =>
              console.error('Failed to persist resumed status:', err)
            );
          }
        }

        if (data.status === 'paused_for_clarification' && data.requestId) {
          handleIncomingClarification({
            requestId: data.requestId,
            message: data.message || 'The assistant needs clarification before proceeding.',
            expected_fields: data.expected_fields,
            payload: data.payload,
          });
        }

        switch (data.type) {
          case 'connected':
            console.log('✅ Trinity AI connected');
            break;

          case 'intent_debug':
            console.log(
              '🧭 Intent detected:',
              data.intent_record?.goal_type,
              '| tools=',
              data.intent_record?.required_tools,
              '| output=',
              data.intent_record?.output_format,
              '| path=',
              data.path,
              '| rationale=',
              data.rationale
            );
            break;

          case 'clarification_request': {
            handleIncomingClarification({
              requestId: data.requestId,
              message: data.message,
              expected_fields: data.expected_fields,
              payload: data.payload,
            });
            setIsLoading(false);
            break;
          }

          case 'clarification_required': {
            console.warn('🛑 Clarification requested before continuing', data);
            if (data.requestId) {
              handleIncomingClarification({
                requestId: data.requestId,
                message: data.message,
                expected_fields: data.expected_fields,
                payload: data.payload,
              });
              setIsLoading(false);
              break;
            }

            stopAutoRun();

            const clarificationMessage: Message = {
              id: `clarification-${Date.now()}`,
              content: data.message || 'The assistant needs clarification before proceeding.',
              sender: 'ai',
              timestamp: new Date(),
              type: 'text'
            };

            setMessages(prev => {
              const withoutProgress = prev.filter(msg => msg.id !== progressMessageId);
              return [...withoutProgress, clarificationMessage];
            });

            // Persist clarification into the active chat history so the user can respond
            try {
              const currentChat = chats.find(c => c.id === currentChatId);
              if (currentChat) {
                const filteredMessages = currentChat.messages.filter(m => m.id !== progressMessageId);
                const updatedChat: Chat = {
                  ...currentChat,
                  messages: [...filteredMessages, clarificationMessage],
                };
                memoryPersistSkipRef.current = false;
                persistChatToMemory(updatedChat).catch(err =>
                  console.error('Failed to persist clarification message:', err)
                );
              }
            } catch (persistError) {
              console.error('Failed to persist chat after clarification:', persistError);
            }

            // If the backend closes the socket after asking for clarification, don't treat it as an error
            setIsLoading(false);
            break;
          }

          case 'policy_shift': {
            console.warn('⚠️ Policy shift detected, awaiting confirmation', data);
            stopAutoRun();

            const policyShiftMessage: Message = {
              id: `policy-shift-${Date.now()}`,
              content: data.message || 'Execution path changed; please confirm before proceeding.',
              sender: 'ai',
              timestamp: new Date(),
              type: 'text'
            };

            setMessages(prev => {
              const withoutProgress = prev.filter(msg => msg.id !== progressMessageId);
              return [...withoutProgress, policyShiftMessage];
            });

            try {
              const currentChat = chats.find(c => c.id === currentChatId);
              if (currentChat) {
                const filteredMessages = currentChat.messages.filter(m => m.id !== progressMessageId);
                const updatedChat: Chat = {
                  ...currentChat,
                  messages: [...filteredMessages, policyShiftMessage],
                };
                memoryPersistSkipRef.current = false;
                persistChatToMemory(updatedChat).catch(err =>
                  console.error('Failed to persist policy shift message:', err)
                );
              }
            } catch (persistError) {
              console.error('Failed to persist chat after policy shift:', persistError);
            }

            setIsLoading(false);
            break;
          }

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
                // Keep loading true - more steps are coming
                setIsLoading(true);
              } else if (autoRunRef.current && !hasNextStep) {
                // Last step in auto-run mode - but wait for workflow_completed
                // Keep loading true until workflow_completed event
                setIsLoading(true);
              } else {
                // Manual mode - waiting for user approval
                // Keep loading true if there are more steps, only stop if this is the last step
                if (!hasNextStep) {
                  // This is the last step, but wait for workflow_completed event
                  setIsLoading(true);
                } else {
                  // More steps coming - keep loading
                  setIsLoading(true);
                }
              }
            }
            break;
            
          case 'workflow_completed':
            updateProgress('\n\n🎉 Workflow complete!');
            // 🔧 CRITICAL FIX: Don't close connection yet - wait for workflow insight
            // Set loading state to show "Generating insights..."
            setIsLoading(true);
            updateProgress('\n\n💭 Generating insights...');
            stopAutoRun();
            if (agentModeEnabledRef.current) {
              autoRunRef.current = true;
            }
            // Don't close websocket - wait for workflow_insight or workflow_insight_failed
            break;
            
          case 'workflow_insight':
            console.log('✅ Workflow insight received:', data);
            const insightContent = data.insight || 'No insight generated';
            const insightText = `📊 **Workflow Insights**\n\n${insightContent}`;
            console.log(`📊 Insight message length: ${insightText.length} characters`);
            
            // Display the insight in a new message
            const insightMessage: Message = {
              id: `insight-${Date.now()}`,
              content: insightText,
              sender: 'ai',
              timestamp: new Date(),
              type: 'text'
            };
            
            // CRITICAL: Update both messages and chats state together
            // This prevents the useEffect from creating a new chat when it sees the updated messages
            if (!currentChatId) {
              console.warn('⚠️ No currentChatId when insight received, skipping insight message');
              break;
            }
            
            // 🔧 CRITICAL FIX: Set skip flag to prevent useEffect from creating new chat
            // This prevents race condition where useEffect runs before chats state is updated
            memoryPersistSkipRef.current = true;
            
            // Update chats state first to ensure chat exists
            setChats(prevChats => {
              const currentChat = prevChats.find(c => c.id === currentChatId);
              if (currentChat) {
                const updatedMessages = [...currentChat.messages, insightMessage];
                const updatedChat: Chat = {
                  ...currentChat,
                  messages: updatedMessages,
                };
                
                // Persist immediately with insight included
                memoryPersistSkipRef.current = false;
                persistChatToMemory(updatedChat).then(result => {
                  if (result) {
                    console.log(`✅ Insight persisted successfully. Total messages: ${result.totalMessages}`);
                  } else {
                    console.warn('⚠️ Insight persistence returned null');
                  }
                }).catch(err => {
                  console.error('❌ Failed to persist insight:', err);
                });
                
                // Return updated chats array
                return prevChats.map(chat => 
                  chat.id === currentChatId ? updatedChat : chat
                );
              }
              return prevChats;
            });
            
            // Update messages state
            setMessages(prev => {
              const updated = [...prev, insightMessage];
              console.log(`💾 Total messages after insight: ${updated.length}`);
              return updated;
            });
            
            updateProgress('\n\n✅ Insights generated!');
            // 🔧 CRITICAL FIX: Don't set loading to false here - wait for WebSocket to close
            // The loading icon will be hidden when ws.onclose fires
            // Now close the connection after insight is received
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
            break;
            
          case 'workflow_insight_failed':
            console.warn('⚠️ Workflow insight failed:', data.error);
            updateProgress(`\n\n⚠️ Insight generation failed: ${data.error || 'Unknown error'}`);
            // 🔧 CRITICAL FIX: Don't set loading to false here - wait for WebSocket to close
            // The loading icon will be hidden when ws.onclose fires
            // Close connection even if insight failed
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
            break;

          case 'workflow_rejected':
            stopAutoRun();
            // 🔧 CRITICAL FIX: Don't set loading to false here - wait for WebSocket to close
            // The loading icon will be hidden when ws.onclose fires
            updateProgress(`\n\n❌ Workflow stopped: ${data?.message || 'Rejected by backend'}`);
            if (agentModeEnabledRef.current) {
              autoRunRef.current = true;
            }
            // Close the connection
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
            break;
            
          case 'error':
            updateProgress(`\n\n❌ Error: ${data.error}`);
            // 🔧 CRITICAL FIX: Don't set loading to false here - wait for WebSocket to close
            // The loading icon will be hidden when ws.onclose fires
            stopAutoRun();
            if (agentModeEnabledRef.current) {
              autoRunRef.current = true;
            }
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
            break;
            
          case 'status':
            // Handle status updates (Analyzing, Processing, Thinking, etc.)
            console.log('📊 Status update:', data.message, data.status);
            const statusMessage = data.message || 'Processing...';
            
            // Update the progress message with new status
            setMessages(prev => prev.map(msg => 
              msg.id === progressMessageId 
                ? { ...msg, content: statusMessage }
                : msg
            ));
            break;

          case 'workflow_progress': {
            console.log('⏳ Workflow progress:', data);
            const stepLabel = data.total_steps
              ? `${data.current_step}/${data.total_steps}`
              : `${data.current_step}/?`;
            const percentLabel =
              typeof data.progress_percent === 'number'
                ? ` (${data.progress_percent}%)`
                : '';
            const progressUpdate = `\n\n⏳ Workflow progress: step ${stepLabel}${percentLabel}\n${data.message || 'Processing...'}`;
            updateProgress(progressUpdate);
            break;
          }

          case 'react_generation_status': {
            console.log('🧠 ReAct generation status:', data);
            const stepNumber = data.step_number ?? data.step ?? '?';
            const attemptLabel = data.attempt ? ` (attempt ${data.attempt})` : '';
            const timeoutLabel = data.timed_out ? ' (timeout; replanning...)' : '';
            const elapsedLabel = typeof data.elapsed_seconds === 'number'
              ? ` after ${data.elapsed_seconds}s`
              : '';
            const progressUpdate = `\n\n🧠 Planning step ${stepNumber}${attemptLabel}${elapsedLabel}: ${data.message || 'Generating next action...'}${timeoutLabel}`;
            updateProgress(progressUpdate);

            setMessages(prev => prev.map(msg => {
              if (msg.type === 'workflow_monitor' && msg.data?.sequence_id === data.sequence_id) {
                const steps = msg.data.steps || [];
                const existingIndex = steps.findIndex((s: any) => s.step_number === stepNumber);
                const updatedStep = {
                  ...(existingIndex >= 0 ? steps[existingIndex] : {}),
                  step_number: stepNumber,
                  status: data.timed_out ? 'retrying' : 'thinking',
                  description: data.message || steps[existingIndex]?.description || 'Planning next action...',
                };

                const updatedSteps = [...steps];
                if (existingIndex >= 0) {
                  updatedSteps[existingIndex] = updatedStep;
                } else {
                  updatedSteps.push(updatedStep);
                }

                return {
                  ...msg,
                  data: {
                    ...msg.data,
                    currentStep: stepNumber,
                    steps: updatedSteps,
                  },
                };
              }
              return msg;
            }));

            break;
          }

          case 'react_validation_blocked': {
            console.warn('⛔ ReAct validation blocked:', data);
            const stepNumber = data.step_number ?? data.step ?? '?';
            const blockMessage = data.message || 'Validation blocked this step.';
            const progressUpdate = `\n\n⛔ Validation blocked for step ${stepNumber}: ${blockMessage}`;
            updateProgress(progressUpdate);

            setMessages(prev => prev.map(msg => {
              if (msg.type === 'workflow_monitor' && msg.data?.sequence_id === data.sequence_id) {
                const steps = msg.data.steps || [];
                const existingIndex = steps.findIndex((s: any) => s.step_number === stepNumber);
                const updatedStep = {
                  ...(existingIndex >= 0 ? steps[existingIndex] : {}),
                  step_number: stepNumber,
                  status: 'blocked',
                  atom_id: data.atom_id || steps[existingIndex]?.atom_id,
                  description: blockMessage,
                };

                const updatedSteps = [...steps];
                if (existingIndex >= 0) {
                  updatedSteps[existingIndex] = updatedStep;
                } else {
                  updatedSteps.push(updatedStep);
                }

                return {
                  ...msg,
                  data: {
                    ...msg.data,
                    currentStep: stepNumber,
                    steps: updatedSteps,
                  },
                };
              }
              return msg;
            }));

            break;
          }

          case 'react_thought': {
            console.log('🧠 ReAct thought event:', data);
            const stepNumber = data.step_number ?? data.step ?? '?';
            const thoughtMessage = data.message || 'Thinking...';
            const progressUpdate = `\n\n🧠 Step ${stepNumber} thinking: ${thoughtMessage}`;
            updateProgress(progressUpdate);

            setMessages(prev => prev.map(msg => {
              if (msg.type === 'workflow_monitor' && msg.data?.sequence_id === data.sequence_id) {
                const steps = msg.data.steps || [];
                const existingIndex = steps.findIndex((s: any) => s.step_number === stepNumber);
                const updatedStep = {
                  ...(existingIndex >= 0 ? steps[existingIndex] : {}),
                  step_number: stepNumber,
                  status: data.loading ? 'thinking' : steps[existingIndex]?.status || 'running',
                  atom_id: data.atom_id || steps[existingIndex]?.atom_id,
                  description: thoughtMessage,
                };

                const updatedSteps = [...steps];
                if (existingIndex >= 0) {
                  updatedSteps[existingIndex] = updatedStep;
                } else {
                  updatedSteps.push(updatedStep);
                }

                return {
                  ...msg,
                  data: {
                    ...msg.data,
                    currentStep: stepNumber,
                    steps: updatedSteps,
                  },
                };
              }
              return msg;
            }));

            break;
          }

          case 'react_action': {
            console.log('⚡ ReAct action event:', data);

            const stepNumber = data.step_number ?? data.step ?? '?';
            const description = data.description || data.message || data.atom_id || 'Running step...';
            const progressUpdate = `\n\n⚡ Executing step ${stepNumber}: ${description}`;
            updateProgress(progressUpdate);

            setMessages(prev => prev.map(msg => {
              if (msg.type === 'workflow_monitor' && msg.data?.sequence_id === data.sequence_id) {
                const steps = msg.data.steps || [];
                const existingIndex = steps.findIndex((s: any) => s.step_number === stepNumber);
                const updatedStep = {
                  ...(existingIndex >= 0 ? steps[existingIndex] : {}),
                  step_number: stepNumber,
                  status: 'running',
                  atom_id: data.atom_id || steps[existingIndex]?.atom_id,
                  description,
                };

                const updatedSteps = [...steps];
                if (existingIndex >= 0) {
                  updatedSteps[existingIndex] = updatedStep;
                } else {
                  updatedSteps.push(updatedStep);
                }

                return {
                  ...msg,
                  data: {
                    ...msg.data,
                    currentStep: stepNumber,
                    steps: updatedSteps,
                  },
                };
              }
                return msg;
            }));

            break;
          }

          case 'react_loop_detected': {
            console.warn('♻️ ReAct loop detected:', data);
            const stepNumber = data.step_number ?? data.step ?? '?';
            const loopMessage = data.message || `Loop detected at step ${stepNumber}.`;
            const progressUpdate = `\n\n♻️ Workflow stopped: ${loopMessage}`;
            updateProgress(progressUpdate);

            setIsLoading(false);
            stopAutoRun();

            setMessages(prev => prev.map(msg => {
              if (msg.type === 'workflow_monitor' && msg.data?.sequence_id === data.sequence_id) {
                const steps = msg.data.steps || [];
                const existingIndex = steps.findIndex((s: any) => s.step_number === stepNumber);
                const updatedStep = {
                  ...(existingIndex >= 0 ? steps[existingIndex] : {}),
                  step_number: stepNumber,
                  status: 'stopped',
                  atom_id: data.repeated_atom || steps[existingIndex]?.atom_id,
                  description: loopMessage,
                };

                const updatedSteps = [...steps];
                if (existingIndex >= 0) {
                  updatedSteps[existingIndex] = updatedStep;
                } else {
                  updatedSteps.push(updatedStep);
                }

                return {
                  ...msg,
                  data: {
                    ...msg.data,
                    currentStep: stepNumber,
                    steps: updatedSteps,
                  },
                };
              }
              return msg;
            }));

            // Close the socket so the UI doesn't wait for more events
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.close(1011, 'ReAct loop detected');
            }

            break;
          }

          case 'react_stalled': {
            console.warn('⏸️ ReAct stalled:', data);
            const attempts = data.attempts ?? '?';
            const stallMessage = data.message || `Workflow stalled after ${attempts} attempts.`;
            const progressUpdate = `\n\n⏸️ Workflow stalled: ${stallMessage}`;
            updateProgress(progressUpdate);

            setIsLoading(false);
            stopAutoRun();

            setMessages(prev => prev.map(msg => {
              if (msg.type === 'workflow_monitor' && msg.data?.sequence_id === data.sequence_id) {
                const steps = msg.data.steps || [];
                const updatedSteps = steps.map((s: any) => ({
                  ...s,
                  status: s.status === 'completed' ? s.status : 'stalled',
                }));

                return {
                  ...msg,
                  data: {
                    ...msg.data,
                    steps: updatedSteps,
                    status: 'stalled',
                  },
                };
              }
              return msg;
            }));

            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.close(1011, 'Workflow stalled');
            }

            break;
          }

          case 'text_reply':
            // Handle direct text reply (for general questions)
            console.log('💬 Text reply received:', data.message);
            
            // Remove progress message and add the actual reply
            setMessages(prev => {
              // Remove progress message
              const filtered = prev.filter(msg => msg.id !== progressMessageId);
              
              // Add text reply message
              const replyMessage: Message = {
                id: `text-reply-${Date.now()}`,
                content: data.message || 'No response received',
                sender: 'ai',
                timestamp: new Date(),
                type: 'text'
              };
              
              return [...filtered, replyMessage];
            });
            
            setIsLoading(false);
            stopAutoRun();
            
            // Persist the reply to memory
            try {
              const currentChat = chats.find(c => c.id === currentChatId);
              if (currentChat) {
                const updatedMessages = [...currentChat.messages];
                // Remove progress message if it exists
                const filteredMessages = updatedMessages.filter(m => m.id !== progressMessageId);
                // Add reply message
                const replyMessage: Message = {
                  id: `text-reply-${Date.now()}`,
                  content: data.message || 'No response received',
                  sender: 'ai',
                  timestamp: new Date(),
                  type: 'text'
                };
                filteredMessages.push(replyMessage);
                
                const updatedChat: Chat = {
                  ...currentChat,
                  messages: filteredMessages,
                };
                memoryPersistSkipRef.current = false;
                await persistChatToMemory(updatedChat);
                console.log('✅ Text reply persisted to memory');
              }
            } catch (persistError) {
              console.error('⚠️ Failed to persist text reply:', persistError);
            }
            break;
            
          case 'complete':
            // Handle completion event
            console.log('✅ Workflow/request completed:', data.status, data.intent);
            
            // If it's a text_reply completion, we've already handled it above
            // If it's a workflow completion, the workflow_completed case handles it
            if (data.intent === 'text_reply') {
              setIsLoading(false);
              stopAutoRun();
            }
            
            // Close WebSocket connection
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
            break;
            
          default:
            // Log unhandled event types for debugging
            console.log('⚠️ Unhandled WebSocket event type:', data.type, data);
            break;
        }
      };
      
      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        updateProgress('\n\n❌ Connection error');
        
        // CRITICAL: Add error message to chat so user knows what happened
        const errorMsg: Message = {
          id: `error-${Date.now()}`,
          content: '❌ Connection error occurred. Your message has been saved. Please try again.',
          sender: 'ai',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMsg]);
        
        // CRITICAL: Ensure user message is persisted even on error
        try {
          const currentChat = chats.find(c => c.id === currentChatId);
          if (currentChat) {
            const updatedChat: Chat = {
              ...currentChat,
              messages: currentChat.messages.some(m => m.id === userMessage.id) 
                ? currentChat.messages 
                : [...currentChat.messages, userMessage],
            };
            memoryPersistSkipRef.current = false;
            persistChatToMemory(updatedChat).catch(err => 
              console.error('Failed to persist on error:', err)
            );
          }
        } catch (persistError) {
          console.error('Failed to persist message on WebSocket error:', persistError);
        }
        
        // 🔧 CRITICAL FIX: Don't set loading to false here - wait for WebSocket to close
        // The loading icon will be hidden when ws.onclose fires
        stopAutoRun();
      };
      
      ws.onclose = (event) => {
        console.log('🔌 WebSocket closed', { code: event.code, reason: event.reason, wasClean: event.wasClean });
        stopAutoRun();
        setWsConnection(null);

        // Treat missing close code (1005) as a clean shutdown and inform the user
        if (event.code === 1005 && event.wasClean) {
          updateProgress('\n\nℹ️ Connection finished without a close code. Ready for the next prompt.');
        }

        // CRITICAL: If connection closed unexpectedly (not clean), ensure message is saved
        if (!event.wasClean && event.code !== 1000) {
          console.warn('⚠️ WebSocket closed unexpectedly, ensuring message is persisted');
          try {
            const currentChat = chats.find(c => c.id === currentChatId);
            if (currentChat) {
              const updatedChat: Chat = {
                ...currentChat,
                messages: currentChat.messages.some(m => m.id === userMessage.id)
                  ? currentChat.messages
                  : [...currentChat.messages, userMessage],
              };
              memoryPersistSkipRef.current = false;
              persistChatToMemory(updatedChat).catch(err =>
                console.error('Failed to persist on close:', err)
              );
            }
          } catch (persistError) {
            console.error('Failed to persist message on WebSocket close:', persistError);
          }
        }

        // 🔧 CRITICAL FIX: Set loading to false ONLY when WebSocket connection closes
        // This ensures the loading icon tracks the complete process until the connection is fully closed
        setIsLoading(false);
        console.log('✅ Loading stopped - WebSocket connection closed');
      };
      
    } catch (error) {
      console.error('❌ Error in handleSendMessage:', error);
      
      // CRITICAL: Ensure user message is persisted even if there's an exception
      try {
        const currentChat = chats.find(c => c.id === currentChatId);
        if (currentChat) {
          const updatedChat: Chat = {
            ...currentChat,
            messages: currentChat.messages.some(m => m.id === userMessage.id) 
              ? currentChat.messages 
              : [...currentChat.messages, userMessage],
          };
          memoryPersistSkipRef.current = false;
          await persistChatToMemory(updatedChat);
          console.log('✅ User message persisted after exception');
        }
      } catch (persistError) {
        console.error('Failed to persist message after exception:', persistError);
      }
      
      // Add error message to chat
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        content: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}. Your message has been saved.`,
        sender: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
      
      setIsLoading(false);
    }
  };
  
  // Don't unmount when collapsed - keep WebSocket connections and requests alive
  // Show loading during initialization
  if (!isInitialized) {
    return null;
  }

  // For horizontal layout, render with new ChatInterface component
  if (layout === 'horizontal') {
    return (
      <>
        <ChatInterface
          messages={messages}
          inputValue={inputValue}
          setInputValue={setInputValue}
          isLoading={isLoading}
          isPaused={isPaused}
          onSendMessage={handleSendMessage}
          selectedAgent={selectedAgent}
          setSelectedAgent={setSelectedAgent}
          onMinimize={onToggle}
          onSettings={() => setShowSettings(!showSettings)}
          onClose={() => {
            if (wsConnection) {
              wsConnection.close();
            }
            setIsLoading(false);
            if (onClose) {
              onClose();
            } else {
              onToggle();
            }
          }}
          onToggleCollapse={onToggle}
          isCollapsed={isCollapsed}
          onAttachClick={handleAttachClick}
          onVoiceTranscript={(text) => {
            setInputValue(prev => prev ? `${prev} ${text}` : text);
          }}
          showFilePicker={showFilePicker}
          availableFiles={availableFiles}
          loadingFiles={loadingFiles}
          onFileSelect={(fileName) => {
            setInputValue(prev => prev ? `${prev} @${fileName}` : `@${fileName}`);
            setShowFilePicker(false);
          }}
          textareaRef={textareaRef}
          onHistoryClick={() => setShowChatHistory(!showChatHistory)}
          showChatHistory={showChatHistory}
          onMemoryClick={() => setShowChatHistory(!showChatHistory)}
          onConnectorsClick={() => {
            // TODO: Implement connectors functionality
            console.log('Connectors clicked');
          }}
          onToolsClick={() => {
            // TODO: Implement tools functionality
            console.log('Tools clicked');
          }}
          onAgentClick={() => {
            // TODO: Implement agent functionality
            console.log('Agent clicked');
          }}
          onAdvancedReasoningClick={() => {
            // TODO: Implement advanced reasoning functionality
            console.log('Advanced Reasoning clicked');
          }}
          onWorkflowAccept={() => {
          stopAutoRun();
          if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({ type: 'approve_plan' }));
            setIsLoading(true);
          }
        }}
        onWorkflowReject={() => {
          stopAutoRun();
          if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({ type: 'reject_plan' }));
            wsConnection.close();
            setWsConnection(null);
          }
          setIsLoading(false);
        }}
        onWorkflowAdd={(info) => {
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
        onWorkflowRunAll={() => {
          if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            startAutoRun();
            wsConnection.send(JSON.stringify({ type: 'approve_plan' }));
            setIsLoading(true);
          }
        }}
        onStepAccept={(stepNumber) => {
          stopAutoRun();
          if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({
              type: 'approve_step',
              step_number: stepNumber
            }));
            // Find and remove the step approval message
            setMessages(prev => {
              const msgToRemove = prev.find(m => m.type === 'step_approval' && m.data?.stepNumber === stepNumber);
              return msgToRemove ? prev.filter(m => m.id !== msgToRemove.id) : prev;
            });
            setIsLoading(true);
          }
        }}
        onStepReject={(stepNumber) => {
          stopAutoRun();
          if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({
              type: 'reject_workflow',
              step_number: stepNumber
            }));
            wsConnection.close();
            setWsConnection(null);
          }
          // Find and remove the step approval message
          setMessages(prev => {
            const msgToRemove = prev.find(m => m.type === 'step_approval' && m.data?.stepNumber === stepNumber);
            return msgToRemove ? prev.filter(m => m.id !== msgToRemove.id) : prev;
          });
          setIsLoading(false);
        }}
        onStepAdd={(stepNumber, info) => {
          stopAutoRun();
          if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({
              type: 'add_info',
              step_number: stepNumber,
              additional_info: info,
              original_prompt: originalPrompt
            }));
            // Find and remove the step approval message
            setMessages(prev => {
              const msgToRemove = prev.find(m => m.type === 'step_approval' && m.data?.stepNumber === stepNumber);
              return msgToRemove ? prev.filter(m => m.id !== msgToRemove.id) : prev;
            });
            setIsLoading(true);
          }
        }}
        onStepRunAll={(stepNumber, sequenceId) => {
          if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            startAutoRun();
            // Find and remove the step approval message
            setMessages(prev => {
              const msgToRemove = prev.find(m => m.type === 'step_approval' && m.data?.stepNumber === stepNumber);
              return msgToRemove ? prev.filter(m => m.id !== msgToRemove.id) : prev;
            });
            queueAutoApprove(stepNumber, sequenceId);
            setIsLoading(true);
          }
        }}
        isAutoRunning={isAutoRunning}
        parseMarkdown={parseMarkdown}
          autoSize={autoSize}
          canvasAreaWidth={canvasAreaWidth}
          canvasAreaLeft={canvasAreaLeft}
          onStop={() => {
            if (wsConnection) {
              wsConnection.close();
            }
            setIsLoading(false);
            stopAutoRun();
          }}
          clarificationRequest={clarificationRequest}
          clarificationValues={clarificationValues}
          onClarificationValueChange={(field, value) => setClarificationValues(prev => ({ ...prev, [field]: value }))}
          onClarificationSubmit={handleClarificationSubmit}
          onClarificationCancel={handleClarificationCancel}
          isLaboratoryMode={isLaboratorySession}
        />
      
      {/* Settings Panel for Horizontal Layout */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm pointer-events-auto"
            onClick={() => setShowSettings(false)}
          />
          <div className="relative w-full max-w-md mx-4 bg-white backdrop-blur-xl border-2 border-gray-200 rounded-2xl shadow-2xl pointer-events-auto max-h-[90vh] flex flex-col">
            <div className="p-4 border-b-2 border-gray-200 bg-gradient-to-r from-gray-50 to-white flex-shrink-0">
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
                  
                  {/* Layout Preference Toggle */}
                  <div className="p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h5 className="font-semibold text-gray-800 font-inter mb-1" style={{ fontSize: `${baseFontSize}px` }}>View</h5>
                        <p className="text-gray-600 font-inter text-xs">Choose between horizontal and vertical layout</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${preferredLayout === 'vertical' ? 'text-gray-800' : 'text-gray-400'}`}>Vertical</span>
                        <button
                          onClick={() => {
                            const newLayout = preferredLayout === 'vertical' ? 'horizontal' : 'vertical';
                            setPreferredLayout(newLayout);
                            localStorage.setItem('trinity_ai_layout_preference', newLayout);
                            // Auto-enable autoSize when switching to horizontal layout
                            if (newLayout === 'horizontal') {
                              setAutoSize(true);
                            }
                            // Dispatch custom event for same-tab updates
                            window.dispatchEvent(new Event('trinity_ai_layout_changed'));
                            setShowSettings(false); // Close settings after changing layout
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            preferredLayout === 'horizontal' ? '' : 'bg-gray-300'
                          }`}
                          style={preferredLayout === 'horizontal' ? { backgroundColor: BRAND_GREEN } : undefined}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            preferredLayout === 'horizontal' ? 'translate-x-6' : 'translate-x-1'
                          }`} />
                        </button>
                        <span className={`text-xs font-medium ${preferredLayout === 'horizontal' ? 'text-gray-800' : 'text-gray-400'}`}>Horizontal</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Auto Size Toggle - Only for horizontal layout */}
                  {preferredLayout === 'horizontal' && (
                    <div className="p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h5 className="font-semibold text-gray-800 font-inter mb-1" style={{ fontSize: `${baseFontSize}px` }}>Auto Size</h5>
                          <p className="text-gray-600 font-inter text-xs">Automatically adjust panel width based on canvas area</p>
                        </div>
                        <button
                          onClick={() => setAutoSize(!autoSize)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            autoSize ? '' : 'bg-gray-300'
                          }`}
                          style={autoSize ? { backgroundColor: BRAND_GREEN } : undefined}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            autoSize ? 'translate-x-6' : 'translate-x-1'
                          }`} />
                        </button>
                      </div>
                    </div>
                  )}
                  
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
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
      
      {/* Chat History Sidebar for Horizontal Layout */}
      {showChatHistory && (
        <div className="fixed right-0 top-0 w-80 h-full bg-white backdrop-blur-xl border-l-2 border-gray-200 z-50 flex flex-col shadow-xl">
          <div className="p-4 border-b-2 border-gray-200 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 font-inter" style={{ fontSize: `${baseFontSize}px` }}>Chat History</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (chats.length === 0) return;
                    if (confirm(`Are you sure you want to delete all ${chats.length} chats? This cannot be undone.`)) {
                      try {
                        setIsMemoryLoading(true);
                        const results = await Promise.allSettled(
                          chats.map(chat => deleteMemoryChat(MEMORY_API_BASE, chat.id))
                        );
                        const failed = results.filter(result => result.status === 'rejected');
                        if (failed.length > 0) {
                          console.error('Some chats failed to delete:', failed);
                          setMemoryError(`Failed to delete ${failed.length} chat(s). Please try again.`);
                        } else {
                          // Reload chats from server to ensure consistency
                          const records: MemoryChatResponse[] = await listMemoryChats(MEMORY_API_BASE);
                          const mappedChats: Chat[] = records
                            .filter(record => {
                              if (!record.chatId || typeof record.chatId !== 'string') return false;
                              if (!Array.isArray(record.messages)) return false;
                              return true;
                            })
                            .map(record => mapRecordToChat(record));
                          
                          setChats(mappedChats);
                          memoryPersistSkipRef.current = true;
                          
                          if (mappedChats.length === 0) {
                            await createNewChat();
                          } else {
                            // Switch to first remaining chat
                            const firstChat = mappedChats[0];
                            setCurrentChatId(firstChat.id);
                            const firstMessages = firstChat.messages && firstChat.messages.length > 0 
                              ? firstChat.messages 
                              : [{
                                  id: '1',
                                  content: "Hello! I'm Trinity AI. Describe your data analysis task and I'll execute it step-by-step with intelligent workflow generation.",
                                  sender: 'ai' as const,
                                  timestamp: new Date()
                                }];
                            setMessages(firstMessages);
                            setCurrentSessionId(firstChat.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
                          }
                          setMemoryError(null);
                        }
                      } catch (error) {
                        console.error('Failed to clear all chats:', error);
                        setMemoryError('Unable to clear all chats from server.');
                      } finally {
                        setIsMemoryLoading(false);
                      }
                    }
                  }}
                  className="h-6 px-2 text-xs hover:bg-red-100 hover:text-red-600 text-gray-600 rounded-lg transition-colors"
                  disabled={chats.length === 0 || isMemoryLoading}
                  title="Clear All Chats"
                >
                  Clear All
                </Button>
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
                    className={`p-3 rounded-xl transition-all duration-200 border-2 ${
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
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => switchToChat(chat.id)}
                      >
                        <h4 className="font-semibold text-gray-800 font-inter text-sm truncate">
                          {chat.title}
                        </h4>
                        <p className="text-gray-500 font-inter text-xs mt-1">
                          {new Date(chat.createdAt).toLocaleDateString()} • {chat.messages.length} messages
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {chat.id === currentChatId && (
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: BRAND_GREEN }}
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600 text-gray-400 rounded-lg"
                          onClick={async (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            if (confirm(`Are you sure you want to delete "${chat.title}"? This cannot be undone.`)) {
                              try {
                                setIsMemoryLoading(true);
                                console.log('Deleting chat:', chat.id);
                                await deleteMemoryChat(MEMORY_API_BASE, chat.id);
                                console.log('Chat deleted successfully, reloading...');
                                
                                // Reload chats from server
                                const records: MemoryChatResponse[] = await listMemoryChats(MEMORY_API_BASE);
                                console.log('Reloaded chats:', records.length);
                                const mappedChats: Chat[] = records
                                  .filter(record => {
                                    // Validate chat structure
                                    if (!record.chatId || typeof record.chatId !== 'string') return false;
                                    if (!Array.isArray(record.messages)) return false;
                                    return true;
                                  })
                                  .map(record => mapRecordToChat(record));
                                
                                memoryPersistSkipRef.current = true;
                                setChats(mappedChats);
                                
                                // If we deleted the current chat, switch to first available or create new
                                if (chat.id === currentChatId) {
                                  if (mappedChats.length === 0) {
                                    await createNewChat();
                                  } else {
                                    const nextChat = mappedChats[0];
                                    setCurrentChatId(nextChat.id);
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
                                  }
                                }
                                setMemoryError(null);
                                console.log('Chat deletion completed successfully');
                              } catch (error) {
                                console.error('Failed to delete chat:', error);
                                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                                setMemoryError(`Unable to delete chat: ${errorMessage}`);
                                alert(`Failed to delete chat: ${errorMessage}`);
                              } finally {
                                setIsMemoryLoading(false);
                              }
                            }
                          }}
                          title="Delete Chat"
                          disabled={isMemoryLoading}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
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
      </>
    );
  }

  // Original vertical layout
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
                
                {/* Layout Preference Toggle */}
                <div className="p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h5 className="font-semibold text-gray-800 font-inter mb-1" style={{ fontSize: `${baseFontSize}px` }}>View</h5>
                      <p className="text-gray-600 font-inter text-xs">Choose between horizontal and vertical layout</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${preferredLayout === 'vertical' ? 'text-gray-800' : 'text-gray-400'}`}>Vertical</span>
                      <button
                        onClick={() => {
                          const newLayout = preferredLayout === 'vertical' ? 'horizontal' : 'vertical';
                          setPreferredLayout(newLayout);
                          localStorage.setItem('trinity_ai_layout_preference', newLayout);
                          // Auto-enable autoSize when switching to horizontal layout
                          if (newLayout === 'horizontal') {
                            setAutoSize(true);
                          }
                          // Dispatch custom event for same-tab updates
                          window.dispatchEvent(new Event('trinity_ai_layout_changed'));
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          preferredLayout === 'horizontal' ? '' : 'bg-gray-300'
                        }`}
                        style={preferredLayout === 'horizontal' ? { backgroundColor: BRAND_GREEN } : undefined}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          preferredLayout === 'horizontal' ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                      <span className={`text-xs font-medium ${preferredLayout === 'horizontal' ? 'text-gray-800' : 'text-gray-400'}`}>Horizontal</span>
                    </div>
                  </div>
                </div>
                
                {/* Auto Size Toggle - Only for horizontal layout */}
                {preferredLayout === 'horizontal' && (
                  <div className="p-4 bg-white rounded-xl border-2 border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h5 className="font-semibold text-gray-800 font-inter mb-1" style={{ fontSize: `${baseFontSize}px` }}>Auto Size</h5>
                        <p className="text-gray-600 font-inter text-xs">Automatically adjust panel width based on canvas area</p>
                      </div>
                      <button
                        onClick={() => setAutoSize(!autoSize)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          autoSize ? '' : 'bg-gray-300'
                        }`}
                        style={autoSize ? { backgroundColor: BRAND_GREEN } : undefined}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          autoSize ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                  </div>
                )}
                
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
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (chats.length === 0) return;
                    if (confirm(`Are you sure you want to delete all ${chats.length} chats? This cannot be undone.`)) {
                      try {
                        setIsMemoryLoading(true);
                        const results = await Promise.allSettled(
                          chats.map(chat => deleteMemoryChat(MEMORY_API_BASE, chat.id))
                        );
                        const failed = results.filter(result => result.status === 'rejected');
                        if (failed.length > 0) {
                          console.error('Some chats failed to delete:', failed);
                          setMemoryError(`Failed to delete ${failed.length} chat(s). Please try again.`);
                        } else {
                          // Reload chats from server to ensure consistency
                          const records: MemoryChatResponse[] = await listMemoryChats(MEMORY_API_BASE);
                          const mappedChats: Chat[] = records
                            .filter(record => {
                              if (!record.chatId || typeof record.chatId !== 'string') return false;
                              if (!Array.isArray(record.messages)) return false;
                              return true;
                            })
                            .map(record => mapRecordToChat(record));
                          
                          setChats(mappedChats);
                          memoryPersistSkipRef.current = true;
                          
                          if (mappedChats.length === 0) {
                            await createNewChat();
                          } else {
                            // Switch to first remaining chat
                            const firstChat = mappedChats[0];
                            setCurrentChatId(firstChat.id);
                            const firstMessages = firstChat.messages && firstChat.messages.length > 0 
                              ? firstChat.messages 
                              : [{
                                  id: '1',
                                  content: "Hello! I'm Trinity AI. Describe your data analysis task and I'll execute it step-by-step with intelligent workflow generation.",
                                  sender: 'ai' as const,
                                  timestamp: new Date()
                                }];
                            setMessages(firstMessages);
                            setCurrentSessionId(firstChat.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
                          }
                          setMemoryError(null);
                        }
                      } catch (error) {
                        console.error('Failed to clear all chats:', error);
                        setMemoryError('Unable to clear all chats from server.');
                      } finally {
                        setIsMemoryLoading(false);
                      }
                    }
                  }}
                  className="h-6 px-2 text-xs hover:bg-red-100 hover:text-red-600 text-gray-600 rounded-lg transition-colors"
                  disabled={chats.length === 0 || isMemoryLoading}
                  title="Clear All Chats"
                >
                  Clear All
                </Button>
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
                    className={`p-3 rounded-xl transition-all duration-200 border-2 ${
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
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => switchToChat(chat.id)}
                      >
                        <h4 className="font-semibold text-gray-800 font-inter text-sm truncate">
                          {chat.title}
                        </h4>
                        <p className="text-gray-500 font-inter text-xs mt-1">
                          {new Date(chat.createdAt).toLocaleDateString()} • {chat.messages.length} messages
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {chat.id === currentChatId && (
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: BRAND_GREEN }}
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600 text-gray-400 rounded-lg"
                          onClick={async (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            if (confirm(`Are you sure you want to delete "${chat.title}"? This cannot be undone.`)) {
                              try {
                                setIsMemoryLoading(true);
                                console.log('Deleting chat:', chat.id);
                                await deleteMemoryChat(MEMORY_API_BASE, chat.id);
                                console.log('Chat deleted successfully, reloading...');
                                
                                // Reload chats from server
                                const records: MemoryChatResponse[] = await listMemoryChats(MEMORY_API_BASE);
                                console.log('Reloaded chats:', records.length);
                                const mappedChats: Chat[] = records
                                  .filter(record => {
                                    // Validate chat structure
                                    if (!record.chatId || typeof record.chatId !== 'string') return false;
                                    if (!Array.isArray(record.messages)) return false;
                                    return true;
                                  })
                                  .map(record => mapRecordToChat(record));
                                
                                memoryPersistSkipRef.current = true;
                                setChats(mappedChats);
                                
                                // If we deleted the current chat, switch to first available or create new
                                if (chat.id === currentChatId) {
                                  if (mappedChats.length === 0) {
                                    await createNewChat();
                                  } else {
                                    const nextChat = mappedChats[0];
                                    setCurrentChatId(nextChat.id);
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
                                  }
                                }
                                setMemoryError(null);
                                console.log('Chat deletion completed successfully');
                              } catch (error) {
                                console.error('Failed to delete chat:', error);
                                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                                setMemoryError(`Unable to delete chat: ${errorMessage}`);
                                alert(`Failed to delete chat: ${errorMessage}`);
                              } finally {
                                setIsMemoryLoading(false);
                              }
                            }
                          }}
                          title="Delete Chat"
                          disabled={isMemoryLoading}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
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
      
      {isPaused && clarificationRequest && isLaboratorySession && (
        <div className="mx-5 mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl shadow-sm animate-fade-in">
          <div className="flex items-start gap-2">
            <Bot className="w-5 h-5 text-amber-700 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Clarification needed</p>
              <p className="text-sm text-amber-900 mt-1">{clarificationRequest.message}</p>
              <div className="mt-3 space-y-2">
                {clarificationRequest.expected_fields && clarificationRequest.expected_fields.length > 0 ? (
                  clarificationRequest.expected_fields.map((field) => (
                    <div key={field} className="space-y-1">
                      <label className="text-xs font-medium text-amber-800">{field}</label>
                      <input
                        className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                        value={clarificationValues[field] || ''}
                        onChange={(e) => setClarificationValues(prev => ({ ...prev, [field]: e.target.value }))}
                        placeholder={`Provide ${field}`}
                      />
                    </div>
                  ))
                ) : (
                  <Textarea
                    placeholder="Add more context so the AI can resume"
                    value={clarificationValues.__freeform || ''}
                    onChange={(e) => setClarificationValues(prev => ({ ...prev, __freeform: e.target.value }))}
                    className="bg-white border-amber-200 focus-visible:ring-amber-300"
                  />
                )}
              </div>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={handleClarificationSubmit}
                  disabled={isLoading}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  Submit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClarificationCancel}
                  disabled={isLoading}
                  className="border-amber-300 text-amber-800 hover:bg-amber-100"
                >
                  Cancel / Skip
                </Button>
              </div>
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
          <VoiceInputButton
            onTranscript={(text) => {
              setInputValue(prev => prev ? `${prev} ${text}` : text);
            }}
            disabled={isLoading}
            className="h-10 w-10 p-0 transition-all duration-200 rounded-xl hover:scale-110 shadow-sm hover:shadow-md"
            size="sm"
            variant="ghost"
          />
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
              disabled={isLoading || isPaused}
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
            disabled={!inputValue.trim() || isLoading || isPaused}
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

