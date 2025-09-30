import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelectDropdown } from '@/templates/dropdown/multiselect';
import { SingleSelectDropdown } from '@/templates/dropdown/single-select';

interface ROIConfigurationProps {
  availableFeatures: string[];
  availableColumns: string[];
  availableCombinations: string[];
  roiConfig: ROIConfig;
  onROIConfigChange: (config: ROIConfig) => void;
}

export interface ROIConfig {
  enabled: boolean;
  features: {
    [featureName: string]: {
      type: 'CPI' | 'CPRP';
      value: number;
    };
  };
  priceColumn: string;
  perCombinationCPRP: boolean;
  combinationCPRPValues: {
    [combinationName: string]: {
      [featureName: string]: number;
    };
  };
}

const ROIConfiguration: React.FC<ROIConfigurationProps> = ({
  availableFeatures,
  availableColumns,
  availableCombinations,
  roiConfig,
  onROIConfigChange
}) => {
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(
    Object.keys(roiConfig.features || {})
  );
  

  const handleFeatureToggle = (features: string[]) => {
    setSelectedFeatures(features);

    // Update ROI config
    const newFeatures: { [key: string]: { type: 'CPI' | 'CPRP'; value: number } } = {};
      features.forEach(featureName => {
        newFeatures[featureName] = roiConfig.features[featureName] || {
          type: 'CPRP',
          value: 0
        };
      });

    onROIConfigChange({
      ...roiConfig,
      enabled: true,  // Always keep enabled as true
      features: newFeatures
    });
  };

  const handleFeatureTypeChange = (feature: string, type: 'CPI' | 'CPRP') => {
    onROIConfigChange({
      ...roiConfig,
      enabled: true,  // Always keep enabled as true
      features: {
        ...roiConfig.features,
        [feature]: {
          ...roiConfig.features[feature],
          type
        }
      }
    });
  };

  const handleFeatureValueChange = (feature: string, value: string) => {
    const numericValue = parseFloat(value) || 0;
    onROIConfigChange({
      ...roiConfig,
      enabled: true,  // Always keep enabled as true
      features: {
        ...roiConfig.features,
        [feature]: {
          ...roiConfig.features[feature],
          value: numericValue
        }
      }
    });
  };

  const handlePriceColumnChange = (priceColumn: string) => {
    onROIConfigChange({
      ...roiConfig,
      enabled: true,  // Always keep enabled as true
      priceColumn: priceColumn || ''  // Ensure it's not undefined
    });
  };

  const handlePerCombinationToggle = (enabled: boolean) => {
    onROIConfigChange({
      ...roiConfig,
      enabled: true,  // Always keep enabled as true
      perCombinationCPRP: enabled
    });
  };

  const handleCombinationCPRPValueChange = (combination: string, feature: string, value: string) => {
    const numericValue = parseFloat(value) || 0;
    const currentCombinationValues = roiConfig.combinationCPRPValues?.[combination] || {};
    
    onROIConfigChange({
      ...roiConfig,
      enabled: true,  // Always keep enabled as true
      combinationCPRPValues: {
        ...roiConfig.combinationCPRPValues,
        [combination]: {
          ...currentCombinationValues,
          [feature]: numericValue
        }
      }
    });
  };


  return (
    <div className="space-y-4">
      {/* Per Combination CPRP Toggle */}
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="per-combination-cprp"
          checked={roiConfig.perCombinationCPRP || false}
          onChange={(e) => handlePerCombinationToggle(e.target.checked)}
          className="rounded border-gray-300"
        />
        <Label htmlFor="per-combination-cprp" className="text-sm font-medium">
          Enable per-combination CPRP values
        </Label>
      </div>

      {/* Feature Selection with Global MultiSelect */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Select Features for ROI Calculation</Label>
        <div className="flex items-start gap-4 p-3 rounded-lg shadow-sm bg-white border-l-4 border-indigo-300 overflow-x-auto overflow-y-auto max-h-60">
          {/* Feature selection and price column dropdowns stacked vertically */}
          <div className="flex-shrink-0 w-64 flex flex-col gap-2">
            <MultiSelectDropdown
              label=""
              placeholder="Select Features for ROI Calculation"
              selectedValues={selectedFeatures}
              onSelectionChange={handleFeatureToggle}
              options={availableFeatures.map(feature => ({ value: feature, label: feature }))}
              showSelectAll={true}
              showTrigger={true}
              className="w-full"
              triggerClassName="w-full max-w-none h-6"
            />
            <SingleSelectDropdown
              label=""
              placeholder="Select Price Column"
              value={roiConfig.priceColumn || ''}
              onValueChange={handlePriceColumnChange}
              options={availableColumns.map(column => ({ value: column, label: column }))}
              className="w-full h-6"
            />
            
            
            {/* Combination names when per-combination CPRP is enabled */}
            {roiConfig.perCombinationCPRP && selectedFeatures.length > 0 && (
              <div className="space-y-2 mt-2">
                {availableCombinations.map(combination => (
                  <div key={combination} className="h-6 flex items-center text-xs text-gray-600 truncate">
                    {combination}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected features display on the right */}
          <div className="flex-shrink-0">
            <div className="w-full self-center">
              <div className="text-sm text-gray-600">
                {selectedFeatures.length > 0 ? (
                  <div className="space-y-2">
                    {/* Feature names in a row */}
                    <div className="flex gap-2 overflow-x-auto">
                      {selectedFeatures.map(feature => (
                        <span key={feature} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs whitespace-nowrap flex-shrink-0">
                          {feature}
                        </span>
                      ))}
                    </div>
                    
                     {/* CPI/CPRP dropdowns in a row below features */}
                     <div className="flex gap-2 overflow-x-auto">
                       {selectedFeatures.map(feature => (
                         <div key={`${feature}-config`} className="flex flex-col items-center gap-2 flex-shrink-0 min-w-20">
                           <SingleSelectDropdown
                             label=""
                             options={[
                               { value: 'CPI', label: 'CPI' },
                               { value: 'CPRP', label: 'CPRP' }
                             ]}
                             selectedValue={roiConfig.features[feature]?.type || 'CPRP'}
                             onSelectionChange={(value) => handleFeatureTypeChange(feature, value as 'CPI' | 'CPRP')}
                             placeholder="CPRP"
                             className="w-20 h-6"
                            />
                            {roiConfig.features[feature]?.type === 'CPRP' && !roiConfig.perCombinationCPRP && (
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={roiConfig.features[feature]?.value || 0}
                                onChange={(e) => handleFeatureValueChange(feature, e.target.value)}
                                className="h-6 w-20 text-xs"
                                placeholder="0.00"
                              />
                            )}
                            
                            {/* Per-combination CPRP input boxes */}
                            {roiConfig.features[feature]?.type === 'CPRP' && roiConfig.perCombinationCPRP && (
                              <div className="space-y-2">
                                {availableCombinations.map(combination => (
                                  <Input
                                    key={`${combination}-${feature}`}
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={roiConfig.combinationCPRPValues?.[combination]?.[feature] || 0}
                                    onChange={(e) => handleCombinationCPRPValueChange(combination, feature, e.target.value)}
                                    className="h-6 w-20 text-xs"
                                    placeholder="0.00"
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                  </div>
                ) : (
                  <span className="text-gray-400">No features selected</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>



    </div>
  );
};

export default ROIConfiguration;
