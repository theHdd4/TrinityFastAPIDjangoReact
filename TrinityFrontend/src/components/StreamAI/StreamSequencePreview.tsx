import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, ChevronRight, Clock } from 'lucide-react';

interface StreamSequencePreviewProps {
  sequence: any;
  onExecute: () => void;
  isExecuting: boolean;
}

export const StreamSequencePreview: React.FC<StreamSequencePreviewProps> = ({
  sequence,
  onExecute,
  isExecuting
}) => {
  if (!sequence || !sequence.sequence) return null;

  const atoms = sequence.sequence || [];
  const totalAtoms = sequence.total_atoms || atoms.length;
  const estimatedDuration = sequence.estimated_duration || 'unknown';

  return (
    <Card className="border border-gray-200 bg-white shadow-sm">
      <div className="p-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">
            Sequence Preview ({totalAtoms} atoms)
          </h3>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3 h-3" />
            <span>{estimatedDuration}</span>
          </div>
        </div>

        <div className="space-y-2 mb-3">
          {atoms.map((atom: any, index: number) => (
            <div
              key={atom.step || index}
              className="flex items-start gap-2 p-2 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[#458EE2] text-white text-xs font-semibold flex-shrink-0">
                {atom.step || index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {atom.atom_id}
                  </span>
                  {index < atoms.length - 1 && (
                    <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-0.5">{atom.purpose}</p>
                {atom.inputs && atom.inputs.length > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-[10px] text-gray-500">Input:</span>
                    <span className="text-[10px] text-[#41C185] font-mono">
                      {atom.inputs.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {sequence.reasoning && (
          <div className="mb-3 p-2 bg-blue-50 border border-blue-100 rounded-md">
            <p className="text-xs text-blue-900">
              <span className="font-semibold">Reasoning: </span>
              {sequence.reasoning}
            </p>
          </div>
        )}

        <Button
          onClick={onExecute}
          disabled={isExecuting}
          className="w-full bg-[#41C185] hover:bg-[#3AB077] text-white"
          size="sm"
        >
          <Play className="w-4 h-4 mr-2" />
          {isExecuting ? 'Executing...' : 'Execute Sequence'}
        </Button>
      </div>
    </Card>
  );
};

export default StreamSequencePreview;

