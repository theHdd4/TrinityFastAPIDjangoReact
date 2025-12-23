import React from 'react';
import { useGroupByGuidedFlow } from './useGroupByGuidedFlow';

interface G4PreviewProps {
  flow: ReturnType<typeof useGroupByGuidedFlow>;
  readOnly?: boolean;
}

function G4Preview({ flow, readOnly }: G4PreviewProps) {
    return (
      <div>
        <p className="text-gray-700">
          Preview your group by results before finalizing the operation.
        </p>
        {readOnly && <p className="text-sm text-gray-500 mt-2">This stage has been completed.</p>}
      </div>
    );
  }
  
  export default G4Preview;
  