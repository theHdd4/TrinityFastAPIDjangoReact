import React from 'react';
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';

interface StreamAIProgressTrackerProps {
  progress: any;
}

export const StreamAIProgressTracker: React.FC<StreamAIProgressTrackerProps> = ({ progress }) => {
  if (!progress) return null;

  const { type, total_atoms, completed_atoms, failed_atoms, atom_index, atom_id, step, total_steps } = progress;

  // Sequence start/complete
  if (type === 'sequence_start') {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-[#41C185]" />
        <span className="text-sm text-gray-700">
          Starting sequence execution ({total_atoms} atoms)...
        </span>
      </div>
    );
  }

  if (type === 'sequence_complete') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {failed_atoms > 0 ? (
            <XCircle className="w-5 h-5 text-red-500" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-[#41C185]" />
          )}
          <span className="text-sm font-semibold text-gray-900">
            Sequence Complete!
          </span>
        </div>
        <div className="text-xs text-gray-600">
          Completed: {completed_atoms}/{total_atoms} atoms
          {failed_atoms > 0 && <span className="text-red-500 ml-2">Failed: {failed_atoms}</span>}
        </div>
      </div>
    );
  }

  // Atom execution
  if (type === 'atom_start') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">
            Atom {atom_index}/{total_atoms}
          </span>
          <span className="text-xs text-gray-500">{atom_id}</span>
        </div>
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#458EE2]" />
          <span className="text-sm text-gray-700">Initializing...</span>
        </div>
        <ProgressBar current={atom_index - 1} total={total_atoms} />
      </div>
    );
  }

  // Step update
  if (type === 'step_update') {
    const stepDescriptions: Record<number, string> = {
      1: 'Creating laboratory card',
      2: 'Fetching atom',
      3: 'Executing atom'
    };

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">
            Atom {atom_index}/{total_atoms}: {atom_id}
          </span>
          <span className="text-xs text-gray-500">
            Step {step}/{total_steps}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#458EE2]" />
          <span className="text-sm text-gray-700">
            {stepDescriptions[step] || 'Processing...'}
          </span>
        </div>
        <ProgressBar current={atom_index - 1} total={total_atoms} />
      </div>
    );
  }

  return null;
};

interface ProgressBarProps {
  current: number;
  total: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ current, total }) => {
  const percentage = (current / total) * 100;

  return (
    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-[#41C185] to-[#458EE2] transition-all duration-300 ease-out"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
};

export default StreamAIProgressTracker;

