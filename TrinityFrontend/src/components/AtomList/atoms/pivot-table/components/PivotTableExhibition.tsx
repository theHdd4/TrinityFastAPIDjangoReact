import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet } from 'lucide-react';
import { PivotTableSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

interface PivotTableExhibitionProps {
  data: PivotTableSettings;
}

const PivotTableExhibition: React.FC<PivotTableExhibitionProps> = ({ data }) => {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium text-foreground mb-2">Export Options</h4>
        <div className="space-y-2">
          <Button variant="outline" className="w-full justify-start" size="sm">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Export to Excel
          </Button>
          <Button variant="outline" className="w-full justify-start" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export to CSV
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground bg-accent/10 p-3 rounded">
        Your pivot table will be exported with all current filters and aggregations applied.
      </div>
    </div>
  );
};

export default PivotTableExhibition;

