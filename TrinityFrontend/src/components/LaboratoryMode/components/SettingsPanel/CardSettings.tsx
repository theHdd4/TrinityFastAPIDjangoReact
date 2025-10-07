import React from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

interface CardSettingsProps {
  exhibitionEnabled: boolean;
  onToggleExhibitionControl: (enabled: boolean) => void;
}

const CardSettings: React.FC<CardSettingsProps> = ({ exhibitionEnabled, onToggleExhibitionControl }) => {
  return (
    <div className="p-4">
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h4 className="font-semibold text-gray-900">Enable Exhibition Control</h4>
            <p className="text-xs text-gray-500 mt-1">
              Turn this on to manage exhibition settings and reveal the "Exhibit the Card" toggle on the canvas card.
            </p>
          </div>
          <Switch checked={exhibitionEnabled} onCheckedChange={onToggleExhibitionControl} />
        </div>
        {!exhibitionEnabled && (
          <p className="text-xs text-gray-500">
            Exhibition controls are hidden for this card. Enable the setting to configure slide behaviour and expose presentation
            toggles.
          </p>
        )}
      </Card>
    </div>
  );
};

export default CardSettings;
