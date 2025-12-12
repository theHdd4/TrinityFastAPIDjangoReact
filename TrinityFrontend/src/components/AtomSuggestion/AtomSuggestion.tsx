import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Grid3X3, Search, X } from 'lucide-react';
import { useExhibitionStore } from '../ExhibitionMode/store/exhibitionStore';
import { VALIDATE_API, TRINITY_V1_ATOMS_API } from '@/lib/api';

interface AtomSuggestionProps {
  cardId?: string;
  isVisible: boolean;
  onClose: () => void;
  onAddAtom?: (atomId: string, atomData: any, targetCardId?: string) => void;
  allowedAtomIds?: string[]; // Optional: filter atoms by IDs. If undefined, show all atoms.
}

interface SavedFrameMeta {
  object_name: string;
  csv_name?: string;
  last_modified?: string;
}

const AtomSuggestion: React.FC<AtomSuggestionProps> = ({
  cardId,
  isVisible,
  onClose,
  onAddAtom,
  allowedAtomIds
}) => {
  const [savedDataframes, setSavedDataframes] = useState<SavedFrameMeta[]>([]);
  const [isLoadingDataframes, setIsLoadingDataframes] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [apiAtoms, setApiAtoms] = useState<Array<{id: string; name: string; description: string; category: string; tags: string[]; color: string}>>([]);
  const { cards } = useExhibitionStore();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get all atoms from all cards (similar to navigation list logic)
  const allAtoms = useMemo(() => {
    return cards.flatMap(card =>
      card.atoms.map(atom => ({
        id: atom.id,
        atomId: atom.atomId,
        title: atom.title,
        category: atom.category,
        color: atom.color,
        cardId: card.id
      }))
    );
  }, [cards]);

  // Check if specific atoms are already used
  const hasDataUploadAtom = useMemo(() => {
    return allAtoms.some(atom => atom.atomId === 'data-validate');
  }, [allAtoms]);

  const hasColumnClassifierAtom = useMemo(() => {
    return allAtoms.some(atom => atom.atomId === 'column-classifier');
  }, [allAtoms]);

  const hasDataframeOperationsAtom = useMemo(() => {
    return allAtoms.some(atom => atom.atomId === 'dataframe-operations');
  }, [allAtoms]);

  const hasFeatureOverviewAtom = useMemo(() => {
    return allAtoms.some(atom => atom.atomId === 'feature-overview');
  }, [allAtoms]);

  const hasExploreAtom = useMemo(() => {
    return allAtoms.some(atom => atom.atomId === 'explore');
  }, [allAtoms]);

  const hasCorrelationAtom = useMemo(() => {
    return allAtoms.some(atom => atom.atomId === 'correlation');
  }, [allAtoms]);

  const hasCreateAndTransformAtom = useMemo(() => {
    return allAtoms.some(atom => atom.atomId === 'create-column');
  }, [allAtoms]);

  const hasChartMakerAtom = useMemo(() => {
    return allAtoms.some(atom => atom.atomId === 'chart-maker');
  }, [allAtoms]);

  const hasGroupByAtom = useMemo(() => {
    return allAtoms.some(atom => atom.atomId === 'groupby-wtg-avg');
  }, [allAtoms]);

  const hasMergeAtom = useMemo(() => {
    return allAtoms.some(atom => atom.atomId === 'merge');
  }, [allAtoms]);

  const hasConcatAtom = useMemo(() => {
    return allAtoms.some(atom => atom.atomId === 'concat');
  }, [allAtoms]);

  const hasScopeSelectorAtom = useMemo(() => {
    return allAtoms.some(atom => atom.atomId === 'scope-selector');
  }, [allAtoms]);

  const hasClusteringAtom = useMemo(() => {
    return allAtoms.some(atom => atom.atomId === 'clustering');
  }, [allAtoms]);

  const hasBuildFeatureBasedAtom = useMemo(() => {
    return allAtoms.some(atom => atom.atomId === 'build-model-feature-based');
  }, [allAtoms]);

  const hasBuildAutoregressiveAtom = useMemo(() => {
    return allAtoms.some(atom => atom.atomId === 'auto-regressive-models');
  }, [allAtoms]);

  const hasSelectModelsFeatureAtom = useMemo(() => {
    return allAtoms.some(atom => atom.atomId === 'select-models-feature');
  }, [allAtoms]);

  const hasEvaluateModelsFeatureAtom = useMemo(() => {
    return allAtoms.some(atom => atom.atomId === 'evaluate-models-feature');
  }, [allAtoms]);

  const hasScenarioPlannerAtom = useMemo(() => {
    return allAtoms.some(atom => atom.atomId === 'scenario-planner');
  }, [allAtoms]);

  // Helper function to get category color
  const getCategoryColor = (category: string) => {
    const colorMap: Record<string, string> = {
      'Data Sources': 'bg-blue-500',
      'Data Processing': 'bg-green-500',
      'Analytics': 'bg-purple-500',
      'Machine Learning': 'bg-orange-500',
      'Visualization': 'bg-pink-500',
      'Planning & Optimization': 'bg-indigo-500',
      'Utilities': 'bg-gray-500',
      'Business Intelligence': 'bg-teal-500'
    };
    return colorMap[category] || 'bg-gray-500';
  };

  // Fetch atoms from API with caching (to avoid slow loading on slow internet)
  useEffect(() => {
    const CACHE_KEY = 'trinity_atoms_cache';
    const CACHE_TIMESTAMP_KEY = 'trinity_atoms_cache_timestamp';
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

    const fetchAtomsFromAPI = async () => {
      try {
        const response = await fetch(`${TRINITY_V1_ATOMS_API}/atoms-for-frontend/`, {
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.atoms) {
            // Transform API data to match frontend format
            const transformedAtoms = data.atoms.map((atom: any) => ({
              id: atom.id || '',
              name: atom.name || '',
              description: atom.description || '',
              category: atom.category || 'Utilities',
              tags: atom.tags || [],
              color: atom.color || getCategoryColor(atom.category || 'Utilities')
            }));
            
            // Update state
            setApiAtoms(transformedAtoms);
            
            // Cache the data for future use
            localStorage.setItem(CACHE_KEY, JSON.stringify(transformedAtoms));
            localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
          } else {
            setApiAtoms([]);
          }
        } else {
          setApiAtoms([]);
        }
      } catch (error) {
        console.error('Error fetching atoms from API:', error);
        throw error; // Re-throw to trigger fallback
      }
    };

    const fetchAtoms = async () => {
      try {
        // Check cache first - this makes search instant on slow internet
        const cachedData = localStorage.getItem(CACHE_KEY);
        const cacheTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
        
        if (cachedData && cacheTimestamp) {
          const timestamp = parseInt(cacheTimestamp, 10);
          const now = Date.now();
          
          // Use cache if it's still fresh (within TTL)
          if (now - timestamp < CACHE_TTL) {
            try {
              const transformedAtoms = JSON.parse(cachedData);
              setApiAtoms(transformedAtoms);
              // Still fetch in background to update cache, but don't wait
              fetchAtomsFromAPI().catch(err => {
                // Silently fail background refresh - we already have cached data
                console.warn('Background atoms refresh failed:', err);
              });
              return;
            } catch (e) {
              console.warn('Failed to parse cached atoms, fetching fresh data');
            }
          }
        }

        // Cache miss or expired - fetch from API
        await fetchAtomsFromAPI();
      } catch (error) {
        console.error('Error fetching atoms:', error);
        // Try to use stale cache as fallback if API fails
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          try {
            const transformedAtoms = JSON.parse(cachedData);
            setApiAtoms(transformedAtoms);
          } catch (e) {
            setApiAtoms([]);
          }
        } else {
          setApiAtoms([]);
        }
      }
    };

    fetchAtoms();
  }, []);

  // Fetch saved dataframes
  const fetchSavedDataframes = async () => {
    setIsLoadingDataframes(true);
    try {
      let query = '';
      const envStr = localStorage.getItem('env');
      if (envStr) {
        try {
          const env = JSON.parse(envStr);
          query = '?' + new URLSearchParams({
            client_id: env.CLIENT_ID || '',
            app_id: env.APP_ID || '',
            project_id: env.PROJECT_ID || '',
            client_name: env.CLIENT_NAME || '',
            app_name: env.APP_NAME || '',
            project_name: env.PROJECT_NAME || ''
          }).toString();
        } catch {
          // ignore
        }
      }

      const response = await fetch(`${VALIDATE_API}/list_saved_dataframes${query}`);
      if (response.ok) {
        const data = await response.json();
        const files: SavedFrameMeta[] = Array.isArray(data.files) ? data.files : [];
        const validFiles = files.filter(
          f => typeof f.object_name === 'string' && /\.[^/]+$/.test(f.object_name.trim())
        );
        setSavedDataframes(validFiles);
      }
    } catch (error) {
      console.error('Error fetching saved dataframes:', error);
      setSavedDataframes([]);
    } finally {
      setIsLoadingDataframes(false);
    }
  };

  // Get suggested atoms based on conditions
  const suggestedAtoms = useMemo(() => {
    const suggestions = [];
    
    // Check if the card above has column classifier, feature overview, data upload, explore, dataframe operations, groupby, merge, scope selector, or build model feature based
    const cardIndex = cards.findIndex(card => card.id === cardId);
    const cardAbove = cardIndex > 0 ? cards[cardIndex - 1] : null;
    const cardAboveHasColumnClassifier = cardAbove?.atoms.some(atom => atom.atomId === 'column-classifier') || false;
    const cardAboveHasFeatureOverview = cardAbove?.atoms.some(atom => atom.atomId === 'feature-overview') || false;
    const cardAboveHasDataUpload = cardAbove?.atoms.some(atom => atom.atomId === 'data-upload' || atom.atomId === 'data-validate') || false;
    const cardAboveHasExplore = cardAbove?.atoms.some(atom => atom.atomId === 'explore') || false;
    const cardAboveHasDataframeOperations = cardAbove?.atoms.some(atom => atom.atomId === 'dataframe-operations') || false;
    const cardAboveHasGroupBy = cardAbove?.atoms.some(atom => atom.atomId === 'groupby-wtg-avg') || false;
    const cardAboveHasMerge = cardAbove?.atoms.some(atom => atom.atomId === 'merge') || false;
    const cardAboveHasScopeSelector = cardAbove?.atoms.some(atom => atom.atomId === 'scope-selector') || false;
    const cardAboveHasBuildModelFeatureBased = cardAbove?.atoms.some(atom => atom.atomId === 'build-model-feature-based') || false;
    const cardAboveHasBuildAutoregressive = cardAbove?.atoms.some(atom => atom.atomId === 'auto-regressive-models') || false;
    const cardAboveHasSelectModelsFeature = cardAbove?.atoms.some(atom => atom.atomId === 'select-models-feature') || false;
    const cardAboveHasEvaluateModelsFeature = cardAbove?.atoms.some(atom => atom.atomId === 'evaluate-models-feature') || false;
    
    // If card above has evaluate models - feature based, suggest scenario planner, explore, and dataframe operations
    if (cardAboveHasEvaluateModelsFeature) {
      suggestions.push({
        id: 'scenario-planner',
        name: 'Scenario planner',
        color: 'bg-cyan-500'
      });
      
      suggestions.push({
        id: 'explore',
        name: 'Explore',
        color: 'bg-teal-500'
      });
      
      suggestions.push({
        id: 'dataframe-operations',
        name: 'Dataframe operations',
        color: 'bg-purple-500'
      });
    }
    
    // If card above has select models - feature based, suggest evaluate feature based, scenario planner, and explore
    if (cardAboveHasSelectModelsFeature) {
      suggestions.push({
        id: 'evaluate-models-feature',
        name: 'Evaluate feature based',
        color: 'bg-emerald-500'
      });
      
      suggestions.push({
        id: 'scenario-planner',
        name: 'Scenario planner',
        color: 'bg-cyan-500'
      });
      
      suggestions.push({
        id: 'explore',
        name: 'Explore',
        color: 'bg-teal-500'
      });
    }
    
    // If card above has build autoregressive, suggest explore, chart maker, and correlation
    if (cardAboveHasBuildAutoregressive) {
      suggestions.push({
        id: 'explore',
        name: 'Explore',
        color: 'bg-teal-500'
      });
      
      suggestions.push({
        id: 'chart-maker',
        name: 'Chart maker',
        color: 'bg-pink-500'
      });
      
      suggestions.push({
        id: 'correlation',
        name: 'Correlation',
        color: 'bg-red-500'
      });
    }
    
    // If card above has build model feature based, suggest select models - feature based, explore, and chart maker
    if (cardAboveHasBuildModelFeatureBased) {
      suggestions.push({
        id: 'select-models-feature',
        name: 'Select models - feature based',
        color: 'bg-slate-500'
      });
      
      suggestions.push({
        id: 'explore',
        name: 'Explore',
        color: 'bg-teal-500'
      });
      
      suggestions.push({
        id: 'chart-maker',
        name: 'Chart maker',
        color: 'bg-pink-500'
      });
    }
    
    // If card above has scope selector, suggest build feature based, build autoregressive, and clustering
    if (cardAboveHasScopeSelector) {
      suggestions.push({
        id: 'build-model-feature-based',
        name: 'Build feature based',
        color: 'bg-amber-500'
      });
      
      suggestions.push({
        id: 'auto-regressive-models',
        name: 'Build autoregressive',
        color: 'bg-lime-500'
      });
      
      suggestions.push({
        id: 'clustering',
        name: 'Clustering',
        color: 'bg-rose-500'
      });
    }
    
    // If card above has merge, suggest scope selector, clustering, and dataframe operations
    if (cardAboveHasMerge) {
      suggestions.push({
        id: 'scope-selector',
        name: 'Scope selector',
        color: 'bg-violet-500'
      });
      
      suggestions.push({
        id: 'clustering',
        name: 'Clustering',
        color: 'bg-rose-500'
      });
      
      suggestions.push({
        id: 'dataframe-operations',
        name: 'Dataframe operations',
        color: 'bg-purple-500'
      });
    }
    
    // If card above has groupby, suggest merge, dataframe operations, and concat
    if (cardAboveHasGroupBy) {
      suggestions.push({
        id: 'merge',
        name: 'Merge',
        color: 'bg-cyan-500'
      });
      
      suggestions.push({
        id: 'dataframe-operations',
        name: 'Dataframe operations',
        color: 'bg-purple-500'
      });
      
      suggestions.push({
        id: 'concat',
        name: 'Concat',
        color: 'bg-emerald-500'
      });
    }
    
    // If card above has dataframe operations, suggest chart-maker and correlation (Dashboard-friendly)
    // Also suggest groupby and merge for Analytics mode (will be filtered by mode if needed)
    if (cardAboveHasDataframeOperations) {
      // Always suggest chart-maker and correlation (both work in Dashboard and Analytics)
      suggestions.push({
        id: 'chart-maker',
        name: 'Chart maker',
        color: 'bg-pink-500'
      });
      
      suggestions.push({
        id: 'correlation',
        name: 'Correlation',
        color: 'bg-red-500'
      });
      
      // Also suggest these for Analytics mode (will be filtered out in Dashboard mode)
      suggestions.push({
        id: 'groupby-wtg-avg',
        name: 'Groupby',
        color: 'bg-yellow-500'
      });
      
      suggestions.push({
        id: 'merge',
        name: 'Merge',
        color: 'bg-cyan-500'
      });
    }
    
    // If card above has explore, suggest dataframe operations, correlation, and groupby
    if (cardAboveHasExplore) {
      suggestions.push({
        id: 'dataframe-operations',
        name: 'Dataframe operations',
        color: 'bg-purple-500'
      });
      
      suggestions.push({
        id: 'correlation',
        name: 'Correlation',
        color: 'bg-red-500'
      });
      
      suggestions.push({
        id: 'groupby-wtg-avg',
        name: 'Groupby',
        color: 'bg-yellow-500'
      });
    }
    
    // If card above has data upload, suggest column classifier and dataframe operations
    if (cardAboveHasDataUpload) {
      suggestions.push({
        id: 'column-classifier',
        name: 'Column classifier',
        color: 'bg-green-500'
      });
      
      suggestions.push({
        id: 'dataframe-operations',
        name: 'Dataframe operations',
        color: 'bg-purple-500'
      });
    }
    
    // If card above has feature overview, suggest explore, create and transform, and chart maker
    if (cardAboveHasFeatureOverview) {
      suggestions.push({
        id: 'explore',
        name: 'Explore',
        color: 'bg-teal-500'
      });
      
      suggestions.push({
        id: 'create-column',
        name: 'Create and Transform Features',
        color: 'bg-green-500'
      });
      
      suggestions.push({
        id: 'chart-maker',
        name: 'Chart maker',
        color: 'bg-pink-500'
      });
    }
    
    // If card above has column classifier, suggest feature overview, explore, and correlation
    if (cardAboveHasColumnClassifier) {
      suggestions.push({
        id: 'feature-overview',
        name: 'Feature overview',
        color: 'bg-orange-500'
      });
      
      suggestions.push({
        id: 'explore',
        name: 'Explore',
        color: 'bg-teal-500'
      });
      
      suggestions.push({
        id: 'correlation',
        name: 'Correlation',
        color: 'bg-red-500'
      });
    }
    
    // If no atoms in any card but dataframes exist, suggest data upload, column classifier, and dataframe operations
    if (allAtoms.length === 0 && savedDataframes.length > 0) {
      suggestions.push({
        id: 'data-validate',
        name: 'Data validate',
        color: 'bg-blue-500'
      });
      
      suggestions.push({
        id: 'column-classifier',
        name: 'Column classifier',
        color: 'bg-green-500'
      });
      
      suggestions.push({
        id: 'dataframe-operations',
        name: 'Dataframe operations',
        color: 'bg-purple-500'
      });
    }
    
    // If no upload atom and no dataframes, suggest data upload
    if (!hasDataUploadAtom && savedDataframes.length === 0) {
      suggestions.push({
        id: 'data-validate',
        name: 'Data validate',
        color: 'bg-blue-500'
      });
    }
    
    // Apply mode filter if provided (Dashboard mode restriction)
    let filteredSuggestions = suggestions;
    if (allowedAtomIds && allowedAtomIds.length > 0) {
      filteredSuggestions = suggestions.filter(suggestion => allowedAtomIds.includes(suggestion.id));
      
      // If in Dashboard mode and no suggestions match (or no cards exist), show all allowed atoms as defaults
      if (filteredSuggestions.length === 0 && allAtoms.length === 0) {
        // Show all 3 allowed atoms in Dashboard mode when starting fresh
        filteredSuggestions = allowedAtomIds.map(atomId => {
          if (atomId === 'dataframe-operations') {
            return { id: 'dataframe-operations', name: 'Dataframe operations', color: 'bg-purple-500' };
          } else if (atomId === 'chart-maker') {
            return { id: 'chart-maker', name: 'Chart maker', color: 'bg-pink-500' };
          } else if (atomId === 'correlation') {
            return { id: 'correlation', name: 'Correlation', color: 'bg-red-500' };
          }
          return null;
        }).filter(Boolean) as Array<{id: string; name: string; color: string}>;
      }
    }
    
    return filteredSuggestions;
  }, [hasDataUploadAtom, hasColumnClassifierAtom, hasDataframeOperationsAtom, hasFeatureOverviewAtom, hasExploreAtom, hasCorrelationAtom, hasCreateAndTransformAtom, hasChartMakerAtom, hasGroupByAtom, hasMergeAtom, hasConcatAtom, hasScopeSelectorAtom, hasClusteringAtom, hasBuildFeatureBasedAtom, hasBuildAutoregressiveAtom, hasSelectModelsFeatureAtom, hasEvaluateModelsFeatureAtom, hasScenarioPlannerAtom, savedDataframes.length, cards, cardId, allAtoms.length, allowedAtomIds]);

  // Check if we should show the suggestion
  const shouldShowSuggestion = useMemo(() => {
    return isVisible && suggestedAtoms.length > 0;
  }, [isVisible, suggestedAtoms.length]);

  // Fetch dataframes when component becomes visible
  useEffect(() => {
    if (isVisible) {
      fetchSavedDataframes();
    }
  }, [isVisible]);

  // Auto-focus search input when card becomes visible
  useEffect(() => {
    if (isVisible && searchInputRef.current) {
      // Small delay to ensure the component is fully rendered
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isVisible]);

  // Filter available atoms based on search query
  const filteredAtoms = useMemo(() => {
    if (!searchQuery.trim()) {
      return [];
    }
    const query = searchQuery.toLowerCase();
    let filtered = apiAtoms.filter(atom => {
      const name = atom.name || '';
      const description = atom.description || '';
      const tags = atom.tags || [];
      return name.toLowerCase().includes(query) ||
             description.toLowerCase().includes(query) ||
             tags.some(tag => tag && tag.toLowerCase().includes(query));
    });
    
    // Apply mode filter if provided (Dashboard mode restriction)
    if (allowedAtomIds && allowedAtomIds.length > 0) {
      filtered = filtered.filter(atom => allowedAtomIds.includes(atom.id));
    }
    
    return filtered;
  }, [searchQuery, apiAtoms, allowedAtomIds]);

  // Handle adding a suggested atom
  const handleAddSuggestedAtom = (atomId: string, atomName: string, color: string) => {
    if (onAddAtom) {
      const atomData = {
        id: `${atomId}-${Date.now()}`,
        atomId: atomId,
        title: atomName,
        category: 'Data Sources',
        color: color
      };
      onAddAtom(atomId, atomData, cardId);
    }
    onClose();
  };

  // Handle adding atom from search
  const handleAddAtomFromSearch = (atom: {id: string; name: string; description: string; category: string; tags: string[]; color: string}) => {
    if (onAddAtom) {
      const atomData = {
        id: `${atom.id}-${Date.now()}`,
        atomId: atom.id,
        title: atom.name,
        category: atom.category,
        color: atom.color
      };
      onAddAtom(atom.id, atomData, cardId);
    }
    setSearchQuery('');
    setShowSearchResults(false);
    onClose();
  };

  // If suggestion should be shown, return the suggestion
  if (shouldShowSuggestion) {
    return (
      <div className="flex flex-col items-center justify-start text-center w-full">
        {/* Search Bar */}
        <div className="w-full mb-4 relative flex justify-center">
          <div className="relative max-w-md w-full">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 transition-colors duration-200 group-hover:text-blue-500 group-focus-within:text-blue-500" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search for atoms..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchResults(e.target.value.trim().length > 0);
                }}
                onFocus={() => {
                  if (searchQuery.trim().length > 0) {
                    setShowSearchResults(true);
                  }
                }}
                className="w-full pl-12 pr-12 py-3 border-2 border-gray-200 rounded-xl bg-white shadow-sm hover:shadow-md focus:shadow-lg focus:border-blue-400 focus:outline-none transition-all duration-200 placeholder:text-gray-400 text-gray-700 hover:border-gray-300"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setShowSearchResults(false);
                  }}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors duration-200 p-1 rounded-full hover:bg-red-50"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
            {/* Search Results */}
            {showSearchResults && filteredAtoms.length > 0 && (
              <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                {filteredAtoms.map((atom) => (
                  <button
                    key={atom.id}
                    onClick={() => handleAddAtomFromSearch(atom)}
                    className="w-full flex items-start space-x-3 px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-all duration-150 first:rounded-t-xl last:rounded-b-xl active:bg-blue-100"
                  >
                    <div className={`w-3 h-3 ${atom.color} rounded-full mt-1 flex-shrink-0`}></div>
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-sm font-medium text-gray-800 mb-1">{atom.name}</div>
                      <div className="text-xs text-gray-500 mb-1">{atom.category}</div>
                      {atom.description && (
                        <div className="text-xs text-gray-600 mb-2 line-clamp-2">{atom.description}</div>
                      )}
                      {atom.tags && atom.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {atom.tags.slice(0, 3).map((tag: string, index: number) => (
                            <span
                              key={index}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700"
                            >
                              {tag}
                            </span>
                          ))}
                          {atom.tags.length > 3 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-gray-500">
                              +{atom.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            {showSearchResults && searchQuery.trim().length > 0 && filteredAtoms.length === 0 && (
              <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl p-4">
                <p className="text-sm text-gray-500 text-center">No atoms found matching "{searchQuery}"</p>
              </div>
            )}
          </div>
        </div>

        <h3 className="text-lg font-bold text-gray-800 mb-4 mt-10">Select What You Could Do Next...</h3>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {suggestedAtoms.map((atom) => (
            <button
              key={atom.id}
              onClick={() => handleAddSuggestedAtom(atom.id, atom.name, atom.color)}
              className="flex items-center space-x-3 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-full hover:from-blue-100 hover:to-indigo-100 hover:border-blue-300 transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <div className={`w-3 h-3 ${atom.color} rounded-full shadow-sm`}></div>
              <span className="text-sm font-medium text-gray-800">{atom.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // If suggestion should not be shown, return the default empty state message with search
  return (
    <div className="flex flex-col items-center justify-start text-center w-full">
      {/* Search Bar */}
      <div className="w-full mb-4 relative flex justify-center">
        <div className="relative max-w-md w-full">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 transition-colors duration-200 group-hover:text-blue-500 group-focus-within:text-blue-500" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search for atoms..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchResults(e.target.value.trim().length > 0);
              }}
              onFocus={() => {
                if (searchQuery.trim().length > 0) {
                  setShowSearchResults(true);
                }
              }}
              className="w-full pl-12 pr-12 py-3 border-2 border-gray-200 rounded-xl bg-white shadow-sm hover:shadow-md focus:shadow-lg focus:border-blue-400 focus:outline-none transition-all duration-200 placeholder:text-gray-400 text-gray-700 hover:border-gray-300"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setShowSearchResults(false);
                }}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors duration-200 p-1 rounded-full hover:bg-red-50"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          
          {/* Search Results */}
          {showSearchResults && filteredAtoms.length > 0 && (
            <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
              {filteredAtoms.map((atom) => (
                <button
                  key={atom.id}
                  onClick={() => handleAddAtomFromSearch(atom)}
                  className="w-full flex items-start space-x-3 px-4 py-3 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-all duration-150 first:rounded-t-xl last:rounded-b-xl active:bg-blue-100"
                >
                  <div className={`w-3 h-3 ${atom.color} rounded-full mt-1 flex-shrink-0`}></div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-sm font-medium text-gray-800 mb-1">{atom.name}</div>
                    <div className="text-xs text-gray-500 mb-1">{atom.category}</div>
                    {atom.description && (
                      <div className="text-xs text-gray-600 mb-2 line-clamp-2">{atom.description}</div>
                    )}
                    {atom.tags && atom.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {atom.tags.slice(0, 3).map((tag: string, index: number) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700"
                          >
                            {tag}
                          </span>
                        ))}
                        {atom.tags.length > 3 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-gray-500">
                            +{atom.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          
          {showSearchResults && searchQuery.trim().length > 0 && filteredAtoms.length === 0 && (
            <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-xl p-4">
              <p className="text-sm text-gray-500 text-center">No atoms found matching "{searchQuery}"</p>
            </div>
          )}
        </div>
      </div>

      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Grid3X3 className="w-8 h-8 text-gray-400" />
      </div>
      <p className="text-gray-500 mb-2">No atoms in this section</p>
      <p className="text-sm text-gray-400">Search for an atom above or configure this atom for your application</p>
    </div>
  );
};

export default AtomSuggestion;
