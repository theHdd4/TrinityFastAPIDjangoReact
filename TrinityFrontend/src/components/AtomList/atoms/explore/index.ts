import type { Atom } from '@/components/AtomCategory/data/atomCategories';
import ExploreAtom from './ExploreAtom';

const explore: Atom = {
  id: 'explore',
  title: 'Explore',
  category: 'Visualization',
  description: 'Create interactive charts and graphs from your data with customizable dimensions and measures',
  tags: ['explore', 'visualization', 'charts', 'graphs', 'analytics'],
  color: 'bg-pink-500',
  component: ExploreAtom
};

export default explore;