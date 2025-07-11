import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileText, FileSpreadsheet } from 'lucide-react';
import { CONCAT_API } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface ConcatExhibitionProps {
  settings: any;
}

const ConcatExhibition: React.FC<ConcatExhibitionProps> = ({ settings }) => {
  const { toast } = useToast();

  const handleExportCSV = async () => {
    if (!settings.concatResults?.result_file) {
      toast({
        title: "No Data Available",
        description: "Please perform a concatenation first to export results.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(`${CONCAT_API}/export_csv?object_name=${encodeURIComponent(settings.concatResults.result_file)}`);
      
      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `concat_result_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export Successful",
        description: "CSV file has been downloaded successfully.",
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export CSV file",
        variant: "destructive",
      });
    }
  };

  const handleExportExcel = async () => {
    if (!settings.concatResults?.result_file) {
      toast({
        title: "No Data Available",
        description: "Please perform a concatenation first to export results.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(`${CONCAT_API}/export_excel?object_name=${encodeURIComponent(settings.concatResults.result_file)}`);
      
      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `concat_result_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export Successful",
        description: "Excel file has been downloaded successfully.",
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: error instanceof Error ? error.message : "Failed to export Excel file",
        variant: "destructive",
      });
    }
  };

  const hasResults = settings.concatResults?.result_file;

  return (
    <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 to-blue-50 overflow-y-auto">
      {/* <div className="mb-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Export Results</h4>
      </div> */}
      
      {!hasResults ? (
        <div className="bg-gray-50 p-8 rounded-lg text-center">
          <div className="text-gray-500 mb-4">
            <Download className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p className="text-lg font-medium text-gray-700 mb-2">No Results Available</p>
            <p className="text-sm text-gray-500">
              Perform a concatenation first to export your results as CSV or Excel files.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h5 className="text-md font-medium text-gray-900 mb-2">Export Options</h5>
            <p className="text-sm text-gray-600 mb-4">
              Download your concatenated results in your preferred format.
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
          
          {settings.concatResults?.result_shape && (
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-sm font-medium text-blue-900">Result Summary</span>
              </div>
              <p className="text-sm text-blue-700">
                Shape: {settings.concatResults.result_shape[0]} rows × {settings.concatResults.result_shape[1]} columns
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConcatExhibition;