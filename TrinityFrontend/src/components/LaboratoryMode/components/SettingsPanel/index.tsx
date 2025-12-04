import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight, Sliders, Sparkles } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { TRINITY_AI_API } from '@/lib/api';
import { getAtomHandler } from '@/components/TrinityAI/handlers';
import { useToast } from '@/hooks/use-toast';
import { Message } from '@/components/TrinityAI/handlers/types';

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
  const addCard = useLaboratoryStore(state => state.addCard);
  const { toast } = useToast();
  
  // State for metric prompt dialog
  const [metricPromptOpen, setMetricPromptOpen] = useState(false);
  const [metricPromptText, setMetricPromptText] = useState('');
  const [sendingMetricPrompt, setSendingMetricPrompt] = useState(false);
  const [metricMessages, setMetricMessages] = useState<Message[]>([]);

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
              <div className="flex items-center gap-1">
                <TabsTrigger value="metrics" className="text-sm font-bold flex-1">Metrics</TabsTrigger>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMetricPromptOpen(true)}
                  className="h-6 w-6 p-0 text-gray-500 hover:text-blue-600"
                  title="AI Prompt for Metrics"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </Button>
              </div>
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
      
      {/* Metric Prompt Dialog */}
      <Dialog open={metricPromptOpen} onOpenChange={setMetricPromptOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>AI Metric Prompt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              placeholder="Describe what metric operation you want to perform... (e.g., 'create a variable that sums sales by region', 'filter rows where channel equals iceland')"
              value={metricPromptText}
              onChange={(e) => setMetricPromptText(e.target.value)}
              className="min-h-[100px] text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSendMetricPrompt();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMetricPromptOpen(false);
                setMetricPromptText('');
              }}
              disabled={sendingMetricPrompt}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendMetricPrompt}
              disabled={!metricPromptText.trim() || sendingMetricPrompt}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {sendingMetricPrompt ? 'Sending...' : 'Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
  
  // Function to send metric prompt via REST API (like other atoms)
  async function handleSendMetricPrompt() {
    if (!metricPromptText.trim() || sendingMetricPrompt) return;
    
    setSendingMetricPrompt(true);
    
    console.log('🚀🚀🚀 handleSendMetricPrompt START');
    console.log('  - metricPromptText:', metricPromptText);
    console.log('  - sendingMetricPrompt:', sendingMetricPrompt);
    
    try {
      console.log('📋 ENTERING TRY BLOCK');
      // Get environment context
      const envStr = localStorage.getItem('env');
      let client_name = '';
      let app_name = '';
      let project_name = '';
      
      if (envStr) {
        try {
          const env = JSON.parse(envStr);
          client_name = env.CLIENT_NAME || '';
          app_name = env.APP_NAME || '';
          project_name = env.PROJECT_NAME || '';
        } catch {
          // Ignore parse errors
        }
      }
      
      // Get session ID
      const sessionId = localStorage.getItem('current_session_id') || `session_${Date.now()}`;
      
      // Call metric REST endpoint directly (like other atoms)
      const endpoint = `${TRINITY_AI_API}/metric`;
      console.log('🔗 Calling metric REST endpoint:', endpoint);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          prompt: metricPromptText.trim(),
          session_id: sessionId,
          client_name,
          app_name,
          project_name
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('✅ Metric API response:', data);
      
      // Handle the response using metricHandler - NO CARD CREATION NEEDED
      // Just update the metrics section UI directly
      console.log('='.repeat(80));
      console.log('📋 SETTINGS PANEL - METRIC HANDLER FLOW');
      console.log('='.repeat(80));
      console.log('📋 STEP 1: Processing metric response...');
      console.log('  - data.success:', data.success);
      console.log('  - data structure:', {
        hasData: !!data.data,
        operationType: data.operation_type || data.data?.operation_type,
        topLevelKeys: Object.keys(data)
      });
      
      if (data.success !== false) {
        // Use selectedAtomId if available, otherwise generate a temporary one
        const metricAtomId = selectedAtomId || `metric_${Date.now()}`;
        console.log('📋 STEP 2: Using atomId:', metricAtomId);
        console.log('📋 STEP 3: Getting metric handler...');
        const metricHandler = getAtomHandler('metric');
        console.log('  - Handler found:', !!metricHandler);
        
        if (metricHandler) {
          // Create a safe wrapper for setMessages
          const safeSetMessages = (updater: (prev: Message[]) => Message[]) => {
            if (typeof setMetricMessages !== 'function') {
              console.warn('⚠️ setMetricMessages is not a function, skipping');
              return;
            }
            setMetricMessages((prev: Message[]) => {
              if (!Array.isArray(prev)) {
                return updater([]);
              }
              return updater(prev);
            });
          };
          
          console.log('📋 STEP 4: Creating handler context...');
          const context = {
            atomId: metricAtomId,
            atomType: 'metric',
            atomTitle: 'Metric',
            sessionId: sessionId,
            updateAtomSettings: (id: string, settings: any) => {
              useLaboratoryStore.getState().updateAtomSettings(id, settings);
            },
            setMessages: safeSetMessages
          };
          
          console.log('📋 STEP 5: Calling metricHandler.handleSuccess...');
          try {
            await metricHandler.handleSuccess(data, context);
            console.log('✅ Handler completed successfully');
            
            toast({
              title: "Success",
              description: "Metric operation completed successfully!",
            });
          } catch (handlerError: any) {
            console.error('❌ Error in metricHandler.handleSuccess:', handlerError);
            console.error('  - Error message:', handlerError?.message);
            console.error('  - Error stack:', handlerError?.stack);
            
            toast({
              title: "Error",
              description: handlerError.message || "Failed to process metric operation",
              variant: "destructive",
            });
            throw handlerError;
          }
        } else {
          console.error('❌ Metric handler not found');
          toast({
            title: "Error",
            description: "Metric handler not found",
            variant: "destructive",
          });
        }
      } else {
        // Handle failure case
        toast({
          title: "Error",
          description: data.error || data.smart_response || "Failed to process metric request",
          variant: "destructive",
        });
      }
      
      // Close dialog and reset
      setMetricPromptOpen(false);
      setMetricPromptText('');
      
    } catch (error: any) {
      console.error('='.repeat(80));
      console.error('❌ OUTER CATCH: Failed to process metric prompt');
      console.error('='.repeat(80));
      console.error('  - Error type:', typeof error);
      console.error('  - Error name:', error?.name);
      console.error('  - Error message:', error?.message);
      console.error('  - Error stack:', error?.stack);
      console.error('  - Full error:', error);
      console.error('='.repeat(80));
      
      toast({
        title: "Error",
        description: error.message || "Failed to process metric request",
        variant: "destructive",
      });
    } finally {
      setSendingMetricPrompt(false);
    }
  }
};

export default SettingsPanel;
