import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Minus, Plus } from 'lucide-react';

interface RowHeightControlProps {
  value: number; // Value in pixels
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

/**
 * Row Height Control with Unit System
 * 1 unit = 3px
 * Default: 10 units (30px) for blank tables
 */
const RowHeightControl: React.FC<RowHeightControlProps> = ({
  value,
  onChange,
  min = 10,
  max = 20,
}) => {
  // Convert px to units (round to nearest)
  const pxToUnits = (px: number): number => Math.round(px / 3);
  
  // Convert units to px
  const unitsToPx = (units: number): number => units * 3;

  // Get current units from px value, default to 10 if no value or invalid
  const currentUnits = value && value >= 30 ? pxToUnits(value) : 10;

  const handleIncrease = () => {
    const newUnits = Math.min(currentUnits + 1, max);
    const newPx = unitsToPx(newUnits);
    onChange(newPx);
  };

  const handleDecrease = () => {
    const newUnits = Math.max(currentUnits - 1, min);
    const newPx = unitsToPx(newUnits);
    onChange(newPx);
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-sm">
        Row Height: {currentUnits}
      </Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDecrease}
          disabled={currentUnits <= min}
          className="h-8 w-8 p-0"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleIncrease}
          disabled={currentUnits >= max}
          className="h-8 w-8 p-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default RowHeightControl;

