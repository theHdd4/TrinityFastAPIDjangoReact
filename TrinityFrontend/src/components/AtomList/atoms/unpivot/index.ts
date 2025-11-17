import type { Atom } from '@/components/AtomCategory/data/atomCategories';

const unpivot: Atom = {
  id: 'unpivot',
  title: 'Unpivot',
  category: 'Business Intelligence',
  description: 'Transform wide datasets into long format by unpivoting columns into rows.',
  tags: ['unpivot', 'melt', 'reshape', 'data-transformation'],
  color: 'bg-emerald-500'
};

export default unpivot;
export { default as UnpivotAtom, UnpivotProperties } from './UnpivotAtom';
