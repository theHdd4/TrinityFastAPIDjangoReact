import React, { useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Bot, User, X, MessageSquare, Send } from 'lucide-react';
import { TRINITY_AI_API, CONCAT_API, MERGE_API } from '@/lib/api';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface AtomAIChatBotProps {
  atomId: string;
  atomType: string;
  atomTitle: string;
  className?: string;
  disabled?: boolean;
}

const ENDPOINTS: Record<string, string> = {
  concat: `${TRINITY_AI_API}/concat`,
  merge: `${TRINITY_AI_API}/merge`,
  'chart-maker': `${TRINITY_AI_API}/chart-maker`,
};

const PERFORM_ENDPOINTS: Record<string, string> = {
  concat: `${CONCAT_API}/perform`,
  merge: `${MERGE_API}/perform`,
};

import { cn } from '@/lib/utils';

const AtomAIChatBot: React.FC<AtomAIChatBotProps> = ({ atomId, atomType, atomTitle, className, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      content: `Hi! I can help configure the "${atomTitle}" atom. Describe what you want to do.`,
      sender: 'ai',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const updateAtomSettings = useLaboratoryStore(state => state.updateAtomSettings);

  const handleSendMessage = async () => {
    const endpoint = ENDPOINTS[atomType];
    const performEndpoint = PERFORM_ENDPOINTS[atomType];
    if (!inputValue.trim() || !endpoint) return;

    const userMsg: Message = { id: Date.now().toString(), content: inputValue, sender: 'user', timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMsg.content }),
      });
      if (res.ok) {
        const data = await res.json();
        const aiText = data.message || data.response || data.final_response || 'AI response';
        const aiMsg: Message = { id: (Date.now() + 1).toString(), content: aiText, sender: 'ai', timestamp: new Date() };
        setMessages(prev => [...prev, aiMsg]);
        if (atomType === 'concat' && data.concat_json) {
          const cfg = data.concat_json;
          const file1 = Array.isArray(cfg.file1) ? cfg.file1[0] : cfg.file1;
          const file2 = Array.isArray(cfg.file2) ? cfg.file2[0] : cfg.file2;
          const direction = cfg.concat_direction || 'vertical';
          try {
            if (performEndpoint) {
              const res2 = await fetch(performEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  file1,
                  file2,
                  concat_direction: direction,
                }),
              });
              if (res2.ok) {
                const result = await res2.json();
                updateAtomSettings(atomId, {
                  file1,
                  file2,
                  direction,
                  concatResults: result,
                  concatId: result.concat_id,
                });
              } else {
                updateAtomSettings(atomId, { file1, file2, direction });
              }
            }
          } catch {
            updateAtomSettings(atomId, { file1, file2, direction });
          }
        } else if (atomType === 'merge' && data.merge_json) {
          const cfg = data.merge_json;
          const file1 = Array.isArray(cfg.file1) ? cfg.file1[0] : cfg.file1;
          const file2 = Array.isArray(cfg.file2) ? cfg.file2[0] : cfg.file2;
          const joinColumns = Array.isArray(cfg.join_columns)
            ? cfg.join_columns
            : [];
          const joinType = cfg.join_type || 'inner';
          try {
            if (performEndpoint) {
              const params = new URLSearchParams({
                file1,
                file2,
                bucket_name: cfg.bucket_name || 'trinity',
                join_columns: JSON.stringify(joinColumns),
                join_type: joinType,
              });
              const res2 = await fetch(performEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params,
              });
              if (res2.ok) {
                const result = await res2.json();
                updateAtomSettings(atomId, {
                  file1,
                  file2,
                  joinColumns,
                  joinType,
                  availableColumns: joinColumns,
                  mergeResults: {
                    ...result,
                    result_file: null,
                    unsaved_data: result.data,
                  },
                });
              } else {
                updateAtomSettings(atomId, {
                  file1,
                  file2,
                  joinColumns,
                  joinType,
                  availableColumns: joinColumns,
                });
              }
            }
          } catch {
            updateAtomSettings(atomId, {
              file1,
              file2,
              joinColumns,
              joinType,
              availableColumns: joinColumns,
            });
          }
        }
      } else {
        const aiMsg: Message = { id: (Date.now() + 1).toString(), content: 'Request failed', sender: 'ai', timestamp: new Date() };
        setMessages(prev => [...prev, aiMsg]);
      }
    } catch {
      const aiMsg: Message = { id: (Date.now() + 1).toString(), content: 'Could not reach AI service', sender: 'ai', timestamp: new Date() };
      setMessages(prev => [...prev, aiMsg]);
    }

    setIsLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={o => !disabled && setIsOpen(o)}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'p-1 hover:bg-gray-100 rounded',
            disabled ? 'cursor-not-allowed opacity-50' : '',
            className,
          )}
          title="Atom AI"
          disabled={disabled}
        >
          <Sparkles className={cn('w-3.5 h-3.5', disabled ? 'text-gray-300' : 'text-purple-500')} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 h-72 p-0 flex flex-col" align="start" side="bottom" sideOffset={8}>
        <div className="p-2 border-b border-gray-200 bg-white rounded-t-md flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MessageSquare className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-gray-800">{atomTitle} AI</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="h-6 w-6 p-0">
            <X className="w-3 h-3" />
          </Button>
        </div>
        <ScrollArea className="flex-1 p-2">
          <div className="space-y-2">
            {messages.map(m => (
              <div key={m.id} className={`flex items-start space-x-2 ${m.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${m.sender === 'ai' ? 'bg-purple-500' : 'bg-gray-600'}`}>
                  {m.sender === 'ai' ? <Bot className="w-3 h-3 text-white" /> : <User className="w-3 h-3 text-white" />}
                </div>
                <Card className={`p-2 text-sm ${m.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200'}`}>{m.content}</Card>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-start space-x-2">
                <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                  <Bot className="w-3 h-3 text-white" />
                </div>
                <Card className="p-2 bg-white border border-gray-200">
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </Card>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="p-2 border-t border-gray-200 bg-white rounded-b-md">
          <div className="flex space-x-2">
            <Textarea value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyPress={handleKeyPress} placeholder="Ask AI..." className="flex-1 resize-none h-8" />
            <Button onClick={handleSendMessage} disabled={!inputValue.trim() || isLoading} className="h-8 px-2 bg-blue-500 text-white">
              <Send className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default AtomAIChatBot;
