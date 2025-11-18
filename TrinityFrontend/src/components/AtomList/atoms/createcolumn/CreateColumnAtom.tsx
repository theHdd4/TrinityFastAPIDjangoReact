
import React from 'react';
import { Card } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import CreateColumnCanvas from './components/CreateColumnCanvas';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Operation {
  id: string;
  type: 'add' | 'subtract' | 'multiply' | 'divide' | 'dummy' | 'rpi' | 'datetime';
  name: string;
  columns?: string[];
  newColumnName: string;
}

interface CreateColumnAtomProps {
  atomId: string;
}

const CreateColumnAtom: React.FC<CreateColumnAtomProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  // 🔧 CRITICAL FIX: Ensure operations is always an array, even if undefined
  const operations: Operation[] = React.useMemo(() => {
    const ops = atom?.settings?.operations;
    if (Array.isArray(ops) && ops.length > 0) {
      return ops as Operation[];
    }
    return [];
  }, [atom?.settings?.operations]);
  const [sampleData] = React.useState([
    { id: 1, name: 'Product A', price: 100, quantity: 5, category: 'Electronics' },
    { id: 2, name: 'Product B', price: 200, quantity: 3, category: 'Clothing' },
    { id: 3, name: 'Product C', price: 150, quantity: 8, category: 'Electronics' },
    { id: 4, name: 'Product D', price: 75, quantity: 12, category: 'Books' },
    { id: 5, name: 'Product E', price: 300, quantity: 2, category: 'Electronics' }
  ]);

  const handleOperationsChange = (newOperations: Operation[]) => {
    updateSettings(atomId, { operations: newOperations });
  };

  return (
    <div className="w-full h-full bg-white rounded-lg border border-gray-200">
      {/* Removed the heading and subheading as requested */}
      <div className="p-4 h-full">
        <CreateColumnCanvas 
          atomId={atomId}
          operations={operations}
          sampleData={sampleData}
          onOperationsChange={handleOperationsChange}
        />
      </div>
    </div>
  );
};

export default CreateColumnAtom;