import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Share2, FileText, Calendar, Target, Layers } from 'lucide-react';
import { ScopeSelectorData } from '../ScopeSelectorAtom';

interface ScopeSelectorExhibitionProps {
  data: ScopeSelectorData;
}

const ScopeSelectorExhibition: React.FC<ScopeSelectorExhibitionProps> = ({ data }) => {
  const totalConfiguredIdentifiers = data.scopes.reduce((total, scope) => {
    return total + Object.values(scope.identifiers).filter(v => v !== '').length;
  }, 0);

  const totalPossibleIdentifiers = data.scopes.length * data.availableIdentifiers.length;
  const configurationRate = Math.round((totalConfiguredIdentifiers / totalPossibleIdentifiers) * 100);

  const handleDownloadCSV = () => {
    // Implementation for CSV download
    console.log('Downloading CSV...');
  };

  const handleDownloadExcel = () => {
    // Implementation for Excel download
    console.log('Downloading Excel...');
  };

  const handleShareResults = () => {
    // Implementation for sharing results
    console.log('Sharing results...');
  };

  return (
    <div className="space-y-6 pb-6">
      {/* Summary Overview */}
      <Card className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Layers className="w-6 h-6 text-blue-600" />
            Scope Selector Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-white rounded-lg border border-blue-200 shadow-sm">
              <div className="text-3xl font-bold text-blue-600 mb-1">{data.scopes.length}</div>
              <div className="text-sm text-gray-600 font-medium">Total Scopes Created</div>
            </div>
            <div className="text-center p-4 bg-white rounded-lg border border-indigo-200 shadow-sm">
              <div className="text-3xl font-bold text-indigo-600 mb-1">{data.selectedIdentifiers.length}</div>
              <div className="text-sm text-gray-600 font-medium">Active Identifiers</div>
            </div>
            <div className="text-center p-4 bg-white rounded-lg border border-purple-200 shadow-sm">
              <div className="text-3xl font-bold text-purple-600 mb-1">{configurationRate}%</div>
              <div className="text-sm text-gray-600 font-medium">Configuration Rate</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-blue-200">
            <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-600" />
              Selected Identifiers
            </h4>
            <div className="flex flex-wrap gap-2">
              {data.selectedIdentifiers.map((identifier) => (
                <Badge key={identifier} className="bg-blue-100 text-blue-800 px-3 py-1">
                  {identifier}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scope Details */}
      <Card className="border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Scope Configurations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.scopes.map((scope) => {
              const configuredCount = Object.values(scope.identifiers).filter(v => v !== '').length;
              const totalCount = Object.keys(scope.identifiers).length;
              const completionPercentage = Math.round((configuredCount / totalCount) * 100);

              return (
                <div key={scope.id} className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-gray-800 text-lg">{scope.name}</h4>
                    <div className="flex items-center gap-2">
                      <Badge 
                        className={`${
                          completionPercentage === 100 
                            ? 'bg-green-100 text-green-800' 
                            : completionPercentage >= 50 
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {completionPercentage}% Complete
                      </Badge>
                      <Badge variant="outline">
                        {configuredCount}/{totalCount} Configured
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-3 text-sm text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span><strong>Timeframe:</strong> {scope.timeframe.from} to {scope.timeframe.to}</span>
                  </div>

                  <div className="space-y-2">
                    <h5 className="font-medium text-gray-700">Identifier Assignments:</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {Object.entries(scope.identifiers).map(([key, value]) => (
                        <div 
                          key={key} 
                          className={`flex justify-between items-center p-2 rounded border text-sm ${
                            value 
                              ? 'bg-white border-green-200 text-green-800' 
                              : 'bg-gray-50 border-gray-200 text-gray-500'
                          }`}
                        >
                          <span className="font-medium">{key}:</span>
                          <span className={value ? 'font-semibold' : 'italic'}>
                            {value || 'Not assigned'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Export Options */}
      <Card className="border-green-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-800">
            <Download className="w-5 h-5" />
            Export & Share
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Button 
              onClick={handleDownloadCSV}
              className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download CSV
            </Button>
            <Button 
              onClick={handleDownloadExcel}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Download Excel
            </Button>
            <Button 
              onClick={handleShareResults}
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-50 flex items-center gap-2"
            >
              <Share2 className="w-4 h-4" />
              Share Results
            </Button>
          </div>
          <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm text-green-800">
              <strong>Ready to export:</strong> {data.scopes.length} scopes with {totalConfiguredIdentifiers} configured identifier assignments across {data.selectedIdentifiers.length} active identifiers.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ScopeSelectorExhibition;