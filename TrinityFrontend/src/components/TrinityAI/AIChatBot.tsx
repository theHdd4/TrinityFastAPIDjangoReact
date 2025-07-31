import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Send, X, MessageSquare, Bot, User, Sparkles } from 'lucide-react';
import ChatSuggestions from './ChatSuggestions';
import { TRINITY_AI_API } from '@/lib/api';
import { logMinioPrefix } from '@/utils/logPrefix';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface AIChatBotProps {
  cardId: string;
  cardTitle: string;
  onAddAtom?: (cardId: string, atomName: string) => void;
  disabled?: boolean;
}

const AIChatBot: React.FC<AIChatBotProps> = ({ cardId, cardTitle, onAddAtom, disabled }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: `Hello! I'm here to help you find and configure atoms for "${cardTitle}". What kind of functionality are you looking for?`,
      sender: 'ai',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [interactionDone, setInteractionDone] = useState(false);

  // Re-enable the prompt if the card becomes empty again
  useEffect(() => {
    if (!disabled) {
      setInteractionDone(false);
      setShowSuggestions(true);
    }
  }, [disabled]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setShowSuggestions(false);

    try {
      try {
        const envRes = await fetch(`${TRINITY_AI_API}/env`);
        if (envRes.ok) {
          const envData = await envRes.json();
          console.log('TrinityAI environment', envData);
          if (envData.debug) {
            console.log('TrinityAI env debug', envData.debug);
          }
          logMinioPrefix(envData.prefix);
        }
      } catch (err) {
        console.log('Env fetch error', err);
      }
      const res = await fetch(`${TRINITY_AI_API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage.content })
      });
      if (res.ok) {
        const data = await res.json();
        const finalText =
          data.final_response ||
          data.message ||
          data.response ||
          `I understand you're looking for "${userMessage.content}".`;

        let atomName: string | undefined;
        if (data.match_type === 'single' && data.atom_status && data.atom_name) {
          atomName = data.atom_name;
        }

        let messageText = finalText;
        if (data.match_type === 'multi' && Array.isArray(data.relevant_atoms)) {
          const list = data.relevant_atoms.map((a: any) => a.name).join(', ');
          messageText += `\n\nRecommended atoms: ${list}`;
        }

        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: messageText,
          sender: 'ai',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMessage]);
        if (atomName && onAddAtom) {
          onAddAtom(cardId, atomName);
          setInteractionDone(true);
        }
      }
    } catch {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: 'Sorry, I could not reach the AI service.',
        sender: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
    }

    setIsLoading(false);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
    setShowSuggestions(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={(open) => !disabled && setIsOpen(open)}>
      <PopoverTrigger asChild>
        <button
          className={`p-1 rounded ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'} transition-transform`}
          title="Use Trinity AI"
        >
          <Sparkles className="w-4 h-4 text-purple-500 hover:scale-110" />
        </button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-96 h-[500px] p-0 flex flex-col" 
        align="start"
        side="bottom"
        sideOffset={8}
      >
        {/* Chat Header */}
        <div className="p-4 border-b border-gray-200 bg-white rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Edit card with AI</h3>
                <p className="text-sm text-gray-600">Ask AI to help with "{cardTitle}"</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-8 w-8 p-0 hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Chat Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-start space-x-3 ${
                  message.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.sender === 'ai' 
                    ? 'bg-gradient-to-r from-blue-500 to-purple-500' 
                    : 'bg-gray-600'
                }`}>
                  {message.sender === 'ai' ? (
                    <Bot className="w-4 h-4 text-white" />
                  ) : (
                    <User className="w-4 h-4 text-white" />
                  )}
                </div>
                <Card className={`p-3 max-w-[240px] ${
                  message.sender === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white border border-gray-200'
                }`}>
                  <p className="text-sm leading-relaxed">{message.content}</p>
                  <p className={`text-xs mt-2 ${
                    message.sender === 'user' ? 'text-blue-100' : 'text-gray-500'
                  }`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </Card>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <Card className="p-3 bg-white border border-gray-200">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Suggestions Section */}
        {showSuggestions && messages.length <= 1 && !interactionDone && (
          <div className="p-4 border-t border-gray-200 max-h-48 overflow-y-auto">
            <ChatSuggestions onSuggestionClick={handleSuggestionClick} />
          </div>
        )}

        {/* Chat Input */}
        {!interactionDone && (
          <div className="p-4 border-t border-gray-200 bg-white rounded-b-lg">
            <div className="flex space-x-2">
              <Textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask AI to..."
                className="flex-1 min-h-[60px] resize-none border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                disabled={isLoading}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isLoading}
                className="bg-blue-500 hover:bg-blue-600 text-white self-end h-[60px] px-4"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default AIChatBot;
