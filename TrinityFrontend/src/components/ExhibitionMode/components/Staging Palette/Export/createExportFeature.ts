import { Download } from 'lucide-react';
import type { StagingPaletteFeature } from '../types';

interface CreateExportFeatureOptions {
  onActivate?: () => void;
  isDisabled?: boolean;
}

export const createExportFeature = ({
  onActivate,
  isDisabled = false,
}: CreateExportFeatureOptions = {}): StagingPaletteFeature => ({
  id: 'export',
  label: 'Export',
  icon: Download,
  onActivate,
  isDisabled,
});
