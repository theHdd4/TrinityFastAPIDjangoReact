import React from 'react';
import { Button } from '@/components/ui/button';
import { BarChart, Database, MessageSquare } from 'lucide-react';

interface ChatSuggestionsProps {
  onSuggestionClick: (suggestion: string) => void;
}

const suggestions = [
  {
    category: 'Data Processing',
    icon: Database,
    items: [
      'Add data validation',
      'Create data transformations',
      'Set up data connections'
    ]
  },
  {
    category: 'Analytics',
    icon: BarChart,
    items: [
      'Add charts and visualizations',
      'Create statistical analysis',
      'Build reporting features'
    ]
  }
];

const ChatSuggestions: React.FC<ChatSuggestionsProps> = ({ onSuggestionClick }) => {
  return (
    <div className="space-y-4">
      {suggestions.map((category) => {
        const IconComponent = category.icon;
        return (
          <div key={category.category}>
            <div className="flex items-center space-x-2 mb-2">
              <IconComponent className="w-4 h-4 text-gray-600" />
              <h4 className="text-sm font-medium text-gray-900">{category.category}</h4>
            </div>
            <div className="space-y-1">
              {category.items.map((item) => (
                <Button
                  key={item}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-left h-auto py-2 px-3 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => onSuggestionClick(item)}
                >
                  <span className="flex items-center space-x-2">
                    <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                    <span>{item}</span>
                  </span>
                  <span className="ml-auto text-xs text-gray-400">⌘</span>
                </Button>
              ))}
            </div>
          </div>
        );
      })}
      
      <div className="pt-2 border-t border-gray-200">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center bg-blue-50 hover:bg-blue-100 text-blue-600 font-medium"
          onClick={() => onSuggestionClick('Chat with AI')}
        >
          <MessageSquare className="w-4 h-4 mr-2" />
          Chat with AI
        </Button>
      </div>
    </div>
  );
};

export default ChatSuggestions;
