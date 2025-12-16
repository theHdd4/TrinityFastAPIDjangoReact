import { TRINITY_AI_API } from '@/lib/api';
import { getAtomHandler, hasAtomData } from './index';
import { AtomHandlerContext } from './types';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

export interface CommandResult {
  isCommand: boolean;
  commandName?: string;
  commandArgs?: string;
  handler?: (args: string, context: CommandContext) => Promise<void>;
  indicatorColor?: string; // Color to show when command is active
}

export interface CommandContext {
  cardId?: string;
  setMessages: (updater: (prev: any[]) => any[]) => void;
  onAddAtom?: (cardId: string, atomName: string) => void;
}

// Atom type to endpoint mapping
const ATOM_ENDPOINTS: Record<string, string> = {
  'metric': `${TRINITY_AI_API}/metric`,
  'concat': `${TRINITY_AI_API}/concat`,
  'merge': `${TRINITY_AI_API}/merge`,
  'chart-maker': `${TRINITY_AI_API}/chart-maker`,
  'create-column': `${TRINITY_AI_API}/create-transform`,
  'groupby-wtg-avg': `${TRINITY_AI_API}/groupby`,
  'explore': `${TRINITY_AI_API}/explore`,
  'correlation': `${TRINITY_AI_API}/correlation`,
  'dataframe-operations': `${TRINITY_AI_API}/dataframe-operations`,
  'data-upload-validate': `${TRINITY_AI_API}/df-validate`,
};

// Atom type to display name mapping
const ATOM_DISPLAY_NAMES: Record<string, string> = {
  'metric': 'Metric',
  'concat': 'Concat',
  'merge': 'Merge',
  'chart-maker': 'Chart Maker',
  'create-column': 'Create Column',
  'groupby-wtg-avg': 'GroupBy',
  'explore': 'Explore',
  'correlation': 'Correlation',
  'dataframe-operations': 'DataFrame Operations',
  'data-upload-validate': 'Data Upload Validate',
};

/**
 * Generic handler for atom commands
 * Command handler's job: Ensure card/atom exists (except metricop), then call agent API
 * The existing handlers will process the response (same as individual AI icon)
 */
