import { BarChart3 } from 'lucide-react';
import type { PaletteOperation } from '../../types';

interface ChartsOperationDeps {
  onOpenChartPanel?: () => void;
  canEdit?: boolean;
}

export const createChartsOperation = (deps: ChartsOperationDeps = {}): PaletteOperation => ({
  icon: BarChart3,
  label: 'Charts',
  onSelect: deps.canEdit === false ? undefined : deps.onOpenChartPanel,
  isDisabled: deps.canEdit === false || typeof deps.onOpenChartPanel !== 'function',
});
