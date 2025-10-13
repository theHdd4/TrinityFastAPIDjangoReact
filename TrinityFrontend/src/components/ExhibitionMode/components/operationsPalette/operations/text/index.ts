import { Type } from 'lucide-react';
import type { PaletteOperation, OperationFactoryDeps } from '../../types';

export const createTextOperation = (deps: OperationFactoryDeps): PaletteOperation => ({
  icon: Type,
  label: 'Text',
  onSelect: deps.onCreateTextBox,
  isDisabled: deps.canEdit === false,
});
