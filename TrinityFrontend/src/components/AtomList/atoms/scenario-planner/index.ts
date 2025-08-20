import type { Atom } from '@/components/AtomCategory/data/atomCategories';
import ScenarioPlannerAtom from './ScenarioPlannerAtom';

const scenarioPlanner: Atom = {
  id: 'scenario-planner',
  title: 'Scenario Planner - Forecasting',
  category: 'Planning & Optimization',
  description: 'Plan and analyze different forecasting scenarios with dynamic identifier combinations',
  tags: ['scenario', 'planning', 'forecasting', 'analysis'],
  color: 'bg-indigo-500',
  component: ScenarioPlannerAtom
};

export default scenarioPlanner;
