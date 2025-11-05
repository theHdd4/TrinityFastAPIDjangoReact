import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, X, User, Sparkles, Bot, Plus, Trash2, Settings, Paperclip, Mic, Minus, Square, File, RotateCcw } from 'lucide-react';
import { useLaboratoryStore } from '../LaboratoryMode/store/laboratoryStore';
import { getAtomHandler, hasAtomHandler } from '../TrinityAI/handlers';
import StreamWorkflowPreview from './StreamWorkflowPreview';
import StreamStepMonitor from './StreamStepMonitor';

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
}

interface StreamAIPanelProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export const StreamAIPanelWebSocket: React.FC<StreamAIPanelProps> = ({ isCollapsed, onToggle }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: "Hello! I'm Stream AI. Describe your data analysis task and I'll execute it step-by-step with intelligent workflow generation.",
      sender: 'ai',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [availableFiles, setAvailableFiles] = useState<any[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [panelWidth, setPanelWidth] = useState(384); // Default 384px (w-96)
  const [isPanelFrozen, setIsPanelFrozen] = useState(true);
  const [baseFontSize] = useState(14);
  const [smallFontSize] = useState(12);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Workflow state
  const [workflowPlan, setWorkflowPlan] = useState<any>(null);
  const [showWorkflowPreview, setShowWorkflowPreview] = useState(false);
  const [executionSteps, setExecutionSteps] = useState<any[]>([]);
  const [currentExecutingStep, setCurrentExecutingStep] = useState(0);
  const [showStepMonitor, setShowStepMonitor] = useState(false);
  
  // Laboratory store
  const { setCards, updateCard } = useLaboratoryStore();
  
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
        type: 'approve_plan'
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
        type: 'reject_plan'
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
        
        const url = `http://localhost:8001/api/data-upload-validate/list_saved_dataframes${query}`;
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
      
      const url = `http://localhost:8001/api/data-upload-validate/list_saved_dataframes${query}`;
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
      
      console.log('🔗 Connecting to Stream AI WebSocket:', wsUrl);
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
        
        // Send initial message with available files
        ws.send(JSON.stringify({
          message: userMessage.content,
          available_files: fileNames,  // Use freshly loaded files
          project_context: projectContext,
          user_id: 'current_user'
        }));
      };
      
      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('📨 WebSocket event:', data.type, data);
        
        switch (data.type) {
          case 'connected':
            console.log('✅ Stream AI connected');
            break;
            
          case 'plan_generated':
            console.log('📋 Plan generated:', data.plan);
            
            // Store workflow plan and show preview
            setWorkflowPlan(data.plan);
            setShowWorkflowPreview(true);
            setIsLoading(false); // Stop loading to show preview
            
            // Initialize execution steps
            const steps = data.plan.workflow_steps.map((step: any) => ({
              ...step,
              status: 'pending'
            }));
            setExecutionSteps(steps);
            
            // Add message about plan generation
            const planMsg: Message = {
              id: `plan-${Date.now()}`,
              content: `🎯 I've generated a ${data.plan.total_steps}-step workflow for you. Please review and approve to proceed.`,
              sender: 'ai',
              timestamp: new Date()
            };
            setMessages(prev => [...prev, planMsg]);
            
            // DON'T close WebSocket - keep it open for workflow execution
            // User can approve and execution continues on same connection
            break;
            
          case 'workflow_started':
            console.log('🚀 Workflow started');
            setShowStepMonitor(true);
            break;
            
          case 'step_started':
            console.log('📍 Step started:', data.step, data.atom_id);
            setCurrentExecutingStep(data.step);
            
            // Update step status to running
            setExecutionSteps(prev => prev.map(s => 
              s.step_number === data.step 
                ? { ...s, status: 'running' }
                : s
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
            localStorage.setItem('laboratory-layout', JSON.stringify(updatedCards));
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
                    setMessages: () => {},
                    sessionId: data.sequence_id
                  };
                  
                  await handler.handleSuccess(data.result, handlerContext);
                  
                  // Save to localStorage
                  const cards = useLaboratoryStore.getState().cards;
                  localStorage.setItem('laboratory-layout', JSON.stringify(cards));
                  setCards([...cards]);  // Force refresh
                  
                  console.log('✅ Handler processed results - card updated!');
                  updateProgress('\n   ✅ Results ready in Laboratory Mode');
                } else {
                  console.warn(`⚠️ No handler for ${data.atom_id}`);
                }
              }
            }
            break;
            
          case 'step_completed':
            console.log('✅ Step completed:', data.step);
            
            // Update step status to completed
            setExecutionSteps(prev => prev.map(s => 
              s.step_number === data.step 
                ? { ...s, status: 'completed', summary: data.summary || 'Step completed successfully' }
                : s
            ));
            break;
            
          case 'workflow_completed':
            updateProgress('\n\n🎉 Workflow complete!');
            setIsLoading(false);
            ws.close();
            break;
            
          case 'error':
            updateProgress(`\n\n❌ Error: ${data.error}`);
            setIsLoading(false);
            ws.close();
            break;
        }
      };
      
      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        updateProgress('\n\n❌ Connection error');
        setIsLoading(false);
      };
      
      ws.onclose = () => {
        console.log('🔌 WebSocket closed');
        setWsConnection(null);
      };
      
    } catch (error) {
      console.error('Error:', error);
      setIsLoading(false);
    }
  };
  
  // Don't unmount when collapsed - keep WebSocket connections and requests alive
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
                      <h5 className="font-semibold text-gray-800 font-inter mb-1" style={{ fontSize: `${baseFontSize}px` }}>Freeze Panel</h5>
                      <p className="text-gray-600 font-inter text-xs">Lock panel width</p>
                    </div>
                    <button
                      onClick={() => setIsPanelFrozen(!isPanelFrozen)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        isPanelFrozen ? 'bg-[#41C185]' : 'bg-gray-300'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isPanelFrozen ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      )}
      
      {/* Header */}
      <div className={`flex items-center justify-between p-5 border-b-2 border-gray-200 cursor-grab active:cursor-grabbing bg-gradient-to-r from-gray-50 to-white backdrop-blur-sm relative overflow-hidden group ${showSettings ? 'z-40' : 'z-10'}`}>
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
            <h3 className="font-bold text-gray-800 tracking-tight font-inter text-lg">Stream AI</h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#50C878] rounded-full animate-pulse" />
              <p className="text-gray-600 font-medium font-inter text-xs">Active • Ready to help</p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-1 relative z-10">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 hover:bg-gray-100 hover:text-gray-800 transition-all duration-200 rounded-xl"
            onClick={() => {
              setMessages([{
                id: '1',
                content: "Hello! I'm Stream AI. Describe your data analysis task and I'll execute it step-by-step with intelligent workflow generation.",
                sender: 'ai',
                timestamp: new Date()
              }]);
            }}
            title="Clear Chat"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 hover:bg-gray-100 hover:text-gray-800 transition-all duration-200 rounded-xl"
            onClick={() => {
              setMessages([{
                id: '1',
                content: "Hello! I'm Stream AI. Describe your data analysis task and I'll execute it step-by-step with intelligent workflow generation.",
                sender: 'ai',
                timestamp: new Date()
              }]);
            }}
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
              if (wsConnection) {
                wsConnection.close();
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
              {/* Avatar */}
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg transition-all duration-300 hover:scale-110 ${
                msg.sender === 'ai' 
                  ? 'bg-[#50C878] border-2 border-[#50C878]/30 shadow-[#50C878]/20' 
                  : 'bg-[#458EE2] border-2 border-[#458EE2]/30 shadow-[#458EE2]/20'
              }`}>
                {msg.sender === 'ai' ? (
                  <Bot className="w-5 h-5 text-white" />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
              </div>

              {/* Message Bubble */}
              <div className={`flex-1 group ${
                msg.sender === 'user' ? 'flex flex-col items-end' : ''
              }`} style={{ maxWidth: '500px' }}>
                <div className={`rounded-3xl px-5 py-3.5 shadow-lg border-2 transition-all duration-300 hover:shadow-xl hover:scale-[1.02] ${
                  msg.sender === 'ai'
                    ? 'bg-[#50C878] text-white border-[#50C878]/30 rounded-tl-md backdrop-blur-sm'
                    : 'bg-[#458EE2] text-white border-[#458EE2]/30 rounded-tr-md backdrop-blur-sm'
                  }`}>
                    <div
                      className="leading-relaxed font-medium font-inter text-sm"
                      dangerouslySetInnerHTML={{
                        __html: parseMarkdown(msg.content)
                      }}
                    />
                  </div>
                  <p className="text-gray-600 mt-2 px-2 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-inter text-xs">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          
          {/* Workflow Preview */}
          {showWorkflowPreview && workflowPlan && (
            <div className="mt-6">
              <StreamWorkflowPreview
                workflow={workflowPlan}
                onAccept={handleAcceptWorkflow}
                onReject={handleRejectWorkflow}
              />
            </div>
          )}
          
          {/* Step Execution Monitor */}
          {showStepMonitor && executionSteps.length > 0 && (
            <div className="mt-6">
              <StreamStepMonitor
                steps={executionSteps}
                currentStep={currentExecutingStep}
                totalSteps={executionSteps.length}
              />
            </div>
          )}

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
                content: "Hello! I'm Stream AI. Describe your data analysis task and I'll execute it step-by-step with intelligent workflow generation.",
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
                            onClick={() => {
                              setInputValue(prev => prev + (prev ? ' ' : '') + displayName);
                              setShowFilePicker(false);
                            }}
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
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Type your message..."
              className="min-h-[48px] max-h-[200px] bg-white backdrop-blur-sm border-2 border-gray-200 hover:border-gray-300 focus:border-[#41C185] focus-visible:ring-2 focus-visible:ring-[#41C185]/20 rounded-2xl px-4 py-3 font-medium transition-all duration-200 shadow-sm placeholder:text-gray-500/60 font-inter resize-none overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400"
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

export default StreamAIPanelWebSocket;

