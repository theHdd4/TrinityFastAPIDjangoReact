import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertCircle, Save } from 'lucide-react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { saveTable } from '../../services/tableApi';
import { useToast } from '@/hooks/use-toast';

interface Props {
  atomId: string;
}

const TableSettingsTab: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings = atom?.settings || {};
  const { toast } = useToast();

  const [saveLoading, setSaveLoading] = useState(false);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');

  const handleSettingChange = (key: string, value: any) => {
    updateSettings(atomId, { [key]: value });
  };

  // Save As - opens dialog to enter filename
  const handleSaveAs = () => {
    if (!settings.tableId) {
      toast({
        title: 'Error',
        description: 'No table data to save',
        variant: 'destructive'
      });
      return;
    }
    
    // Generate default filename
    const defaultName = `table_${Date.now()}`;
    setSaveFileName(defaultName);
    setShowSaveAsDialog(true);
  };

  // Confirm Save As
  const confirmSaveAs = async () => {
    if (!settings.tableId) return;
    
    setSaveLoading(true);
    try {
      const filename = saveFileName.trim() || `table_${Date.now()}`;
      const response = await saveTable(settings.tableId, filename, false);
      
      toast({
        title: 'Success',
        description: `Table saved as ${response.object_name}`,
      });
      
      // Update settings with new file reference
      updateSettings(atomId, {
        sourceFile: response.object_name,
        savedFile: response.object_name
      });
      
      setShowSaveAsDialog(false);
      setSaveFileName('');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save table',
        variant: 'destructive'
      });
    } finally {
      setSaveLoading(false);
    }
  };

  // Save (overwrite original)
  const handleSave = () => {
    if (!settings.tableId) {
      toast({
        title: 'Error',
        description: 'No table data to save',
        variant: 'destructive'
      });
      return;
    }
    
    if (!settings.sourceFile) {
      toast({
        title: 'Error',
        description: 'No original file to overwrite. Use "Save As" instead.',
        variant: 'destructive'
      });
      return;
    }
    
    setShowOverwriteDialog(true);
  };

  // Confirm overwrite Save
  const confirmOverwriteSave = async () => {
    if (!settings.tableId || !settings.sourceFile) return;
    
    setShowOverwriteDialog(false);
    setSaveLoading(true);
    
    try {
      const response = await saveTable(settings.tableId, settings.sourceFile, true);
      
      toast({
        title: 'Success',
        description: 'Table saved successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save table',
        variant: 'destructive'
      });
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <Card className="p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Display Options</h3>

        {/* Show Row Numbers */}
        <div className="flex items-center justify-between">
          <Label htmlFor="showRowNumbers" className="text-sm">
            Show Row Numbers
          </Label>
          <Switch
            id="showRowNumbers"
            checked={settings.showRowNumbers ?? true}
            onCheckedChange={(checked) => handleSettingChange('showRowNumbers', checked)}
          />
        </div>

        {/* Show Summary Row */}
        <div className="flex items-center justify-between">
          <Label htmlFor="showSummaryRow" className="text-sm">
            Show Summary Row
          </Label>
          <Switch
            id="showSummaryRow"
            checked={settings.showSummaryRow ?? false}
            onCheckedChange={(checked) => handleSettingChange('showSummaryRow', checked)}
          />
        </div>

        {/* Row Height */}
        <div className="space-y-2">
          <Label className="text-sm">
            Row Height: {settings.rowHeight || 32}px
          </Label>
          <Slider
            min={24}
            max={64}
            step={4}
            value={[settings.rowHeight || 32]}
            onValueChange={([value]) => handleSettingChange('rowHeight', value)}
            className="w-full"
          />
        </div>

        {/* Page Size */}
        <div className="space-y-2">
          <Label className="text-sm">Rows per Page</Label>
          <select
            value={settings.pageSize || 50}
            onChange={(e) => handleSettingChange('pageSize', parseInt(e.target.value))}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
          </select>
        </div>
      </Card>

      {/* Save Actions */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800">Save Table</h3>
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={saveLoading || !settings.tableId || !settings.sourceFile}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            size="sm"
          >
            {saveLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save
              </>
            )}
          </Button>
          <Button
            onClick={handleSaveAs}
            disabled={saveLoading || !settings.tableId}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            size="sm"
          >
            {saveLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save As
              </>
            )}
          </Button>
        </div>
        {settings.sourceFile && (
          <p className="text-xs text-gray-500">
            Original file: {settings.sourceFile.split('/').pop()}
          </p>
        )}
      </Card>

      {/* Save As Dialog */}
      <Dialog open={showSaveAsDialog} onOpenChange={setShowSaveAsDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Save Table As</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="filename" className="text-sm mb-2 block">
              Filename (without .arrow extension)
            </Label>
            <Input
              id="filename"
              value={saveFileName}
              onChange={(e) => setSaveFileName(e.target.value)}
              placeholder="table_name"
              className="w-full"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !saveLoading) {
                  confirmSaveAs();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSaveAsDialog(false)}
              disabled={saveLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmSaveAs}
              disabled={saveLoading || !saveFileName.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saveLoading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Overwrite Confirmation Dialog */}
      <Dialog open={showOverwriteDialog} onOpenChange={setShowOverwriteDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Confirm Overwrite</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-gray-700 mb-2">
                  Are you sure you want to save the changes to the original file?
                </p>
                <p className="text-sm font-medium text-gray-900 mb-1">
                  File: {settings.sourceFile?.split('/').pop()}
                </p>
                <p className="text-xs text-gray-600">
                  This action will overwrite the original file and cannot be undone.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowOverwriteDialog(false)}
              disabled={saveLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmOverwriteSave}
              disabled={saveLoading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {saveLoading ? 'Saving...' : 'Yes, Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TableSettingsTab;


