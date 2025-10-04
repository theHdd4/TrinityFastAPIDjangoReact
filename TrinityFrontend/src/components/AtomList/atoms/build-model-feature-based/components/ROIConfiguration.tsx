import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { SingleSelectDropdown } from '@/templates/dropdown/single-select';
import { X } from 'lucide-react';

interface ROIConfigurationProps {
  availableFeatures: string[];
  availableColumns: string[];
  availableCombinations: string[];
  roiConfig: ROIConfig;
  onROIConfigChange: (config: ROIConfig) => void;
  yVariable?: string; // The selected y_variable for modeling
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
  // New fields for Part 1
  manualPriceEntry: boolean;
  manualPriceValue: number;
  perCombinationManualPrice: boolean;
  combinationManualPriceValues: {
    [combinationName: string]: number;
  };
  averageMonths: number;
  // Part 2 fields
  roiVariables: string[]; // Array of selected variables to measure ROI for
  // Part 3 fields
  perCombinationCostPerUnit: boolean;
  costPerUnit: {
    [variableName: string]: number;
  };
  combinationCostPerUnit: {
    [combinationName: string]: {
      [variableName: string]: number;
    };
  };
}

const ROIConfiguration: React.FC<ROIConfigurationProps> = ({
  availableFeatures,
  availableColumns,
  availableCombinations,
  roiConfig,
  onROIConfigChange,
  yVariable
}) => {
  
  const handlePriceColumnChange = (priceColumn: string) => {
    onROIConfigChange({
      ...roiConfig,
      enabled: true,
      priceColumn: priceColumn || ''
    });
  };

  const handleManualPriceToggle = (enabled: boolean) => {
    onROIConfigChange({
      ...roiConfig,
      enabled: true,
      manualPriceEntry: enabled
    });
  };

  const handleManualPriceValueChange = (value: string) => {
    const numericValue = parseFloat(value) || 0;
    onROIConfigChange({
      ...roiConfig,
      enabled: true,
      manualPriceValue: numericValue
    });
  };

  const handlePerCombinationManualPriceToggle = (enabled: boolean) => {
    onROIConfigChange({
      ...roiConfig,
      enabled: true,
      perCombinationManualPrice: enabled
    });
  };

  const handleCombinationManualPriceValueChange = (combination: string, value: string) => {
    const numericValue = parseFloat(value) || 0;
    onROIConfigChange({
      ...roiConfig,
      enabled: true,
      combinationManualPriceValues: {
        ...roiConfig.combinationManualPriceValues,
        [combination]: numericValue
      }
    });
  };

  const handleAverageMonthsChange = (months: string) => {
    onROIConfigChange({
      ...roiConfig,
      enabled: true,
      averageMonths: parseInt(months) || 3
    });
  };

  // Part 2 Handlers
  const handleAddVariable = () => {
    const currentVariables = roiConfig.roiVariables || [];
    onROIConfigChange({
      ...roiConfig,
      enabled: true,
      roiVariables: [...currentVariables, ''] // Add empty slot for new variable
    });
  };

  const handleVariableChange = (index: number, variable: string) => {
    const currentVariables = roiConfig.roiVariables || [];
    const updatedVariables = [...currentVariables];
    updatedVariables[index] = variable;
    onROIConfigChange({
      ...roiConfig,
      enabled: true,
      roiVariables: updatedVariables
    });
  };

  const handleRemoveVariable = (index: number) => {
    const currentVariables = roiConfig.roiVariables || [];
    const updatedVariables = currentVariables.filter((_, i) => i !== index);
    onROIConfigChange({
      ...roiConfig,
      enabled: true,
      roiVariables: updatedVariables
    });
  };

  // Part 3 Handlers
  const handlePerCombinationCostToggle = (enabled: boolean) => {
    onROIConfigChange({
      ...roiConfig,
      enabled: true,
      perCombinationCostPerUnit: enabled
    });
  };

  const handleCostPerUnitChange = (variable: string, value: string) => {
    const numericValue = parseFloat(value) || 0;
    onROIConfigChange({
      ...roiConfig,
      enabled: true,
      costPerUnit: {
        ...roiConfig.costPerUnit,
        [variable]: numericValue
      }
    });
  };

  const handleCombinationCostPerUnitChange = (combination: string, variable: string, value: string) => {
    const numericValue = parseFloat(value) || 0;
    const currentCombinationValues = roiConfig.combinationCostPerUnit?.[combination] || {};
    
    onROIConfigChange({
      ...roiConfig,
      enabled: true,
      combinationCostPerUnit: {
        ...roiConfig.combinationCostPerUnit,
        [combination]: {
          ...currentCombinationValues,
          [variable]: numericValue
        }
      }
    });
  };

  // Check if Part 1 is complete to show Part 2
  // Part 1 is complete when:
  // - Average months is selected AND
  // - Either manual entry is enabled OR price column is selected
  const isPart1Complete = roiConfig.averageMonths && 
    (roiConfig.manualPriceEntry || roiConfig.priceColumn);

  // Check if Part 2 has selected variables to show Part 3
  const isPart2Complete = (roiConfig.roiVariables || []).length > 0 && 
    (roiConfig.roiVariables || []).every(v => v !== '');

  // Generate month options (3 to 24 months)
  const monthOptions = Array.from({ length: 22 }, (_, i) => {
    const months = i + 3;
    return {
      value: months.toString(),
      label: `Avg over ${months} months`
    };
  });

  return (
    <div className="space-y-4">
      {/* Part 1: Sales Value Conversion */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">ROI Specific Inputs</Label>
        <div className="relative p-4 rounded-lg shadow-sm bg-white border border-gray-200">
          {/* Clear Button - Right Center */}
          <button
            className="absolute top-1/2 right-2 transform -translate-y-1/2 h-6 w-6 flex items-center justify-center text-black hover:text-red-600 transition-colors"
            onClick={() => {
              onROIConfigChange({
                enabled: true,
                features: {},
                priceColumn: '',
                perCombinationCPRP: false,
                combinationCPRPValues: {},
                manualPriceEntry: false,
                manualPriceValue: undefined,
                perCombinationManualPrice: false,
                combinationManualPriceValues: {},
                averageMonths: undefined,
                roiVariables: [],
                perCombinationCostPerUnit: false,
                costPerUnit: {},
                combinationCostPerUnit: {}
              });
            }}
            title="Clear all ROI configuration"
          >
            <X className="w-4 h-4" />
          </button>
          
          {/* Header Text */}
          <div className="mb-4 pr-8">
            <p className="text-sm font-medium text-gray-700">
              "<span className="text-blue-600 font-semibold">{yVariable || 'y_variable'}</span>" is converted to salesvalue by multiplying with:
            </p>
          </div>

          {/* Dropdowns and Checkbox Row */}
          <div className="flex gap-4 items-center flex-wrap">
            {/* Price Column Dropdown or Manual Input */}
            {!roiConfig.manualPriceEntry ? (
              <div className="flex-shrink-0">
                <SingleSelectDropdown
                  label=""
                  placeholder=""
                  value={roiConfig.priceColumn || ''}
                  onValueChange={handlePriceColumnChange}
                  options={availableColumns.map(column => ({ value: column, label: column }))}
                  className="w-48 h-8"
                />
              </div>
            ) : (
              /* Manual Entry - Show either global or per-combination inputs */
              !roiConfig.perCombinationManualPrice ? (
                /* Global Manual Input */
                <div className="flex-shrink-0">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={roiConfig.manualPriceValue || ''}
                    onChange={(e) => handleManualPriceValueChange(e.target.value)}
                    className="w-48 h-8"
                    placeholder="Enter price value"
                  />
                </div>
              ) : (
                /* Per-Combination Manual Inputs */
                <div className="space-y-3">
                  {availableCombinations.map((combination, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div 
                        className="h-8 flex items-center text-xs text-gray-600 truncate pr-2 max-w-[180px] cursor-help hover:text-gray-800 transition-colors" 
                        title={combination}
                      >
                        {combination}
                      </div>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={roiConfig.combinationManualPriceValues?.[combination] || ''}
                        onChange={(e) => handleCombinationManualPriceValueChange(combination, e.target.value)}
                        className="w-32 h-8"
                        placeholder="0.00"
                      />
                    </div>
                  ))}
                </div>
              )
            )}

            {/* Average Months Dropdown - Only show when manual entry is disabled */}
            {!roiConfig.manualPriceEntry && (
              <div className="flex-shrink-0">
                <SingleSelectDropdown
                  label=""
                  placeholder="Select avg over month"
                  value={roiConfig.averageMonths?.toString() || ''}
                  onValueChange={handleAverageMonthsChange}
                  options={monthOptions}
                  className="w-56 h-8"
                />
              </div>
            )}

            {/* Manual Entry Checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="manual-price-entry"
                checked={roiConfig.manualPriceEntry || false}
                onCheckedChange={(checked) => handleManualPriceToggle(!!checked)}
              />
              <Label htmlFor="manual-price-entry" className="text-sm text-gray-600 cursor-pointer">
                Enter manually
              </Label>
            </div>

            {/* Per-Combination Manual Price Checkbox - Only show when manual entry is enabled */}
            {roiConfig.manualPriceEntry && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="per-combination-manual-price"
                  checked={roiConfig.perCombinationManualPrice || false}
                  onCheckedChange={(checked) => handlePerCombinationManualPriceToggle(!!checked)}
                />
                <Label htmlFor="per-combination-manual-price" className="text-sm text-gray-600 cursor-pointer">
                  Per combination input
                </Label>
              </div>
            )}
          </div>
        </div>
      </div>

       {/* Part 2: Determine Variables to Measure ROI */}
       {isPart1Complete && (
         <div className="space-y-3 animate-in slide-in-from-top-4 duration-300 ease-out">
           <div className="relative p-4 rounded-lg shadow-sm bg-white border border-gray-200">
             {/* Clear Button - Right Center */}
             <button
               className="absolute top-1/2 right-2 transform -translate-y-1/2 h-6 w-6 flex items-center justify-center text-black hover:text-red-600 transition-colors"
               onClick={() => {
                 onROIConfigChange({
                   ...roiConfig,
                   enabled: true,
                   roiVariables: []
                 });
               }}
               title="Clear Part 2 selections"
             >
               <X className="w-4 h-4" />
             </button>
             
             {/* Header Text */}
             <div className="mb-3 pr-8">
               <p className="text-sm font-medium text-gray-700">
                 Determine variables to measure ROI for:
               </p>
             </div>

            {/* Variables Row */}
            <div className="flex gap-2 items-start flex-wrap">
              {/* Existing variable dropdowns */}
              {(roiConfig.roiVariables || []).map((variable, index) => {
                // Filter out already selected variables (except current dropdown's value)
                const selectedVariables = (roiConfig.roiVariables || []).filter((v, i) => i !== index && v !== '');
                const availableOptions = availableFeatures
                  .filter(feature => !selectedVariables.includes(feature))
                  .map(feature => ({ value: feature, label: feature }));
                
                return (
                  <div key={index} className="flex items-start gap-1">
                    <div className="flex-shrink-0">
                      <SingleSelectDropdown
                        label=""
                        placeholder="Select variable"
                        value={variable}
                        onValueChange={(val) => handleVariableChange(index, val)}
                        options={availableOptions}
                        className="w-48 h-8"
                      />
                    </div>
                    {/* Remove button (X) - positioned slightly below dropdown center */}
                    <button
                      onClick={() => handleRemoveVariable(index)}
                      className="h-6 w-6 flex items-center justify-center rounded border border-red-300 bg-red-50 hover:bg-red-100 text-red-600 transition-colors flex-shrink-0 mt-1"
                      title="Remove variable"
                    >
                      <span className="text-sm font-bold leading-none">×</span>
                    </button>
                  </div>
                );
              })}

              {/* Add Variable Button - positioned slightly below dropdown center */}
              <button
                onClick={handleAddVariable}
                className="h-6 px-2 flex items-center gap-1 rounded border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors text-xs font-medium whitespace-nowrap flex-shrink-0 mt-1"
              >
                <span className="text-sm leading-none font-bold">+</span>
                Add Variable
              </button>
             </div>
          </div>
        </div>
      )}

       {/* Part 3: Enter Cost Per Unit for Each Variable */}
       {isPart2Complete && (
         <div className="space-y-3 animate-in slide-in-from-top-4 duration-300 ease-out">
          {/* Per Combination Cost Toggle */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="per-combination-cost"
              checked={roiConfig.perCombinationCostPerUnit || false}
              onCheckedChange={(checked) => handlePerCombinationCostToggle(!!checked)}
            />
            <Label htmlFor="per-combination-cost" className="text-sm font-medium cursor-pointer">
              Enable per-combination cost per unit values
            </Label>
          </div>

          <div className="p-4 rounded-lg shadow-sm bg-white border border-gray-200">
            {/* Header Text */}
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700">
                For each selected variables enter cost per unit:
              </p>
            </div>

            {!roiConfig.perCombinationCostPerUnit ? (
              /* Global Cost Per Unit - When checkbox is disabled */
              <div className="flex gap-4 items-start flex-wrap">
                {(roiConfig.roiVariables || []).filter(v => v !== '').map((variable, index) => (
                  <div key={index} className="flex flex-col gap-2">
                    {/* Variable Name Label */}
                    <label className="text-xs font-medium text-gray-700">
                      {variable}
                    </label>
                    {/* Cost Per Unit Input */}
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                        value={roiConfig.costPerUnit?.[variable] || ''}
                      onChange={(e) => handleCostPerUnitChange(variable, e.target.value)}
                      className="w-48 h-8"
                      placeholder="Enter cost per unit"
                    />
                  </div>
                ))}
              </div>
            ) : (
              /* Per-Combination Cost Per Unit - When checkbox is enabled */
              <div className="flex gap-4 items-start">
                {/* Combinations Column */}
                <div className="flex flex-col gap-2">
                  <div className="h-6"></div> {/* Spacer for variable names row */}
                  {availableCombinations.map((combination, index) => (
                    <div 
                      key={index} 
                      className="h-8 flex items-center text-xs text-gray-600 truncate pr-2 max-w-[180px] cursor-help hover:text-gray-800 transition-colors" 
                      title={combination}
                    >
                      {combination}
                    </div>
                  ))}
                </div>

                {/* Variable Inputs Columns */}
                {(roiConfig.roiVariables || []).filter(v => v !== '').map((variable, varIndex) => (
                  <div key={varIndex} className="flex flex-col gap-2">
                    {/* Variable Name Header */}
                    <label className="h-6 text-xs font-medium text-gray-700 flex items-center">
                      {variable}
                    </label>
                    {/* Input boxes for each combination */}
                    {availableCombinations.map((combination, comboIndex) => (
                      <Input
                        key={comboIndex}
                        type="number"
                        step="0.01"
                        min="0"
                          value={roiConfig.combinationCostPerUnit?.[combination]?.[variable] || ''}
                        onChange={(e) => handleCombinationCostPerUnitChange(combination, variable, e.target.value)}
                        className="w-32 h-8"
                        placeholder="0.00"
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ROIConfiguration;
