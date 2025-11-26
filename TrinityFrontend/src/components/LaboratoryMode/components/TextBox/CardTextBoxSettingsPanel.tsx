import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Minus,
  Plus,
  Strikethrough,
  Underline,
} from 'lucide-react';
import { CardTextBoxSettings } from './types';

interface CardTextBoxSettingsPanelProps {
  settings: CardTextBoxSettings;
  onSettingsChange: (settings: Partial<CardTextBoxSettings>) => void;
}

const CardTextBoxSettingsPanel: React.FC<CardTextBoxSettingsPanelProps> = ({ settings, onSettingsChange }) => {
  const fontFamilies = [
    'Open Sauce',
    'Arial',
    'Helvetica',
    'Times New Roman',
    'Georgia',
    'Courier New',
    'Verdana',
    'Trebuchet MS',
    'Comic Sans MS',
    'Impact',
  ];

  const decreaseFontSize = () => {
    onSettingsChange({ fontSize: Math.max(8, settings.fontSize - 2) });
  };

  const increaseFontSize = () => {
    onSettingsChange({ fontSize: Math.min(500, settings.fontSize + 2) });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Font Family</Label>
        <Select
          value={settings.fontFamily}
          onValueChange={(value) => onSettingsChange({ fontFamily: value })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fontFamilies.map((font) => (
              <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                {font}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Font Size</Label>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={decreaseFontSize}
            className="h-9 w-9"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Input
            type="number"
            value={settings.fontSize}
            onChange={(e) => onSettingsChange({ fontSize: parseInt(e.target.value, 10) || 12 })}
            className="text-center font-medium"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={increaseFontSize}
            className="h-9 w-9"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Text Formatting</Label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={settings.bold ? 'default' : 'outline'}
            size="icon"
            onClick={() => onSettingsChange({ bold: !settings.bold })}
            className="h-9 w-9"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant={settings.italic ? 'default' : 'outline'}
            size="icon"
            onClick={() => onSettingsChange({ italic: !settings.italic })}
            className="h-9 w-9"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            variant={settings.underline ? 'default' : 'outline'}
            size="icon"
            onClick={() => onSettingsChange({ underline: !settings.underline })}
            className="h-9 w-9"
          >
            <Underline className="h-4 w-4" />
          </Button>
          <Button
            variant={settings.strikethrough ? 'default' : 'outline'}
            size="icon"
            onClick={() => onSettingsChange({ strikethrough: !settings.strikethrough })}
            className="h-9 w-9"
          >
            <Strikethrough className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Text Alignment</Label>
        <div className="flex gap-2">
          <Button
            variant={settings.textAlign === 'left' ? 'default' : 'outline'}
            size="icon"
            onClick={() => onSettingsChange({ textAlign: 'left' })}
            className="h-9 w-9"
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button
            variant={settings.textAlign === 'center' ? 'default' : 'outline'}
            size="icon"
            onClick={() => onSettingsChange({ textAlign: 'center' })}
            className="h-9 w-9"
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button
            variant={settings.textAlign === 'right' ? 'default' : 'outline'}
            size="icon"
            onClick={() => onSettingsChange({ textAlign: 'right' })}
            className="h-9 w-9"
          >
            <AlignRight className="h-4 w-4" />
          </Button>
          <Button
            variant={settings.textAlign === 'justify' ? 'default' : 'outline'}
            size="icon"
            onClick={() => onSettingsChange({ textAlign: 'justify' })}
            className="h-9 w-9"
          >
            <AlignJustify className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Lists</Label>
        <div className="flex gap-2">
          <Button
            variant={settings.listType === 'bullet' ? 'default' : 'outline'}
            size="icon"
            onClick={() => onSettingsChange({ listType: settings.listType === 'bullet' ? 'none' : 'bullet' })}
            className="h-9 w-9"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={settings.listType === 'number' ? 'default' : 'outline'}
            size="icon"
            onClick={() => onSettingsChange({ listType: settings.listType === 'number' ? 'none' : 'number' })}
            className="h-9 w-9"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Text Color</Label>
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={settings.textColor}
            onChange={(e) => onSettingsChange({ textColor: e.target.value })}
            className="h-10 w-20 cursor-pointer"
          />
          <Input
            type="text"
            value={settings.textColor}
            onChange={(e) => onSettingsChange({ textColor: e.target.value })}
            className="flex-1 font-mono text-sm"
            placeholder="#000000"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Background Color</Label>
        <div className="flex items-center gap-2">
          <Input
            type="color"
            value={settings.backgroundColor === 'transparent' ? '#ffffff' : settings.backgroundColor}
            onChange={(e) => onSettingsChange({ backgroundColor: e.target.value })}
            className="h-10 w-20 cursor-pointer"
          />
          <Input
            type="text"
            value={settings.backgroundColor}
            onChange={(e) => onSettingsChange({ backgroundColor: e.target.value })}
            className="flex-1 font-mono text-sm"
            placeholder="transparent"
          />
        </div>
      </div>
    </div>
  );
};

export default CardTextBoxSettingsPanel;
