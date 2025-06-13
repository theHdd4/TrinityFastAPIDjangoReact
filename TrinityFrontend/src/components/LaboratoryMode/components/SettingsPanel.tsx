
import React from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, ChevronRight, Settings, Eye, BarChart2 } from 'lucide-react';

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
                <Card className="p-4">
                  <h4 className="font-medium text-gray-900 mb-3">{selectedAtomId ? 'Atom Settings' : 'Card Settings'}</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Pipeline Name</label>
                      <Input defaultValue="Untitled Pipeline" className="text-sm" />
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
                
                {selectedAtomId && (
                  <Card className="p-4">
                  <h4 className="font-medium text-gray-900 mb-3">Atom Parameters</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm text-gray-600 block mb-1">Atom Name</label>
                        <Input defaultValue="Data Import" className="text-sm" />
                      </div>
                      <div>
                        <label className="text-sm text-gray-600 block mb-1">Parameters</label>
                        <div className="space-y-2">
                          <Input placeholder="file_path" className="text-sm" />
                          <Input placeholder="delimiter" className="text-sm" />
                        </div>
                      </div>
                    </div>
                  </Card>
                )}
              </TabsContent>
              
              <TabsContent value="visual" className="space-y-4">
                <Card className="p-4">
                  <h4 className="font-medium text-gray-900 mb-3">Visualisation</h4>
                  <div className="bg-gray-100 p-3 rounded text-xs font-mono">
                    <pre className="text-gray-700">
{`import pandas as pd
data = pd.read_csv('data.csv')
data.info()`}
                    </pre>
                  </div>
                </Card>
              </TabsContent>
              
              <TabsContent value="exhibition" className="space-y-4">
                <Card className="p-4">
                  <h4 className="font-medium text-gray-900 mb-3">Exhibition Settings</h4>
                  <div className="bg-gray-50 p-3 rounded text-sm">
                    <p className="text-gray-600">No output yet. Run the pipeline to see results.</p>
                  </div>
                </Card>
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
