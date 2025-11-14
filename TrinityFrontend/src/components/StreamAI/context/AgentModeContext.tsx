import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

interface AgentModeContextValue {
  isAgentMode: boolean;
  setAgentMode: (value: boolean) => void;
  toggleAgentMode: () => void;
}

const AgentModeContext = createContext<AgentModeContextValue | undefined>(undefined);
const STORAGE_KEY = 'trinity-ai-agent-mode';

export const AgentModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAgentMode, setIsAgentMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, isAgentMode ? 'true' : 'false');
    } catch {
      /* ignore storage errors */
    }
  }, [isAgentMode]);

  const value = useMemo(
    () => ({
      isAgentMode,
      setAgentMode: setIsAgentMode,
      toggleAgentMode: () => setIsAgentMode(prev => !prev),
    }),
    [isAgentMode]
  );

  return <AgentModeContext.Provider value={value}>{children}</AgentModeContext.Provider>;
};

export const useAgentMode = (): AgentModeContextValue => {
  const context = useContext(AgentModeContext);
  if (!context) {
    throw new Error('useAgentMode must be used within an AgentModeProvider');
  }
  return context;
};


