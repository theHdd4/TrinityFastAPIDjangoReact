import React, { useState, useEffect, useMemo } from 'react';
import { Grid3X3 } from 'lucide-react';
import { useExhibitionStore } from '../ExhibitionMode/store/exhibitionStore';
import { VALIDATE_API } from '@/lib/api';

interface AtomSuggestionProps {
  cardId?: string;
  isVisible: boolean;
  onClose: () => void;
  onAddAtom?: (atomId: string, atomData: any, targetCardId?: string) => void;
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
  onAddAtom
}) => {
  const [savedDataframes, setSavedDataframes] = useState<SavedFrameMeta[]>([]);
  const [isLoadingDataframes, setIsLoadingDataframes] = useState(false);
  const { cards } = useExhibitionStore();

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
    return allAtoms.some(atom => atom.atomId === 'data-upload-validate');
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
    return allAtoms.some(atom => atom.atomId === 'createcolumn');
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
    
    // Check if the card above has column classifier, feature overview, data upload, explore, dataframe operations, groupby, or merge
    const cardIndex = cards.findIndex(card => card.id === cardId);
    const cardAbove = cardIndex > 0 ? cards[cardIndex - 1] : null;
    const cardAboveHasColumnClassifier = cardAbove?.atoms.some(atom => atom.atomId === 'column-classifier') || false;
    const cardAboveHasFeatureOverview = cardAbove?.atoms.some(atom => atom.atomId === 'feature-overview') || false;
    const cardAboveHasDataUpload = cardAbove?.atoms.some(atom => atom.atomId === 'data-upload-validate') || false;
    const cardAboveHasExplore = cardAbove?.atoms.some(atom => atom.atomId === 'explore') || false;
    const cardAboveHasDataframeOperations = cardAbove?.atoms.some(atom => atom.atomId === 'dataframe-operations') || false;
    const cardAboveHasGroupBy = cardAbove?.atoms.some(atom => atom.atomId === 'groupby-wtg-avg') || false;
    const cardAboveHasMerge = cardAbove?.atoms.some(atom => atom.atomId === 'merge') || false;
    
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
    
    // If card above has dataframe operations, suggest groupby, correlation, and merge
    if (cardAboveHasDataframeOperations) {
      suggestions.push({
        id: 'groupby-wtg-avg',
        name: 'Groupby',
        color: 'bg-yellow-500'
      });
      
      suggestions.push({
        id: 'correlation',
        name: 'Correlation',
        color: 'bg-red-500'
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
        id: 'createcolumn',
        name: 'Create and transform',
        color: 'bg-indigo-500'
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
        id: 'data-upload-validate',
        name: 'Data upload and validate',
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
        id: 'data-upload-validate',
        name: 'Data upload and validate',
        color: 'bg-blue-500'
      });
    }
    
    
    
    return suggestions;
  }, [hasDataUploadAtom, hasColumnClassifierAtom, hasDataframeOperationsAtom, hasFeatureOverviewAtom, hasExploreAtom, hasCorrelationAtom, hasCreateAndTransformAtom, hasChartMakerAtom, hasGroupByAtom, hasMergeAtom, hasConcatAtom, hasScopeSelectorAtom, hasClusteringAtom, savedDataframes.length, cards, cardId, allAtoms.length]);

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

  // If suggestion should be shown, return the suggestion
  if (shouldShowSuggestion) {
    return (
      <div className="flex flex-col items-center justify-center text-center">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Select What You Could Do Next...</h3>
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
        <p className="text-sm text-pink-600 mt-4">
          If your desired atom is not present here, use the search bar (Ctrl+Q) to find it
        </p>
      </div>
    );
  }

  // If suggestion should not be shown, return the default empty state message
  return (
    <div className="flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Grid3X3 className="w-8 h-8 text-gray-400" />
      </div>
      <p className="text-gray-500 mb-2">No atoms in this section</p>
      <p className="text-sm text-gray-400">Configure this atom for your application</p>
    </div>
  );
};

export default AtomSuggestion;
