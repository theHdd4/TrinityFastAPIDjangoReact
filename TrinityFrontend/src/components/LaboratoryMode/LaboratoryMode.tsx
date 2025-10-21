
import React, { useState, useEffect, useLayoutEffect, useRef, useInsertionEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Save, Share2, Undo2, List } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/Header';
import { atoms as allAtoms } from '@/components/AtomList/data';
import {
  sanitizeLabConfig,
  saveCurrentProject,
  persistLaboratoryConfig,
} from '@/utils/projectStorage';
import CanvasArea from './components/CanvasArea';
import AuxiliaryMenu from './components/AuxiliaryMenu';
import AuxiliaryMenuLeft from './components/AuxiliaryMenuLeft';
import FloatingNavigationList from './components/FloatingNavigationList';
import { REGISTRY_API, LAB_ACTIONS_API, LABORATORY_PROJECT_STATE_API } from '@/lib/api';
import { useLaboratoryStore, LayoutCard } from './store/laboratoryStore';
import { useAuth } from '@/contexts/AuthContext';
import { addNavigationItem, logSessionState } from '@/lib/session';
import {
  animateLabElementsIn,
  cleanupProjectTransition,
  prepareLabElements,
  prefersReducedMotion,
  LAB_PREP_CLASS,
  LAB_ENTRANCE_PREP_DELAY_MS,
} from '@/utils/projectTransition';
import { getActiveProjectContext } from '@/utils/projectEnv';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
const useIsomorphicInsertionEffect =
  typeof window !== 'undefined' && typeof useInsertionEffect === 'function'
    ? useInsertionEffect
    : useIsomorphicLayoutEffect;

const collectExhibitedCards = (cardList: unknown): LayoutCard[] => {
  if (!Array.isArray(cardList)) {
    return [];
  }

  return cardList.filter((card): card is LayoutCard => {
    if (!card || typeof card !== 'object') {
      return false;
    }

    const candidate = card as { id?: unknown; atoms?: unknown };
    if (typeof candidate.id !== 'string') {
      return false;
    }

    const atoms = Array.isArray(candidate.atoms) ? candidate.atoms : [];
    return atoms.some((atom: any) => {
      const selections = atom?.settings?.exhibitionSelections;
      return Array.isArray(selections) && selections.length > 0;
    });
  });
};

