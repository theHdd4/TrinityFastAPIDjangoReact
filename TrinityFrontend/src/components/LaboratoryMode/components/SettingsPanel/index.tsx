import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight, Sliders } from 'lucide-react';

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

import ExploreProperties from '@/components/AtomList/atoms/explore/components/properties/ExploreProperties';
import SelectModelsFeatureProperties from '@/components/AtomList/atoms/select-models-feature/components/properties/SelectModelsFeatureProperties';
import EvaluateModelsFeatureProperties from '@/components/AtomList/atoms/evaluate-models-feature/components/properties/EvaluateModelsFeatureProperties';
import PivotTableProperties from '@/components/AtomList/atoms/pivot-table/components/PivotTableProperties';
import { UnpivotProperties } from '@/components/AtomList/atoms/unpivot';
import AtomSettingsTabs from './AtomSettingsTabs';
import CardSettingsTabs from './CardSettingsTabs';

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
  const [tab, setTab] = useState<'variables' | 'text-box' | 'settings' | 'visual' | 'exhibition'>(
    'variables',
  );

  const atom = useLaboratoryStore((state) =>
    selectedAtomId ? state.getAtom(selectedAtomId) : undefined
  );
  const updateSettings = useLaboratoryStore((state) => state.updateAtomSettings);
  const cards = useLaboratoryStore(state => state.cards);
  const addCardVariable = useLaboratoryStore(state => state.addCardVariable);
  const updateCardVariable = useLaboratoryStore(state => state.updateCardVariable);
  const deleteCardVariable = useLaboratoryStore(state => state.deleteCardVariable);
  const toggleCardVariableAppend = useLaboratoryStore(state => state.toggleCardVariableAppend);

  const selectedCard = useMemo(
    () => (selectedCardId ? cards.find(card => card.id === selectedCardId) : undefined),
    [cards, selectedCardId],
  );

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
      setTab(selectedAtomId ? 'settings' : 'variables');
    }
  }, [cardExhibited, selectedAtomId, tab]);

  useEffect(() => {
    if (selectedAtomId) {
      setTab(current => (current === 'visual' || current === 'exhibition' ? current : 'settings'));
    } else if (selectedCardId) {
      setTab(current =>
        current === 'variables' || current === 'text-box' || current === 'visual' ? current : 'variables',
      );
    }
  }, [selectedAtomId, selectedCardId]);



  return (
    <div
      className={`bg-white border-l border-gray-200 transition-all duration-300 flex flex-col h-full ${
        isCollapsed ? 'w-12' : 'w-80'
      }`}
    >
      {/* Toggle / Header */}
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        {!isCollapsed && (
          <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
            <Sliders className="w-4 h-4" />
            <span>Properties</span>
          </h3>
        )}
        <Button variant="ghost" size="sm" onClick={onToggle} className="p-1 h-8 w-8">
          {isCollapsed ? <Sliders className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </Button>
      </div>

      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300">
          {!selectedAtomId && !selectedCardId ? (
            <div className="p-4 text-gray-600 text-sm">Please select a Card/Atom</div>
          ) : selectedCardId && !selectedAtomId && selectedCard ? (
            <CardSettingsTabs
              card={selectedCard}
              tab={tab}
              setTab={setTab}
              onAddVariable={addCardVariable}
              onUpdateVariable={updateCardVariable}
              onDeleteVariable={deleteCardVariable}
              onToggleVariable={toggleCardVariableAppend}
            />
          ) : selectedCardId && !selectedAtomId && !selectedCard ? (
            <div className="p-4 text-gray-600 text-sm">Card not found. Try selecting another card.</div>
          ) : selectedAtomId && atom?.atomId === 'data-upload-validate' ? (
            <DataUploadValidateProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'feature-overview' ? (
            <FeatureOverviewProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'groupby-wtg-avg' ? (
            <GroupByProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'create-column' ? (
            <CreateColumnProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'explore' ? (
            <ExploreProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'chart-maker' ? (
            <ChartMakerProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'pivot-table' ? (
            <PivotTableProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'unpivot' ? (
            <UnpivotProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'build-model-feature-based' ? (
            <BuildModelFeatureBasedPropertiesPanel atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'select-models-feature' ? (
            <SelectModelsFeatureProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'auto-regressive-models' ? (
            <AutoRegressiveModelsProperties atomId={selectedAtomId} />
                     ) : selectedAtomId && atom?.atomId === 'evaluate-models-feature' ? (
             <EvaluateModelsFeatureProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'concat' ? (
            <ConcatProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'scope-selector' ? (
            <ScopeSelectorProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'merge' ? (
            <MergeProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'column-classifier' ? (
            <ColumnClassifierProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'dataframe-operations' ? (
            <DataFrameOperationsProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'groupby-wtg-avg' ? (
            <GroupByProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'create-column' ? (
            <CreateColumnProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'correlation' ? (
            <CorrelationProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'clustering' ? (
            <ClusteringProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'scenario-planner' ? (
            <ScenarioPlannerProperties atomId={selectedAtomId} />
          ) : (
            <AtomSettingsTabs
              tab={tab}
              setTab={setTab}
              selectedAtomId={selectedAtomId!}
              cardExhibited={cardExhibited}
              settings={settings as TextBoxSettings}
              updateSettings={updateSettings}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;
