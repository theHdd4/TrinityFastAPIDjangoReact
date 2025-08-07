
import React, { useState } from 'react';
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
  Info
} from 'lucide-react';
import { CorrelationData } from '../CorrelationAtom';

interface CorrelationExhibitionProps {
  data: CorrelationData;
}

const CorrelationExhibition: React.FC<CorrelationExhibitionProps> = ({ data }) => {
  const [selectedMetric, setSelectedMetric] = useState('all');

  // Enhanced correlation results with more detailed information
  const correlationResults = [
    { 
      var1: 'Sales Volume', 
      var2: 'Marketing Spend', 
      correlation: 0.89, 
      strength: 'Very Strong Positive', 
      pValue: 0.001,
      confidence: 0.95,
      interpretation: 'Strong evidence that marketing spend drives sales volume',
      recommendation: 'Increase marketing budget for optimal ROI',
      risk: 'low'
    },
    { 
      var1: 'Price', 
      var2: 'Demand', 
      correlation: -0.72, 
      strength: 'Strong Negative', 
      pValue: 0.003,
      confidence: 0.92,
      interpretation: 'Higher prices significantly reduce demand',
      recommendation: 'Consider price elasticity in pricing strategy',
      risk: 'medium'
    },
    { 
      var1: 'Temperature', 
      var2: 'Ice Cream Sales', 
      correlation: 0.65, 
      strength: 'Moderate Positive', 
      pValue: 0.012,
      confidence: 0.88,
      interpretation: 'Seasonal temperature patterns influence sales',
      recommendation: 'Adjust inventory based on weather forecasts',
      risk: 'low'
    },
    { 
      var1: 'Advertising', 
      var2: 'Brand Awareness', 
      correlation: 0.58, 
      strength: 'Moderate Positive', 
      pValue: 0.025,
      confidence: 0.85,
      interpretation: 'Advertising efforts moderately increase brand awareness',
      recommendation: 'Optimize ad spend allocation across channels',
      risk: 'medium'
    },
    { 
      var1: 'Experience', 
      var2: 'Salary', 
      correlation: 0.45, 
      strength: 'Weak Positive', 
      pValue: 0.045,
      confidence: 0.78,
      interpretation: 'Experience has limited impact on salary in this dataset',
      recommendation: 'Investigate other factors influencing compensation',
      risk: 'high'
    },
  ];

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

  return (
    <div className="p-6 space-y-6 h-full overflow-auto bg-gradient-to-br from-background via-background to-muted/10">
      {/* Enhanced Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Eye className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Analysis Results</h2>
            <p className="text-sm text-muted-foreground">Comprehensive correlation findings</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="bg-primary/10 border-primary/30">
            <Target className="h-3 w-3 mr-1" />
            {correlationResults.length} Correlations
          </Badge>
          <Button variant="outline" size="sm">
            <Share className="h-4 w-4 mr-2" />
            Share
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex items-center space-x-2 p-2 bg-muted/50 rounded-lg">
        <span className="text-sm font-medium text-muted-foreground">Filter by risk:</span>
        {['all', 'low', 'medium', 'high'].map((risk) => (
          <Button
            key={risk}
            variant={selectedMetric === risk ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSelectedMetric(risk)}
            className="capitalize"
          >
            {risk === 'all' ? 'All Results' : `${risk} Risk`}
          </Button>
        ))}
      </div>

      {/* Enhanced Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/10 border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700 dark:text-green-300">Strongest Positive</p>
                <p className="text-2xl font-bold text-green-800 dark:text-green-200">+0.89</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">Sales × Marketing</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600 opacity-60" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/10 border-red-200 dark:border-red-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-300">Strongest Negative</p>
                <p className="text-2xl font-bold text-red-800 dark:text-red-200">-0.72</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">Price × Demand</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-600 opacity-60" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/10 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Average Strength</p>
                <p className="text-2xl font-bold text-blue-800 dark:text-blue-200">0.66</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Absolute correlation</p>
              </div>
              <Target className="h-8 w-8 text-blue-600 opacity-60" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/10 border-purple-200 dark:border-purple-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-700 dark:text-purple-300">Significant Results</p>
                <p className="text-2xl font-bold text-purple-800 dark:text-purple-200">5/5</p>
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">p &lt; 0.05</p>
              </div>
              <Award className="h-8 w-8 text-purple-600 opacity-60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Detailed Results */}
      <Card className="shadow-lg border-0 bg-gradient-to-br from-card to-card/50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BookOpen className="h-5 w-5" />
            <span>Detailed Correlation Analysis</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {filteredResults.map((result, index) => (
              <div key={index} className="border border-border rounded-xl p-6 space-y-4 bg-gradient-to-r from-background to-muted/30">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-lg flex items-center space-x-2">
                      <span>{result.var1} × {result.var2}</span>
                      {result.correlation >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-600" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-600" />
                      )}
                    </h4>
                    <div className="flex items-center space-x-3">
                      <Badge variant="outline" className="text-xs">
                        p-value: {result.pValue}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        CI: {result.confidence * 100}%
                      </Badge>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(result.risk)}`}>
                        {result.risk} risk
                      </span>
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <div className="text-2xl font-bold">
                      {result.correlation.toFixed(3)}
                    </div>
                    <Badge variant={getStrengthColor(result.correlation)} className="text-xs">
                      {result.strength}
                    </Badge>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium">Correlation Strength</span>
                    <span className="text-muted-foreground">{Math.abs(result.correlation).toFixed(3)}</span>
                  </div>
                  <Progress 
                    value={getProgressValue(result.correlation)} 
                    className="h-3"
                  />
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-start space-x-2">
                    <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Interpretation</p>
                      <p className="text-sm text-muted-foreground mt-1">{result.interpretation}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-700 dark:text-green-300">Recommendation</p>
                      <p className="text-sm text-muted-foreground mt-1">{result.recommendation}</p>
                    </div>
                  </div>
                  
                  {result.risk === 'high' && (
                    <div className="flex items-start space-x-2">
                      <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-orange-700 dark:text-orange-300">Caution</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Low statistical power. Consider collecting more data or investigating confounding variables.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Interpretation Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-lg border-0 bg-gradient-to-br from-card to-card/50">
          <CardHeader>
            <CardTitle className="text-lg">Correlation Strength Guide</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { range: '0.8 - 1.0', label: 'Very Strong', color: 'destructive', desc: 'Highly predictable relationship' },
                { range: '0.6 - 0.8', label: 'Strong', color: 'default', desc: 'Substantial relationship' },
                { range: '0.4 - 0.6', label: 'Moderate', color: 'secondary', desc: 'Moderate relationship' },
                { range: '0.0 - 0.4', label: 'Weak', color: 'outline', desc: 'Limited relationship' },
              ].map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Badge variant={item.color as any} className="text-xs min-w-[80px] justify-center">
                      {item.label}
                    </Badge>
                    <span className="text-sm font-medium">{item.range}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{item.desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-lg border-0 bg-gradient-to-br from-card to-card/50">
          <CardHeader>
            <CardTitle className="text-lg">Statistical Significance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { threshold: 'p < 0.001', label: 'Highly Significant', color: 'text-green-600', desc: 'Extremely strong evidence' },
                { threshold: 'p < 0.01', label: 'Very Significant', color: 'text-green-500', desc: 'Strong evidence' },
                { threshold: 'p < 0.05', label: 'Significant', color: 'text-yellow-600', desc: 'Moderate evidence' },
                { threshold: 'p ≥ 0.05', label: 'Not Significant', color: 'text-red-600', desc: 'Insufficient evidence' },
              ].map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-medium min-w-[80px]">{item.threshold}</span>
                    <span className={`text-sm font-medium ${item.color}`}>{item.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{item.desc}</span>
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