
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
import { CorrelationSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

interface CorrelationExhibitionProps {
  data: CorrelationSettings;
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
                <p className="text-sm font-bold text-green-800 dark:text-green-200">+0.89</p>
                <p className="text-[9px] text-green-600 dark:text-green-400 truncate">Sales×Mktg</p>
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
                <p className="text-sm font-bold text-red-800 dark:text-red-200">-0.72</p>
                <p className="text-[9px] text-red-600 dark:text-red-400 truncate">Price×Demand</p>
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
                <p className="text-sm font-bold text-blue-800 dark:text-blue-200">0.66</p>
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
                <p className="text-sm font-bold text-purple-800 dark:text-purple-200">5/5</p>
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
          {filteredResults.map((result, index) => (
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
                      p: {result.pValue}
                    </span>
                    <span className="bg-muted px-1 py-0 rounded text-[9px]">
                      CI: {result.confidence * 100}%
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