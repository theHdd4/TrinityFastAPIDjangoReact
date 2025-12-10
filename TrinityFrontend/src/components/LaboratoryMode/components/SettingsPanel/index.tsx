import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight, Sliders } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  useLaboratoryStore,
  TextBoxSettings,
  DEFAULT_TEXTBOX_SETTINGS,
  DataUploadSettings,
  createDefaultDataUploadSettings,
  FeatureOverviewSettings,
  DEFAULT_FEATURE_OVERVIEW_SETTINGS,
  DataFrameOperationsSettings,
  DEFAULT_DATAFRAME_OPERATIONS_SETTINGS,
  CorrelationSettings,
  DEFAULT_CORRELATION_SETTINGS,
  ChartMakerSettings,
  DEFAULT_CHART_MAKER_SETTINGS,
  ClusteringSettings,
  DEFAULT_CLUSTERING_SETTINGS,
  ScenarioPlannerSettings,
  DEFAULT_SCENARIO_PLANNER_SETTINGS,
  SelectModelsFeatureSettings,
  DEFAULT_SELECT_MODELS_FEATURE_SETTINGS,
  CardVariable,
  LayoutCard,
} from '../../store/laboratoryStore';

import DataUploadValidateProperties from '@/components/AtomList/atoms/data-upload-validate/components/properties/DataUploadValidateProperties';
import FeatureOverviewProperties from '@/components/AtomList/atoms/feature-overview/components/properties/FeatureOverviewProperties';
import GroupByProperties from '@/components/AtomList/atoms/groupby-wtg-avg/components/properties/GroupByProperties';
import ConcatProperties from '@/components/AtomList/atoms/concat/components/properties/ConcatProperties';
import ScopeSelectorProperties from '@/components/AtomList/atoms/scope-selector/components/properties/ScopeSelectorProperties';
import CreateColumnProperties from '@/components/AtomList/atoms/createcolumn/components/properties/CreateColumnProperties';
import BuildModelFeatureBasedPropertiesPanel from '@/components/AtomList/atoms/build-model-feature-based/components/properties/BuildModelFeatureBasedProperties';
import AutoRegressiveModelsProperties from '@/components/AtomList/atoms/auto-regressive-models/components/properties/AutoRegressiveModelsProperties';
import MergeProperties from '@/components/AtomList/atoms/merge/components/properties/MergeProperties';
import ColumnClassifierProperties from '@/components/AtomList/atoms/column-classifier/components/properties/ColumnClassifierProperties';
import DataFrameOperationsProperties from '@/components/AtomList/atoms/dataframe-operations/components/properties/DataFrameOperationsProperties';
import CorrelationProperties from '@/components/AtomList/atoms/correlation/components/properties/CorrelationProperties';
import ChartMakerProperties from '@/components/AtomList/atoms/chart-maker/components/properties/ChartMakerProperties';
import ClusteringProperties from '@/components/AtomList/atoms/clustering/components/properties/ClusteringProperties';
import { ScenarioPlannerProperties } from '@/components/AtomList/atoms/scenario-planner/components/properties/ScenarioPlannerProperties';
import TableProperties from '@/components/AtomList/atoms/table/components/properties/TableProperties';

import ExploreProperties from '@/components/AtomList/atoms/explore/components/properties/ExploreProperties';
import SelectModelsFeatureProperties from '@/components/AtomList/atoms/select-models-feature/components/properties/SelectModelsFeatureProperties';
import EvaluateModelsFeatureProperties from '@/components/AtomList/atoms/evaluate-models-feature/components/properties/EvaluateModelsFeatureProperties';
import PivotTableProperties from '@/components/AtomList/atoms/pivot-table/components/PivotTableProperties';
import { UnpivotProperties } from '@/components/AtomList/atoms/unpivot';
import AtomSettingsTabs from './AtomSettingsTabs';
import CardSettingsTabs from './metricstabs/CardSettingsTabs';

