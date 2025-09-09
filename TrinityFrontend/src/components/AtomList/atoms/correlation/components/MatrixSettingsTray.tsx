import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export interface MatrixSettings {
  theme: string;
  showAxisLabels: boolean;
  showDataLabels: boolean;
  showLegend: boolean;
}

// Reuse color themes from Explore atom
export const COLOR_THEMES: Record<string, { name: string; primary: string; secondary: string; tertiary: string; }> = {
  default: {
    name: 'Default',
    primary: '#41C185', // Trinity green
    secondary: '#458EE2', // Trinity blue
    tertiary: '#E0E7FF',
  },
  blue: {
    name: 'Blue',
    primary: '#3b82f6',
    secondary: '#60a5fa',
    tertiary: '#dbeafe',
  },
  green: {
    name: 'Green',
    primary: '#10b981',
    secondary: '#6ee7b7',
    tertiary: '#d1fae5',
  },
  purple: {
    name: 'Purple',
    primary: '#8b5cf6',
    secondary: '#c4b5fd',
    tertiary: '#ede9fe',
  },
  orange: {
    name: 'Orange',
    primary: '#f59e0b',
    secondary: '#fcd34d',
    tertiary: '#fef3c7',
  },
  red: {
    name: 'Red',
    primary: '#ef4444',
    secondary: '#f87171',
    tertiary: '#fecaca',
  },
  teal: {
    name: 'Teal',
    primary: '#14b8a6',
    secondary: '#5eead4',
    tertiary: '#ccfbf1',
  },
  pink: {
    name: 'Pink',
    primary: '#ec4899',
    secondary: '#f9a8d4',
    tertiary: '#fce7f3',
  },
  gray: {
    name: 'Gray',
    primary: '#6b7280',
    secondary: '#9ca3af',
    tertiary: '#f3f4f6',
  },
};

interface MatrixSettingsTrayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: MatrixSettings;
  onSave: (settings: MatrixSettings) => void;
}

const MatrixSettingsTray: React.FC<MatrixSettingsTrayProps> = ({ open, onOpenChange, settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState<MatrixSettings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = () => {
    onSave(localSettings);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Matrix Settings</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 mt-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Color Theme</label>
            <Select
              value={localSettings.theme}
              onValueChange={(value) => setLocalSettings((prev) => ({ ...prev, theme: value }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(COLOR_THEMES).map(([key, theme]) => (
                  <SelectItem key={key} value={key}>{theme.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Axis Labels</label>
            <Switch
              checked={localSettings.showAxisLabels}
              onCheckedChange={(checked) => setLocalSettings((prev) => ({ ...prev, showAxisLabels: checked }))}
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Data Labels</label>
            <Switch
              checked={localSettings.showDataLabels}
              onCheckedChange={(checked) => setLocalSettings((prev) => ({ ...prev, showDataLabels: checked }))}
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Legend</label>
            <Switch
              checked={localSettings.showLegend}
              onCheckedChange={(checked) => setLocalSettings((prev) => ({ ...prev, showLegend: checked }))}
            />
          </div>

          <Button className="w-full" onClick={handleSave}>Save</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MatrixSettingsTray;
