import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScenarioPlannerSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

interface ScenarioPlannerExhibitionProps {
  data: ScenarioPlannerSettings;
}

export const ScenarioPlannerExhibition: React.FC<ScenarioPlannerExhibitionProps> = ({ data }) => {
  // ✅ FIXED: Use the new nested scenario structure with proper null checks
  const currentScenario = data.selectedScenario || 'scenario-1';
  const currentScenarioData = data.scenarios?.[currentScenario];
  
  // ✅ SAFE: Get identifiers from current scenario with fallbacks
  const identifiers = currentScenarioData?.identifiers || data.identifiers || [];
  const features = currentScenarioData?.features || data.features || [];
  const outputs = currentScenarioData?.outputs || data.outputs || [];
  
  // ✅ SAFE: Calculate active combinations with null checks
  const activeCombinations = identifiers.reduce((acc, id) => {
    if (!id || !id.values || !Array.isArray(id.values)) return acc;
    return acc + id.values.filter(v => v && v.checked).length;
  }, 0);
  
  // ✅ SAFE: Filter active features and outputs with null checks
  const activeFeatures = features.filter(f => f && f.selected);
  const activeOutputs = outputs.filter(o => o && o.selected);

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
              {identifiers && identifiers.length > 0 ? identifiers.map(identifier => {
                if (!identifier || !identifier.values || !Array.isArray(identifier.values)) return null;
                const checkedValues = identifier.values.filter(v => v && v.checked);
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
              }) : (
                <div className="text-sm text-muted-foreground">No identifiers configured</div>
              )}
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="font-medium text-foreground mb-2">Selected Features</h4>
            <div className="flex flex-wrap gap-1">
              {activeFeatures && activeFeatures.length > 0 ? activeFeatures.map(feature => (
                <Badge key={feature.id} variant="default" className="text-xs">
                  {feature.name}
                </Badge>
              )) : (
                <div className="text-sm text-muted-foreground">No features selected</div>
              )}
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="font-medium text-foreground mb-2">Output Variables</h4>
            <div className="flex flex-wrap gap-1">
              {activeOutputs && activeOutputs.length > 0 ? activeOutputs.map(output => (
                <Badge key={output.id} variant="secondary" className="text-xs">
                  {output.name}
                </Badge>
              )) : (
                <div className="text-sm text-muted-foreground">No outputs selected</div>
              )}
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="font-medium text-foreground mb-2">Reference Configuration</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method:</span>
                <span className="capitalize">{data.referenceMethod || 'Not set'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Period:</span>
                <span>
                  {data.referencePeriod?.from || 'Not set'} - {data.referencePeriod?.to || 'Not set'}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Result Views</h3>
        
        <Card className="p-4">
          <div className="space-y-3">
            {data.resultViews && data.resultViews.length > 0 ? data.resultViews.map(view => (
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
                  Combinations: {view.selectedCombinations?.length || 'None selected'}
                </div>
              </div>
            )) : (
              <div className="text-sm text-muted-foreground">No result views configured</div>
            )}
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