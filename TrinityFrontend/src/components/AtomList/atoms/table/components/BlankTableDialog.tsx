import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import GridSelector from './GridSelector';

interface BlankTableDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTable: (rows: number, columns: number) => void;
}

const BlankTableDialog: React.FC<BlankTableDialogProps> = ({
  isOpen,
  onClose,
  onCreateTable
}) => {
  const [gridRows, setGridRows] = useState(5);
  const [gridCols, setGridCols] = useState(5);
  const [manualRows, setManualRows] = useState(10);
  const [manualCols, setManualCols] = useState(5);
  const [useGridSelection, setUseGridSelection] = useState(true);

  const handleCreate = () => {
    const rows = useGridSelection ? gridRows : manualRows;
    const cols = useGridSelection ? gridCols : manualCols;

    if (rows < 1 || cols < 1) {
      alert('Please enter valid dimensions (minimum 1×1)');
      return;
    }

    if (rows > 1000 || cols > 100) {
      if (!confirm(`Creating a large table (${rows}×${cols}). This may be slow. Continue?`)) {
        return;
      }
    }

    onCreateTable(rows, cols);
    onClose();

    // Reset for next time
    setGridRows(5);
    setGridCols(5);
    setManualRows(10);
    setManualCols(5);
    setUseGridSelection(true);
  };

  const handleGridSelect = (rows: number, cols: number) => {
    setGridRows(rows);
    setGridCols(cols);
    setUseGridSelection(true);
  };

  const handleManualChange = () => {
    setUseGridSelection(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Blank Table</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Grid Selector Section */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              📐 Quick Select (10×10 Grid)
            </h4>
            <p className="text-xs text-gray-500 mb-3">
              Click on the grid to select table dimensions
            </p>
            
            <div className="flex justify-center">
              <GridSelector
                onSelect={handleGridSelect}
                selectedRows={gridRows}
                selectedCols={gridCols}
              />
            </div>

            {useGridSelection && (
              <p className="text-sm text-center mt-3 font-medium text-teal-600">
                Selected: {gridRows} rows × {gridCols} columns
              </p>
            )}
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">Or</span>
            </div>
          </div>

          {/* Manual Input Section */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              ✍️ Enter Custom Dimensions
            </h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="manualRows" className="text-sm">
                  Rows (m)
                </Label>
                <Input
                  id="manualRows"
                  type="number"
                  min="1"
                  max="1000"
                  value={manualRows}
                  onChange={(e) => {
                    setManualRows(parseInt(e.target.value) || 1);
                    handleManualChange();
                  }}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="manualCols" className="text-sm">
                  Columns (n)
                </Label>
                <Input
                  id="manualCols"
                  type="number"
                  min="1"
                  max="100"
                  value={manualCols}
                  onChange={(e) => {
                    setManualCols(parseInt(e.target.value) || 1);
                    handleManualChange();
                  }}
                  className="mt-1"
                />
              </div>
            </div>

            {!useGridSelection && (
              <p className="text-sm text-center mt-3 font-medium text-teal-600">
                Preview: {manualRows} rows × {manualCols} columns
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} className="bg-teal-500 hover:bg-teal-600">
            Create Table
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BlankTableDialog;


