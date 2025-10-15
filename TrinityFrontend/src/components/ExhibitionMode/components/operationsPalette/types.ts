import type { LucideIcon } from 'lucide-react';

export interface PaletteOperation {
  icon: LucideIcon;
  label: string;
  colorClass?: string;
  onSelect?: () => void;
  isDisabled?: boolean;
}

export interface OperationFactoryDeps {
  onCreateTextBox?: () => void;
  onCreateTable?: () => void;
  canEdit?: boolean;
}
