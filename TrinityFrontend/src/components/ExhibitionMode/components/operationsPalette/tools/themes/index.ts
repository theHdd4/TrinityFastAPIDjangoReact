import { Palette } from 'lucide-react';
import type { PaletteOperation } from '../../types';

interface ThemeToolDeps {
  onOpenThemesPanel?: () => void;
  canEdit?: boolean;
}

export const createThemesTool = (deps: ThemeToolDeps = {}): PaletteOperation => ({
  icon: Palette,
  label: 'Themes',
  onSelect: deps.onOpenThemesPanel,
  isDisabled:
    deps.canEdit === false ||
    typeof deps.onOpenThemesPanel !== 'function',
});
