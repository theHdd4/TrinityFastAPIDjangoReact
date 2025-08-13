
import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronRight, Sliders, Eye, BarChart2 } from 'lucide-react';
import {
  useLaboratoryStore,
  TextBoxSettings,
  DEFAULT_TEXTBOX_SETTINGS,
  DataUploadSettings,
  DEFAULT_DATAUPLOAD_SETTINGS,
  FeatureOverviewSettings,
  DEFAULT_FEATURE_OVERVIEW_SETTINGS,
  DataFrameOperationsSettings,
  DEFAULT_DATAFRAME_OPERATIONS_SETTINGS,
} from '../store/laboratoryStore';
import DataUploadValidateProperties from '@/components/AtomList/atoms/data-upload-validate/components/properties/DataUploadValidateProperties';
import FeatureOverviewProperties from '@/components/AtomList/atoms/feature-overview/components/properties/FeatureOverviewProperties';
import ConcatProperties from '@/components/AtomList/atoms/concat/components/properties/ConcatProperties';
import MergeProperties from '@/components/AtomList/atoms/merge/components/properties/MergeProperties';
import ColumnClassifierProperties from '@/components/AtomList/atoms/column-classifier/components/properties/ColumnClassifierProperties';
import CreateColumnProperties from '@/components/AtomList/atoms/createcolumn/components/properties/CreateColumnProperties';
import GroupByProperties from '@/components/AtomList/atoms/groupby-wtg-avg/components/properties/GroupByProperties';
import BuildModelFeatureBasedProperties from '@/components/AtomList/atoms/build-model-feature-based/components/properties/BuildModelFeatureBasedProperties';
import ScopeSelectorProperties from '@/components/AtomList/atoms/scope-selector/components/properties/ScopeSelectorProperties';
import DataFrameOperationsProperties from '@/components/AtomList/atoms/dataframe-operations/components/properties/DataFrameOperationsProperties';

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
  const [tab, setTab] = useState('settings');
  const atom = useLaboratoryStore(state =>
    selectedAtomId ? state.getAtom(selectedAtomId) : undefined
  );
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: TextBoxSettings | DataUploadSettings | FeatureOverviewSettings | DataFrameOperationsSettings =
    atom?.settings ||
    (atom?.atomId === 'data-upload-validate'
      ? { ...DEFAULT_DATAUPLOAD_SETTINGS }
      : atom?.atomId === 'feature-overview'
      ? { ...DEFAULT_FEATURE_OVERVIEW_SETTINGS }
      : atom?.atomId === 'dataframe-operations'
      ? { ...DEFAULT_DATAFRAME_OPERATIONS_SETTINGS }
      : { ...DEFAULT_TEXTBOX_SETTINGS });

  useEffect(() => {
    if (!cardExhibited && tab === 'exhibition') {
      setTab('settings');
    }
  }, [cardExhibited]);

  useEffect(() => {
    setTab('settings');
  }, [selectedAtomId, selectedCardId]);
  return (
    <div
      className={`bg-white border-l border-gray-200 transition-all duration-300 flex flex-col h-full ${
        isCollapsed ? 'w-12' : 'w-80'
      }`}
    >
      {/* Toggle Button */}
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        {!isCollapsed && (
          <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
            <Sliders className="w-4 h-4" />
            <span>Properties</span>
          </h3>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="p-1 h-8 w-8"
        >
          {isCollapsed ? (
            <Sliders className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </Button>
      </div>

      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300">
          {!selectedAtomId && !selectedCardId ? (
            <div className="p-4 text-gray-600 text-sm">Please select a Card/Atom</div>
          ) : selectedAtomId && atom?.atomId === 'data-upload-validate' ? (
            <DataUploadValidateProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'feature-overview' ? (
            <FeatureOverviewProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'concat' ? (
            <ConcatProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'merge' ? (
            <MergeProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'column-classifier' ? (
            <ColumnClassifierProperties atomId={selectedAtomId} />
          ) : selectedAtomId && (atom?.atomId === 'create-column' || atom?.atomId === 'createcolumn') ? (
            <CreateColumnProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'groupby-wtg-avg' ? (
            <GroupByProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'dataframe-operations' ? (
            <DataFrameOperationsProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'scope-selector' ? (
            <ScopeSelectorProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'build-model-feature-based' ? (
            <BuildModelFeatureBasedProperties atomId={selectedAtomId} />
          ) : (
          <>
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mx-4 my-4">
              <TabsTrigger value="settings" className="text-xs">
                <Sliders className="w-3 h-3 mr-1" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="visual" className="text-xs">
                <BarChart2 className="w-3 h-3 mr-1" />
                Visualisation
              </TabsTrigger>
              <TabsTrigger
                value="exhibition"
                className="text-xs mr-2"
                data-disabled={!cardExhibited}
                disabled={!cardExhibited}
              >
                <Eye className="w-3 h-3 mr-1" />
                Exhibition
              </TabsTrigger>
            </TabsList>
            
            <div className="px-4">
              <TabsContent value="settings" className="space-y-4">
                {selectedAtomId && (
                  <Card className="p-4 space-y-3">
                    <h4 className="font-medium text-gray-900 mb-3">Atom Settings</h4>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Format</label>
                      <select
                        value={settings.format}
                        onChange={e => updateSettings(selectedAtomId, { format: e.target.value as TextBoxSettings['format'] })}
                        className="w-full border rounded p-1 text-sm"
                      >
                        <option value="quill-delta">quill-delta</option>
                        <option value="markdown">markdown</option>
                        <option value="html">html</option>
                        <option value="plain">plain</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Default Content</label>
                      <Input
                        value={settings.content}
                        onChange={e => updateSettings(selectedAtomId, { content: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={settings.allow_variables}
                        onChange={e => updateSettings(selectedAtomId, { allow_variables: e.target.checked })}
                      />
                      <label className="text-sm text-gray-600">Allow variables</label>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Max Characters</label>
                      <Input
                        type="number"
                        value={settings.max_chars}
                        onChange={e => updateSettings(selectedAtomId, { max_chars: parseInt(e.target.value) || 0 })}
                        className="text-sm"
                      />
                    </div>
                  </Card>
                )}

                <Card className="p-4">
                  <h4 className="font-medium text-gray-900 mb-3">{selectedAtomId ? 'Atom Identity' : 'Card Settings'}</h4>
                  <div className="space-y-3">
                    <div>
                    <label className="text-sm text-gray-600 block mb-1">{selectedAtomId ? 'Atom Name' : 'Card Name'}</label>
                    <Input defaultValue="Untitled Card" className="text-sm" />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Description</label>
                      <Input placeholder="Describe your pipeline..." className="text-sm" />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Tags</label>
                      <div className="flex flex-wrap gap-1 mb-2">
                        <Badge variant="outline" className="text-xs">ML</Badge>
                        <Badge variant="outline" className="text-xs">Analytics</Badge>
                      </div>
                      <Input placeholder="Add tags..." className="text-sm" />
                    </div>
                  </div>
                </Card>
                
              </TabsContent>
              
              <TabsContent value="visual" className="space-y-4">
                {selectedAtomId && (
                  <Card className="p-4 space-y-3">
                    <h4 className="font-medium text-gray-900 mb-3">Visualisation</h4>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Text Align</label>
                      <select
                        value={settings.text_align}
                        onChange={e => updateSettings(selectedAtomId, { text_align: e.target.value as TextBoxSettings['text_align'] })}
                        className="w-full border rounded p-1 text-sm"
                      >
                        <option value="left">left</option>
                        <option value="center">center</option>
                        <option value="right">right</option>
                        <option value="justify">justify</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Font Size</label>
                      <Input
                        type="number"
                        value={settings.font_size}
                        onChange={e => updateSettings(selectedAtomId, { font_size: parseInt(e.target.value) || 0 })}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Font Family</label>
                      <select
                        value={settings.font_family}
                        onChange={e => updateSettings(selectedAtomId, { font_family: e.target.value })}
                        className="w-full border rounded p-1 text-sm"
                      >
                        <option value="Inter">Inter</option>
                        <option value="Arial">Arial</option>
                        <option value="Tahoma">Tahoma</option>
                        <option value="Calibri">Calibri</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Text Color</label>
                      <Input
                        type="color"
                        value={settings.text_color}
                        onChange={e => updateSettings(selectedAtomId, { text_color: e.target.value })}
                        className="text-sm h-8"
                      />
                    </div>
                    <div className="flex items-center space-x-3">
                      <label className="text-sm text-gray-600">Bold</label>
                      <input
                        type="checkbox"
                        checked={settings.bold}
                        onChange={e => updateSettings(selectedAtomId, { bold: e.target.checked })}
                      />
                      <label className="text-sm text-gray-600">Italics</label>
                      <input
                        type="checkbox"
                        checked={settings.italics}
                        onChange={e => updateSettings(selectedAtomId, { italics: e.target.checked })}
                      />
                      <label className="text-sm text-gray-600">Underline</label>
                      <input
                        type="checkbox"
                        checked={settings.underline}
                        onChange={e => updateSettings(selectedAtomId, { underline: e.target.checked })}
                      />
                    </div>
                  </Card>
                )}
              </TabsContent>
              
              <TabsContent value="exhibition" className="space-y-4">
                {selectedAtomId && cardExhibited && (
                  <Card className="p-4 space-y-3">
                    <h4 className="font-medium text-gray-900 mb-3">Exhibition Settings</h4>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Headline</label>
                      <Input
                        value={settings.headline}
                        onChange={e => updateSettings(selectedAtomId, { headline: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Slide Layout</label>
                      <select
                        value={settings.slide_layout}
                        onChange={e => updateSettings(selectedAtomId, { slide_layout: e.target.value as TextBoxSettings['slide_layout'] })}
                        className="w-full border rounded p-1 text-sm"
                      >
                        <option value="full">full</option>
                        <option value="sidebar">sidebar</option>
                        <option value="note-callout">note-callout</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Transition</label>
                      <select
                        value={settings.transition_effect}
                        onChange={e => updateSettings(selectedAtomId, { transition_effect: e.target.value as TextBoxSettings['transition_effect'] })}
                        className="w-full border rounded p-1 text-sm"
                      >
                        <option value="none">none</option>
                        <option value="fade">fade</option>
                        <option value="typewriter">typewriter</option>
                      </select>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={settings.lock_content}
                        onChange={e => updateSettings(selectedAtomId, { lock_content: e.target.checked })}
                      />
                      <label className="text-sm text-gray-600">Lock content</label>
                    </div>
                  </Card>
                )}
              </TabsContent>
            </div>
          </Tabs>

          <div className="p-4 border-t border-gray-200 mt-4">
            <Card className="p-3">
              <h4 className="font-medium text-gray-900 mb-2 text-sm">Execution Log</h4>
              <div className="space-y-1 text-xs">
                <div className="text-green-600">✓ Pipeline initialized</div>
                <div className="text-gray-600">Ready to add atoms</div>
                <div className="text-gray-400">No errors detected</div>
              </div>
            </Card>
          </div>
          </>
        )}
        </div>
      )}
    </div>
  );
  };

export default SettingsPanel;
