import { Sparkles } from 'lucide-react';
import type { PaletteOperation } from '../../types';

export const createAiAssistantOperation = (): PaletteOperation => ({
  icon: Sparkles,
  label: 'AI Assistant',
  colorClass: 'text-purple-500',
});
