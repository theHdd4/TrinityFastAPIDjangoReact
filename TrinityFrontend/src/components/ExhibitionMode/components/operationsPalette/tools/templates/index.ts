import { FileText } from 'lucide-react';
import type { PaletteOperation, OperationFactoryDeps } from '../../types';

interface TemplatesToolDeps extends Pick<OperationFactoryDeps, 'onOpenTemplatesPanel' | 'canEdit'> {}

export const createTemplatesTool = (deps: TemplatesToolDeps = {}): PaletteOperation => ({
  icon: FileText,
  label: 'Templates',
  onSelect: deps.onOpenTemplatesPanel,
  isDisabled: deps.canEdit === false || typeof deps.onOpenTemplatesPanel !== 'function',
});
