
import React from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, ChevronRight, Settings, Eye, BarChart2 } from 'lucide-react';
import { useLaboratoryStore, TextBoxSettings, DEFAULT_TEXTBOX_SETTINGS } from '../store/laboratoryStore';

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
  const atom = useLaboratoryStore(state =>
    selectedAtomId ? state.getAtom(selectedAtomId) : undefined
  );
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: TextBoxSettings = atom?.settings || { ...DEFAULT_TEXTBOX_SETTINGS };
  return (
    <div className={`bg-white border-l border-gray-200 transition-all duration-300 ${
      isCollapsed ? 'w-12' : 'w-80'
    }`}>
      {/* Toggle Button */}
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        {!isCollapsed && (
          <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
            <Settings className="w-4 h-4" />
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
            <ChevronLeft className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </Button>
      </div>

      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto">
          {!selectedAtomId && !selectedCardId ? (
            <div className="p-4 text-gray-600 text-sm">Please select a Card/Atom</div>
          ) : (
          <> 
          <Tabs defaultValue="settings" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mx-4 my-4">
              <TabsTrigger value="settings" className="text-xs">
                <Settings className="w-3 h-3 mr-1" />
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
                      <Input
                        value={settings.font_family}
                        onChange={e => updateSettings(selectedAtomId, { font_family: e.target.value })}
                        className="text-sm"
                      />
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
