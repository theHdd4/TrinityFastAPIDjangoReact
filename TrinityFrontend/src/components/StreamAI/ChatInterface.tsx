import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from '@/components/ui/collapsible';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Send, 
  ChevronUp,
  ChevronDown,
  Plug, 
  Wrench, 
  Bot, 
  Sparkles, 
  User,
  Settings,
  X,
  Clock,
  Paperclip,
  Mic,
  File,
  Square,
  Eye,
  EyeOff
} from 'lucide-react';

const BRAND_PURPLE = '#7C3AED';
import { cn } from '@/lib/utils';
import StreamWorkflowPreview from './StreamWorkflowPreview';
import StreamStepMonitor from './StreamStepMonitor';
import StreamStepApproval from './StreamStepApproval';
import VoiceInputButton from './VoiceInputButton';
import { getAvailableCommands, detectCommand } from '../TrinityAI/handlers/commandHandler';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai' | 'assistant';
  timestamp: Date;
  type?: 'text' | 'workflow_preview' | 'workflow_monitor' | 'step_approval';
  data?: any;
}

interface ChatInterfaceProps {
  messages: Message[];
  inputValue: string;
  setInputValue: (value: string) => void;
  isLoading: boolean;
  isPaused?: boolean;
  onSendMessage: () => void;
  selectedAgent: string;
  setSelectedAgent: (agent: string) => void;
  onConnectorsClick?: () => void;
  onToolsClick?: () => void;
  onAgentClick?: () => void;
  onAdvancedReasoningClick?: () => void;
  onMemoryClick?: () => void;
  // Control buttons
  onMinimize?: () => void;
  onSettings?: () => void;
  onClose?: () => void;
  onToggleCollapse?: () => void;
  isCollapsed?: boolean;
  // File and voice
  onAttachClick?: () => void;
  onVoiceTranscript?: (text: string) => void;
  showFilePicker?: boolean;
  availableFiles?: Array<{ object_name: string }>;
  loadingFiles?: boolean;
  onFileSelect?: (fileName: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  // Chat history
  onHistoryClick?: () => void;
  showChatHistory?: boolean;
  // Workflow handlers
  onWorkflowAccept?: () => void;
  onWorkflowReject?: () => void;
  onWorkflowAdd?: (info: string) => void;
  onWorkflowRunAll?: () => void;
  onStepAccept?: (stepNumber: number) => void;
  onStepReject?: (stepNumber: number) => void;
  onStepAdd?: (stepNumber: number, info: string) => void;
  onStepRunAll?: (stepNumber: number, sequenceId?: string) => void;
  isAutoRunning?: boolean;
  parseMarkdown?: (content: string) => string;
  // Brand colors
  brandGreen?: string;
  brandBlue?: string;
  // Auto-size
  autoSize?: boolean;
  canvasAreaWidth?: number | null;
  canvasAreaLeft?: number | null;
  // Stop handler
  onStop?: () => void;
  clarificationRequest?: { message: string; expected_fields?: string[] } | null;
  clarificationValues?: Record<string, string>;
  onClarificationValueChange?: (field: string, value: string) => void;
  onClarificationSubmit?: () => void;
  onClarificationCancel?: () => void;
  isLaboratoryMode?: boolean;
}

const BRAND_GREEN = '#50C878';
const BRAND_BLUE = '#458EE2';

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  inputValue,
  setInputValue,
  isLoading,
  isPaused = false,
  onSendMessage,
  selectedAgent,
  setSelectedAgent,
  onConnectorsClick,
  onToolsClick,
  onAgentClick,
  onAdvancedReasoningClick,
  onMemoryClick,
  onMinimize,
  onSettings,
  onClose,
  onToggleCollapse,
  isCollapsed = false,
  onAttachClick,
  onVoiceTranscript,
  showFilePicker = false,
  availableFiles = [],
  loadingFiles = false,
  onFileSelect,
  textareaRef,
  onHistoryClick,
  showChatHistory = false,
  onWorkflowAccept,
  onWorkflowReject,
  onWorkflowAdd,
  onWorkflowRunAll,
  onStepAccept,
  onStepReject,
  onStepAdd,
  onStepRunAll,
  isAutoRunning = false,
  parseMarkdown = (content) => content,
  brandGreen = BRAND_GREEN,
  brandBlue = BRAND_BLUE,
  autoSize = false,
  canvasAreaWidth = null,
  canvasAreaLeft = null,
  onStop,
  clarificationRequest = null,
  clarificationValues = {},
  onClarificationValueChange,
  onClarificationSubmit,
  onClarificationCancel,
  isLaboratoryMode = false,
}) => {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isPanelHidden, setIsPanelHidden] = useState(false);
  const [activeCommand, setActiveCommand] = useState<{ name: string; color: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Detect commands as user types for visual indicator
  useEffect(() => {
    if (!inputValue.trim()) {
      setActiveCommand(null);
      return;
    }
    
    const commandResult = detectCommand(inputValue);
    
    if (commandResult.isCommand && commandResult.indicatorColor) {
      setActiveCommand({
        name: commandResult.commandName || '',
        color: commandResult.indicatorColor
      });
    } else {
      setActiveCommand(null);
    }
  }, [inputValue]);

  // Reset hidden state when panel is opened via AI icon
  useEffect(() => {
    if (!isCollapsed) {
      setIsPanelHidden(false);
    }
  }, [isCollapsed]);

  // Chat history stays closed by default - user must click to open it
  // Removed auto-open behavior so only chat box opens when AI panel is opened

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isPaused) {
      e.preventDefault();
      onSendMessage();
    }
  };

  // If collapsed, hide the panel completely (opened via AI icon in sidebar)
  if (isCollapsed) {
    return null;
  }

  // If panel is minimized (hidden via eye icon), hide it completely
  // It will be reopened via AI icon in sidebar which resets isPanelHidden
  if (isPanelHidden) {
    return null;
  }

  // Calculate width and position for auto-size mode
  const containerWidth = autoSize && canvasAreaWidth 
    ? `${canvasAreaWidth}px` 
    : undefined;
  const containerLeft = autoSize && canvasAreaLeft !== null
    ? `${canvasAreaLeft}px`
    : undefined;

  return (
    <div 
      className="fixed bottom-0 z-40 flex pointer-events-none"
      style={autoSize && canvasAreaWidth && canvasAreaLeft !== null ? {
        left: containerLeft,
        width: containerWidth,
        right: 'auto',
      } : {
        left: '0',
        right: '0',
        justifyContent: 'center',
      }}
    >
      <div 
        className={`mb-6 pointer-events-auto ${!autoSize ? 'w-full max-w-3xl mx-4' : ''}`}
        style={autoSize && canvasAreaWidth ? {
          width: containerWidth,
          maxWidth: containerWidth,
          marginLeft: '0px',
          marginRight: '0px',
        } : {}}
      >
        <Collapsible open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          {/* Chat History */}
          <CollapsibleContent className="mb-3" forceMount asChild>
            <AnimatePresence>
              {isHistoryOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.95 }}
                  transition={{ 
                    duration: 0.3,
                    ease: [0.4, 0, 0.2, 1]
                  }}
                >
                  <div className="bg-white/98 backdrop-blur-md border border-border/50 rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/10">
                          <Bot className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-foreground tracking-tight">Chat History</span>
                          <p className="text-xs text-muted-foreground">
                            {messages.length} message{messages.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <CollapsibleTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="h-9 w-9 p-0 rounded-xl hover:bg-muted/50 transition-all duration-200 hover:scale-105"
                        >
                          <motion.div
                            animate={{ rotate: isHistoryOpen ? 0 : 180 }}
                            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                          >
                            <ChevronDown className="w-4 h-4" />
                          </motion.div>
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                    
                    <ScrollArea className="h-[420px]" ref={scrollRef}>
                      <div className="p-6 space-y-5">
                        {messages.map((message) => {
                          const isUser = message.sender === 'user';
                          const isAssistant = message.sender === 'ai' || message.sender === 'assistant';
                          
                          return (
                            <div
                              key={message.id}
                              className={cn(
                                "flex items-start gap-3 animate-fade-in",
                                isUser && "flex-row-reverse"
                              )}
                            >
                              {(!message.type || message.type === 'text') && (
                                <div 
                                  className={cn(
                                    "w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg border-2 transition-transform hover:scale-105",
                                    isAssistant ? '' : 'border-[#458EE2]/30'
                                  )}
                                  style={
                                    isAssistant
                                      ? {
                                          backgroundColor: brandGreen,
                                          borderColor: `${brandGreen}4D`,
                                        }
                                      : {
                                          backgroundColor: brandBlue,
                                          borderColor: `${brandBlue}4D`,
                                        }
                                  }
                                >
                                  {isAssistant ? (
                                    <Bot className="w-5 h-5 text-white" />
                                  ) : (
                                    <User className="w-5 h-5 text-white" />
                                  )}
                                </div>
                              )}
                              <div 
                                className={cn(
                                  "max-w-[70%] rounded-2xl px-5 py-3 shadow-lg border-2 transition-all duration-200 hover:shadow-xl backdrop-blur-sm",
                                  isUser
                                    ? "text-white rounded-tr-md"
                                    : "text-white rounded-tl-md"
                                )}
                                style={
                                  isUser
                                    ? {
                                        backgroundColor: brandBlue,
                                        borderColor: `${brandBlue}4D`,
                                        boxShadow: `0 15px 30px -12px ${brandBlue}66`,
                                      }
                                    : {
                                        backgroundColor: brandGreen,
                                        borderColor: `${brandGreen}4D`,
                                        boxShadow: `0 15px 30px -12px ${brandGreen}66`,
                                      }
                                }
                              >
                                {(!message.type || message.type === 'text') && (
                                  <p 
                                    className="text-sm leading-relaxed font-medium"
                                    dangerouslySetInnerHTML={{ __html: parseMarkdown(message.content) }}
                                  />
                                )}
                                
                                {/* Workflow components */}
                                {message.type === 'workflow_preview' && message.data && onWorkflowAccept && (
                                  <div className="mt-2 w-full">
                                    <StreamWorkflowPreview
                                      workflow={message.data.plan}
                                      onAccept={onWorkflowAccept}
                                      onReject={onWorkflowReject || (() => {})}
                                      onAdd={onWorkflowAdd || (() => {})}
                                      onRunAll={onWorkflowRunAll || (() => {})}
                                      isAutoRunning={isAutoRunning}
                                    />
                                  </div>
                                )}
                                
                                {message.type === 'workflow_monitor' && message.data && (
                                  <div className="mt-2 w-full">
                                    <StreamStepMonitor
                                      steps={message.data.steps}
                                      currentStep={message.data.currentStep || 0}
                                      totalSteps={message.data.steps.length}
                                    />
                                  </div>
                                )}
                                
                                {message.type === 'step_approval' && message.data && onStepAccept && (
                                  <div className="mt-2 w-full">
                                    <StreamStepApproval
                                      stepNumber={message.data.stepNumber}
                                      totalSteps={message.data.totalSteps}
                                      stepDescription={message.data.stepDescription}
                                      stepPrompt={message.data.stepPrompt}
                                      filesUsed={message.data.filesUsed}
                                      inputs={message.data.inputs}
                                      outputAlias={message.data.outputAlias}
                                      onAccept={() => onStepAccept(message.data.stepNumber)}
                                      onReject={onStepReject ? () => onStepReject(message.data.stepNumber) : undefined}
                                      onAdd={onStepAdd ? (info: string) => onStepAdd(message.data.stepNumber, info) : undefined}
                                      onRunAll={onStepRunAll ? () => onStepRunAll(message.data.stepNumber, message.data.sequence_id) : undefined}
                                      isAutoRunning={isAutoRunning}
                                    />
                                  </div>
                                )}
                                
                                <p className={cn(
                                  "text-xs mt-2 font-medium",
                                  isUser ? "text-white/60" : "text-white/80"
                                )}>
                                  {message.timestamp.toLocaleTimeString([], { 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                  })}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                        
                        {isLoading && (
                          <div className="flex items-start gap-3 animate-fade-in">
                            <div 
                              className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg border-2"
                              style={{
                                backgroundColor: brandGreen,
                                borderColor: `${brandGreen}4D`,
                              }}
                            >
                              <Bot className="w-5 h-5 text-white" />
                            </div>
                            <div 
                              className="text-white rounded-2xl rounded-tl-md px-5 py-4 shadow-lg border-2 backdrop-blur-sm"
                              style={{
                                backgroundColor: brandGreen,
                                borderColor: `${brandGreen}4D`,
                              }}
                            >
                              <div className="flex gap-2">
                                <div className="w-2.5 h-2.5 bg-white/70 rounded-full animate-bounce shadow-sm" />
                                <div className="w-2.5 h-2.5 bg-white/70 rounded-full animate-bounce [animation-delay:0.15s] shadow-sm" />
                                <div className="w-2.5 h-2.5 bg-white/70 rounded-full animate-bounce [animation-delay:0.3s] shadow-sm" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CollapsibleContent>

          {isPaused && clarificationRequest && isLaboratoryMode && (
            <div className="mb-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl shadow-sm">
              <div className="flex items-start gap-2">
                <Bot className="w-5 h-5 text-amber-700 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-800">Clarification needed</p>
                  <p className="text-sm text-amber-900 mt-1">{clarificationRequest.message}</p>
                  <div className="mt-3 space-y-2">
                    {clarificationRequest.expected_fields?.length ? (
                      clarificationRequest.expected_fields.map((field) => (
                        <div key={field} className="space-y-1">
                          <label className="text-xs font-medium text-amber-800">{field}</label>
                          <input
                            className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                            value={clarificationValues?.[field] || ''}
                            onChange={(e) => onClarificationValueChange?.(field, e.target.value)}
                          />
                        </div>
                      ))
                    ) : (
                      <Textarea
                        placeholder="Add more context so the AI can resume"
                        value={clarificationValues?.__freeform || ''}
                        onChange={(e) => onClarificationValueChange?.('__freeform', e.target.value)}
                        className="bg-white border-amber-200 focus-visible:ring-amber-300"
                      />
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      onClick={onClarificationSubmit}
                      disabled={isLoading}
                      className="bg-amber-500 hover:bg-amber-600 text-white"
                    >
                      Submit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onClarificationCancel}
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

          {/* Chat Input */}
          <motion.div
            className={cn(
              "bg-white border border-border/50 shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden",
              isHistoryOpen ? "rounded-b-3xl" : "rounded-3xl"
            )}
            animate={{ 
              borderTopLeftRadius: isHistoryOpen ? "1.5rem" : "1.5rem",
              borderTopRightRadius: isHistoryOpen ? "1.5rem" : "1.5rem",
            }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="px-5 py-4 bg-gradient-to-r from-primary/[0.02] via-transparent to-primary/[0.02] flex items-start gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                className="h-8 w-8 p-0 rounded-xl hover:bg-muted/50 transition-all duration-200 flex-shrink-0 mt-1"
                title={isHistoryOpen ? "Collapse Chat History" : "Expand Chat History"}
              >
                {isHistoryOpen ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronUp className="w-4 h-4" />
                )}
              </Button>
              <div className="relative flex-1">
                {activeCommand && (
                  <div 
                    className="absolute top-2 left-3 z-10 px-2 py-1 rounded-md text-xs font-semibold text-white shadow-md"
                    style={{ backgroundColor: activeCommand.color }}
                  >
                    /{activeCommand.name}
                  </div>
                )}
                <Textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Send a message..."
                  className={`min-h-[52px] max-h-[130px] resize-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-foreground placeholder:text-muted-foreground/60 text-sm leading-relaxed flex-1 rounded-xl ${
                    activeCommand ? 'pt-10 border-2' : 'border-0'
                  }`}
                  style={activeCommand ? {
                    paddingTop: '2.5rem',
                    borderColor: activeCommand.color,
                    boxShadow: `0 0 0 3px ${activeCommand.color}40, 0 0 0 1px ${activeCommand.color}`,
                  } : {}}
                  disabled={isLoading || isPaused}
                />
              </div>
            </div>

            <div className="flex items-center justify-between px-5 pb-4 pt-0 border-t border-border/30">
              <div className="flex items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="h-9 gap-2 px-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 hover:scale-105"
                      onClick={() => onConnectorsClick?.()}
                    >
                      <Plug className="w-4 h-4" />
                      <span className="text-xs font-medium">Connectors</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="rounded-xl">
                    <DropdownMenuItem>Database Connector</DropdownMenuItem>
                    <DropdownMenuItem>API Connector</DropdownMenuItem>
                    <DropdownMenuItem>File Connector</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="h-9 gap-2 px-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 hover:scale-105"
                      onClick={() => onToolsClick?.()}
                    >
                      <Wrench className="w-4 h-4" />
                      <span className="text-xs font-medium">Tools</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="rounded-xl max-h-[400px] overflow-y-auto">
                    {getAvailableCommands().map((command) => (
                      <DropdownMenuItem
                        key={command.name}
                        onClick={() => {
                          // Insert command into input with a space after it
                          setInputValue(prev => {
                            const trimmed = prev.trim();
                            // If input is empty or ends with space, just add the command
                            if (!trimmed || trimmed.endsWith(' ')) {
                              return `${command.name} `;
                            }
                            // Otherwise, add space before command
                            return `${trimmed} ${command.name} `;
                          });
                          // Focus the textarea if ref is available
                          if (textareaRef?.current) {
                            textareaRef.current.focus();
                          }
                        }}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <div 
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: command.color }}
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{command.name}</span>
                          <span className="text-xs text-muted-foreground">{command.description}</span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="h-9 gap-2 px-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 hover:scale-105"
                      onClick={() => onAgentClick?.()}
                    >
                      <Bot className="w-4 h-4" />
                      <span className="text-xs font-medium">Agent</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="rounded-xl">
                    <DropdownMenuItem>Research Agent</DropdownMenuItem>
                    <DropdownMenuItem>Analysis Agent</DropdownMenuItem>
                    <DropdownMenuItem>Creative Agent</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button 
                  variant="ghost" 
                  size="sm"
                  className="h-9 gap-2 px-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 hover:scale-105"
                  onClick={() => onAdvancedReasoningClick?.()}
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="text-xs font-medium">Advanced Reasoning</span>
                </Button>

                <Button 
                  variant="ghost" 
                  size="sm"
                  className={cn(
                    "h-9 gap-2 px-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 hover:scale-105",
                    showChatHistory && "bg-muted/50"
                  )}
                  onClick={() => {
                    if (onHistoryClick) {
                      onHistoryClick();
                    }
                  }}
                  title="Chat History"
                >
                  <Clock className="w-4 h-4" />
                  <span className="text-xs font-medium">History</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsPanelHidden(!isPanelHidden)}
                  className="h-9 w-9 p-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 hover:scale-105"
                  title={isPanelHidden ? "Show Panel" : "Hide Panel"}
                >
                  {isPanelHidden ? (
                    <Eye className="w-4 h-4" />
                  ) : (
                    <EyeOff className="w-4 h-4" />
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSettings?.()}
                  className="h-9 w-9 p-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 hover:scale-105"
                  title="Settings"
                >
                  <Settings className="w-4 h-4" />
                </Button>

                {onAttachClick && (
                  <div className="relative">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className={cn(
                        "h-9 w-9 p-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200 hover:scale-105",
                        showFilePicker && "bg-muted/50"
                      )}
                      onClick={() => onAttachClick?.()}
                      title="Attach File"
                    >
                      <Paperclip className="w-4 h-4" />
                    </Button>
                    
                    {/* File Picker Dropdown */}
                    {showFilePicker && (
                      <div className="absolute bottom-full left-0 mb-2 w-96 bg-white/98 backdrop-blur-md rounded-xl shadow-xl border border-border/50 max-h-96 z-50 animate-fade-in flex flex-col">
                        <div className="p-3 border-b border-border/30 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 flex-shrink-0">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-foreground text-sm flex items-center gap-2">
                              <File className="w-4 h-4" />
                              Saved DataFrames
                            </h4>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={onAttachClick}
                              className="h-6 w-6 p-0 hover:bg-muted/50 rounded-lg"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="overflow-auto max-h-80 p-2">
                          {loadingFiles ? (
                            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                              <div className="w-6 h-6 border-2 border-border rounded-full animate-spin mb-2" />
                              <p className="text-xs">Loading files...</p>
                            </div>
                          ) : availableFiles.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
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
                                      if (onFileSelect) {
                                        onFileSelect(displayName);
                                      } else {
                                        setInputValue(prev => prev ? `${prev} @${displayName}` : `@${displayName}`);
                                      }
                                      if (onAttachClick) onAttachClick();
                                    }}
                                    className="w-full text-left p-3 rounded-lg hover:bg-muted/50 transition-colors duration-150 group border border-transparent hover:border-primary/20"
                                  >
                                    <div className="flex items-center gap-2">
                                      <File className="w-4 h-4 text-primary flex-shrink-0" />
                                      <span className="text-sm font-medium text-foreground group-hover:text-primary whitespace-nowrap">
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
                )}

                {onVoiceTranscript && (
                  <VoiceInputButton
                    onTranscript={onVoiceTranscript}
                    disabled={isLoading || isPaused}
                    className="h-9 w-9 p-0 rounded-xl"
                    size="sm"
                    variant="ghost"
                  />
                )}
              </div>

              <div className="flex items-center gap-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="h-9 px-3 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
                    >
                      {selectedAgent}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-xl">
                    <DropdownMenuItem onClick={() => setSelectedAgent('Default')}>
                      Default
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSelectedAgent('Advanced')}>
                      Advanced
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSelectedAgent('Expert')}>
                      Expert
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {isLoading && onStop && (
                  <Button
                    onClick={onStop}
                    className="h-10 w-10 p-0 rounded-2xl bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30 hover:shadow-xl hover:shadow-red-500/40 transition-all duration-300 hover:scale-110"
                    size="sm"
                    title="Stop Request"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </Button>
                )}
                
                <Button
                  onClick={onSendMessage}
                  disabled={!inputValue.trim() || isLoading || isPaused}
                  size="sm"
                  className="h-10 w-10 p-0 rounded-2xl bg-[#FEEB99] hover:bg-[#FFBD59] text-gray-800 shadow-lg shadow-[#FFBD59]/30 hover:shadow-xl hover:shadow-[#FFBD59]/40 transition-all duration-300 hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-gray-800/30 border-t-gray-800 rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </Collapsible>
      </div>
    </div>
  );
};

export default ChatInterface;

