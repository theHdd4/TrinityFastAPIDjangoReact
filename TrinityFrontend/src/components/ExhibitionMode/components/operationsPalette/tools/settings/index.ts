import { Settings } from 'lucide-react';
import type { PaletteOperation } from '../../types';

export { SettingsPanel } from './SettingsPanel';

interface SettingsToolDeps {
  onOpenSettingsPanel?: () => void;
  canEdit?: boolean;
}

export const createSettingsTool = (deps: SettingsToolDeps = {}): PaletteOperation => ({
  icon: Settings,
  label: 'Settings',
  onSelect: deps.onOpenSettingsPanel,
  isDisabled: deps.canEdit === false || typeof deps.onOpenSettingsPanel !== 'function',
});
