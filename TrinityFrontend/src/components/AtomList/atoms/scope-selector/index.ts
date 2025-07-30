import type { Atom } from '@/components/AtomCategory/data/atomCategories';

import ScopeSelectorAtom, { ScopeSelectorProperties } from './ScopeSelectorAtom';

const scopeSelector: Atom = {
  id: 'scope-selector',
  title: 'Scope Selector',
  category: 'Data Processing',
  description: 'Select specific scope or subset of data',
  tags: ['scope', 'selection', 'filter'],
  color: 'bg-green-500',
  component: ScopeSelectorAtom,
  properties: ScopeSelectorProperties
};

export default scopeSelector;
