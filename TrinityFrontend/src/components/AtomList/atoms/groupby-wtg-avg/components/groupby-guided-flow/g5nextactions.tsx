import React from 'react';
import { useGroupByGuidedFlow } from './useGroupByGuidedFlow';

interface G5NextActionsProps {
  flow: ReturnType<typeof useGroupByGuidedFlow>;
  readOnly?: boolean;
}

function G5NextActions({ flow, readOnly }: G5NextActionsProps) {
    return (
      <div>
        <p className="text-gray-700">
          Review your completed group by operation and choose your next steps.
        </p>
        {readOnly && <p className="text-sm text-gray-500 mt-2">This stage has been completed.</p>}
      </div>
    );
  }
  
  export default G5NextActions;
  