import React from 'react';
import { BarChart3 } from 'lucide-react';
import type { KPIDashboardData } from '../KPIDashboardAtom';

interface KPIDashboardVisualisationProps {
  data: KPIDashboardData | null;
}

const KPIDashboardVisualisation: React.FC<KPIDashboardVisualisationProps> = ({ data }) => {
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-4">
        <BarChart3 className="w-12 h-12 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          Upload data to view visualizations
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
        <h4 className="text-sm font-medium text-foreground mb-2">
          Data Summary
        </h4>
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Total Records:</span>
            <span className="font-medium text-foreground">{data.rows.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Total Columns:</span>
            <span className="font-medium text-foreground">{data.headers.length}</span>
          </div>
          <div className="flex justify-between">
            <span>File Name:</span>
            <span className="font-medium text-foreground truncate max-w-[150px]">
              {data.fileName}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
        <p className="text-xs text-muted-foreground">
          📊 Advanced visualizations will appear here based on your selected metrics
        </p>
      </div>
    </div>
  );
};

export default KPIDashboardVisualisation;
