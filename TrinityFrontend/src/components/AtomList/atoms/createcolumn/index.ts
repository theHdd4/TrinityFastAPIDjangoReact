
import { Plus } from 'lucide-react';
import CreateColumnAtom from './CreateColumnAtom';
import CreateColumnProperties from './components/properties/CreateColumnProperties';

export default {
  id: 'create-column',
  title: 'Create and Transform Columns',
  category: 'Data Processing',
  description: 'Create or Transform new columns using arithmetic operations on dataframe columns',
  tags: ['feature', 'transform', 'create'],
  color: 'bg-green-500',
  icon: Plus,
  component: CreateColumnAtom,
  properties: CreateColumnProperties
};