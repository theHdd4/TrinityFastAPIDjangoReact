import React from 'react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import type { FeatureOverviewSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

interface FeatureOverviewExhibitionProps {
  settings: FeatureOverviewSettings;
  onComponentsChange: (components: FeatureOverviewSettings['exhibitionComponents']) => void;
  onExhibit: () => void;
  isSubmitting?: boolean;
}

const DEFAULT_COMPONENTS = {
  skuStatistics: false,
  trendAnalysis: false,
};

const FeatureOverviewExhibition: React.FC<FeatureOverviewExhibitionProps> = ({
  settings,
  onComponentsChange,
  onExhibit,
  isSubmitting,
}) => {
  const components = settings.exhibitionComponents ?? DEFAULT_COMPONENTS;
  const selectedSkus = Array.isArray(settings.exhibitionSkus) ? settings.exhibitionSkus : [];

  const handleComponentToggle = (key: keyof typeof DEFAULT_COMPONENTS, checked: boolean) => {
    onComponentsChange({
      ...components,
      [key]: checked,
    });
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 border border-gray-200 shadow-sm space-y-4">
        <div>
          <h4 className="font-medium text-gray-900">Component Selection</h4>
          <p className="text-xs text-gray-500 mt-1">
            Choose which feature overview insights should be prepared for exhibition when you publish this card.
          </p>
        </div>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <Checkbox
              checked={components.skuStatistics}
              onCheckedChange={(checked) => handleComponentToggle('skuStatistics', Boolean(checked))}
            />
            SKU Statistics
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <Checkbox
              checked={components.trendAnalysis}
              onCheckedChange={(checked) => handleComponentToggle('trendAnalysis', Boolean(checked))}
            />
            Trend Analysis
          </label>
        </div>
      </Card>

      <Card className="p-4 border border-gray-200 shadow-sm space-y-3">
        <div>
          <h4 className="font-medium text-gray-900">Visualisation Overview</h4>
          <p className="text-xs text-gray-500 mt-1">
            The following SKUs will be available in the exhibition catalogue once published.
          </p>
        </div>
        {selectedSkus.length > 0 ? (
          <ul className="space-y-2 text-sm text-gray-700">
            {selectedSkus.map((sku) => (
              <li key={sku} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2">
                <span>{sku}</span>
                <span className="text-xs text-gray-500">Ready for exhibition</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-md px-4 py-6 text-center">
            Select SKUs from the table to include them in the exhibition catalogue.
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <Button onClick={onExhibit} disabled={isSubmitting || selectedSkus.length === 0}>
          {isSubmitting ? 'Exhibiting…' : 'Exhibit'}
        </Button>
      </div>
    </div>
  );
};

export default FeatureOverviewExhibition;
