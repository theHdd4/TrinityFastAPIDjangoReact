import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VALIDATE_API } from '@/lib/api';

interface ConcatSettingsProps {
  settings: {
    file1: string;
    file2: string;
    direction: string;
    performConcat: boolean;
  };
  onSettingsChange: (settings: any) => void;
  onPerformConcat?: () => void;
}

interface Frame { object_name: string; csv_name: string; }

const ConcatSettings: React.FC<ConcatSettingsProps> = ({ settings, onSettingsChange, onPerformConcat }) => {
  const [frames, setFrames] = useState<Frame[]>([]);

  useEffect(() => {
    fetch(`${VALIDATE_API}/list_saved_dataframes`)
      .then(r => r.json())
      .then(d => setFrames(Array.isArray(d.files) ? d.files : []))
      .catch(() => setFrames([]));
  }, []);

  return (
    <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 to-blue-50 overflow-y-auto">
      <Tabs defaultValue="inputs" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="inputs">Inputs</TabsTrigger>
          <TabsTrigger value="options">Concat Options</TabsTrigger>
        </TabsList>
        
        <TabsContent value="inputs" className="space-y-4">
          <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-1">
              <div className="bg-white rounded-sm">
                <div className="p-6">
                  <div className="flex items-center mb-4">
                    <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full mr-4"></div>
                    <h4 className="text-xl font-bold text-gray-900 mb-3">Input Files</h4>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">File 1</label>
                      <Select value={settings.file1} onValueChange={val => onSettingsChange({ ...settings, file1: val })}>
                        <SelectTrigger className="bg-blue-50 border border-blue-200">
                          <SelectValue placeholder="Select first dataframe" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Array.isArray(frames) ? frames : []).map(f => (
                            <SelectItem key={f.object_name} value={f.object_name}>
                              {f.csv_name.split('/').pop()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">File 2</label>
                      <Select value={settings.file2} onValueChange={val => onSettingsChange({ ...settings, file2: val })}>
                        <SelectTrigger className="bg-green-50 border border-green-200">
                          <SelectValue placeholder="Select second dataframe" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Array.isArray(frames) ? frames : []).map(f => (
                            <SelectItem key={f.object_name} value={f.object_name}>
                              {f.csv_name.split('/').pop()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
        
        <TabsContent value="options" className="space-y-4">
          <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm overflow-hidden">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-1">
              <div className="bg-white rounded-sm">
                <div className="p-6">
                  <div className="flex items-center mb-4">
                    <div className="w-1 h-8 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full mr-4"></div>
                    <h4 className="text-xl font-bold text-gray-900 mb-3">Concatenation Settings</h4>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-600 block mb-2">Direction</label>
                      <Select value={settings.direction} onValueChange={(value) => onSettingsChange({ ...settings, direction: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select direction" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="vertical">vertical</SelectItem>
                          <SelectItem value="horizontal">horizontal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <label className="text-sm text-gray-600 block mb-2">Number of rows to preview</label>
                      <Select defaultValue="6">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5</SelectItem>
                          <SelectItem value="6">6</SelectItem>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <Button 
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={onPerformConcat}
                    >
                      Perform Concatenate
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ConcatSettings;