import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, X, Bot, User, Sparkles, RotateCcw, Clock, Settings, Paperclip, Mic, Plus, Trash2, MessageCircle } from 'lucide-react';
import { TRINITY_AI_API } from '@/lib/api';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
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
}

const SuperagentAIPanel: React.FC<SuperagentAIPanelProps> = ({ isCollapsed, onToggle }) => {
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
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: data.response || 'I received your message but couldn\'t generate a proper response.',
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


  // Don't return null when collapsed - preserve state
  if (isCollapsed) {
    return null;
  }

  return (
    <div className="h-full bg-white border-l border-gray-200 flex flex-col relative" style={{ width: `${panelWidth}px` }}>
      {/* Resize Handle */}
      <div
        ref={resizeRef}
        onMouseDown={handleMouseDown}
        className="absolute left-0 top-0 w-1 h-full bg-gray-300 hover:bg-gray-400 cursor-col-resize transition-colors duration-200 z-50"
        style={{ marginLeft: '-2px' }}
      />
      {/* Chat History Sidebar */}
      {showChatHistory && (
        <div className="absolute left-0 top-0 w-64 h-full bg-white border-r border-gray-200 z-50 flex flex-col shadow-xl">
          <div className="p-4 border-b border-gray-200 bg-[#F5F5F5]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-black font-inter">Chat History</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowChatHistory(false)}
                className="h-6 w-6 p-0 hover:bg-black/10 text-black"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <ScrollArea className="flex-1 p-2 bg-white">
            <div className="space-y-2">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => switchToChat(chat.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                    chat.id === currentChatId
                      ? 'bg-[#F5F5F5] text-black shadow-md border border-gray-300'
                      : 'bg-gray-50 hover:bg-[#F5F5F5] hover:text-black'
                  }`}
                >
                  <div className="text-sm font-medium truncate font-inter">{chat.title}</div>
                  <div className={`text-xs mt-1 ${
                    chat.id === currentChatId ? 'text-black/70' : 'text-gray-600'
                  }`}>
                    {chat.messages.length - 1} messages
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
      {/* Header */}
      <div className={`p-4 border-b border-gray-200 bg-[#F5F5F5] text-black relative overflow-hidden ${showChatHistory ? 'z-40' : 'z-10'}`}>
        {/* Elegant background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-black via-transparent to-black"></div>
        </div>
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#333333] to-[#1a1a1a] rounded-full flex items-center justify-center shadow-lg relative overflow-hidden">
              {/* Background pattern */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#FFBD59]/20 to-transparent rounded-full"></div>
              {/* Trinity Icon - Three overlapping circles */}
              <div className="relative w-5 h-5 z-10">
                <div className="absolute top-1 left-1 w-2 h-2 bg-white rounded-full opacity-80"></div>
                <div className="absolute top-1 right-1 w-2 h-2 bg-white rounded-full opacity-80"></div>
                <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-white rounded-full opacity-80"></div>
                {/* Center connecting element */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-[#FFBD59] rounded-full"></div>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold font-inter text-black">Trinity AI</h3>
              <p className="text-sm text-black font-inter font-medium">Intelligent Assistant</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={deleteCurrentChat}
              className="h-8 w-8 p-0 hover:bg-black/10 text-black transition-colors"
              title="Delete Chat"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={startNewChat}
              className="h-8 w-8 p-0 hover:bg-black/10 text-black transition-colors"
              title="New Chat"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
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
               <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg ${
                 message.sender === 'ai' 
                   ? 'bg-[#41C185]' 
                   : 'bg-[#458EE2]'
               }`}>
                 {message.sender === 'ai' ? (
                   <Bot className="w-4 h-4 text-white" />
                 ) : (
                   <User className="w-4 h-4 text-white" />
                 )}
               </div>
         <div className="flex-1">
           <Card className={`p-3 max-w-[280px] shadow-lg ${
             message.sender === 'user'
               ? 'bg-[#458EE2] text-white border border-[#458EE2]/30'
               : 'bg-[#41C185] text-white border border-[#41C185]/20'
           }`}>
             <div
               className="text-sm leading-relaxed prose prose-sm max-w-none font-inter"
               dangerouslySetInnerHTML={{
                 __html: message.content.replace(/\n/g, '<br>')
               }}
             />
             <p className={`text-xs mt-2 font-inter ${
               message.sender === 'user' ? 'text-blue-100' : 'text-green-100'
             }`}>
               {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
             </p>
           </Card>
         </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-full bg-[#41C185] flex items-center justify-center shadow-lg">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <Card className="p-3 bg-[#41C185] border border-[#41C185]/20 shadow-lg">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </Card>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Action Icons */}
      <div className="p-4 border-t border-gray-200 bg-[#F5F5F5]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowChatHistory(!showChatHistory)}
              className="h-8 w-8 p-0 hover:bg-black/10 text-black transition-colors"
              title="Chat History"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-black/10 text-black transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-black/10 text-black transition-colors"
              title="Attach"
            >
              <Paperclip className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-black/10 text-black transition-colors"
              title="Voice Input"
            >
              <Mic className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={startNewChat}
              className="h-8 w-8 p-0 hover:bg-black/10 text-black transition-colors"
              title="New Chat"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-black/10 text-black transition-colors"
              title="Help"
            >
              <MessageCircle className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Input Area */}
        <div className="flex space-x-2">
          <Textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask anything..."
            className="flex-1 min-h-[40px] resize-none bg-white border-gray-300 focus:border-black focus:ring-black font-inter text-black placeholder-gray-500 shadow-sm"
            disabled={isLoading}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="bg-[#F5F5F5] hover:bg-gray-400 text-black h-[40px] px-4 font-inter font-semibold shadow-lg transition-all duration-200 border border-gray-300"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SuperagentAIPanel;