async function handleAtomCommand(atomType: string, args: string, context: CommandContext): Promise<void> {
  console.log(`🎯 /${atomType} command handler called - calling ${atomType} agent directly (no WebSocket)`);
  console.log('  - Args:', args);
  
  if (!args) {
    const displayName = ATOM_DISPLAY_NAMES[atomType] || atomType;
    context.setMessages(prev => [...prev, {
      id: Date.now().toString(),
      content: `Please provide a ${displayName.toLowerCase()} operation after /${atomType}. For example: /${atomType} <your operation description>`,
      sender: 'ai',
      timestamp: new Date()
    }]);
    return;
  }

  // STEP 1: For all atoms except metric, automatically create NEW card and atom for each command
  // Metric doesn't need a card/atom - it works differently
  let atomId: string | null = null;
  let targetCardId: string | undefined;
  
  if (atomType !== 'metric') {
    const { cards, setCards, updateCard } = useLaboratoryStore.getState();
    
    // Helper to generate unique ID
    const generateId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Always create a NEW card for each command execution
    targetCardId = generateId('card');
    const newCard = {
      id: targetCardId,
      atoms: [],
      isExhibited: false,
      variables: []
    };
    setCards([...cards, newCard]);
    console.log(`🔧 Auto-created new card: ${targetCardId}`);
    
    // Wait a bit for card to be added to store
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Create atom in the new card
    const newAtomId = generateId('atom');
    const displayName = ATOM_DISPLAY_NAMES[atomType] || atomType;
    const newAtom = {
      id: newAtomId,
      atomId: atomType,
      title: displayName,
      category: 'Atom',
      color: 'bg-gray-400',
      source: 'ai' as const,
      settings: {}
    };
    
    // Get updated cards and add atom to the new card
    const updatedCards = useLaboratoryStore.getState().cards;
    const createdCard = updatedCards.find(c => c.id === targetCardId);
    if (createdCard) {
      updateCard(targetCardId, {
        atoms: [...(Array.isArray(createdCard.atoms) ? createdCard.atoms : []), newAtom]
      });
      atomId = newAtomId;
      console.log(`🔧 Auto-created ${atomType} atom: ${atomId} in new card ${targetCardId}`);
    } else {
      // Retry if card not found yet
      await new Promise(resolve => setTimeout(resolve, 200));
      const retryCards = useLaboratoryStore.getState().cards;
      const retryCard = retryCards.find(c => c.id === targetCardId);
      if (retryCard) {
        updateCard(targetCardId, {
          atoms: [...(Array.isArray(retryCard.atoms) ? retryCard.atoms : []), newAtom]
        });
        atomId = newAtomId;
        console.log(`🔧 Auto-created ${atomType} atom: ${atomId} in new card ${targetCardId} (retry)`);
      }
    }
    
    // Verify atom was created
    if (!atomId) {
      console.error(`❌ Failed to create atom for ${atomType}`);
      context.setMessages(prev => [...prev, {
        id: Date.now().toString(),
        content: `Unable to create ${ATOM_DISPLAY_NAMES[atomType] || atomType} atom. Please try again.`,
        sender: 'ai',
        timestamp: new Date()
      }]);
      return;
    }
  }

  // STEP 2: Get environment context
  let envContext = { client_name: '', app_name: '', project_name: '' };
  try {
    const envStr = localStorage.getItem('env');
    if (envStr) {
      const env = JSON.parse(envStr);
      envContext = {
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      };
    }
  } catch (error) {
    console.warn('Failed to load environment context:', error);
  }

  // STEP 3: Call agent API (same as individual AI icon does)
  const endpoint = ATOM_ENDPOINTS[atomType];
  if (!endpoint) {
    context.setMessages(prev => [...prev, {
      id: Date.now().toString(),
      content: `No endpoint configured for ${atomType} agent.`,
      sender: 'ai',
      timestamp: new Date()
    }]);
    return;
  }

  console.log(`📞 Calling ${atomType} agent API:`, endpoint);
  console.log('  - Prompt:', args);
  
  const basePayload = {
    session_id: `${atomType}_${Date.now()}`,
    ...envContext
  };

  const requestPayload = atomType === 'dataframe-operations'
    ? { ...basePayload, query: args, prompt: args }
    : { ...basePayload, prompt: args };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(requestPayload)
  });

  if (!res.ok) {
    const errorText = await res.text();
    const displayName = ATOM_DISPLAY_NAMES[atomType] || atomType;
    context.setMessages(prev => [...prev, {
      id: Date.now().toString(),
      content: `${displayName} operation failed: ${errorText || 'Unknown error'}`,
      sender: 'ai',
      timestamp: new Date()
    }]);
    return;
  }

  const data = await res.json();
  console.log(`✅ ${atomType} API response received:`, data);

  // STEP 4: Process response using existing handlers (same as individual AI icon)
  // This is exactly what AtomAIChatBot does - let the handlers do their work
  const hasData = hasAtomData(atomType, data);
  
  if (hasData) {
    const handler = getAtomHandler(atomType);
    
    if (handler) {
      const updateAtomSettings = useLaboratoryStore.getState().updateAtomSettings;
      const sessionId = `${atomType}_${Date.now()}`;
      
      // For metric, use temp atomId if no atom exists (metric works without atom)
      const effectiveAtomId = atomId || (atomType === 'metric' ? `temp_metric_${Date.now()}` : null);
      
      if (!effectiveAtomId && atomType !== 'metric') {
        context.setMessages(prev => [...prev, {
          id: Date.now().toString(),
          content: `Unable to process ${ATOM_DISPLAY_NAMES[atomType] || atomType} operation: atom not found.`,
          sender: 'ai',
          timestamp: new Date()
        }]);
        return;
      }
      
      const handlerContext: AtomHandlerContext = {
        atomId: effectiveAtomId!,
        atomType,
        atomTitle: ATOM_DISPLAY_NAMES[atomType] || atomType,
        sessionId,
        updateAtomSettings,
        setMessages: context.setMessages,
        isStreamMode: false // Individual AI mode - same as AtomAIChatBot
      };

      // Call handler (same as individual AI icon does)
      try {
        if (data.success !== false) {
          await handler.handleSuccess(data, handlerContext);
        } else {
          await handler.handleFailure(data, handlerContext);
        }
      } catch (handlerError: any) {
        console.error('❌ Error in handler execution:', handlerError);
        const displayName = ATOM_DISPLAY_NAMES[atomType] || atomType;
        context.setMessages(prev => [...prev, {
          id: Date.now().toString(),
          content: `Error processing ${displayName.toLowerCase()} operation: ${handlerError?.message || 'Unknown error'}`,
          sender: 'ai',
          timestamp: new Date()
        }]);
      }
    } else {
      // No handler - show general response
      context.setMessages(prev => [...prev, {
        id: Date.now().toString(),
        content: data.smart_response || data.message || data.reasoning || 'Operation completed.',
        sender: 'ai',
        timestamp: new Date()
      }]);
    }
  } else {
    // No specific data - show general AI response
    context.setMessages(prev => [...prev, {
      id: Date.now().toString(),
      content: data.smart_response || data.message || data.reasoning || 'Operation completed.',
      sender: 'ai',
      timestamp: new Date()
    }]);
  }
}