const LaboratoryMode = () => {
  const initialReduceMotion = useMemo(() => prefersReducedMotion(), []);
  const [selectedAtomId, setSelectedAtomId] = useState<string>();
  const [selectedCardId, setSelectedCardId] = useState<string>();
  const [showFloatingNavigationList, setShowFloatingNavigationList] = useState(true);
  const [auxActive, setAuxActive] = useState<'settings' | 'frames' | 'help' | 'superagent' | null>(null);
  const { toast } = useToast();
  const { cards, setCards: setLabCards } = useLaboratoryStore();
  const { hasPermission, user } = useAuth();
  const canEdit = hasPermission('laboratory:edit');
  const skipInitialLabCleanupRef = useRef(true);
  const reduceMotionRef = useRef(initialReduceMotion);
  const [isPreparingAnimation, setIsPreparingAnimation] = useState(!initialReduceMotion);

  useIsomorphicInsertionEffect(() => {
    const reduceMotion = prefersReducedMotion();
    reduceMotionRef.current = reduceMotion;
    if (reduceMotion) {
      setIsPreparingAnimation(false);
    }

    cleanupProjectTransition('laboratory', { preserveLabPrepClass: true });

    if (!reduceMotion && typeof document !== 'undefined') {
      document.body.classList.add(LAB_PREP_CLASS);
    }

    prepareLabElements();

    return () => {
      if (skipInitialLabCleanupRef.current) {
        skipInitialLabCleanupRef.current = false;
        return;
      }

      cleanupProjectTransition('laboratory');

      if (!reduceMotionRef.current && typeof document !== 'undefined') {
        document.body.classList.remove(LAB_PREP_CLASS);
      }
    };
  }, []);

  useIsomorphicLayoutEffect(() => {
    animateLabElementsIn();
    if (reduceMotionRef.current) {
      setIsPreparingAnimation(false);
    }
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    if (reduceMotionRef.current) {
      setIsPreparingAnimation(false);
      return;
    }

    const headerElement = document.querySelector('[data-lab-header]') as HTMLElement | null;

    let hasMarkedStart = false;

    const markAnimationStarted = () => {
      if (hasMarkedStart) {
        return;
      }
      hasMarkedStart = true;
      setIsPreparingAnimation(false);
    };

    const handleHeaderAnimationStart = (event: AnimationEvent) => {
      if (event.target !== headerElement) {
        return;
      }
      markAnimationStarted();
    };

    headerElement?.addEventListener('animationstart', handleHeaderAnimationStart);

    const startFallbackDelay = LAB_ENTRANCE_PREP_DELAY_MS + 100;
    const startFallback = window.setTimeout(markAnimationStarted, startFallbackDelay);

    return () => {
      headerElement?.removeEventListener('animationstart', handleHeaderAnimationStart);
      window.clearTimeout(startFallback);
    };
  }, []);

  useEffect(() => {
    if (localStorage.getItem('laboratory-config')) {
      console.log('Successfully Loaded Existing Project State');
      toast({ title: 'Successfully Loaded Existing Project State' });
    }
    
    // Hide navigation list when switching from workflow mode
    const hasWorkflowData = localStorage.getItem('workflow-data') || 
                           localStorage.getItem('workflow-selected-atoms') || 
                           localStorage.getItem('workflow-molecules');
    if (hasWorkflowData) {
      setShowFloatingNavigationList(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Note: Workflow data loading is now handled entirely by CanvasArea component
  // This prevents conflicts and ensures proper molecule container restoration

  const handleUndo = async () => {
    if (!canEdit) return;
    const current = localStorage.getItem('current-project');
    if (!current) return;
    try {
      const proj = JSON.parse(current);
      const res = await fetch(`${LAB_ACTIONS_API}/?project=${proj.id}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const last = Array.isArray(data) ? data[0] : data.results?.[0];
        if (last && last.state) {
          setLabCards(last.state);
          const labConfig = {
            cards: last.state,
            exhibitedCards: collectExhibitedCards(last.state || []),
            timestamp: new Date().toISOString(),
          };
          const sanitized = sanitizeLabConfig(labConfig);
          await fetch(`${REGISTRY_API}/projects/${proj.id}/`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: { laboratory_config: sanitized } }),
          }).catch(() => {});

          const storageSuccess = persistLaboratoryConfig(sanitized);
          if (!storageSuccess) {
            console.warn('Storage quota exceeded while caching undo state.');
            toast({
              title: 'Storage Limit Reached',
              description:
                'We updated your configuration, but local caching failed due to storage limits. Clear your browser storage to continue working offline.',
              variant: 'destructive',
            });
          }

          await fetch(`${LAB_ACTIONS_API}/${last.id}/`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
          toast({ title: 'Undo', description: 'Last change reverted' });
        }
      }
    } catch (error) {
      console.error('Undo error:', error);
      toast({
        title: 'Undo Failed',
        description: 'Failed to undo. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleAtomDragStart = (e: React.DragEvent, atomId: string) => {
    if (!canEdit) return;
    const atomData = { id: atomId };
    e.dataTransfer.setData('application/json', JSON.stringify(atomData));
  };

  const handleAtomSelect = (atomId: string) => {
    if (!canEdit) return;
    setSelectedAtomId(atomId);
    setSelectedCardId(undefined);
  };

  const handleCardSelect = (cardId: string) => {
    if (!canEdit) return;
    setSelectedAtomId(undefined);
    setSelectedCardId(cardId);
  };

  const toggleSettingsPanel = () => {
    if (!canEdit) return;
    setAuxActive(prev => (prev === 'settings' ? null : 'settings'));
  };

  const toggleHelpPanel = () => {
    if (!canEdit) return;
    setAuxActive(prev => (prev === 'help' ? null : 'help'));
  };

  const handleSave = async () => {
    if (!canEdit) return;
    try {
      const exhibitedCards = collectExhibitedCards(cards);

      // Save the current laboratory configuration
      const labConfig = {
        cards,
        exhibitedCards,
        timestamp: new Date().toISOString(),
      };
      const sanitized = sanitizeLabConfig(labConfig);

      const projectContext = getActiveProjectContext();
      if (projectContext) {
        try {
          const response = await fetch(`${LABORATORY_PROJECT_STATE_API}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              client_id: projectContext.client_name,
              app_id: projectContext.app_name,
              project_id: projectContext.project_name,
              state: { laboratory_config: sanitized },
            }),
          });
          if (!response.ok && response.status !== 404) {
            console.warn('Laboratory project state sync failed', response.status);
          }
        } catch (stateError) {
          console.warn('Failed to persist laboratory project state', stateError);
        }
      }

      const current = localStorage.getItem('current-project');
      if (current) {
        try {
          const proj = JSON.parse(current);
          await fetch(`${REGISTRY_API}/projects/${proj.id}/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              state: { laboratory_config: sanitized },
            }),
          });
          proj.state = { ...(proj.state || {}), laboratory_config: sanitized };
          saveCurrentProject(proj);
        } catch (apiError) {
          console.error('API error during save:', apiError);
          // Don't show error for API failures, just log them
        }
      }

      const storageSuccess = persistLaboratoryConfig(sanitized);
      if (storageSuccess) {
        toast({
          title: 'Configuration Saved',
          description: `Laboratory configuration saved successfully. ${exhibitedCards.length} card(s) marked for exhibition.`,
        });
      } else {
        toast({
          title: 'Storage Limit Reached',
          description:
            'We saved your configuration, but local caching failed due to storage limits. Clear your browser storage to continue working offline.',
          variant: 'destructive',
        });
      }
      const allAtoms = cards.flatMap(card =>
        card.atoms.map(atom => ({
          id: atom.id,
          title: atom.title,
          category: atom.category,
          color: atom.color,
          cardId: card.id,
        }))
      );
      addNavigationItem(user?.id, { atom: 'laboratory-save', atoms: allAtoms });
      logSessionState(user?.id);
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Save Error",
        description: "Failed to save configuration. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div
      data-lab-preparing={isPreparingAnimation ? 'true' : undefined}
      className="h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col"
    >
      <Header />
      
      {/* Laboratory Header */}
      <div
        data-lab-header="true"
        className="bg-white/80 backdrop-blur-sm border-b border-gray-200/60 px-6 py-6 flex-shrink-0 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <div data-lab-header-text="true">
            <h2 className="text-3xl font-light text-gray-900 mb-2">Laboratory Mode</h2>
            <p className="text-gray-600 font-light">Build sophisticated applications with modular atoms</p>
          </div>

          <div data-lab-toolbar="true" className="flex items-center space-x-3">
            <Button
              variant="outline"
              size="sm"
              className={`border-gray-200 text-gray-700 font-medium ${canEdit ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
              onClick={handleUndo}
              disabled={!canEdit}
            >
              <Undo2 className="w-4 h-4 mr-2" />
              Undo
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`border-gray-200 text-gray-700 font-medium ${canEdit ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
              onClick={handleSave}
              disabled={!canEdit}
              data-lab-save="true"
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`border-gray-200 text-gray-700 font-medium ${canEdit ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
              onClick={() => canEdit && setShowFloatingNavigationList(!showFloatingNavigationList)}
              disabled={!canEdit}
            >
              <List className="w-4 h-4 mr-2" />
              {showFloatingNavigationList ? 'Hide' : 'Show'} Navigation List
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`border-gray-200 text-gray-700 font-medium ${canEdit ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
              disabled={!canEdit}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
            <Button
              className={`bg-gradient-to-r from-[#41C185] to-[#3ba876] text-white shadow-lg font-medium ${canEdit ? 'hover:from-[#3ba876] to-[#339966]' : 'opacity-50 cursor-not-allowed'}`}
              disabled={!canEdit}
            >
              <Play className="w-4 h-4 mr-2" />
              Run Pipeline
            </Button>
          </div>
        </div>
      </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Atoms Sidebar */}
          <div data-lab-sidebar="true" className={`${canEdit ? '' : 'cursor-not-allowed'} h-full`}>
            <AuxiliaryMenuLeft onAtomDragStart={handleAtomDragStart} />
          </div>

          {/* Main Canvas Area */}
          <div
            data-lab-canvas="true"
            className={`flex-1 p-6 ${canEdit ? '' : 'cursor-not-allowed'}`}
            onClick={
              canEdit
                ? () => {
                    setSelectedAtomId(undefined);
                    setSelectedCardId(undefined);
                  }
                : undefined
            }
          >
            <CanvasArea
              onAtomSelect={handleAtomSelect}
              onCardSelect={handleCardSelect}
              selectedCardId={selectedCardId}
              onToggleSettingsPanel={toggleSettingsPanel}
              onToggleHelpPanel={toggleHelpPanel}
              canEdit={canEdit}
            />
          </div>

          {/* Auxiliary menu */}
          <div data-lab-settings="true" className={`${canEdit ? '' : 'cursor-not-allowed'} h-full`}>
            <AuxiliaryMenu
              selectedAtomId={selectedAtomId}
              selectedCardId={selectedCardId}
              active={auxActive}
              onActiveChange={setAuxActive}
            />
            <FloatingNavigationList
              isVisible={showFloatingNavigationList}
              onClose={() => setShowFloatingNavigationList(false)}
              anchorSelector="[data-lab-header-text]"
            />
          </div>
        </div>
    </div>
  );
};

export default LaboratoryMode;