import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileText } from 'lucide-react';
import type { KPIDashboardData } from '../KPIDashboardAtom';

interface KPIDashboardExhibitionProps {
  data: KPIDashboardData | null;
}

const KPIDashboardExhibition: React.FC<KPIDashboardExhibitionProps> = ({ data }) => {
  const handleExport = () => {
    if (!data) return;

    const csvContent = [
      data.headers.join(','),
      ...data.rows.map(row =>
        data.headers.map(header => row[header]).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kpi-dashboard-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-4">
        <FileText className="w-12 h-12 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          Upload data to enable export
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">Export Options</h4>
        <p className="text-xs text-muted-foreground">
          Download your KPI dashboard data
        </p>
      </div>

      <Button
        onClick={handleExport}
        className="w-full"
        variant="outline"
      >
        <Download className="w-4 h-4 mr-2" />
        Export as CSV
      </Button>

      <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
        <p className="text-xs text-muted-foreground">
          The exported file will contain all your dashboard data in CSV format.
        </p>
      </div>
    </div>
  );
};

export default KPIDashboardExhibition;
