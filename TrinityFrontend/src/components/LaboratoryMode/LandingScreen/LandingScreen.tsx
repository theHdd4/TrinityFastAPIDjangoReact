import React from 'react';
import { Loader2 } from 'lucide-react';
import { useLaboratoryScenario } from '../hooks/useLaboratoryScenario';
import { EmptyStateCard } from './EmptyStateCard';
import { PartialPrimedCard } from './PartialPrimedCard';
import { AllPrimedCard } from './AllPrimedCard';

export const LandingScreen: React.FC = () => {
  const scenarioData = useLaboratoryScenario();

  // Show loading state
  if (scenarioData.scenario === 'loading') {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm text-gray-500">Loading project status...</p>
        </div>
      </div>
    );
  }

  // Calculate counts
  const primedCount = scenarioData.primedFiles.length;
  const unprimedCount = scenarioData.unprimedFiles.length;
  const inProgressCount = scenarioData.inProgressFiles.length;
  const totalUnprimed = unprimedCount + inProgressCount;

  // State mapping:
  // 'A' (no files) -> EmptyStateCard
  // 'B' (partial primed) -> PartialPrimedCard
  // 'C' or 'D' (all primed) -> AllPrimedCard
  if (scenarioData.scenario === 'A') {
    // No files uploaded
    return <EmptyStateCard />;
  }

  if (scenarioData.scenario === 'B') {
    // Partial data primed (mixed state)
    return (
      <PartialPrimedCard
        files={scenarioData.files}
        primingStatuses={scenarioData.primingStatuses}
        primedCount={primedCount}
        unprimedCount={totalUnprimed}
        inProgressCount={inProgressCount}
      />
    );
  }

  // Scenario 'C' or 'D' - All data primed (ready state)
  // Note: 'C' might indicate saved flow state exists, 'D' indicates all files primed
  return (
    <AllPrimedCard
      files={scenarioData.files}
      primingStatuses={scenarioData.primingStatuses}
      primedCount={primedCount}
      unprimedCount={0}
      inProgressCount={0}
    />
  );
};


