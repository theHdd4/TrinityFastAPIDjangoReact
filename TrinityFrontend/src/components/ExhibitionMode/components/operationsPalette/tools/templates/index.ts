import { FileText } from 'lucide-react';
import type { PaletteOperation } from '../../types';

export const createTemplatesTool = (): PaletteOperation => ({
  icon: FileText,
  label: 'Templates',
});
