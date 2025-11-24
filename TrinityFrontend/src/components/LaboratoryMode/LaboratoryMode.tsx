
import React, { useState, useEffect, useLayoutEffect, useRef, useInsertionEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Play, Save, Share2, Undo2, List, Wifi, WifiOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/Header';
import { atoms as allAtoms } from '@/components/AtomList/data';
import {
  sanitizeLabConfig,
  saveCurrentProject,
  persistLaboratoryConfig,
} from '@/utils/projectStorage';
import CanvasArea, { CanvasAreaRef } from './components/CanvasArea';
import AuxiliaryMenu from './components/AuxiliaryMenu';
import AuxiliaryMenuLeft from './components/AuxiliaryMenuLeft';
import FloatingNavigationList from './components/FloatingNavigationList';
import { useExhibitionStore } from '@/components/ExhibitionMode/store/exhibitionStore';
import { REGISTRY_API, LAB_ACTIONS_API, LABORATORY_PROJECT_STATE_API } from '@/lib/api';
import { useLaboratoryStore, LayoutCard } from './store/laboratoryStore';
import { useAuth } from '@/contexts/AuthContext';
import { addNavigationItem, logSessionState } from '@/lib/session';
import { ShareDialog } from './components/ShareDialog';
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
  const [showFloatingNavigationList, setShowFloatingNavigationList] = useState(true);
  const [auxActive, setAuxActive] = useState<'settings' | 'frames' | 'help' | 'trinity' | 'exhibition' | null>('frames');
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [projectContext, setProjectContext] = useState<ProjectContext | null>(() => getActiveProjectContext());
  const [autosaveEnabled, setAutosaveEnabled] = useState(true); // Default to true, will be loaded from MongoDB
  const { toast } = useToast();
  const { cards, setCards: setLabCards, auxiliaryMenuLeftOpen } = useLaboratoryStore();
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
    
    // Hide navigation list when switching from workflow mode
    const hasWorkflowData = localStorage.getItem('workflow-data') || 
                           localStorage.getItem('workflow-selected-atoms') || 
                           localStorage.getItem('workflow-molecules');
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

        // Get workflow molecules to sort cards correctly
        const storedWorkflowMolecules = localStorage.getItem('workflow-molecules');
        let workflowMolecules: any[] = [];
        if (storedWorkflowMolecules) {
          try {
            workflowMolecules = JSON.parse(storedWorkflowMolecules);
          } catch (e) {
            console.warn('[AUTOSAVE] Failed to parse workflow molecules for sorting', e);
          }
        }

        // Sort cards in workflow order before saving
        const sortedCards = workflowMolecules.length > 0 
          ? sortCardsInWorkflowOrder(cards || [], workflowMolecules)
          : cards || [];

        // Prepare workflow_molecules with isActive and moleculeIndex for MongoDB
        const workflowMoleculesForSave = (sortedCards.length === 0) 
          ? []
          : workflowMolecules.map((molecule, index) => ({
              moleculeId: molecule.moleculeId,
              moleculeTitle: molecule.moleculeTitle,
              atoms: molecule.atoms || [],
              isActive: molecule.isActive !== false,
              moleculeIndex: index
            }));

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
          const payload = {
            client_name: projectContext.client_name,
            app_name: projectContext.app_name,
            project_name: projectContext.project_name,
            cards: sanitized.cards || [],
            workflow_molecules: workflowMoleculesForSave,
            auxiliaryMenuLeftOpen: auxiliaryMenuLeftOpen ?? true,
            autosaveEnabled: autosaveEnabled,
            mode: 'laboratory',
          };

          console.log('🔄 [AUTOSAVE] Saving with auxiliaryMenuLeftOpen:', auxiliaryMenuLeftOpen ?? true);

          try {
            const response = await fetch(requestUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(payload),
            });
            if (!response.ok) {
              console.error('[AUTOSAVE] Failed to persist configuration', await response.text());
            } else {
              console.log('✅ [AUTOSAVE] Configuration saved successfully');
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

        persistLaboratoryConfig(sanitized);
        
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

  const handleCardSelect = (cardId: string, exhibited: boolean) => {
    if (!canEdit) return;
    setSelectedAtomId(undefined);
    setSelectedCardId(cardId);
    setCardExhibited(exhibited);
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

      // Get workflow molecules to sort cards correctly
      const storedWorkflowMolecules = localStorage.getItem('workflow-molecules');
      let workflowMolecules: any[] = [];
      if (storedWorkflowMolecules) {
        try {
          workflowMolecules = JSON.parse(storedWorkflowMolecules);
        } catch (e) {
          console.warn('Failed to parse workflow molecules for sorting', e);
        }
      }

      // Sort cards in workflow order before saving (ensures order field reflects actual workflow position)
      const sortedCards = workflowMolecules.length > 0 
        ? sortCardsInWorkflowOrder(cards || [], workflowMolecules)
        : cards || [];

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

      // FIX: Clear workflow-related localStorage items when no cards remain
      if (sortedCards.length === 0) {
        localStorage.removeItem('workflow-molecules');
        localStorage.removeItem('workflow-selected-atoms');
        localStorage.removeItem('workflow-data');
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
        const payload = {
          client_name: projectContext.client_name,
          app_name: projectContext.app_name,
          project_name: projectContext.project_name,
          cards: sanitized.cards || [],
          workflow_molecules: workflowMoleculesForSave, // Include workflow molecules with isActive and moleculeIndex (empty if no cards)
          auxiliaryMenuLeftOpen: auxiliaryMenuLeftOpen ?? true, // Include auxiliary menu left state
          autosaveEnabled: autosaveEnabled, // Include autosave toggle state
          mode: 'laboratory',
        };

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
            console.error('[Laboratory API] Failed to persist configuration', message);
          } else {
            console.info('[Laboratory API] Configuration saved successfully');
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

      const storageSuccess = persistLaboratoryConfig(sanitized);
      
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
            {canEdit && activeUsers.length > 0 && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border border-gray-200 shadow-sm"
                title={activeUsers.map(user => user.email).join('\n')}
              >
                <div className="flex -space-x-2">
                  {activeUsers.slice(0, 3).map((activeUser, index) => (
                    <div
                      key={activeUser.client_id}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold border-2 border-white shadow-sm"
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
                      className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-semibold border-2 border-white shadow-sm"
                      title={`+${activeUsers.length - 3} more`}
                    >
                      +{activeUsers.length - 3}
                    </div>
                  )}
                </div>
                <span className="text-xs text-gray-600 font-medium ml-1">
                  {activeUsers.length} {activeUsers.length === 1 ? 'user' : 'users'} editing
                </span>
              </div>
            )}
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
            {canEdit && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border border-gray-200">
                <span className="text-xs text-gray-600 font-medium">Auto Save</span>
                <Switch
                  checked={autosaveEnabled}
                  onCheckedChange={setAutosaveEnabled}
                  disabled={!canEdit}
                />
              </div>
            )}
            {!autosaveEnabled && (
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
            )}
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
              onClick={handleShareClick}
              disabled={!canEdit}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
            {/* {canEdit && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-gray-50 border border-gray-200">
                {isSyncConnected ? (
                  <>
                    <Wifi className="w-4 h-4 text-green-600" />
                    <span className="text-xs text-gray-600 font-medium">Live</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-gray-400" />
                    <span className="text-xs text-gray-500 font-medium">Offline</span>
                  </>
                )}
              </div>
            )} */}
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
              onActiveChange={setAuxActive}
            />
            <FloatingNavigationList
              isVisible={showFloatingNavigationList}
              onClose={() => setShowFloatingNavigationList(false)}
              anchorSelector="[data-lab-header-text]"
            />
          </div>
        </div>

        <ShareDialog
          open={isShareOpen}
          onOpenChange={setIsShareOpen}
          projectName={projectContext?.project_name ?? 'Laboratory Project'}
        />
    </div>
  );
};

export default LaboratoryMode;