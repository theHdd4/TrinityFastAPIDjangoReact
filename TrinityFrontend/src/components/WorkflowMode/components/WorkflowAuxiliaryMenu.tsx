import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SuperagentAIPanel, TrinityAIIcon } from '@/components/TrinityAI';

const WorkflowAuxiliaryMenu: React.FC = () => {
  const [isTrinityAIActive, setIsTrinityAIActive] = useState(false);

  const toggleTrinityAI = () => {
    setIsTrinityAIActive(previous => !previous);
  };

  return (
    <div className="relative z-50 flex h-full">
      {isTrinityAIActive && (
        <SuperagentAIPanel isCollapsed={false} onToggle={() => setIsTrinityAIActive(false)} />
      )}

      <div className="bg-background border-l border-border transition-all duration-300 flex flex-col h-full w-12 flex-shrink-0 items-center py-4">
        <div className="flex flex-col items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleTrinityAI}
            className={`w-9 h-9 rounded-lg hover:bg-muted transition-all group relative hover:scale-105 hover:shadow-lg flex items-center justify-center ${
              isTrinityAIActive ? 'bg-muted text-foreground' : ''
            }`}
            title="Trinity AI"
            aria-pressed={isTrinityAIActive}
            aria-label="Toggle Trinity AI"
          >
            <TrinityAIIcon className="text-purple-500" />
            <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
              Trinity AI
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WorkflowAuxiliaryMenu;

