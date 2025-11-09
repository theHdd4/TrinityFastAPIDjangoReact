import type { LucideIcon } from 'lucide-react';

export interface StagingPaletteFeature {
  id: string;
  label: string;
  icon: LucideIcon;
  onActivate?: () => void;
  isDisabled?: boolean;
}
