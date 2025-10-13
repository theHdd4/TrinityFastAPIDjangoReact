import { Image } from 'lucide-react';
import type { PaletteOperation } from '../../types';

export const createImagesOperation = (): PaletteOperation => ({
  icon: Image,
  label: 'Images',
});