interface SettingsPanelProps {
  isCollapsed: boolean;
  onToggle: () => void;
  selectedAtomId?: string;
  selectedCardId?: string;
  cardExhibited?: boolean;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isCollapsed,
  onToggle,
  selectedAtomId,
  selectedCardId,
  cardExhibited,
}) => {
  const metricsInputs = useLaboratoryStore(state => state.metricsInputs);
  const updateMetricsInputs = useLaboratoryStore(state => state.updateMetricsInputs);
  const tab = metricsInputs.currentTab;
  const setTab = (value: 'input' | 'variables' | 'column-operations' | 'exhibition') => {
    updateMetricsInputs({ currentTab: value });
  };
  const atom = useLaboratoryStore((state) =>
    selectedAtomId ? state.getAtom(selectedAtomId) : undefined
  );
  const updateSettings = useLaboratoryStore((state) => state.updateAtomSettings);
  const updateCard = useLaboratoryStore(state => state.updateCard);
  const cards = useLaboratoryStore(state => state.cards);
  const addCardVariable = useLaboratoryStore(state => state.addCardVariable);
  const updateCardVariable = useLaboratoryStore(state => state.updateCardVariable);
  const deleteCardVariable = useLaboratoryStore(state => state.deleteCardVariable);
  const toggleCardVariableAppend = useLaboratoryStore(state => state.toggleCardVariableAppend);

  const selectedCard = useMemo(
    () => {
      if (selectedCardId) {
        return cards.find(card => card.id === selectedCardId);
      }
      // If no card is selected but an atom is selected, find the card containing that atom
      if (selectedAtomId && !selectedCardId) {
        return cards.find(card => 
          Array.isArray(card.atoms) && card.atoms.some(atom => atom.id === selectedAtomId)
        );
      }
      return undefined;
    },
    [cards, selectedCardId, selectedAtomId],
  );

  // Create a default global card for metrics operations when no card is selected
  const globalCard = useMemo(
    () => ({
      id: 'global-metrics',
      atoms: [],
      isExhibited: false,
      variables: [] as CardVariable[],
    }),
    [],
  );

  // Use selectedCard if available, otherwise use globalCard for Metrics tab
  const cardForMetrics = selectedCard || globalCard;

  // Initialize mainTab based on initial selection state
  const [mainTab, setMainTab] = useState<'settings' | 'metrics'>(() => {
    // If no atom or card is selected, default to metrics
    if (!selectedAtomId && !selectedCardId) {
      return 'metrics';
    }
    // If card is selected (with or without atom), default to metrics
    if (selectedCardId) {
      return 'metrics';
    }
    // Only atom selected (no card) - default to settings
    return 'settings';
  });

  const settings:
    | TextBoxSettings
    | DataUploadSettings
    | FeatureOverviewSettings
    | DataFrameOperationsSettings
    | ChartMakerSettings
    | CorrelationSettings
    | ClusteringSettings
    | ScenarioPlannerSettings
    | SelectModelsFeatureSettings =
    atom?.settings ||
    (atom?.atomId === 'correlation'
      ? { ...DEFAULT_CORRELATION_SETTINGS }
      : atom?.atomId === 'clustering'
      ? { ...DEFAULT_CLUSTERING_SETTINGS }
      : atom?.atomId === 'scenario-planner'
      ? { ...DEFAULT_SCENARIO_PLANNER_SETTINGS }
      : atom?.atomId === 'data-upload-validate'
      ? createDefaultDataUploadSettings()
      : atom?.atomId === 'feature-overview'
      ? { ...DEFAULT_FEATURE_OVERVIEW_SETTINGS }
      : atom?.atomId === 'dataframe-operations'
      ? { ...DEFAULT_DATAFRAME_OPERATIONS_SETTINGS }
      : atom?.atomId === 'chart-maker'
      ? { ...DEFAULT_CHART_MAKER_SETTINGS }
      : atom?.atomId === 'select-models-feature'
      ? { ...DEFAULT_SELECT_MODELS_FEATURE_SETTINGS }
      : { ...DEFAULT_TEXTBOX_SETTINGS });

  useEffect(() => {
    if (!cardExhibited && tab === 'exhibition') {
      setTab('input');
    }
  }, [cardExhibited, tab, setTab]);

  // Track previous selection to only set defaults on initial selection, not on every change
  const prevSelection = React.useRef({ selectedAtomId, selectedCardId });
  const isInitialMount = React.useRef(true);
  
  useEffect(() => {
    const selectionChanged = 
      prevSelection.current.selectedAtomId !== selectedAtomId ||
      prevSelection.current.selectedCardId !== selectedCardId;
    
    // On initial mount or when selection changes
    if (isInitialMount.current || selectionChanged) {
      // Only set defaults when selection actually changes (initial selection)
      if (selectedCardId) {
        // When card is selected (with or without atom), default to Metrics tab
        // Only set to 'input' if current tab is 'exhibition' (invalid state)
        if (tab === 'exhibition') {
          setTab('input');
        }
        setMainTab('metrics');
      } else if (selectedAtomId) {
        // Only atom selected (no card) - default to Settings tab
        setMainTab('settings');
      } else {
        // No card or atom selected - force to Metrics tab
        setMainTab('metrics');
      }
      
      prevSelection.current = { selectedAtomId, selectedCardId };
      isInitialMount.current = false;
    }
  }, [selectedAtomId, selectedCardId, tab, setTab]);

  // Set context for metric operations (for table atom auto-display)
  useEffect(() => {
    if (mainTab === 'metrics') {
      // Get the atom ID - prefer selectedAtomId, otherwise get first atom from selectedCard
      const contextAtomId = selectedAtomId || (selectedCard?.atoms && selectedCard.atoms.length > 0 
        ? selectedCard.atoms[0].id 
        : undefined);
      
      // Get card ID - prefer selectedCardId, otherwise find card containing the atom
      const contextCardId = selectedCardId || (selectedAtomId && selectedCard
        ? selectedCard.id
        : undefined);
      
      // Always set context when metrics tab is active (even if no selection, clear it)
      updateMetricsInputs({
        contextCardId: contextCardId || undefined,
        contextAtomId: contextAtomId || undefined,
      });
      
      console.log('📋 [Metrics Context] Updated context:', {
        mainTab,
        contextCardId,
        contextAtomId,
        selectedCardId,
        selectedAtomId,
        hasSelectedCard: !!selectedCard
      });
    }
  }, [mainTab, selectedCardId, selectedAtomId, selectedCard, updateMetricsInputs]);

  return (
    <div
      className={`bg-white border-l border-gray-200 transition-all duration-300 flex flex-col h-full ${
        isCollapsed ? 'w-12' : 'w-80'
      }`}
    >
      {/* Toggle / Header */}
      <div className="p-2 border-b border-gray-200 flex items-center justify-between">
        {!isCollapsed && (
          <h3 className="text-sm font-medium text-gray-900 flex items-center space-x-2">
            <Sliders className="w-3.5 h-3.5" />
            <span>Properties</span>
          </h3>
        )}
        <Button variant="ghost" size="sm" onClick={onToggle} className="p-1 h-8 w-8">
          {isCollapsed ? <Sliders className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </Button>
      </div>

      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 flex flex-col text-sm">
          <Tabs value={mainTab} onValueChange={(value) => setMainTab(value as 'settings' | 'metrics')} className="flex-1 flex flex-col">
            <TabsList className={`grid w-full ${selectedAtomId || selectedCardId ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {(selectedAtomId || selectedCardId) && (
                <TabsTrigger value="settings" className="text-sm font-bold">Settings</TabsTrigger>
              )}
              <TabsTrigger value="metrics" className="text-sm font-bold">Metrics</TabsTrigger>
            </TabsList>

            {/* Settings Tab Content */}
            <TabsContent value="settings" className="flex-1 mt-0">
              {selectedAtomId ? (
                <>
                  {atom?.atomId === 'data-upload-validate' ? (
                    <DataUploadValidateProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'feature-overview' ? (
                    <FeatureOverviewProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'groupby-wtg-avg' ? (
                    <GroupByProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'create-column' ? (
                    <CreateColumnProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'explore' ? (
                    <ExploreProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'chart-maker' ? (
                    <ChartMakerProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'pivot-table' ? (
                    <PivotTableProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'unpivot' ? (
                    <UnpivotProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'build-model-feature-based' ? (
                    <BuildModelFeatureBasedPropertiesPanel atomId={selectedAtomId} />
                  ) : atom?.atomId === 'select-models-feature' ? (
                    <SelectModelsFeatureProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'auto-regressive-models' ? (
                    <AutoRegressiveModelsProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'evaluate-models-feature' ? (
                    <EvaluateModelsFeatureProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'concat' ? (
                    <ConcatProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'scope-selector' ? (
                    <ScopeSelectorProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'merge' ? (
                    <MergeProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'column-classifier' ? (
                    <ColumnClassifierProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'dataframe-operations' ? (
                    <DataFrameOperationsProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'table' ? (
                    <TableProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'correlation' ? (
                    <CorrelationProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'clustering' ? (
                    <ClusteringProperties atomId={selectedAtomId} />
                  ) : atom?.atomId === 'scenario-planner' ? (
                    <ScenarioPlannerProperties atomId={selectedAtomId} />
                  ) : (
                    <AtomSettingsTabs
                      tab={tab}
                      setTab={setTab}
                      selectedAtomId={selectedAtomId}
                      cardExhibited={cardExhibited}
                      settings={settings as TextBoxSettings}
                      updateSettings={updateSettings}
                    />
                  )}
                </>
              ) : selectedCardId ? (
                <div className="p-4 text-gray-600 text-sm">Select an Atom to view its settings.</div>
              ) : (
                <div className="p-4 text-gray-600 text-sm">Please select a Card/Atom</div>
              )}
            </TabsContent>

            {/* Metrics Tab Content */}
            <TabsContent value="metrics" className="flex-1 mt-0">
              <CardSettingsTabs
                card={cardForMetrics}
                tab={tab}
                setTab={setTab}
                onAddVariable={addCardVariable}
                onUpdateVariable={updateCardVariable}
                onDeleteVariable={deleteCardVariable}
                onToggleVariable={toggleCardVariableAppend}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;