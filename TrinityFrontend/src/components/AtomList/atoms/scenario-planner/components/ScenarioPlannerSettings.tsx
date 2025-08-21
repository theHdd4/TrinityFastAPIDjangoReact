import React, { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ScenarioPlannerSettings as SettingsType } from '@/components/LaboratoryMode/store/laboratoryStore';
import { Card } from '@/components/ui/card';

interface ScenarioPlannerSettingsProps {
  data: SettingsType;
  onDataChange: (newData: Partial<SettingsType>) => void;
}

export const ScenarioPlannerSettings: React.FC<ScenarioPlannerSettingsProps> = ({ data, onDataChange }) => {
  const [openSections, setOpenSections] = useState({
    identifier1: true,
    identifier2: true,
    identifier3: false,
    identifier4: false,
    referenceValue: true,
    referencePeriod: true,
    features: true,
    output: true,
    aggregatedViews: true,
    referenceSettings: true,
    combinationSelection: true,
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const generateCombinationsFromIdentifiers = (identifiers: any[]) => {
    const selectedValues = identifiers
      .filter(identifier => identifier.values.some((value: any) => value.checked))
      .map(identifier => ({
        id: identifier.id,
        name: identifier.name,
        values: identifier.values.filter((value: any) => value.checked)
      }))
      .filter(identifier => identifier.values.length > 0);

    if (selectedValues.length === 0) {
      return [];
    }

    const generateCombinations = (arrays: any[], index = 0, current: any[] = []): any[] => {
      if (index === arrays.length) {
        return [current.slice()];
      }

      const combinations: any[] = [];
      for (const value of arrays[index]) {
        current[index] = value;
        combinations.push(...generateCombinations(arrays, index + 1, current));
      }
      return combinations;
    };

    const valueArrays = selectedValues.map(identifier => identifier.values);
    
    const combinations = generateCombinations(valueArrays);

    const finalCombinations = combinations.map((combination, index) => {
      // Create a descriptive name for the combination
      const combinationName = combination.map((value: any, valueIndex: number) => 
        `${selectedValues[valueIndex].name}: ${value.name}`
      ).join(' × ');
      
      return {
        id: `combination-${index + 1}`,
        identifiers: combination.map((value: any, valueIndex: number) => 
          `${selectedValues[valueIndex].id}-${value.id}`
        ),
        values: Object.fromEntries(
          data.features.filter(f => f.selected).map(feature => [
            feature.id,
            {
              input: 0,
              change: 0,
              reference: Math.round(Math.random() * 100 + 50)
            }
          ])
        )
      };
    });
    
    return finalCombinations;
  };

  const toggleIdentifierValue = (identifierId: string, valueId: string) => {
    const updatedIdentifiers = data.identifiers.map(identifier => {
      if (identifier.id === identifierId) {
        return {
          ...identifier,
          values: identifier.values.map(value => 
            value.id === valueId ? { ...value, checked: !value.checked } : value
          )
        };
      }
      return identifier;
    });
    
    // Generate new combinations based on updated identifiers
    const updatedCombinations = generateCombinationsFromIdentifiers(updatedIdentifiers);
    
    // Update both identifiers and combinations together
    const updateData = { 
      identifiers: updatedIdentifiers,
      combinations: updatedCombinations
    };
    
    onDataChange(updateData);
  };

  const selectAllIdentifierValues = (identifierId: string) => {
    const updatedIdentifiers = data.identifiers.map(identifier => {
      if (identifier.id === identifierId) {
        return {
          ...identifier,
          values: identifier.values.map(value => ({ ...value, checked: true }))
        };
      }
      return identifier;
    });
    
    const updatedCombinations = generateCombinationsFromIdentifiers(updatedIdentifiers);
    onDataChange({ 
      identifiers: updatedIdentifiers,
      combinations: updatedCombinations
    });
  };

  const deselectAllIdentifierValues = (identifierId: string) => {
    const updatedIdentifiers = data.identifiers.map(identifier => {
      if (identifier.id === identifierId) {
        return {
          ...identifier,
          values: identifier.values.map(value => ({ ...value, checked: false }))
        };
      }
      return identifier;
    });
    
    const updatedCombinations = generateCombinationsFromIdentifiers(updatedIdentifiers);
    onDataChange({ 
      identifiers: updatedIdentifiers,
      combinations: updatedCombinations
    });
  };

  const toggleFeature = (featureId: string) => {
    const updatedFeatures = data.features.map(feature =>
      feature.id === featureId ? { ...feature, selected: !feature.selected } : feature
    );
    onDataChange({ features: updatedFeatures });
  };

  const selectAllFeatures = () => {
    const updatedFeatures = data.features.map(feature => ({ ...feature, selected: true }));
    onDataChange({ features: updatedFeatures });
  };

  const deselectAllFeatures = () => {
    const updatedFeatures = data.features.map(feature => ({ ...feature, selected: false }));
    onDataChange({ features: updatedFeatures });
  };

  const toggleOutput = (outputId: string) => {
    const updatedOutputs = data.outputs.map(output =>
      output.id === outputId ? { ...output, selected: !output.selected } : output
    );
    onDataChange({ outputs: updatedOutputs });
  };

  return (
    <div className="h-full">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {/* Combination Selection Box */}
          <Card className="p-4">
            <Collapsible open={openSections.combinationSelection} onOpenChange={() => toggleSection('combinationSelection')}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-md">
                <span className="font-medium">Combination Selection</span>
                {openSections.combinationSelection ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="px-2 py-2">
                <div className="space-y-4">
                  {data.identifiers.map((identifier, index) => (
                    <Card key={identifier.id} className="p-2">
                      <Collapsible 
                        open={openSections[`identifier${index + 1}` as keyof typeof openSections] as boolean} 
                        onOpenChange={() => toggleSection(`identifier${index + 1}`)}
                      >
                        <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-md">
                          <span className="font-medium">{identifier.name}</span>
                          {openSections[`identifier${index + 1}` as keyof typeof openSections] ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-2 py-2">
                          <div className="space-y-3">
                            {/* Select All / Deselect All Buttons */}
                            <div className="flex space-x-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  const allSelected = identifier.values.every(value => value.checked);
                                  if (allSelected) {
                                    deselectAllIdentifierValues(identifier.id);
                                  } else {
                                    selectAllIdentifierValues(identifier.id);
                                  }
                                }}
                                className="text-xs"
                              >
                                {identifier.values.every(value => value.checked) ? 'Deselect All' : 'Select All'}
                              </Button>
                            </div>
                            
                            {/* Individual Checkboxes */}
                            <div className="space-y-2">
                              {identifier.values.map(value => (
                                <div key={value.id} className="flex items-center space-x-2">
                                  <Checkbox 
                                    id={value.id}
                                    checked={value.checked}
                                    onCheckedChange={(checked) => {
                                      if (checked === true || checked === false) {
                                        toggleIdentifierValue(identifier.id, value.id);
                                      }
                                    }}
                                  />
                                  <label htmlFor={value.id} className="text-sm text-foreground cursor-pointer">
                                    {value.name}
                                  </label>
                                </div>
                              ))}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Reference Settings Box */}
          <Card className="p-4">
            <Collapsible open={openSections.referenceSettings} onOpenChange={() => toggleSection('referenceSettings')}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-md">
                <span className="font-medium">Reference Settings</span>
                {openSections.referenceSettings ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
              )}
              </CollapsibleTrigger>
              <CollapsibleContent className="px-2 py-2">
                <div className="space-y-4">
                  {/* Reference Value */}
                  <Collapsible open={openSections.referenceValue} onOpenChange={() => toggleSection('referenceValue')}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-md">
                      <span className="font-medium">Reference Method</span>
                      {openSections.referenceValue ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-2 py-2">
                      <div className="space-y-2">
                        {data.referenceMethod && (
                          <div className="flex items-center space-x-2">
                            <Checkbox 
                              id="reference-mean"
                              checked={data.referenceMethod === "mean"}
                              onCheckedChange={(checked) => {
                                if (checked === true) {
                                  onDataChange({ referenceMethod: "mean" });
                                }
                              }}
                            />
                            <label htmlFor="reference-mean" className="text-sm text-foreground cursor-pointer">
                              Mean
                            </label>
                          </div>
                        )}
                        {data.referenceMethod && (
                          <div className="flex items-center space-x-2">
                            <Checkbox 
                              id="reference-median"
                              checked={data.referenceMethod === "median"}
                              onCheckedChange={(checked) => {
                                if (checked === true) {
                                  onDataChange({ referenceMethod: "median" });
                                }
                              }}
                            />
                            <label htmlFor="reference-median" className="text-sm text-foreground cursor-pointer">
                              Median
                            </label>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Reference Period */}
                  <Collapsible open={openSections.referencePeriod} onOpenChange={() => toggleSection('referencePeriod')}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-md">
                      <span className="font-medium">Reference Period</span>
                      {openSections.referencePeriod ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-2 py-2">
                      <div className="text-sm text-gray-600">
                        From: {data.referencePeriod?.from || 'N/A'}<br/>
                        To: {data.referencePeriod?.to || 'N/A'}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Features Selection Box */}
          <Card className="p-4">
            <Collapsible open={openSections.features} onOpenChange={() => toggleSection('features')}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-md">
                <span className="font-medium">Features Selection</span>
                {openSections.features ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="px-2 py-2">
                <div className="space-y-3">
                  {/* Select All / Deselect All Buttons */}
                  <div className="flex space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        const allSelected = data.features.every(feature => feature.selected);
                        if (allSelected) {
                          deselectAllFeatures();
                        } else {
                          selectAllFeatures();
                        }
                      }}
                      className="text-xs"
                    >
                      {data.features.every(feature => feature.selected) ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                  
                  {/* Individual Feature Checkboxes */}
                  <div className="space-y-2">
                    {data.features.map(feature => (
                      <div key={feature.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={feature.id}
                          checked={feature.selected}
                          onCheckedChange={() => toggleFeature(feature.id)}
                        />
                        <label htmlFor={feature.id} className="text-sm text-foreground cursor-pointer">
                          {feature.name}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Output Selection Box */}
          <Card className="p-4">
            <Collapsible open={openSections.output} onOpenChange={() => toggleSection('output')}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-md">
                <span className="font-medium">Output Selection</span>
                {openSections.output ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="px-2 py-2">
                <div className="space-y-2">
                  {data.outputs.map(output => (
                    <div key={output.id} className="flex items-center space-x-2">
                      <Checkbox 
                        id={output.id}
                        checked={output.selected}
                        onCheckedChange={() => toggleOutput(output.id)}
                      />
                      <label htmlFor={output.id} className="text-sm text-foreground cursor-pointer">
                        {output.name}
                      </label>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Aggregated Views Box */}
          <Card className="p-4">
            <Collapsible open={openSections.aggregatedViews} onOpenChange={() => toggleSection('aggregatedViews')}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-md">
                <span className="font-medium">Aggregated Views</span>
                {openSections.aggregatedViews ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="px-2 py-2">
                <div className="text-sm text-gray-600">
                  Aggregated view options will be displayed here.
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
};