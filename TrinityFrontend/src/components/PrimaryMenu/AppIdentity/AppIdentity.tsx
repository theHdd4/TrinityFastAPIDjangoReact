import React from 'react';
import BackToAppsIcon from '../TrinityAssets/BackToAppsIcon';

interface AppIdentityProps {
  projectName: string | null;
  onGoBack: () => void;
}

const AppIdentity: React.FC<AppIdentityProps> = ({ projectName, onGoBack }) => (
  <>
    {projectName && (
      <div className="flex items-center space-x-2 text-sm text-gray-600">
        <span>{projectName}</span>
        <button
          type="button"
          onClick={onGoBack}
          className="p-2 text-black"
          title="Go back to projects menu"
        >
          <BackToAppsIcon className="w-5 h-5" />
        </button>
      </div>
    )}
  </>
);

export default AppIdentity;