/**
 * Command Registry - Add new commands here
 * Each command can have a handler function and visual indicator
 */
export const COMMAND_REGISTRY: Record<string, {
  handler: (args: string, context: CommandContext) => Promise<void>;
  indicatorColor: string;
  description: string;
}> = {
  'metricop': {
    handler: (args, context) => handleAtomCommand('metric', args, context),
    indicatorColor: '#458EE2', // Blue color
    description: 'Execute metric operations (variables, column ops, input)'
  },
  'concat': {
    handler: (args, context) => handleAtomCommand('concat', args, context),
    indicatorColor: '#458EE2',
    description: 'Concatenate multiple dataframes'
  },
  'merge': {
    handler: (args, context) => handleAtomCommand('merge', args, context),
    indicatorColor: '#458EE2',
    description: 'Merge dataframes with join operations'
  },
  'chartmaker': {
    handler: (args, context) => handleAtomCommand('chart-maker', args, context),
    indicatorColor: '#458EE2',
    description: 'Create charts and visualizations'
  },
  'createcolumn': {
    handler: (args, context) => handleAtomCommand('create-column', args, context),
    indicatorColor: '#458EE2',
    description: 'Create or transform columns'
  },
  'groupby': {
    handler: (args, context) => handleAtomCommand('groupby-wtg-avg', args, context),
    indicatorColor: '#458EE2',
    description: 'Group by operations with weighted averages'
  },
  'explore': {
    handler: (args, context) => handleAtomCommand('explore', args, context),
    indicatorColor: '#458EE2',
    description: 'Explore and analyze data'
  },
  'correlate': {
    handler: (args, context) => handleAtomCommand('correlation', args, context),
    indicatorColor: '#458EE2',
    description: 'Calculate correlations between variables'
  },
  'dataframeop': {
    handler: (args, context) => handleAtomCommand('dataframe-operations', args, context),
    indicatorColor: '#458EE2',
    description: 'Perform dataframe operations'
  },
  'validate': {
    handler: (args, context) => handleAtomCommand('data-upload-validate', args, context),
    indicatorColor: '#458EE2',
    description: 'Validate uploaded data'
  },
};

/**
 * Check if input is a command and return command info
 * Commands bypass WebSocket orchestration and call agents directly
 */
export function detectCommand(input: string): CommandResult {
  if (!input || typeof input !== 'string') {
    return { isCommand: false };
  }
  
  const trimmed = input.trim();
  if (!trimmed) {
    return { isCommand: false };
  }
  
  // Check if input starts with a command (e.g., /metricop)
  // Case-insensitive matching
  const lowerInput = trimmed.toLowerCase();
  
  for (const [commandName, commandConfig] of Object.entries(COMMAND_REGISTRY)) {
    const commandPrefix = `/${commandName.toLowerCase()}`;
    
    if (lowerInput.startsWith(commandPrefix)) {
      // Extract args (everything after the command)
      const args = trimmed.substring(commandPrefix.length).trim();
      return {
        isCommand: true,
        commandName,
        commandArgs: args,
        handler: commandConfig.handler,
        indicatorColor: commandConfig.indicatorColor
      };
    }
  }
  
  return { isCommand: false };
}


/**
 * Get available commands for autocomplete/help
 */
export function getAvailableCommands(): Array<{ name: string; description: string; color: string }> {
  return Object.entries(COMMAND_REGISTRY).map(([name, config]) => ({
    name: `/${name}`,
    description: config.description,
    color: config.indicatorColor
  }));
}

