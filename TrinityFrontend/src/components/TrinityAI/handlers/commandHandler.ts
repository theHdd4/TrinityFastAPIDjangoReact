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
    handler: handleMetricOp,
    indicatorColor: '#458EE2', // Blue color
    description: 'Execute metric operations (variables, column ops, input)'
  },
  // Add more commands here in the future
  // 'mergeop': { handler: handleMergeOp, indicatorColor: '#41C185', description: '...' },
  // 'correlate': { handler: handleCorrelate, indicatorColor: '#FFBD59', description: '...' },
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
 * Handle /metricop command
 * This directly calls the metric agent API - NO WebSocket orchestration
 */
async function handleMetricOp(args: string, context: CommandContext): Promise<void> {
  console.log('🎯 /metricop command handler called - calling metric agent directly (no WebSocket)');
  console.log('  - Args:', args);
  
  if (!args) {
    context.setMessages(prev => [...prev, {
      id: Date.now().toString(),
      content: 'Please provide a metric operation after /metricop. For example: /metricop create a price variable by dividing SalesValue by Volume',
      sender: 'ai',
      timestamp: new Date()
    }]);
    return;
  }

  // Get environment context
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

  // DIRECT API CALL to metric agent - NO WebSocket orchestration
  console.log('📞 Calling metric agent API directly:', `${TRINITY_AI_API}/metric`);
  console.log('  - Prompt:', args);
  console.log('  - Env context:', envContext);
  
  const res = await fetch(`${TRINITY_AI_API}/metric`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      prompt: args,
      session_id: `metric_${Date.now()}`,
      ...envContext
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    context.setMessages(prev => [...prev, {
      id: Date.now().toString(),
      content: `Metric operation failed: ${errorText || 'Unknown error'}`,
      sender: 'ai',
      timestamp: new Date()
    }]);
    return;
  }

  const data = await res.json();
  
  console.log('✅ Metric API response received:', data);
  console.log('📊 Response structure:', {
    success: data.success,
    hasData: !!data.data,
    hasOperationType: !!(data.operation_type || data.data?.operation_type),
    hasOperationConfig: !!(data.operation_config || data.data?.operation_config),
    topLevelKeys: Object.keys(data || {})
  });
  
  // Find metric atom in any card (or use first card if context.cardId provided)
  const cards = useLaboratoryStore.getState().cards;
  let metricAtomId: string | null = null;
  let targetCardId: string | undefined = context.cardId;

  // First, try to find existing metric atom in the specified card or any card
  for (const card of cards) {
    if (context.cardId && card.id !== context.cardId) continue;
    
    if (Array.isArray(card.atoms)) {
      const metricAtom = card.atoms.find(atom => atom.atomId === 'metric');
      if (metricAtom) {
        metricAtomId = metricAtom.id;
        targetCardId = card.id;
        break;
      }
    }
  }

  // If no metric atom found and we have a card, try to add one via callback
  if (!metricAtomId && context.onAddAtom && targetCardId) {
    context.onAddAtom(targetCardId, 'metric');
    // Wait a bit and find the newly created atom
    await new Promise(resolve => setTimeout(resolve, 500));
    const updatedCards = useLaboratoryStore.getState().cards;
    const targetCard = updatedCards.find(c => c.id === targetCardId);
    if (targetCard && Array.isArray(targetCard.atoms)) {
      const newMetricAtom = targetCard.atoms.find(atom => atom.atomId === 'metric');
      metricAtomId = newMetricAtom?.id || null;
    }
  }

  // Follow the exact same flow as Atom_ai_chat.tsx
  const atomType = 'metric';
  
  // Check if response has metric data (same as Atom_ai_chat)
  const hasData = hasAtomData(atomType, data);
  console.log('🔍 hasAtomData check for metric:', hasData);
  console.log('🔍 metricAtomId:', metricAtomId);
  
  // CRITICAL FIX: Call handler even if no metric atom exists
  // The handler can still process the response and show messages in chat
  if (hasData) {
    console.log('✅ hasData is true - proceeding to get handler');
    // Get handler from registry (same as Atom_ai_chat)
    const handler = getAtomHandler(atomType);
    console.log('🔍 Handler retrieved:', {
      hasHandler: !!handler,
      handlerType: typeof handler,
      hasHandleSuccess: handler ? typeof handler.handleSuccess === 'function' : false,
      hasHandleFailure: handler ? typeof handler.handleFailure === 'function' : false
    });
    
    if (handler) {
      console.log('✅ Handler found, preparing to call...');
      // Create handler context (same as Atom_ai_chat)
      const updateAtomSettings = useLaboratoryStore.getState().updateAtomSettings;
      const sessionId = `metric_${Date.now()}`;
      
      // Use a temporary atomId if no metric atom exists
      // The handler will still process the response and show messages
      const effectiveAtomId = metricAtomId || `temp_metric_${Date.now()}`;
      
      console.log('📋 Preparing to call handler with:', {
        effectiveAtomId,
        hasMetricAtom: !!metricAtomId,
        hasData,
        dataSuccess: data.success !== false
      });
      
      const handlerContext: AtomHandlerContext = {
        atomId: effectiveAtomId,
        atomType: 'metric',
        atomTitle: 'Metric',
        sessionId,
        updateAtomSettings,
        setMessages: context.setMessages,
        isStreamMode: false
      };

      // Call handler (same as Atom_ai_chat)
      try {
        console.log('📋 About to call handler with data structure:', {
          hasData: !!data,
          hasDataData: !!data.data,
          success: data.success,
          operationType: data.operation_type || data.data?.operation_type,
          hasOperationConfig: !!(data.operation_config || data.data?.operation_config)
        });
        
        if (data.success !== false) {
          console.log('📋 Calling handler.handleSuccess...');
          console.log('📋 Handler context:', {
            atomId: handlerContext.atomId,
            atomType: handlerContext.atomType,
            hasSetMessages: typeof handlerContext.setMessages === 'function',
            hasUpdateAtomSettings: typeof handlerContext.updateAtomSettings === 'function'
          });
          
          const handlerResult = await handler.handleSuccess(data, handlerContext);
          console.log('✅ Handler.handleSuccess completed with result:', handlerResult);
          
          if (handlerResult && handlerResult.success === false) {
            console.error('⚠️ Handler returned failure:', handlerResult.error);
            context.setMessages(prev => [...prev, {
              id: Date.now().toString(),
              content: `Metric operation failed: ${handlerResult.error || 'Unknown error'}`,
              sender: 'ai',
              timestamp: new Date()
            }]);
          }
        } else {
          console.log('📋 Calling handler.handleFailure...');
          const handlerResult = await handler.handleFailure(data, handlerContext);
          console.log('✅ Handler.handleFailure completed with result:', handlerResult);
        }
      } catch (handlerError: any) {
        console.error('❌ Error in handler execution:', handlerError);
        console.error('❌ Error stack:', handlerError?.stack);
        context.setMessages(prev => [...prev, {
          id: Date.now().toString(),
          content: `Error processing metric operation: ${handlerError?.message || 'Unknown error'}`,
          sender: 'ai',
          timestamp: new Date()
        }]);
      }
    } else {
      // Fallback if no handler found
      console.warn('⚠️ No handler found for metric');
      context.setMessages(prev => [...prev, {
        id: Date.now().toString(),
        content: data.smart_response || data.message || data.reasoning || 'Metric operation completed, but handler not found.',
        sender: 'ai',
        timestamp: new Date()
      }]);
    }
  } else {
    // No metric-specific data - show general AI response
    console.log('⚠️ No metric data detected in response, showing general message');
    context.setMessages(prev => [...prev, {
      id: Date.now().toString(),
      content: data.smart_response || data.message || data.reasoning || data.data?.reasoning || 'Metric operation completed, but no specific data to process.',
      sender: 'ai',
      timestamp: new Date()
    }]);
  }
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

