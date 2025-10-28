import { Image } from 'lucide-react';
import type { PaletteOperation, OperationFactoryDeps } from '../../types';

export const createImagesOperation = (deps: OperationFactoryDeps): PaletteOperation => ({
  icon: Image,
  label: 'Images',
  onSelect: deps.onOpenImagesPanel,
  isDisabled: deps.canEdit === false,
});
