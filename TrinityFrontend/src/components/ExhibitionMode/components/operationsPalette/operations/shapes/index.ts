import { Shapes } from 'lucide-react';
import type { PaletteOperation, OperationFactoryDeps } from '../../types';

export const createShapesOperation = (deps: OperationFactoryDeps): PaletteOperation => ({
  icon: Shapes,
  label: 'Shapes',
  onSelect: deps.onOpenShapesPanel,
  isDisabled: deps.canEdit === false || typeof deps.onOpenShapesPanel !== 'function',
});
