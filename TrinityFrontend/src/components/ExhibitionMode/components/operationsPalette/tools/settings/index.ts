import { Settings } from 'lucide-react';
import type { PaletteOperation } from '../../types';

export const createSettingsTool = (): PaletteOperation => ({
  icon: Settings,
  label: 'Settings',
});
