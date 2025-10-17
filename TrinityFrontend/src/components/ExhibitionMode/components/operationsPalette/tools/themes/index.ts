import { Palette } from 'lucide-react';
import type { PaletteOperation } from '../../types';

export const createThemesTool = (): PaletteOperation => ({
  icon: Palette,
  label: 'Themes',
});
