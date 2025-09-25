import type { Atom } from '@/components/AtomCategory/data/atomCategories';
import EvaluateModelsAutoRegressiveAtom from './EvaluateModelsAutoRegressiveAtom';

const evaluateModelsAutoRegressive: Atom = {
  id: 'evaluate-models-auto-regressive',
  title: 'Evaluate models - Auto regressive',
  category: 'Machine Learning',
  description: 'Evaluate auto-regressive model performance',
  tags: ['evaluation', 'autoregressive', 'models'],
  color: 'bg-green-500'
};

export { EvaluateModelsAutoRegressiveAtom };
export default evaluateModelsAutoRegressive;
