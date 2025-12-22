import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useLaboratoryScenario } from '../hooks/useLaboratoryScenario';
import { EmptyStateCard } from './EmptyStateCard';
import { PartialPrimedCard } from './PartialPrimedCard';

interface LandingScreenAtomProps {
  atomId: string;
  cardId: string;
  onReplaceAtom: (newAtomId: string) => void;
  onAddNewCard?: () => void;
}

/**
 * LandingScreenAtom - Displays landing screen based on project state.
 * Case 1 (No files): Shows DataUploadAtom
 * Case 2 (Files uploaded): Shows split panel with saved dataframes and upload area
 */
export const LandingScreenAtom: React.FC<LandingScreenAtomProps> = ({ 
  atomId,
  cardId,
  onAddNewCard,
}) => {
  const scenarioData = useLaboratoryScenario();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimeoutRef = useRef<number | null>(null);

  // Listen for dataframe-saved events to show loading screen during transition
  useEffect(() => {
    const handleDataframeSaved = () => {
      // Show loading screen when files are uploaded (we're likely transitioning from A to B)
      console.log('[LandingScreenAtom] Files uploaded, showing loading screen for transition...');
      setIsTransitioning(true);
      
      // Clear any existing timeout
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
      
      // Auto-hide loading after max 3 seconds (should update much sooner via scenario change)
      transitionTimeoutRef.current = setTimeout(() => {
        console.log('[LandingScreenAtom] Timeout reached, hiding loading screen');
        setIsTransitioning(false);
      }, 3000);
    };

    window.addEventListener('dataframe-saved', handleDataframeSaved);
    return () => {
      window.removeEventListener('dataframe-saved', handleDataframeSaved);
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  // Hide loading when scenario changes from A to B/C/D
  useEffect(() => {
    if (isTransitioning && scenarioData.scenario !== 'A' && scenarioData.scenario !== 'loading') {
      console.log('[LandingScreenAtom] Scenario updated to', scenarioData.scenario, '- hiding loading screen');
      setIsTransitioning(false);
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
    }
  }, [scenarioData.scenario, isTransitioning]);

  // Case 1: No files uploaded - show simple upload interface
  if (scenarioData.scenario === 'A' || scenarioData.scenario === 'loading') {
    return (
      <div className="relative w-full h-full">
        <EmptyStateCard cardId={cardId} atomId={atomId} />
        {/* Loading overlay when transitioning from A to B */}
        {isTransitioning && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
              <div className="text-center">
                <p className="text-base font-semibold text-gray-800">Processing uploaded files...</p>
                <p className="text-sm text-gray-600 mt-1">Preparing your data for priming</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Case 2: Files uploaded - priming UI is now owned by the Upload atom.
  // We no longer render the separate landing card here to avoid duplication.
  return null;
};


