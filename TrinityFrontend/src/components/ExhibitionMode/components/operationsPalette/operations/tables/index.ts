import { Table } from 'lucide-react';
import type { PaletteOperation } from '../../types';

export const createTablesOperation = (): PaletteOperation => ({
  icon: Table,
  label: 'Tables',
});
