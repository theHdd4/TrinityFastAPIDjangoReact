import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, Share2 } from 'lucide-react';
import { BuildModelFeatureBasedData } from '../BuildModelFeatureBasedAtom';

interface BuildModelFeatureBasedExhibitionProps {
  data: BuildModelFeatureBasedData;
}

const BuildModelFeatureBasedExhibition: React.FC<BuildModelFeatureBasedExhibitionProps> = ({ data }) => {
  return (
    <div className="space-y-6">
      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Export Options
          </h4>
        </div>
        <div className="p-4 space-y-4">
          <Button className="w-full justify-start" variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export Model Results
          </Button>
          
          <Button className="w-full justify-start" variant="outline">
            <Share2 className="w-4 h-4 mr-2" />
            Share Analysis
          </Button>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h4 className="font-medium text-foreground">Model Summary</h4>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Selected Models:</span>
            <span className="text-sm font-medium">{data.selectedModels.length}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Y-Variable:</span>
            <span className="text-sm font-medium">{data.yVariable || 'Not selected'}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">X-Variables:</span>
            <span className="text-sm font-medium">{data.xVariables.length}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Transformations:</span>
            <span className="text-sm font-medium">{data.transformations.length}</span>
          </div>
        </div>
      </Card>

      {data.selectedModels.length > 0 && (
        <Card>
          <div className="p-4 border-b bg-muted/30">
            <h4 className="font-medium text-foreground">Selected Models</h4>
          </div>
          <div className="p-4">
            <div className="flex flex-wrap gap-2">
              {data.modelConfigs.map((config) => (
                <Badge key={config.id} variant="secondary">
                  {config.name}
                </Badge>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default BuildModelFeatureBasedExhibition;