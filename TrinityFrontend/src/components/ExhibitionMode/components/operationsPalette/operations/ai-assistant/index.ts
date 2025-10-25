import type { PaletteOperation } from '../../types';
import { TrinityAIIcon } from '@/components/TrinityAI';

export const createAiAssistantOperation = (): PaletteOperation => ({
  icon: TrinityAIIcon,
  label: 'Trinity AI',
  colorClass: 'text-purple-500',
});
