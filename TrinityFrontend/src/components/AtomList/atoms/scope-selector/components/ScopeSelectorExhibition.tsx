import React from 'react';
import { Button } from '@/components/ui/button';
import { FileText, FileSpreadsheet } from 'lucide-react';
import { ScopeSelectorData } from '../ScopeSelectorAtom';

interface Props {
  data: ScopeSelectorData;
}

const ScopeSelectorExhibition: React.FC<Props> = () => {
  const handleExportCSV = () => console.log('Export CSV');
  const handleExportExcel = () => console.log('Export Excel');

  return (
    <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 to-blue-50 overflow-y-auto">
      <div className="space-y-6">
        <div>
          <h5 className="text-md font-medium text-gray-900 mb-2">Export Options</h5>
          <p className="text-sm text-gray-600 mb-4">
            Download your scope-selector results in your preferred format.
          </p>

          <div className="space-y-3">
            <Button
              onClick={handleExportCSV}
              className="w-full flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-700 text-white py-3"
            >
              <FileText className="w-5 h-5" />
              <span>Export as CSV</span>
            </Button>

            <Button
              onClick={handleExportExcel}
              className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white py-3"
            >
              <FileSpreadsheet className="w-5 h-5" />
              <span>Export as Excel</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScopeSelectorExhibition;