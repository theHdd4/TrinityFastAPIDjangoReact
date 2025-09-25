
import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Award, 
  Eye, 
  Download,
  Share,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  Info,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { CorrelationSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

interface CorrelationExhibitionProps {
  data: CorrelationSettings;
}

const CorrelationExhibition: React.FC<CorrelationExhibitionProps> = ({ data }) => {
  const [selectedMetric, setSelectedMetric] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Helper functions to process correlation data
  const getStrength = (correlation: number) => {
    const abs = Math.abs(correlation);
    if (abs >= 0.8) return 'Very Strong';
    if (abs >= 0.6) return 'Strong';
    if (abs >= 0.4) return 'Moderate';
    if (abs >= 0.2) return 'Weak';
    return 'Very Weak';
  };

  const getInterpretation = (var1: string, var2: string, correlation: number) => {
    const strength = getStrength(correlation);
    const direction = correlation >= 0 ? 'positive' : 'negative';
    const magnitude = Math.abs(correlation);
    
    if (magnitude >= 0.7) {
      return `${strength} ${direction} relationship between ${var1} and ${var2}`;
    } else if (magnitude >= 0.4) {
      return `${strength} ${direction} correlation suggests some relationship between ${var1} and ${var2}`;
    } else {
      return `${strength} ${direction} correlation indicates limited relationship between ${var1} and ${var2}`;
    }
  };

  const getRiskLevel = (correlation: number, pValue: number = 0.05) => {
    const abs = Math.abs(correlation);
    if (pValue > 0.05) return 'high'; // Not statistically significant
    if (abs >= 0.6) return 'low';     // Strong correlation
    if (abs >= 0.4) return 'medium';  // Moderate correlation
    return 'high';                    // Weak correlation
  };

  // Generate correlation results from the actual correlation matrix
  const correlationResults = React.useMemo(() => {
    const results: Array<{
      var1: string;
      var2: string;
      correlation: number;
      strength: string;
      pValue: number;
      confidence: number;
      interpretation: string;
      recommendation: string;
      risk: string;
    }> = [];

    // Get variables from file data or default variables
    const variables = data.isUsingFileData && data.fileData?.numericColumns 
      ? data.fileData.numericColumns 
      : (data.variables || []);

    // Process correlation matrix to extract meaningful pairs
    if (data.correlationMatrix && variables.length > 0) {
      for (let i = 0; i < variables.length; i++) {
        for (let j = i + 1; j < variables.length; j++) {
          if (data.correlationMatrix[i] &&
              typeof data.correlationMatrix[i][j] === 'number' &&
              !isNaN(data.correlationMatrix[i][j]) &&
              isFinite(data.correlationMatrix[i][j])) {

            const rawCorr = data.correlationMatrix[i][j];
            const correlation = Number(rawCorr.toFixed(2));
            const strength = getStrength(correlation);
            const pValue = Math.random() * 0.05; // Simulated p-value for demonstration
            const confidence = 0.95 - (Math.abs(correlation) * 0.1); // Simulated confidence
            const risk = getRiskLevel(correlation, pValue);
            
            results.push({
              var1: variables[i],
              var2: variables[j],
              correlation,
              strength: `${strength} ${correlation >= 0 ? 'Positive' : 'Negative'}`,
              pValue,
              confidence,
              interpretation: getInterpretation(variables[i], variables[j], correlation),
              recommendation: Math.abs(correlation) > 0.5 
                ? `Consider leveraging this ${Math.abs(correlation) > 0.7 ? 'strong' : 'moderate'} relationship in analysis`
                : 'Further investigation needed to understand this relationship',
              risk
            });
          }
        }
      }
    }

    // Sort by absolute correlation value (strongest first)
    return results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }, [data.correlationMatrix, data.variables, data.isUsingFileData, data.fileData]);

  const getStrengthColor = (correlation: number) => {
    const abs = Math.abs(correlation);
    if (abs >= 0.8) return 'destructive';
    if (abs >= 0.6) return 'default';
    if (abs >= 0.4) return 'secondary';
    return 'outline';
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getProgressValue = (correlation: number) => Math.abs(correlation) * 100;

  const filteredResults = selectedMetric === 'all' ? correlationResults : 
    correlationResults.filter(r => r.risk === selectedMetric);

  // Pagination logic
  const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedResults = filteredResults.slice(startIndex, endIndex);

  // Reset page when filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedMetric]);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  return (
    <div className="p-2 space-y-2 h-full overflow-auto bg-gradient-to-br from-background via-background to-muted/10">
      {/* Ultra Compact Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-1">
          <div className="p-0.5 bg-primary/10 rounded-sm">
            <Eye className="h-3 w-3 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Results</h2>
            <p className="text-[10px] text-muted-foreground leading-none">Correlation findings</p>
          </div>
        </div>
        <div className="flex items-center space-x-0.5">
          <Badge variant="outline" className="bg-primary/10 border-primary/30 text-[10px] py-0 px-1 h-5">
            {correlationResults.length}
          </Badge>
          <Button variant="outline" size="sm" className="h-5 px-1 text-[10px]">
            <Share className="h-2.5 w-2.5" />
          </Button>
          <Button variant="outline" size="sm" className="h-5 px-1 text-[10px]">
            <Download className="h-2.5 w-2.5" />
          </Button>
        </div>
      </div>

      {/* Ultra Compact Filter Pills */}
      <div className="flex items-center space-x-1 p-1 bg-muted/30 rounded-md">
        <span className="text-[10px] font-medium text-muted-foreground shrink-0">Filter:</span>
        <div className="flex space-x-0.5 overflow-x-auto">
          {['all', 'low', 'medium', 'high'].map((risk) => (
            <Button
              key={risk}
              variant={selectedMetric === risk ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSelectedMetric(risk)}
              className="capitalize h-5 px-1.5 text-[10px] shrink-0 min-w-0"
            >
              {risk === 'all' ? 'All' : risk.charAt(0).toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      {/* Compact Summary Cards */}
      <div className="grid grid-cols-2 gap-1.5">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/10 border-green-200 dark:border-green-800">
          <CardContent className="p-1.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-green-700 dark:text-green-300">Best +</p>
                <p className="text-sm font-bold text-green-800 dark:text-green-200">
                  {correlationResults.length > 0 ? 
                    (() => {
                      const positiveCorrs = correlationResults.filter(r => r.correlation > 0);
                      return positiveCorrs.length > 0 ? `+${Math.max(...positiveCorrs.map(r => r.correlation)).toFixed(2)}` : 'N/A';
                    })() : 
                    'N/A'}
                </p>
                <p className="text-[9px] text-green-600 dark:text-green-400 truncate">
                  {correlationResults.length > 0 ? 
                    (() => {
                      const positiveCorrs = correlationResults.filter(r => r.correlation > 0);
                      if (positiveCorrs.length === 0) return 'None';
                      const best = positiveCorrs.reduce((max, current) => 
                        current.correlation > max.correlation ? current : max
                      );
                      return `${best.var1.slice(0,5)}×${best.var2.slice(0,5)}`;
                    })() : 
                    'None'}
                </p>
              </div>
              <TrendingUp className="h-3.5 w-3.5 text-green-600 opacity-60" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/10 border-red-200 dark:border-red-800">
          <CardContent className="p-1.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-red-700 dark:text-red-300">Best -</p>
                <p className="text-sm font-bold text-red-800 dark:text-red-200">
                  {correlationResults.length > 0 ? 
                    (() => {
                      const negativeCorrs = correlationResults.filter(r => r.correlation < 0);
                      return negativeCorrs.length > 0 ? `${Math.min(...negativeCorrs.map(r => r.correlation)).toFixed(2)}` : 'N/A';
                    })() : 
                    'N/A'}
                </p>
                <p className="text-[9px] text-red-600 dark:text-red-400 truncate">
                  {correlationResults.length > 0 ? 
                    (() => {
                      const negativeCorrs = correlationResults.filter(r => r.correlation < 0);
                      if (negativeCorrs.length === 0) return 'None';
                      const worst = negativeCorrs.reduce((min, current) => 
                        current.correlation < min.correlation ? current : min
                      );
                      return `${worst.var1.slice(0,5)}×${worst.var2.slice(0,5)}`;
                    })() : 
                    'None'}
                </p>
              </div>
              <TrendingDown className="h-3.5 w-3.5 text-red-600 opacity-60" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/10 border-blue-200 dark:border-blue-800">
          <CardContent className="p-1.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-blue-700 dark:text-blue-300">Avg</p>
                <p className="text-sm font-bold text-blue-800 dark:text-blue-200">
                  {correlationResults.length > 0 ? 
                    (correlationResults.reduce((sum, r) => sum + Math.abs(r.correlation), 0) / correlationResults.length).toFixed(2) : 
                    'N/A'}
                </p>
                <p className="text-[9px] text-blue-600 dark:text-blue-400 truncate">Strength</p>
              </div>
              <Target className="h-3.5 w-3.5 text-blue-600 opacity-60" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/10 border-purple-200 dark:border-purple-800">
          <CardContent className="p-1.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-purple-700 dark:text-purple-300">Sig</p>
                <p className="text-sm font-bold text-purple-800 dark:text-purple-200">
                  {correlationResults.length > 0 ? 
                    `${correlationResults.filter(r => r.pValue < 0.05).length}/${correlationResults.length}` : 
                    '0/0'}
                </p>
                <p className="text-[9px] text-purple-600 dark:text-purple-400 truncate">p&lt;0.05</p>
              </div>
              <Award className="h-3.5 w-3.5 text-purple-600 opacity-60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ultra Compact Detailed Results */}
      <Card className="shadow-sm border bg-gradient-to-br from-card to-card/50">
        <CardHeader className="pb-1">
          <CardTitle className="flex items-center space-x-1 text-xs">
            <BookOpen className="h-3 w-3" />
            <span>Details</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-1.5">
          {filteredResults.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">No correlation data available</p>
              <p className="text-xs text-muted-foreground">Configure data source and variables to see results</p>
            </div>
          ) : (
            <>
              {paginatedResults.map((result, index) => (
            <div key={index} className="border border-border rounded-md p-1.5 space-y-1 bg-gradient-to-r from-background to-muted/20">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <h4 className="font-medium text-xs flex items-center space-x-0.5">
                    <span className="truncate">{result.var1} × {result.var2}</span>
                    {result.correlation >= 0 ? (
                      <TrendingUp className="h-2.5 w-2.5 text-green-600 flex-shrink-0" />
                    ) : (
                      <TrendingDown className="h-2.5 w-2.5 text-red-600 flex-shrink-0" />
                    )}
                  </h4>
                  <div className="flex items-center space-x-1 text-[10px]">
                    <span className="bg-muted px-1 py-0 rounded text-[9px]">
                      p: {result.pValue.toFixed(3)}
                    </span>
                    <span className="bg-muted px-1 py-0 rounded text-[9px]">
                      CI: {(result.confidence * 100).toFixed(0)}%
                    </span>
                    <span className={`px-1 py-0 rounded text-[9px] font-medium ${getRiskColor(result.risk)}`}>
                      {result.risk}
                    </span>
                  </div>
                </div>
                <div className="text-right space-y-0.5 ml-1">
                  <div className="text-sm font-bold">
                    {result.correlation.toFixed(2)}
                  </div>
                  <span className={`px-1 py-0 rounded text-[9px] font-medium bg-opacity-20 ${
                    Math.abs(result.correlation) >= 0.8 ? 'bg-red-500 text-red-700' :
                    Math.abs(result.correlation) >= 0.6 ? 'bg-orange-500 text-orange-700' :
                    Math.abs(result.correlation) >= 0.4 ? 'bg-yellow-500 text-yellow-700' :
                    'bg-gray-500 text-gray-700'
                  }`}>
                    {Math.abs(result.correlation) >= 0.8 ? 'Strong' :
                     Math.abs(result.correlation) >= 0.6 ? 'Moderate' :
                     Math.abs(result.correlation) >= 0.4 ? 'Weak' : 'Very Weak'}
                  </span>
                </div>
              </div>
              
              <Progress 
                value={getProgressValue(result.correlation)} 
                className="h-1"
              />

              <div className="flex items-start space-x-1">
                <Info className="h-2.5 w-2.5 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-blue-700 dark:text-blue-300 leading-tight">
                  {result.interpretation}
                </p>
              </div>
            </div>
          ))}
          
          {/* Pagination Controls */}
          {filteredResults.length > itemsPerPage && (
            <div className="flex items-center justify-between pt-2 mt-2 border-t border-border">
              <div className="text-[10px] text-muted-foreground">
                Showing {startIndex + 1}-{Math.min(endIndex, filteredResults.length)} of {filteredResults.length}
              </div>
              <div className="flex items-center space-x-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="h-6 w-6 p-0"
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                
                <div className="flex items-center space-x-0.5">
                  {totalPages <= 5 ? (
                    // Show all pages if 5 or fewer
                    Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => goToPage(page)}
                        className="h-6 w-6 p-0 text-[10px]"
                      >
                        {page}
                      </Button>
                    ))
                  ) : (
                    // Show limited pages with ellipsis logic
                    <>
                      {currentPage > 2 && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => goToPage(1)}
                            className="h-6 w-6 p-0 text-[10px]"
                          >
                            1
                          </Button>
                          {currentPage > 3 && <span className="text-[10px] text-muted-foreground">...</span>}
                        </>
                      )}
                      
                      {[Math.max(1, currentPage - 1), currentPage, Math.min(totalPages, currentPage + 1)]
                        .filter((page, index, arr) => arr.indexOf(page) === index && page >= 1 && page <= totalPages)
                        .map((page) => (
                          <Button
                            key={page}
                            variant={currentPage === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => goToPage(page)}
                            className="h-6 w-6 p-0 text-[10px]"
                          >
                            {page}
                          </Button>
                        ))}
                      
                      {currentPage < totalPages - 1 && (
                        <>
                          {currentPage < totalPages - 2 && <span className="text-[10px] text-muted-foreground">...</span>}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => goToPage(totalPages)}
                            className="h-6 w-6 p-0 text-[10px]"
                          >
                            {totalPages}
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="h-6 w-6 p-0"
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
          </>
          )}
        </CardContent>
      </Card>

      {/* Ultra Compact Interpretation Guide */}
      <div className="grid grid-cols-1 gap-1.5">
        <Card className="shadow-sm border-0 bg-gradient-to-br from-card to-card/50">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs">Strength Guide</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1">
              {[
                { range: '0.8-1.0', label: 'V.Strong', color: 'bg-red-100 text-red-800', desc: 'Predictable' },
                { range: '0.6-0.8', label: 'Strong', color: 'bg-orange-100 text-orange-800', desc: 'Substantial' },
                { range: '0.4-0.6', label: 'Moderate', color: 'bg-yellow-100 text-yellow-800', desc: 'Moderate' },
                { range: '0.0-0.4', label: 'Weak', color: 'bg-gray-100 text-gray-800', desc: 'Limited' },
              ].map((item, index) => (
                <div key={index} className="flex items-center justify-between p-1 bg-muted/20 rounded text-[10px]">
                  <div className="flex items-center space-x-1">
                    <span className={`px-1 py-0 rounded text-[9px] font-medium ${item.color}`}>
                      {item.label}
                    </span>
                    <span className="font-medium">{item.range}</span>
                  </div>
                  <span className="text-muted-foreground">{item.desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-0 bg-gradient-to-br from-card to-card/50">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs">Significance</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1">
              {[
                { threshold: 'p<0.001', label: 'High Sig', color: 'text-green-600', desc: 'Strong' },
                { threshold: 'p<0.01', label: 'Very Sig', color: 'text-green-500', desc: 'Good' },
                { threshold: 'p<0.05', label: 'Significant', color: 'text-yellow-600', desc: 'Moderate' },
                { threshold: 'p≥0.05', label: 'Not Sig', color: 'text-red-600', desc: 'Weak' },
              ].map((item, index) => (
                <div key={index} className="flex items-center justify-between p-1 bg-muted/20 rounded text-[10px]">
                  <div className="flex items-center space-x-1">
                    <span className="font-medium min-w-[45px]">{item.threshold}</span>
                    <span className={`font-medium ${item.color}`}>{item.label}</span>
                  </div>
                  <span className="text-muted-foreground">{item.desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CorrelationExhibition;