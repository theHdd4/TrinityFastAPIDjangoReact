import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScenarioPlannerSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

interface ScenarioPlannerExhibitionProps {
  data: ScenarioPlannerSettings;
}

export const ScenarioPlannerExhibition: React.FC<ScenarioPlannerExhibitionProps> = ({ data }) => {
  const activeCombinations = data.identifiers.reduce((acc, id) => 
    acc + id.values.filter(v => v.checked).length, 0
  );
  
  const activeFeatures = data.features.filter(f => f.selected);
  const activeOutputs = data.outputs.filter(o => o.selected);

  return (
    <div className="p-4 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Configuration Overview</h3>
        
        <Card className="p-4 space-y-4">
          <div>
            <h4 className="font-medium text-foreground mb-2">Current Scenario</h4>
            <Badge variant="secondary" className="capitalize">
              {data.selectedScenario.replace('-', ' ')}
            </Badge>
          </div>

          <Separator />

          <div>
            <h4 className="font-medium text-foreground mb-2">Active Identifiers</h4>
            <div className="space-y-2">
              {data.identifiers.map(identifier => {
                const checkedValues = identifier.values.filter(v => v.checked);
                return checkedValues.length > 0 && (
                  <div key={identifier.id} className="flex flex-wrap gap-1">
                    <span className="text-sm text-muted-foreground min-w-24">{identifier.name}:</span>
                    {checkedValues.map(value => (
                      <Badge key={value.id} variant="outline" className="text-xs">
                        {value.name}
                      </Badge>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="font-medium text-foreground mb-2">Selected Features</h4>
            <div className="flex flex-wrap gap-1">
              {activeFeatures.map(feature => (
                <Badge key={feature.id} variant="default" className="text-xs">
                  {feature.name}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="font-medium text-foreground mb-2">Output Variables</h4>
            <div className="flex flex-wrap gap-1">
              {activeOutputs.map(output => (
                <Badge key={output.id} variant="secondary" className="text-xs">
                  {output.name}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="font-medium text-foreground mb-2">Reference Configuration</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method:</span>
                <span className="capitalize">{data.referenceMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Period:</span>
                <span>{data.referencePeriod.from} - {data.referencePeriod.to}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Result Views</h3>
        
        <Card className="p-4">
          <div className="space-y-3">
            {data.resultViews.map(view => (
              <div key={view.id} className="p-3 border border-border rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <h5 className="font-medium text-foreground">{view.name}</h5>
                  <Badge 
                    variant={data.selectedView === view.id ? "default" : "outline"}
                    className="text-xs"
                  >
                    {data.selectedView === view.id ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  Combinations: {view.selectedCombinations.length || 'None selected'}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Export Options</h3>
        
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">
            Export functionality will be available after calculating results. 
            Supported formats: CSV, Excel, JSON, PDF Report.
          </div>
        </Card>
      </div>
    </div>
  );
};