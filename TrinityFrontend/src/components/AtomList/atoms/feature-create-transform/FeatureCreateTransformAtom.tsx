import React from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { Card } from '@/components/ui/card';
import { AtomAIChatBot } from '@/components/TrinityAI/AtomAIChatBot';

interface Props {
  atomId: string;
}

const FeatureCreateTransformAtom: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const settings = atom?.settings || {};

  return (
    <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col">
      <Card className="flex-1 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Feature Create & Transform</h3>
          <AtomAIChatBot 
            atomId={atomId}
            atomType="feature-create-transform"
            atomTitle="Feature Create & Transform"
            className="ml-2"
          />
        </div>
        
        <div className="space-y-4">
          {settings.result_file ? (
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-medium text-blue-800 mb-2">Transform Result</h4>
              <p className="text-sm text-blue-600">
                File: {settings.result_file}
              </p>
              {settings.row_count && (
                <p className="text-sm text-blue-600">
                  Rows: {settings.row_count}
                </p>
              )}
              {settings.columns && (
                <p className="text-sm text-blue-600">
                  Columns: {settings.columns.join(', ')}
                </p>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 p-6 rounded-lg text-center">
              <p className="text-gray-600 mb-4">
                Use the AI assistant to create new features or transform existing ones
              </p>
              <p className="text-sm text-gray-500">
                Example: "Create a new column 'total_price' by multiplying price and quantity"
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default FeatureCreateTransformAtom;