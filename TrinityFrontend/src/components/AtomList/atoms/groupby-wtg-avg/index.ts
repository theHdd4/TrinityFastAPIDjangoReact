import type { Atom } from '@/components/AtomCategory/data/atomCategories';
import GroupByAtom, { GroupByProperties } from './GroupByAtom';

const groupbyWtgAvg: Atom = {
  id: 'groupby-wtg-avg',
  title: 'GroupBy with Wtg Avg',
  category: 'Data Processing',
  description: 'Group data and calculate weighted averages',
  tags: ['groupby', 'weighted', 'average'],
  color: 'bg-green-500',
  component: GroupByAtom,
  properties: GroupByProperties,
};

export default groupbyWtgAvg;
