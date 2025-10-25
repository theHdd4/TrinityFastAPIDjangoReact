import type { ComponentType } from 'react';

export interface PaletteOperation {
  icon: ComponentType<{ className?: string }>;
  label: string;
  colorClass?: string;
  onSelect?: () => void;
  isDisabled?: boolean;
}

export interface OperationFactoryDeps {
  onCreateTextBox?: () => void;
  onCreateTable?: () => void;
  onOpenShapesPanel?: () => void;
  onOpenImagesPanel?: () => void;
  canEdit?: boolean;
}
