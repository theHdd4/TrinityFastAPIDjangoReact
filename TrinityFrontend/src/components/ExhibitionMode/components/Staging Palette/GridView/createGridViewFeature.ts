import { Layers } from 'lucide-react';
import type { StagingPaletteFeature } from '../types';

interface CreateGridViewFeatureOptions {
  onActivate?: () => void;
  isDisabled?: boolean;
}

export const createGridViewFeature = ({
  onActivate,
  isDisabled = false,
}: CreateGridViewFeatureOptions = {}): StagingPaletteFeature => ({
  id: 'grid-view',
  label: 'Grid View',
  icon: Layers,
  onActivate,
  isDisabled,
});
