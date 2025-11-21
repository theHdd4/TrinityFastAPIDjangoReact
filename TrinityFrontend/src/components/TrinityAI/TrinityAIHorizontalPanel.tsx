import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, X, User, Bot, Plus, Trash2, Settings, Paperclip, Minus, Square, File, RotateCcw, Clock, MessageCircle, Sparkles, ChevronUp, ChevronDown } from 'lucide-react';
import { TrinityAIPanel } from '../StreamAI/StreamAIPanelWebSocket';
import { AgentModeProvider } from '../StreamAI/context/AgentModeContext';
import VoiceInputButton from '../StreamAI/VoiceInputButton';

const BRAND_GREEN = '#50C878';
const BRAND_PURPLE = '#7C3AED';

interface TrinityAIHorizontalPanelProps {
  isCollapsed: boolean;
  onToggle: () => void;
  onBackgroundStatusChange?: (status: { isProcessing: boolean; isCollapsed: boolean; hasActiveWorkflow: boolean }) => void;
}

const TrinityAIHorizontalPanel: React.FC<TrinityAIHorizontalPanelProps> = ({ 
  isCollapsed: externalCollapsed, 
  onToggle,
  onBackgroundStatusChange 
}) => {
  const [isExpanded, setIsExpanded] = useState(!externalCollapsed);
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync with external collapsed state
  useEffect(() => {
    setIsExpanded(!externalCollapsed);
  }, [externalCollapsed]);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
    onToggle();
  };

  const handleInputFocus = () => {
    setIsFocused(true);
    if (!isExpanded) {
      setIsExpanded(true);
      onToggle();
    }
  };

  const handleInputBlur = () => {
    setIsFocused(false);
  };

  // Simple markdown parser
  const parseMarkdown = (text: string): string => {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  };

  return (
    <AgentModeProvider>
      <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col">
        {/* Collapsed State - ChatGPT-like input bar */}
        {!isExpanded && (
          <div className="bg-white border-t border-gray-200 shadow-lg">
            <div className="max-w-4xl mx-auto px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-purple-600 flex items-center justify-center shadow-md">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <Textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        // Will be handled by the expanded panel
                      }
                    }}
                    placeholder="Ask Trinity AI anything..."
                    className="flex-1 min-h-[48px] max-h-[120px] bg-white border-2 border-gray-200 hover:border-gray-300 focus:border-purple-500 focus-visible:ring-2 focus-visible:ring-purple-500/20 rounded-xl px-4 py-3 font-medium transition-all duration-200 resize-none overflow-y-auto"
                    rows={1}
                  />
                </div>
                <Button
                  onClick={handleToggle}
                  className="h-12 w-12 bg-[#FEEB99] hover:bg-[#FFBD59] text-gray-800 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 rounded-xl"
                  size="icon"
                >
                  <ChevronUp className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Expanded State - Full horizontal panel */}
        {isExpanded && (
          <div className="bg-white border-t border-gray-200 shadow-2xl flex flex-col" style={{ height: '500px' }}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-[#F4E9FF] via-white to-white">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-lg border-2 border-gray-200/20">
                  <Sparkles className="w-5 h-5" style={{ color: BRAND_PURPLE }} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 tracking-tight font-inter text-lg">Trinity AI</h3>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggle}
                  className="h-8 w-8 p-0 hover:bg-gray-100 rounded-xl"
                  title="Minimize"
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (onToggle) onToggle();
                  }}
                  className="h-8 w-8 p-0 hover:bg-red-100 hover:text-red-500 rounded-xl"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Content Area - Horizontal Layout */}
            <div className="flex-1 flex overflow-hidden">
              {/* Chat Messages - Horizontal Scroll */}
              <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-6">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg border-2" style={{ backgroundColor: BRAND_GREEN, borderColor: `${BRAND_GREEN}4D` }}>
                        <Bot className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="rounded-3xl rounded-tl-md px-5 py-3.5 shadow-lg border-2 backdrop-blur-sm" style={{ backgroundColor: BRAND_GREEN, borderColor: `${BRAND_GREEN}4D` }}>
                          <div className="text-white leading-relaxed font-medium font-inter text-sm">
                            Hello! I'm Trinity AI. Describe your data analysis task and I'll execute it step-by-step with intelligent workflow generation.
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Messages will be rendered here by the inner panel */}
                  </div>
                </ScrollArea>
              </div>

              {/* Right Sidebar - Settings, History, etc. */}
              <div className="w-64 border-l border-gray-200 bg-gray-50 flex flex-col">
                <div className="p-4 border-b border-gray-200">
                  <h4 className="font-semibold text-gray-800 text-sm font-inter mb-2">Quick Actions</h4>
                  <div className="space-y-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-gray-700 hover:bg-gray-100"
                    >
                      <Clock className="w-4 h-4 mr-2" />
                      Chat History
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-gray-700 hover:bg-gray-100"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Settings
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Input Area */}
            <div className="border-t border-gray-200 bg-gradient-to-b from-white to-gray-50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-10 w-10 p-0 hover:bg-gray-100 rounded-xl"
                  title="Reset Chat"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-10 w-10 p-0 hover:bg-gray-100 rounded-xl"
                  title="Attach Files"
                >
                  <Paperclip className="w-4 h-4" />
                </Button>
                <VoiceInputButton
                  onTranscript={(text) => {
                    setInputValue(prev => prev ? `${prev} ${text}` : text);
                  }}
                  disabled={false}
                  className="h-10 w-10 p-0 rounded-xl"
                  size="sm"
                  variant="ghost"
                />
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-10 w-10 p-0 hover:bg-gray-100 rounded-xl"
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
                        // Handle send - will be connected to actual panel
                      }
                    }}
                    placeholder="Type your message..."
                    className="min-h-[48px] max-h-[200px] bg-white border-2 border-gray-200 hover:border-gray-300 focus:border-[#50C878] focus-visible:ring-2 focus-visible:ring-[#50C878]/20 rounded-2xl px-4 py-3 font-medium transition-all duration-200 resize-none overflow-y-auto"
                    rows={1}
                  />
                </div>
                <Button
                  onClick={() => {
                    // Handle send
                  }}
                  disabled={!inputValue.trim()}
                  className="h-12 w-12 bg-[#FEEB99] hover:bg-[#FFBD59] text-gray-800 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 rounded-2xl disabled:opacity-50"
                  size="icon"
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AgentModeProvider>
  );
};

export default TrinityAIHorizontalPanel;

