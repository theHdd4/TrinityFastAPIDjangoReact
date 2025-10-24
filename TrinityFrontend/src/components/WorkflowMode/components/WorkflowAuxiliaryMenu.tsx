import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { SuperagentAIPanel } from '@/components/TrinityAI';

const WorkflowAuxiliaryMenu: React.FC = () => {
  const [isTrinityAIActive, setIsTrinityAIActive] = useState(false);

  const toggleTrinityAI = () => {
    setIsTrinityAIActive(previous => !previous);
  };

  return (
    <div className="relative z-40 flex h-full">
      {isTrinityAIActive && (
        <SuperagentAIPanel isCollapsed={false} onToggle={() => setIsTrinityAIActive(false)} />
      )}

      <div className="bg-white border-l border-gray-200 transition-all duration-300 flex flex-col h-full w-12 flex-shrink-0">
        <div className="p-3 border-b border-gray-200 flex items-center justify-center">
          <button
            type="button"
            onClick={toggleTrinityAI}
            className={`w-9 h-9 rounded-lg hover:bg-muted transition-all group relative hover:scale-105 hover:shadow-lg flex items-center justify-center ${
              isTrinityAIActive ? 'bg-muted text-foreground' : ''
            }`}
            title="Trinity AI"
          >
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
              Trinity AI
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkflowAuxiliaryMenu;

