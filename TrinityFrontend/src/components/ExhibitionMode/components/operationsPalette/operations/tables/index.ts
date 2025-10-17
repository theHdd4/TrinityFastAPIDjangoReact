import { Table } from 'lucide-react';
import type { PaletteOperation, OperationFactoryDeps } from '../../types';

export const createTablesOperation = (deps: OperationFactoryDeps): PaletteOperation => ({
  icon: Table,
  label: 'Tables',
  onSelect: deps.onCreateTable,
  isDisabled: deps.canEdit === false || typeof deps.onCreateTable !== 'function',
});
