
import React, { useState, useEffect, useLayoutEffect, useRef, useInsertionEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
// import { Play, Save, Share2, Undo2, List, Wifi, WifiOff } from 'lucide-react';
import { Play, Save, Share2, Undo2, List, Wifi, WifiOff, ChevronUp, ChevronDown, BarChart3, LayoutDashboard } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/Header';
import { atoms as allAtoms } from '@/components/AtomList/data';
import {
  sanitizeLabConfig,
  saveCurrentProject,
  persistLaboratoryConfig,
  getWorkflowMoleculesKey,
  getWorkflowSelectedAtomsKey,
  getWorkflowDataKey,
} from '@/utils/projectStorage';
import CanvasArea, { CanvasAreaRef } from './components/CanvasArea';
import AuxiliaryMenu from './components/AuxiliaryMenu';
import AuxiliaryMenuLeft from './components/AuxiliaryMenuLeft';
import FloatingNavigationList from './components/FloatingNavigationList';
import { useExhibitionStore } from '@/components/ExhibitionMode/store/exhibitionStore';
import { REGISTRY_API, LAB_ACTIONS_API, LABORATORY_PROJECT_STATE_API } from '@/lib/api';
import { useLaboratoryStore, LayoutCard, DASHBOARD_ALLOWED_ATOMS } from './store/laboratoryStore';
import { useAuth } from '@/contexts/AuthContext';
import { addNavigationItem, logSessionState } from '@/lib/session';
import { DashboardShareDialog } from './components/DashboardShareDialog';
import { getActiveProjectContext, type ProjectContext } from '@/utils/projectEnv';
import {
  animateLabElementsIn,
  cleanupProjectTransition,
  prepareLabElements,
  prefersReducedMotion,
  LAB_PREP_CLASS,
  LAB_ENTRANCE_PREP_DELAY_MS,
} from '@/utils/projectTransition';
import { useCollaborativeSync } from '@/hooks/useCollaborativeSync';
import { TrinityAIPanel } from '@/components/TrinityAI';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
const useIsomorphicInsertionEffect =
  typeof window !== 'undefined' && typeof useInsertionEffect === 'function'
    ? useInsertionEffect
    : useIsomorphicLayoutEffect;

const LaboratoryMode = () => {
  const initialReduceMotion = useMemo(() => prefersReducedMotion(), []);
  const [selectedAtomId, setSelectedAtomId] = useState<string>();
  const [selectedCardId, setSelectedCardId] = useState<string>();
  const [cardExhibited, setCardExhibited] = useState<boolean>(false);
  const [showFloatingNavigationList, setShowFloatingNavigationList] = useState(false);
  const [auxActive, setAuxActive] = useState<'settings' | 'frames' | 'help' | 'trinity' | 'exhibition' | null>('frames');
  const [isExhibitionOpen, setIsExhibitionOpen] = useState<boolean>(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isHeaderMinimized, setIsHeaderMinimized] = useState(false);
  const [isTrinityAIVisible, setIsTrinityAIVisible] = useState(true); // Track if AI panel should be visible at all
  const [isHorizontalAICollapsed, setIsHorizontalAICollapsed] = useState(false); // Track collapse state for horizontal view only
  // Layout preference: 'vertical' (default) or 'horizontal'
  const [trinityAILayout, setTrinityAILayout] = useState<'vertical' | 'horizontal'>(() => {
    const saved = localStorage.getItem('trinity_ai_layout_preference');
    return (saved === 'horizontal' || saved === 'vertical') ? saved : 'vertical';
  });

  // Listen for layout preference changes (from settings panel)
  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem('trinity_ai_layout_preference');
      const newLayout = (saved === 'horizontal' || saved === 'vertical') ? saved : 'vertical';
      setTrinityAILayout(newLayout);
    };

    // Listen to custom event for same-tab updates
    const handleCustomStorageChange = () => handleStorageChange();
    window.addEventListener('trinity_ai_layout_changed', handleCustomStorageChange);

    // Listen to storage events for cross-tab updates
    window.addEventListener('storage', (e) => {
      if (e.key === 'trinity_ai_layout_preference') {
        handleStorageChange();
      }
    });

    return () => {
      window.removeEventListener('trinity_ai_layout_changed', handleCustomStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);
  const [projectContext, setProjectContext] = useState<ProjectContext | null>(() => getActiveProjectContext());
  const [autosaveEnabled, setAutosaveEnabled] = useState(true); // Default to true, will be loaded from MongoDB
  const { toast } = useToast();
  const { cards, setCards: setLabCards, auxiliaryMenuLeftOpen, subMode, setSubMode } = useLaboratoryStore();
  const setExhibitionCards = useExhibitionStore(state => state.setCards);
  const { hasPermission, user } = useAuth();
  const canEdit = hasPermission('laboratory:edit');
  const skipInitialLabCleanupRef = useRef(true);
  const reduceMotionRef = useRef(initialReduceMotion);
  const [isPreparingAnimation, setIsPreparingAnimation] = useState(!initialReduceMotion);
  // Ref for CanvasArea to access sync function
  const canvasAreaRef = useRef<CanvasAreaRef>(null);
  // Ref to track if initial cards have been loaded (to prevent autosave on initial load)
  const hasInitialCardsLoadedRef = useRef(false);

  // Real-time collaborative sync
  const { isConnected: isSyncConnected, activeUsers, cardEditors, notifyCardFocus, notifyCardBlur } = useCollaborativeSync({
    enabled: canEdit && autosaveEnabled, // Only enable for users with edit permissions and when autosave is enabled
    debounceMs: 2000, // 2 seconds debounce
    fullSyncIntervalMs: 30000, // 30 seconds full sync
    onError: (error) => {
      console.error('[CollaborativeSync] Error:', error);
    },
    onConnected: () => {
      console.log('[CollaborativeSync] Connected to real-time sync');
    },
    onDisconnected: () => {
      console.log('[CollaborativeSync] Disconnected from real-time sync');
    },
    onUsersChanged: (users) => {
      console.log('[CollaborativeSync] Active users:', users);
    },
  });

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

  // Load subMode from URL query param on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get('mode');
    if (modeParam === 'dashboard' || modeParam === 'analytics') {
      setSubMode(modeParam);
    } else {
      // Check localStorage for saved mode
      const savedMode = localStorage.getItem('laboratory-submode');
      if (savedMode === 'dashboard' || savedMode === 'analytics') {
        setSubMode(savedMode);
      }
    }
  }, [setSubMode]);

  // Persist subMode to localStorage and URL when it changes
  useEffect(() => {
    localStorage.setItem('laboratory-submode', subMode);
    const url = new URL(window.location.href);
    url.searchParams.set('mode', subMode);
    window.history.replaceState({}, '', url.toString());
  }, [subMode]);

  useEffect(() => {
    if (isShareOpen) {
      setProjectContext(getActiveProjectContext());
    }
  }, [isShareOpen]);

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

    // Hide navigation list when switching from workflow mode (check both mode-specific and legacy shared keys for migration)
    const hasWorkflowData = localStorage.getItem(getWorkflowDataKey(subMode)) ||
      localStorage.getItem('workflow-data') || // Legacy key for migration
      localStorage.getItem(getWorkflowSelectedAtomsKey(subMode)) ||
      localStorage.getItem('workflow-selected-atoms') || // Legacy key for migration
      localStorage.getItem(getWorkflowMoleculesKey(subMode)) ||
      localStorage.getItem('workflow-molecules'); // Legacy key for migration
    if (hasWorkflowData) {
      setShowFloatingNavigationList(false);
    }

    // Load autosaveEnabled from MongoDB
    const loadAutosaveEnabled = async () => {
      const projectContext = getActiveProjectContext();
      if (!projectContext) return;

      try {
        const requestUrl = `${LABORATORY_PROJECT_STATE_API}/get/${projectContext.client_name}/${projectContext.app_name}/${projectContext.project_name}`;
        const response = await fetch(requestUrl, {
          method: 'GET',
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          if (data.status === 'ok' && data.autosaveEnabled !== undefined) {
            setAutosaveEnabled(data.autosaveEnabled);
            console.info('[Laboratory API] Restored autosaveEnabled:', data.autosaveEnabled);
          }
        }
      } catch (error) {
        console.warn('[Laboratory API] Failed to load autosaveEnabled, using default:', error);
      }
    };

    loadAutosaveEnabled();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Note: Workflow data loading is now handled entirely by CanvasArea component
  // This prevents conflicts and ensures proper molecule container restoration

  // Function to sort cards in workflow order using order field (grid approach)
  // Uses the same logic as buildUnifiedRenderArray to ensure consistency
  // order = (moleculeIndex * 1000) + subOrder
  const sortCardsInWorkflowOrder = (cardsToSort: LayoutCard[], workflowMolecules: any[]): LayoutCard[] => {
    if (!workflowMolecules || workflowMolecules.length === 0) {
      // No workflow molecules - sort by order field if available
      return [...cardsToSort].sort((a, b) => {
        const orderA = typeof a.order === 'number' ? a.order : Infinity;
        const orderB = typeof b.order === 'number' ? b.order : Infinity;
        return orderA - orderB;
      });
    }

    const sortedCards: LayoutCard[] = [];

    // Separate cards into workflow and standalone
    const workflowCards = cardsToSort.filter(card => card.moleculeId);
    const standaloneCards = cardsToSort.filter(card => !card.moleculeId);

    // Create a map of moleculeId to moleculeIndex for quick lookup
    const moleculeIndexMap = new Map<string, number>();
    workflowMolecules.forEach((molecule, index) => {
      moleculeIndexMap.set(molecule.moleculeId, index);
    });

    // Process each molecule and its associated cards
    workflowMolecules.forEach((molecule, moleculeIndex) => {
      // Add all workflow cards for this molecule first (maintain their relative order)
      const moleculeCards = workflowCards
        .filter(card => card.moleculeId === molecule.moleculeId)
        .sort((a, b) => {
          // Maintain original order within molecule
          const indexA = cardsToSort.findIndex(c => c.id === a.id);
          const indexB = cardsToSort.findIndex(c => c.id === b.id);
          return indexA - indexB;
        });
      sortedCards.push(...moleculeCards);

      // Find standalone cards that should appear after this molecule
      // Based on order field: order = (moleculeIndex * 1000) + subOrder
      const cardsAfterThisMolecule = standaloneCards.filter(card => {
        if (card.order !== undefined && typeof card.order === 'number') {
          const cardMoleculeIndex = Math.floor(card.order / 1000);
          return cardMoleculeIndex === moleculeIndex;
        }
        return false;
      });

      // Sort standalone cards by subOrder
      cardsAfterThisMolecule.sort((a, b) => {
        const subOrderA = a.order !== undefined ? a.order % 1000 : 0;
        const subOrderB = b.order !== undefined ? b.order % 1000 : 0;
        return subOrderA - subOrderB;
      });

      // Add standalone cards that appear after this molecule (between molecules)
      sortedCards.push(...cardsAfterThisMolecule);
    });

    // Add standalone cards that should appear after the last molecule (orphans)
    const placedStandaloneIds = new Set(sortedCards.map(c => c.id));
    const orphanCards = standaloneCards.filter(card => !placedStandaloneIds.has(card.id));
    sortedCards.push(...orphanCards);

    // Add any remaining workflow cards that weren't in any molecule (shouldn't happen, but safety check)
    const allProcessedIds = new Set(sortedCards.map(c => c.id));
    const remaining = cardsToSort.filter(c => !allProcessedIds.has(c.id));
    sortedCards.push(...remaining);

    return sortedCards;
  };

  // Autosave: Automatically save and sync when cards or auxiliaryMenuLeftOpen change
  useEffect(() => {
    if (!canEdit || !autosaveEnabled) return;

    const hasInitialCards = cards && cards.length > 0;

    // Skip autosave on initial load (wait for cards to be loaded)
    // But allow autosave for auxiliaryMenuLeftOpen changes even if no cards
    if (!hasInitialCards) {
      // Mark that we've checked and there are no cards yet
      if (!hasInitialCardsLoadedRef.current) {
        hasInitialCardsLoadedRef.current = true;
        // Skip autosave on the very first load (when there are no cards)
        return;
      }
      // After initial load, allow autosave even without cards (for auxiliaryMenuLeftOpen changes)
    } else {
      // Mark that initial cards have been loaded
      if (!hasInitialCardsLoadedRef.current) {
        hasInitialCardsLoadedRef.current = true;
        // Skip autosave on the very first load (when cards are first loaded)
        return;
      }
    }

    // Debounce autosave to avoid too frequent saves
    const autosaveTimer = setTimeout(async () => {
      console.log('🔄 [AUTOSAVE] Triggering autosave...');

      try {
        const exhibitedCards = (cards || []).filter(card => card.isExhibited);
        setExhibitionCards(cards);

        // Get workflow molecules to sort cards correctly (mode-specific)
        const storedWorkflowMolecules = localStorage.getItem(getWorkflowMoleculesKey(subMode));
        let workflowMolecules: any[] = [];
        if (storedWorkflowMolecules) {
          try {
            workflowMolecules = JSON.parse(storedWorkflowMolecules);
          } catch (e) {
            console.warn('[AUTOSAVE] Failed to parse workflow molecules for sorting', e);
          }
        }

        // CRITICAL FIX: Filter cards before saving to ensure mode-specific data separation
        let cardsToSave = cards || [];
        if (subMode === 'dashboard') {
          // Dashboard mode: Filter out any analytics-only atoms before saving
          const allowedAtomIdsSet = new Set(DASHBOARD_ALLOWED_ATOMS);
          cardsToSave = cardsToSave.map(card => {
            const allowedAtoms = (card.atoms || []).filter(atom => 
              allowedAtomIdsSet.has(atom.atomId as any)
            );
            return {
              ...card,
              atoms: allowedAtoms
            };
          }).filter(card => (card.atoms || []).length > 0); // Remove cards with no allowed atoms
          
          if (cardsToSave.length !== cards.length) {
            console.warn(`[AUTOSAVE] Filtered out ${cards.length - cardsToSave.length} card(s) with non-dashboard atoms before saving to MongoDB`);
          }
        }
        // Analytics mode: Save all cards (no filtering needed)

        // Sort cards in workflow order before saving
        const sortedCards = workflowMolecules.length > 0
          ? sortCardsInWorkflowOrder(cardsToSave, workflowMolecules)
          : cardsToSave;

        // Save the current laboratory configuration with sorted cards
        const labConfig = {
          cards: sortedCards,
          exhibitedCards,
          timestamp: new Date().toISOString(),
        };
        const sanitized = sanitizeLabConfig(labConfig);

        const projectContext = getActiveProjectContext();
        if (projectContext) {
          const requestUrl = `${LABORATORY_PROJECT_STATE_API}/save`;
          const mode = subMode === 'analytics' ? 'laboratory' : 'laboratory-dashboard';
          
          console.log('🔍 [DIAGNOSIS] ========== AUTOSAVE START ==========');
          console.log('🔍 [DIAGNOSIS] Autosave details:', {
            subMode,
            mode,
            cardsCount: sanitized.cards?.length || 0,
            workflowMoleculesCount: workflowMoleculesForSave.length,
            cardAtomIds: sanitized.cards?.map((c: any) => c.atoms?.map((a: any) => a.atomId)).flat() || [],
            timestamp: new Date().toISOString()
          });
          
          const payload = {
            client_name: projectContext.client_name,
            app_name: projectContext.app_name,
            project_name: projectContext.project_name,
            cards: sanitized.cards || [],
            workflow_molecules: workflowMoleculesForSave,
            auxiliaryMenuLeftOpen: auxiliaryMenuLeftOpen ?? true,
            autosaveEnabled: autosaveEnabled,
            mode: mode,
          };

          console.log('🔍 [DIAGNOSIS] Payload being sent to MongoDB:', {
            mode: payload.mode,
            cardsCount: payload.cards.length,
            cardDetails: payload.cards.map((c: any) => ({
              id: c.id,
              atoms: c.atoms?.map((a: any) => ({ atomId: a.atomId, title: a.title })) || []
            }))
          });
          console.log('🔄 [AUTOSAVE] Saving with auxiliaryMenuLeftOpen:', auxiliaryMenuLeftOpen ?? true);

          try {
            const response = await fetch(requestUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(payload),
            });
            if (!response.ok) {
              const errorText = await response.text();
              console.error('🔍 [DIAGNOSIS] ❌ [AUTOSAVE] Failed to persist configuration', {
                status: response.status,
                error: errorText,
                mode,
                subMode
              });
            } else {
              const responseData = await response.json().catch(() => ({}));
              console.log('🔍 [DIAGNOSIS] ✅ [AUTOSAVE] Configuration saved successfully', {
                mode,
                subMode,
                cardsCount: payload.cards.length,
                response: responseData
              });
              console.log('🔍 [DIAGNOSIS] ========== AUTOSAVE COMPLETE ==========');
            }
          } catch (apiError) {
            console.error('[AUTOSAVE] Error while saving configuration', apiError);
          }
        }

        // Save to localStorage
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
            console.error('[AUTOSAVE] API error during save:', apiError);
          }
        }

        persistLaboratoryConfig(sanitized, subMode);

        // CRITICAL: Sync changes to Workflow collection during autosave
        console.log('🔄 [AUTOSAVE] About to call syncWorkflowCollection, canvasAreaRef exists:', !!canvasAreaRef.current);
        if (canvasAreaRef.current) {
          try {
            console.log('🔄 [AUTOSAVE] Calling syncWorkflowCollection...');
            await canvasAreaRef.current.syncWorkflowCollection();
            console.log('✅ [AUTOSAVE] Laboratory changes synced to Workflow collection');
          } catch (syncError) {
            console.error('❌ [AUTOSAVE] Failed to sync Laboratory changes to Workflow collection:', syncError);
            console.error('❌ [AUTOSAVE] Sync error details:', syncError instanceof Error ? syncError.stack : syncError);
          }
        } else {
          console.warn('⚠️ [AUTOSAVE] canvasAreaRef.current is null, cannot sync workflow collection');
        }
      } catch (error) {
        console.error('[AUTOSAVE] Autosave error:', error);
      }
    }, 3000); // 3 second debounce for autosave

    return () => {
      clearTimeout(autosaveTimer);
    };
  }, [cards, auxiliaryMenuLeftOpen, canEdit, autosaveEnabled, setExhibitionCards, sortCardsInWorkflowOrder]); // eslint-disable-line react-hooks/exhaustive-deps

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
          setExhibitionCards(last.state);
          const labConfig = {
            cards: last.state,
            exhibitedCards: (last.state || []).filter((c: any) => c.isExhibited),
            timestamp: new Date().toISOString(),
          };
          const sanitized = sanitizeLabConfig(labConfig);
          await fetch(`${REGISTRY_API}/projects/${proj.id}/`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: { laboratory_config: sanitized } }),
          }).catch(() => { });

          const storageSuccess = persistLaboratoryConfig(sanitized, subMode);
          if (!storageSuccess) {
            console.warn('Storage quota exceeded while caching undo state.');
            toast({
              title: 'Storage Limit Reached',
              description:
                'We updated your configuration, but local caching failed due to storage limits. Clear your browser storage to continue working offline.',
              variant: 'destructive',
            });
          }

          await fetch(`${LAB_ACTIONS_API}/${last.id}/`, { method: 'DELETE', credentials: 'include' }).catch(() => { });
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

  const handleCardSelect = (cardId: string, exhibited: boolean) => {
    if (!canEdit) return;
    setSelectedCardId(cardId);
    setCardExhibited(exhibited);

    // Auto-select the atom in the card if it exists
    const card = cards.find(c => c.id === cardId);
    if (card && Array.isArray(card.atoms) && card.atoms.length > 0) {
      // Select the first atom in the card
      setSelectedAtomId(card.atoms[0].id);
    } else {
      // Only clear atom selection if card has no atoms
      setSelectedAtomId(undefined);
    }
  };

  const toggleSettingsPanel = () => {
    if (!canEdit) return;
    setAuxActive(prev => (prev === 'settings' ? null : 'settings'));
  };

  const openSettingsPanel = () => {
    if (!canEdit) return;
    setAuxActive('settings');
  };

  const toggleHelpPanel = () => {
    if (!canEdit) return;
    setAuxActive(prev => (prev === 'help' ? null : 'help'));
  };

  const handleShareClick = () => {
    if (!canEdit) {
      return;
    }
    const context = getActiveProjectContext();
    setProjectContext(context);
    setIsShareOpen(true);
  };

  const handleSave = async () => {
    if (!canEdit) return;
    try {
      const exhibitedCards = (cards || []).filter(card => card.isExhibited);

      setExhibitionCards(cards);

      // Get workflow molecules to sort cards correctly (mode-specific)
      const storedWorkflowMolecules = localStorage.getItem(getWorkflowMoleculesKey(subMode));
      let workflowMolecules: any[] = [];
      if (storedWorkflowMolecules) {
        try {
          workflowMolecules = JSON.parse(storedWorkflowMolecules);
        } catch (e) {
          console.warn('Failed to parse workflow molecules for sorting', e);
        }
      }

      // CRITICAL FIX: Filter cards before saving to ensure mode-specific data separation
      let cardsToSave = cards || [];
      if (subMode === 'dashboard') {
        // Dashboard mode: Filter out any analytics-only atoms before saving
        const allowedAtomIdsSet = new Set(DASHBOARD_ALLOWED_ATOMS);
        cardsToSave = cardsToSave.map(card => {
          const allowedAtoms = (card.atoms || []).filter(atom => 
            allowedAtomIdsSet.has(atom.atomId as any)
          );
          return {
            ...card,
            atoms: allowedAtoms
          };
        }).filter(card => (card.atoms || []).length > 0); // Remove cards with no allowed atoms
        
        if (cardsToSave.length !== cards.length) {
          console.warn(`[MANUAL SAVE] Filtered out ${cards.length - cardsToSave.length} card(s) with non-dashboard atoms before saving to MongoDB`);
        }
      }
      // Analytics mode: Save all cards (no filtering needed)

      // Sort cards in workflow order before saving (ensures order field reflects actual workflow position)
      const sortedCards = workflowMolecules.length > 0
        ? sortCardsInWorkflowOrder(cardsToSave, workflowMolecules)
        : cardsToSave;

      console.info('[Laboratory API] Sorting cards in workflow order before save:', {
        originalCount: cards?.length || 0,
        sortedCount: sortedCards.length,
        workflowMoleculesCount: workflowMolecules.length,
        sortedCards: sortedCards.map((c, i) => ({
          index: i,
          id: c.id,
          atomId: c.atoms[0]?.atomId,
          moleculeId: c.moleculeId,
          order: c.order
        }))
      });

      // Prepare workflow_molecules with isActive and moleculeIndex for MongoDB
      // moleculeIndex preserves the original order/position in the array
      // FIX: If there are no cards, clear workflow molecules to return to regular laboratory mode
      const workflowMoleculesForSave = (sortedCards.length === 0)
        ? [] // Clear workflow molecules when no cards remain
        : workflowMolecules.map((molecule, index) => ({
          moleculeId: molecule.moleculeId,
          moleculeTitle: molecule.moleculeTitle,
          atoms: molecule.atoms || [],
          isActive: molecule.isActive !== false, // Default to true if not specified
          moleculeIndex: index // Preserve the original index/position
        }));

      // FIX: Clear workflow-related localStorage items when no cards remain (mode-specific)
      if (sortedCards.length === 0) {
        localStorage.removeItem(getWorkflowMoleculesKey(subMode));
        localStorage.removeItem(getWorkflowSelectedAtomsKey(subMode));
        localStorage.removeItem(getWorkflowDataKey(subMode));
        console.info('[Laboratory API] Cleared workflow data from localStorage (no cards remaining)');
      }

      console.info('[Laboratory API] Saving workflow molecules with isActive and moleculeIndex:', {
        workflowMoleculesCount: workflowMoleculesForSave.length,
        cardsCount: sortedCards.length,
        willClearWorkflow: sortedCards.length === 0,
        molecules: workflowMoleculesForSave.map(m => ({
          moleculeId: m.moleculeId,
          moleculeTitle: m.moleculeTitle,
          isActive: m.isActive,
          moleculeIndex: m.moleculeIndex
        }))
      });

      // Save the current laboratory configuration with sorted cards
      const labConfig = {
        cards: sortedCards,
        exhibitedCards,
        timestamp: new Date().toISOString(),
      };
      const sanitized = sanitizeLabConfig(labConfig);

      const projectContext = getActiveProjectContext();
      if (projectContext) {
        const requestUrl = `${LABORATORY_PROJECT_STATE_API}/save`;
        const mode = subMode === 'analytics' ? 'laboratory' : 'laboratory-dashboard';
        
        console.log('🔍 [DIAGNOSIS] ========== MANUAL SAVE START ==========');
        console.log('🔍 [DIAGNOSIS] Manual save details:', {
          subMode,
          mode,
          cardsCount: sanitized.cards?.length || 0,
          workflowMoleculesCount: workflowMoleculesForSave.length,
          cardAtomIds: sanitized.cards?.map((c: any) => c.atoms?.map((a: any) => a.atomId)).flat() || [],
          timestamp: new Date().toISOString()
        });
        
        const payload = {
          client_name: projectContext.client_name,
          app_name: projectContext.app_name,
          project_name: projectContext.project_name,
          cards: sanitized.cards || [],
          workflow_molecules: workflowMoleculesForSave, // Include workflow molecules with isActive and moleculeIndex (empty if no cards)
          auxiliaryMenuLeftOpen: auxiliaryMenuLeftOpen ?? true, // Include auxiliary menu left state
          autosaveEnabled: autosaveEnabled, // Include autosave toggle state
          mode: mode,
        };

        console.log('🔍 [DIAGNOSIS] Payload being sent to MongoDB:', {
          mode: payload.mode,
          cardsCount: payload.cards.length,
          cardDetails: payload.cards.map((c: any) => ({
            id: c.id,
            atoms: c.atoms?.map((a: any) => ({ atomId: a.atomId, title: a.title })) || []
          }))
        });
        console.log('💾 [MANUAL SAVE] Saving with auxiliaryMenuLeftOpen:', auxiliaryMenuLeftOpen ?? true);

        const requestInit: RequestInit = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        };

        console.info('[Laboratory API] Saving laboratory configuration', {
          url: requestUrl,
          method: requestInit.method,
          hasCards: Array.isArray(payload.cards) && payload.cards.length > 0,
          project: payload.project_name,
        });

        try {
          const response = await fetch(requestUrl, requestInit);
          if (!response.ok) {
            const message = await response.text();
            console.error('🔍 [DIAGNOSIS] ❌ [Laboratory API] Failed to persist configuration', {
              status: response.status,
              error: message,
              mode,
              subMode
            });
          } else {
            const responseData = await response.json().catch(() => ({}));
            console.info('🔍 [DIAGNOSIS] ✅ [Laboratory API] Configuration saved successfully', {
              mode,
              subMode,
              cardsCount: payload.cards.length,
              response: responseData
            });
            console.log('🔍 [DIAGNOSIS] ========== MANUAL SAVE COMPLETE ==========');
          }
        } catch (apiError) {
          console.error('[Laboratory API] Error while saving configuration', apiError);
        }
      } else {
        console.warn('[Laboratory API] Skipping save, project context unavailable');
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

      const storageSuccess = persistLaboratoryConfig(sanitized, subMode);

      // Sync changes to Workflow collection
      console.log('🔄 [LAB MODE] About to call syncWorkflowCollection, canvasAreaRef exists:', !!canvasAreaRef.current);
      if (canvasAreaRef.current) {
        try {
          console.log('🔄 [LAB MODE] Calling syncWorkflowCollection...');
          await canvasAreaRef.current.syncWorkflowCollection();
          console.log('✅ [LAB MODE] Laboratory changes synced to Workflow collection');
        } catch (syncError) {
          console.error('❌ [LAB MODE] Failed to sync Laboratory changes to Workflow collection:', syncError);
          console.error('❌ [LAB MODE] Sync error details:', syncError instanceof Error ? syncError.stack : syncError);
          // Don't show error to user, just log it
        }
      } else {
        console.warn('⚠️ [LAB MODE] canvasAreaRef.current is null, cannot sync workflow collection');
      }

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
        Array.isArray(card.atoms) ? card.atoms.map(atom => ({
          id: atom.id,
          title: atom.title,
          category: atom.category,
          color: atom.color,
          cardId: card.id,
        })) : []
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

  // Handle Ctrl+S keyboard shortcut for manual save (works regardless of autosave state)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+S (or Cmd+S on Mac)
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        // Don't trigger if user is typing in an input field
        const target = event.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.contentEditable === 'true' ||
          target.getAttribute('role') === 'textbox'
        ) {
          return;
        }

        // Prevent default and stop propagation to prevent other handlers (like useSearchShortcut) from running
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (canEdit) {
          handleSave();
        }
      }
    };

    // Use capture phase to ensure this handler runs before others
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [canEdit, handleSave]);

  // Handle Ctrl+Alt+I keyboard shortcut to toggle AI panel
  // Use refs to always access latest state values
  const auxActiveRef = useRef(auxActive);
  const isTrinityAIVisibleRef = useRef(isTrinityAIVisible);
  const trinityAILayoutRef = useRef(trinityAILayout);
  
  // Keep refs in sync with state
  useEffect(() => {
    auxActiveRef.current = auxActive;
    isTrinityAIVisibleRef.current = isTrinityAIVisible;
    trinityAILayoutRef.current = trinityAILayout;
  }, [auxActive, isTrinityAIVisible, trinityAILayout]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Debug: Log all Ctrl+Alt key combinations to help troubleshoot
      if ((event.ctrlKey || event.metaKey) && event.altKey) {
        console.log('🔍 Ctrl+Alt key detected:', {
          key: event.key,
          code: event.code,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          target: (event.target as HTMLElement)?.tagName
        });
      }
      
      // Check for Ctrl+Alt+I (or Cmd+Alt+I on Mac)
      const isCtrlAltI = (event.ctrlKey || event.metaKey) && event.altKey && 
                         (event.key.toLowerCase() === 'i' || event.code === 'KeyI');
      
      if (isCtrlAltI) {
        console.log('✅ Ctrl+Alt+I detected!');
        
        // Don't trigger if user is typing in an input field
        const target = event.target as HTMLElement;
        const isInputField = 
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.contentEditable === 'true' ||
          target.getAttribute('role') === 'textbox';
        
        if (isInputField) {
          console.log('⚠️ Ignored: user is typing in input field');
          return;
        }

        // Prevent default and stop propagation
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        console.log('⌨️ Ctrl+Alt+I pressed - toggling AI panel', {
          currentActive: auxActiveRef.current,
          isVisible: isTrinityAIVisibleRef.current,
          layout: trinityAILayoutRef.current
        });
        
        // Directly toggle the AI panel state (same logic as clicking the icon)
        const currentActive = auxActiveRef.current;
        const newActive = currentActive === 'trinity' ? null : 'trinity';
        
        // If panel was hidden, show it again
        if (newActive === 'trinity' && !isTrinityAIVisibleRef.current) {
          setIsTrinityAIVisible(true);
        }
        
        // In horizontal view, toggle collapse state
        if (trinityAILayoutRef.current === 'horizontal' && newActive === 'trinity') {
          setIsHorizontalAICollapsed(false); // Expand when opening
        } else if (trinityAILayoutRef.current === 'horizontal' && newActive === null && currentActive === 'trinity') {
          setIsHorizontalAICollapsed(true); // Collapse when closing
        }
        
        // Update the active state
        setAuxActive(newActive);
        console.log('✅ AI panel toggled to:', newActive);
      }
    };

    // Use capture phase to ensure this handler runs before others
    window.addEventListener('keydown', handleKeyDown, true);
    console.log('🎹 Keyboard shortcut handler registered: Ctrl+Alt+I');
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []); // Empty deps - we use refs for state access

  return (
    <div
      data-lab-preparing={isPreparingAnimation ? 'true' : undefined}
      className="h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col"
    >
      <Header />

      {/* Laboratory Header */}
      <div
        data-lab-header="true"
        className="absolute top-[53px] flex items-center justify-center z-50 pointer-events-none"
        style={{
          left: (auxiliaryMenuLeftOpen || isExhibitionOpen) ? '336px' : '48px', // w-12 (48px) icons + w-72 (288px) sidebar/panel when open
          right: (auxActive && auxActive !== 'exhibition') ? '368px' : '48px', // w-12 (48px) icons + w-80 (320px) panel when open (exhibition is on left)
        }}
      >
        <div className="bg-white rounded-full shadow-md border border-gray-200 px-2.5 py-0.5 flex items-center gap-2 pointer-events-auto transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
          {/* Active Users */}
          {canEdit && activeUsers.length > 0 && (
            <div className="flex items-center">
              <div className="relative group">
                <div className="flex -space-x-2">
                  {activeUsers.slice(0, 3).map((activeUser, index) => (
                    <div
                      key={activeUser.client_id}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold border-2 border-white shadow-sm"
                      title={`${activeUser.name} (${activeUser.email})`}
                      style={{
                        zIndex: 10 - index,
                        backgroundColor: activeUser.color || '#3B82F6'
                      }}
                    >
                      {activeUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                  ))}
                  {activeUsers.length > 3 && (
                    <div
                      className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-[10px] font-semibold border-2 border-white shadow-sm"
                      title={`+${activeUsers.length - 3} more`}
                    >
                      +{activeUsers.length - 3}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Undo */}
          <button
            onClick={handleUndo}
            disabled={!canEdit}
            className={`w-7 h-7 rounded-lg hover:bg-gray-100 transition-all flex items-center justify-center text-gray-600 ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            title="Undo"
            type="button"
          >
            <Undo2 className="w-3.5 h-3.5" strokeWidth={2} />
          </button>

          {/* Auto Save Toggle */}
          {canEdit && setAutosaveEnabled && (
            <div className="flex items-center">
              <Switch
                checked={autosaveEnabled}
                onCheckedChange={setAutosaveEnabled}
                disabled={!canEdit}
                className="scale-[0.65]"
              />
            </div>
          )}

          {/* Save */}
          {!autosaveEnabled && handleSave && (
            <button
              onClick={handleSave}
              disabled={!canEdit}
              className={`w-7 h-7 rounded-lg hover:bg-gray-100 transition-all flex items-center justify-center text-gray-600 ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              title="Save"
              type="button"
              data-lab-save="true"
            >
              <Save className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          )}

          {/* Share */}
          {handleShareClick && (
            <button
              onClick={handleShareClick}
              disabled={!canEdit}
              className={`w-7 h-7 rounded-lg hover:bg-gray-100 transition-all flex items-center justify-center text-gray-600 ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              title="Share"
              type="button"
            >
              <Share2 className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          )}

          {/* Run Pipeline */}
          <button
            disabled={!canEdit}
            className={`w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-700 hover:shadow-md transition-all flex items-center justify-center text-white ${
              !canEdit ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            title="Run Pipeline"
            type="button"
          >
            <Play className="w-3.5 h-3.5" fill="white" />
          </button>

          {/* Mode Toggle - Pill Style */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSubMode('analytics')}
              disabled={!canEdit}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
                subMode === 'analytics'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${!canEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              title="Analytics Mode"
              type="button"
            >
              <div className="flex items-center gap-1.5">
                <BarChart3 className="w-3 h-3" />
                <span>Analytics</span>
              </div>
            </button>
            <button
              onClick={() => setSubMode('dashboard')}
              disabled={!canEdit}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
                subMode === 'dashboard'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${!canEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              title="Dashboard Mode"
              type="button"
            >
              <div className="flex items-center gap-1.5">
                <LayoutDashboard className="w-3 h-3" />
                <span>Dashboard</span>
              </div>
            </button>
          </div>
        </div>
      </div>

        <div className="flex-1 flex overflow-hidden relative">
          {/* Atoms Sidebar */}
          <div data-lab-sidebar="true" className={`${canEdit ? '' : 'cursor-not-allowed'} h-full relative z-10`}>
            <AuxiliaryMenuLeft 
              onAtomDragStart={handleAtomDragStart}
              active={auxActive}
              onActiveChange={(newActive) => {
                setAuxActive(newActive);
              }}
              isExhibitionOpen={isExhibitionOpen}
              setIsExhibitionOpen={setIsExhibitionOpen}
              canEdit={canEdit}
              showFloatingNavigationList={showFloatingNavigationList}
              setShowFloatingNavigationList={setShowFloatingNavigationList}
            />
          </div>

          {/* Main Canvas Area */}
          <div
            data-lab-canvas="true"
            className={`flex-1 pt-[2.1rem] px-[0.3rem] pb-[0.3rem] relative z-0 ${canEdit ? '' : 'cursor-not-allowed'}`}
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
                ref={canvasAreaRef}
                onAtomSelect={handleAtomSelect}
                onCardSelect={handleCardSelect}
                selectedCardId={selectedCardId}
                onToggleSettingsPanel={toggleSettingsPanel}
                onOpenSettingsPanel={openSettingsPanel}
                onToggleHelpPanel={toggleHelpPanel}
                canEdit={canEdit}
                cardEditors={cardEditors}
                onCardFocus={notifyCardFocus}
                onCardBlur={notifyCardBlur}
              />
          </div>

          {/* Auxiliary menu */}
          <div data-lab-settings="true" className={`${canEdit ? '' : 'cursor-not-allowed'} h-full`}>
            <AuxiliaryMenu
              selectedAtomId={selectedAtomId}
              selectedCardId={selectedCardId}
              cardExhibited={cardExhibited}
              active={auxActive}
              onActiveChange={(newActive) => {
                setAuxActive(newActive);
                // If clicking AI icon and panel was hidden, show it again
                if (newActive === 'trinity' && !isTrinityAIVisible) {
                  setIsTrinityAIVisible(true);
                }
                // In horizontal view, toggle collapse state when AI icon is clicked
                if (trinityAILayout === 'horizontal' && newActive === 'trinity') {
                  setIsHorizontalAICollapsed(false); // Expand when AI icon is clicked
                } else if (trinityAILayout === 'horizontal' && newActive === null && auxActive === 'trinity') {
                  setIsHorizontalAICollapsed(true); // Collapse when AI icon is clicked again
                }
              }}
              trinityAILayout={trinityAILayout}
              isTrinityAIVisible={isTrinityAIVisible}
              onTrinityAIClose={() => {
                setIsTrinityAIVisible(false);
                setAuxActive(null);
              }}
              canEdit={canEdit}
              activeUsers={activeUsers}
              autosaveEnabled={autosaveEnabled}
              setAutosaveEnabled={setAutosaveEnabled}
              onUndo={handleUndo}
              onSave={handleSave}
              onShare={handleShareClick}
              showFloatingNavigationList={showFloatingNavigationList}
              setShowFloatingNavigationList={setShowFloatingNavigationList}
            />
            <FloatingNavigationList
              isVisible={showFloatingNavigationList}
              onClose={() => setShowFloatingNavigationList(false)}
              anchorSelector="[data-lab-header-text]"
            />
          </div>

          {/* Trinity AI Panel - Only for horizontal layout */}
          {/* For vertical layout, it's rendered inside AuxiliaryMenu */}
          {/* In horizontal view, panel stays visible and aligned with canvas area */}
          {isTrinityAIVisible && trinityAILayout === 'horizontal' && (
            <div 
              className="absolute bottom-0 left-0 right-12 z-50 pointer-events-none"
            >
              <div className="pointer-events-auto">
                <TrinityAIPanel
                  isCollapsed={isHorizontalAICollapsed}
                  onToggle={() => {
                    // In horizontal view, toggle between collapsed (sparkle icon) and expanded
                    // Don't auto-minimize when other panels open - only toggle when AI icon is clicked
                    setIsHorizontalAICollapsed(prev => !prev);
                    if (isHorizontalAICollapsed) {
                      setAuxActive('trinity');
                    } else {
                      setAuxActive(null);
                    }
                  }}
                  onClose={() => {
                    // Only X button calls this - completely hide the panel
                    setIsTrinityAIVisible(false);
                    setIsHorizontalAICollapsed(false);
                    setAuxActive(null);
                  }}
                  layout="horizontal"
                />
              </div>
            </div>
        )}
      </div>

      <DashboardShareDialog
        open={isShareOpen}
        onOpenChange={setIsShareOpen}
        projectName={projectContext?.project_name ?? 'Dashboard Project'}
      />
    </div>
  );
};

export default LaboratoryMode;
