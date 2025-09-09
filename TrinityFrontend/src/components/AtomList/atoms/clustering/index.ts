import type { Atom } from '@/components/AtomCategory/data/atomCategories';

const clustering: Atom = {
  id: 'clustering',
  title: 'Clustering',
  category: 'Machine Learning',              // ← was 'Data Processing'
  description: 'Cluster data points into groups based on similarity',
  tags: ['clustering', 'similarity', 'data', 'unsupervised', 'kmeans'],
  color: 'bg-orange-500'                     // ← matches Machine Learning section
};

export default clustering;

