import React from 'react';
import { BarChart3, Download, Eye, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ClusteringSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

interface ClusteringExhibitionProps {
  settings: ClusteringSettings;
}

const ClusteringExhibition: React.FC<ClusteringExhibitionProps> = ({ settings }) => {
  // Get the actual clustering results data
  const clusterResults = settings.clusteringData?.clusterResults?.output_data || [];
  const hasResults = clusterResults && Array.isArray(clusterResults) && clusterResults.length > 0;
  
  const getClusterColor = (cluster: number) => {
    const colors = {
      1: '#ef4444', // red
      2: '#22c55e', // green
      3: '#eab308', // yellow
      4: '#3b82f6'  // blue
    };
    return colors[cluster as keyof typeof colors] || '#6b7280';
  };

  const exportToCSV = (data: any[]) => {
    if (data.length === 0) {
      alert('No data to export.');
      return;
    }
    
    // Create CSV content with proper headers
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(key => {
          const value = row[key];
          return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : String(value);
        }).join(',')
      )
    ].join('\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clustering_results_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportToExcel = (data: any[]) => {
    if (data.length === 0) {
      alert('No data to export.');
      return;
    }
    
    try {
      // Import XLSX dynamically to avoid build issues
      import('xlsx').then((XLSX) => {
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Clustering Results');
        
        const fileName = `clustering_results_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(workbook, fileName);
      }).catch((error) => {
        console.error('Failed to load XLSX library:', error);
        alert('Excel export failed. Please use CSV export instead.');
      });
    } catch (error) {
      console.error('Error in Excel export:', error);
      alert('Excel export failed. Please use CSV export instead.');
    }
  };

  const exportFromBackend = async (filePath: string, format: 'csv' | 'excel') => {
    try {
      const endpoint = format === 'csv' ? '/export_csv' : '/export_excel';
      const url = `${process.env.NEXT_PUBLIC_CLUSTERING_API || '/api/clustering'}${endpoint}?object_name=${encodeURIComponent(filePath)}`;
      
      console.log(`Exporting ${format.toUpperCase()} from: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to export ${format.toUpperCase()}: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const fileName = `${filePath.split('/').pop()?.replace('.arrow', '') || 'clustering_result'}.${format === 'csv' ? 'csv' : 'xlsx'}`;

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      
      console.log(`${format.toUpperCase()} exported successfully: ${fileName}`);
    } catch (error) {
      console.error(`Error exporting ${format.toUpperCase()}:`, error);
      alert(`Failed to export ${format.toUpperCase()}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Results Summary */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">Clustering Results</Label>
        </div>
        
        {hasResults ? (
          <div className="space-y-4">
            {/* Export Buttons */}
            <div className="flex gap-2">
              <Button 
                onClick={() => exportToCSV(clusterResults)}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button 
                onClick={() => exportToExcel(clusterResults)}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                Export Excel
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No clustering results yet</p>
            <p className="text-sm">Run clustering from the canvas to see results</p>
          </div>
        )}
      </div>

      {/* Configuration Summary */}
      <div>
        <div className="mb-3">
          <Label className="text-sm font-medium">Configuration Summary</Label>
        </div>
        
        <div className="bg-muted rounded-lg p-4 space-y-2">
          <div className="text-xs">
            <span className="font-medium">Method:</span> {settings.clusteringData?.algorithm ? settings.clusteringData.algorithm.toUpperCase() : 'Not set'}
          </div>
          <div className="text-xs">
            <span className="font-medium">Clusters:</span> {settings.clusteringData?.n_clusters || 'Not set'}
          </div>
          <div className="text-xs">
            <span className="font-medium">Identifiers:</span> {settings.clusteringData?.selectedIdentifiers?.length || 0} selected
          </div>
          <div className="text-xs">
            <span className="font-medium">Measures:</span> {settings.clusteringData?.selectedMeasures?.length || 0} selected
          </div>
          {settings.clusteringData?.selectedDataFile && (
            <div className="text-xs">
              <span className="font-medium">Data File:</span> {settings.clusteringData.selectedDataFile}
            </div>
          )}
          {settings.clusteringData?.uploadedFile && (
            <div className="text-xs">
              <span className="font-medium">Uploaded File:</span> {settings.clusteringData.uploadedFile}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClusteringExhibition;