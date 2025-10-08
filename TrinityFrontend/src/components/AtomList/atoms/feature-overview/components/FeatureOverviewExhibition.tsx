import React from 'react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import type { FeatureOverviewSettings, FeatureOverviewExhibitionMetricSelection } from '@/components/LaboratoryMode/store/laboratoryStore';
import { Trash2 } from 'lucide-react';

interface FeatureOverviewExhibitionProps {
  settings: FeatureOverviewSettings;
  onComponentsChange: (components: FeatureOverviewSettings['exhibitionComponents']) => void;
  onExhibit: () => void;
  isSubmitting?: boolean;
  onSelectionRemove?: (key: string) => void;
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
  onSelectionRemove,
}) => {
  const components = settings.exhibitionComponents ?? DEFAULT_COMPONENTS;
  const metricSelections: FeatureOverviewExhibitionMetricSelection[] = settings.exhibitionMetrics
    ? Object.values(settings.exhibitionMetrics)
    : [];

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
          <h4 className="font-medium text-gray-900">Prepared Statistical Summaries</h4>
          <p className="text-xs text-gray-500 mt-1">
            Metrics toggled for exhibition inside the statistical summary table will appear here and publish to the catalogue.
          </p>
        </div>
        {metricSelections.length > 0 ? (
          <ul className="space-y-2 text-sm text-gray-700">
            {metricSelections.map(selection => (
              <li key={selection.key} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 gap-3">
                <div className="flex flex-col">
                  <span className="font-medium text-gray-900">{selection.skuTitle}</span>
                  <span className="text-xs text-gray-600">{selection.metricLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Ready for exhibition</span>
                  {onSelectionRemove && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onSelectionRemove(selection.key)}
                      aria-label="Remove from exhibition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-md px-4 py-6 text-center">
            View a SKU's statistical summary and toggle the Exhibit switch for a metric to prepare it for the catalogue.
          </div>
        )}
      </Card>

      <div>
        <Button
          className="w-full"
          onClick={onExhibit}
          disabled={isSubmitting || metricSelections.length === 0}
        >
          {isSubmitting ? 'Exhibiting…' : 'Exhibit'}
        </Button>
      </div>
    </div>
  );
};

export default FeatureOverviewExhibition;
