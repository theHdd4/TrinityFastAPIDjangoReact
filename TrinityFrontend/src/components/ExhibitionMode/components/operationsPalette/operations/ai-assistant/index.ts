import { Sparkles } from 'lucide-react';
import type { PaletteOperation } from '../../types';

export const createAiAssistantOperation = (): PaletteOperation => ({
  icon: Sparkles,
  label: 'Trinity AI',
  colorClass: 'text-purple-500',
});
