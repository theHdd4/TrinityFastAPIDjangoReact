import { atomCategories } from '../../AtomCategory/data/atomCategories';

export interface Atom {
  id: string;
  title: string;
  category: string;
  description: string;
  tags: string[];
  color: string;
}

// Flatten categories into a single list of atoms for easy access
export const atoms: Atom[] = atomCategories.flatMap(cat => cat.atoms);
