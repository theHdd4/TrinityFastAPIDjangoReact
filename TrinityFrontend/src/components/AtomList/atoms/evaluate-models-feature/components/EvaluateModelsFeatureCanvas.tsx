import React, { useState, useEffect, useMemo } from 'react';

// Custom scrollbar styles
const customScrollbarStyles = `
  .custom-scrollbar-orange::-webkit-scrollbar {
    height: 8px;
  }
  .custom-scrollbar-orange::-webkit-scrollbar-track {
    background: #e5e7eb;
    border-radius: 4px;
  }
  .custom-scrollbar-orange::-webkit-scrollbar-thumb {
    background: #374151;
    border-radius: 4px;
    transition: background 0.2s ease;
  }
  .custom-scrollbar-orange::-webkit-scrollbar-thumb:hover {
    background: #111827;
  }
  .custom-scrollbar-purple::-webkit-scrollbar {
    height: 8px;
  }
  .custom-scrollbar-purple::-webkit-scrollbar-track {
    background: #e5e7eb;
    border-radius: 4px;
  }
  .custom-scrollbar-purple::-webkit-scrollbar-thumb {
    background: #8b5cf6;
    border-radius: 4px;
    transition: background 0.2s ease;
  }
  .custom-scrollbar-purple::-webkit-scrollbar-thumb:hover {
    background: #7c3aed;
  }
  .custom-scrollbar-green::-webkit-scrollbar {
    height: 8px;
  }
  .custom-scrollbar-green::-webkit-scrollbar-track {
    background: #e5e7eb;
    border-radius: 4px;
  }
  .custom-scrollbar-green::-webkit-scrollbar-thumb {
    background: #10b981;
    border-radius: 4px;
    transition: background 0.2s ease;
  }
  .custom-scrollbar-green::-webkit-scrollbar-thumb:hover {
    background: #059669;
  }
`;
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip as RechartsTooltip, ScatterChart, Scatter } from 'recharts';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import SCurveChartRenderer from '@/templates/charts/SCurveChartRenderer';
import { Maximize2, X, MessageSquare, Send, Edit3, Trash2, Filter, ChevronDown, ChevronRight, ChevronUp, ArrowUp, ArrowDown, Filter as FilterIcon, Plus, BarChart3 } from 'lucide-react';
import { EvaluateModelsFeatureData } from '../EvaluateModelsFeatureAtom';
import { EvaluateModelsFeatureSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import { EVALUATE_API, FEATURE_OVERVIEW_API, GROUPBY_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import type {
  EvaluateModelsFeatureExhibitionComponentType,
  EvaluateModelsFeatureExhibitionSelection,
  EvaluateModelsFeatureExhibitionSelectionGraphState,
  EvaluateModelsFeatureExhibitionSelectionContext,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import Table from '@/templates/tables/table';
import evaluateModelsFeature from '../index';

// Normalizes various date-like inputs (Date, timestamp, ISO/string) to YYYY-MM-DD
function normalizeToDateString(input: any): string {
  if (input === null || input === undefined) {
    return '';
  }
  try {
    if (input instanceof Date) {
      return input.toISOString().slice(0, 10);
    }
    if (typeof input === 'number') {
      const fromNumber = new Date(input);
      if (!isNaN(fromNumber.getTime())) {
        return fromNumber.toISOString().slice(0, 10);
      }
    }
    if (typeof input === 'string') {
      // If it's already a YYYY-MM-DD string, keep it
      if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        return input;
      }
      const fromString = new Date(input);
      if (!isNaN(fromString.getTime())) {
        return fromString.toISOString().slice(0, 10);
      }
    }
  } catch (e) {
    // Fall through to default return
  }
  return String(input);
}

// Dynamic color palette function (same as select atom)
const getColor = (index: number) => {
  const colors = [
    'hsl(217 91% 60%)',   // Blue
    'hsl(197 92% 61%)',   // Teal blue
    'hsl(262 83% 58%)',   // Purple
    'hsl(173 58% 39%)',   // Dark teal
    'hsl(43 74% 66%)',    // Golden yellow
    'hsl(215 28% 17%)',   // Navy blue
    'hsl(142 76% 36%)',   // Green
    'hsl(0 84% 60%)',     // Red
    'hsl(280 65% 60%)',   // Magenta
    'hsl(32 95% 44%)',    // Orange
    'hsl(200 98% 39%)',   // Dark blue
    'hsl(120 61% 34%)',   // Dark green
    'hsl(340 82% 52%)',   // Pink
    'hsl(60 100% 50%)',   // Yellow
    'hsl(180 100% 25%)',  // Dark cyan
    'hsl(300 100% 25%)'   // Dark magenta
  ];
  
  // If we have more models than colors, cycle through the palette
  return colors[index % colors.length];
};



interface EvaluateModelsFeatureCanvasProps {
  atomId: string;
  data: EvaluateModelsFeatureData;
  settings: EvaluateModelsFeatureSettings['settings'];
  onDataChange: (data: Partial<EvaluateModelsFeatureData>) => void;
  onSettingsChange: (settings: Partial<EvaluateModelsFeatureSettings['settings']>) => void;
  onDataUpload: (file: File, fileId: string) => void;
  onClose?: () => void;
}

// Interface for YoY growth data
interface YoYGrowthData {
  combination_id: string;
  model_name: string;
  waterfall: {
    labels: string[];
    values: number[];
  };
  observed: {
    yoy_percentage: number;
  };
  explanation: {
    contributions: Array<{
      variable: string;
      delta_contribution: number;
    }>;
  };
}

interface Comment {
  id: string;
  text: string;
  timestamp: string;
}

const EvaluateModelsFeatureCanvas: React.FC<EvaluateModelsFeatureCanvasProps> = ({
  atomId,
  data,
  settings,
  onDataChange,
  onSettingsChange,
  onDataUpload,
  onClose
}) => {
  // Get atom from store for exhibition functionality
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  // Get fresh settings from atom store to ensure we have latest values (especially for seriesSettings)
  const atomSettings = (atom?.settings as any) || {};
  // Merge props settings with atom settings (atom settings takes precedence for latest values)
  const effectiveSettings = { ...settings, ...atomSettings };
  
  // Get input file name for clickable subtitle
  const inputFileName = data.selectedDataframe || '';

  // Handle opening the input file in a new tab
  const handleViewDataClick = () => {
    if (inputFileName && atomId) {
      window.open(`/dataframe?name=${encodeURIComponent(inputFileName)}`, '_blank');
    }
  };

  // Comment state management - use data from props instead of local state
  const comments = data.comments || {};
  const newComments = data.newComments || {};
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});

  const saveComment = async (chartId: string) => {
    const newComment = newComments[chartId];
    if (!newComment?.trim()) return;
    
    setIsSaving(prev => ({ ...prev, [chartId]: true }));
    try {
      // Extract combination name and graph type from chartId
      const [graphType, combinationName] = chartId.split('-', 2);
      
      // Get environment variables like column classifier
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};
      
      const formData = new FormData();
      formData.append('client_name', env.CLIENT_NAME || '');
      formData.append('app_name', env.APP_NAME || '');
      formData.append('project_name', env.PROJECT_NAME || '');
      formData.append('combination_id', combinationName);
      formData.append('graph_type', graphType);
              formData.append('comments', JSON.stringify([...(comments[chartId] || []), {id: Date.now().toString(), text: newComment, timestamp: new Date().toISOString()}]));
      
      const response = await fetch(`${EVALUATE_API}/save-comments`, {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        const newCommentObj = {
          id: Date.now().toString(),
          text: newComment,
          timestamp: new Date().toISOString()
        };
        onDataChange({
          comments: {
            ...comments,
            [chartId]: [...(comments[chartId] || []), newCommentObj]
          },
          newComments: {
            ...newComments,
            [chartId]: ''
          }
        });
      } else {
        console.error('Failed to save comments');
      }
    } catch (error) {
      console.error('Error saving comments:', error);
    } finally {
      setIsSaving(prev => ({ ...prev, [chartId]: false }));
    }
  };

  const renderCommentSection = (chartId: string) => {
    const newComment = newComments[chartId] || '';
    const chartComments = comments[chartId] || [];
    const isCurrentlySaving = isSaving[chartId] || false;

    return (
      <div className="mt-4">
        {/* Existing Comments */}
        {chartComments.length > 0 && (
          <div className="mb-3 space-y-2">
            {chartComments.map((comment) => (
              <div key={comment.id} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">{comment.text}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(comment.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteComment(chartId, comment.id)}
                    className="ml-2 text-red-500 hover:text-red-700 text-sm"
                    title="Delete comment"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* New Comment Input */}
        <div className="relative">
          <textarea
            value={newComment}
            onChange={(e) => onDataChange({
              newComments: {
                ...newComments,
                [chartId]: e.target.value
              }
            })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (newComment.trim()) {
                  saveComment(chartId);
                }
              }
            }}
            placeholder="Add your notes or comments here... (Press Enter to save)"
            className="w-full p-3 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all duration-200 text-sm shadow-md"
            rows={3}
            disabled={isCurrentlySaving}
          />
          {isCurrentlySaving && (
            <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center rounded-lg">
              <div className="text-sm text-orange-600">Saving...</div>
            </div>
          )}
        </div>
      </div>
    );
  };
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [scopeSectionExpanded, setScopeSectionExpanded] = useState(true);
  const [yoyGrowthData, setYoyGrowthData] = useState<YoYGrowthData[]>([]);
  const [isLoadingYoyData, setIsLoadingYoyData] = useState(false);
  const [contributionData, setContributionData] = useState<{[key: string]: any[]}>({});
  const [isLoadingContributionData, setIsLoadingContributionData] = useState(false);
  const [actualVsPredictedData, setActualVsPredictedData] = useState<{[key: string]: any}>({});
  const [isLoadingActualVsPredictedData, setIsLoadingActualVsPredictedData] = useState(false);
  const [betaData, setBetaData] = useState<{[key: string]: any}>({});
  const [isLoadingBetaData, setIsLoadingBetaData] = useState(false);
  const [elasticityData, setElasticityData] = useState<{[key: string]: any}>({});
  const [isLoadingElasticityData, setIsLoadingElasticityData] = useState(false);
  const [roiData, setRoiData] = useState<{[key: string]: any}>({});
  const [isLoadingRoiData, setIsLoadingRoiData] = useState(false);
  const [sCurveData, setSCurveData] = useState<{[key: string]: any}>({});
  const [isLoadingSCurveData, setIsLoadingSCurveData] = useState(false);
  
  // State for application type
  const [applicationType, setApplicationType] = useState<string>(() => {
    return data.applicationType || 'general';
  });
  const [isLoadingApplicationType, setIsLoadingApplicationType] = useState(false);
  const [averagesData, setAveragesData] = useState<{[key: string]: any}>({});
  const [isLoadingAveragesData, setIsLoadingAveragesData] = useState(false);
  
  // Dialog open states for expander functionality
  const [waterfallDialogOpen, setWaterfallDialogOpen] = useState(false);
  const [contributionDialogOpen, setContributionDialogOpen] = useState(false);
  const [roiDialogOpen, setRoiDialogOpen] = useState(false);
  const [actualVsPredictedDialogOpen, setActualVsPredictedDialogOpen] = useState(false);
  const [betaDialogOpen, setBetaDialogOpen] = useState(false);
  const [elasticityDialogOpen, setElasticityDialogOpen] = useState(false);
  const [averagesDialogOpen, setAveragesDialogOpen] = useState(false);
  const [sCurveDialogOpen, setSCurveDialogOpen] = useState(false);
  
  // Track which sections were auto-expanded (originally collapsed but expanded to show dialog)
  const [autoExpandedSections, setAutoExpandedSections] = useState<{[key: string]: boolean}>({});
  
  // Cardinality view state
  const [cardinalityData, setCardinalityData] = useState<any[]>([]);
  const [cardinalityLoading, setCardinalityLoading] = useState(false);
  const [cardinalityError, setCardinalityError] = useState<string | null>(null);
  // Use filtering state from global store instead of local state
  const sortColumn = data.sortColumn || '';
  const sortDirection = data.sortDirection || 'desc';
  const columnFilters = data.columnFilters || {};
  
  const selectedCombinations = data.selectedCombinations || [];
  
  // Get scope from the 'scope' column in the dataset
  const [currentScope, setCurrentScope] = useState<string>('');
  
  // New state for identifiers
  interface IdentifierInfo {
    column_name: string | null;
    unique_values: string[];
  }
  const [identifiersData, setIdentifiersData] = useState<{[key: string]: IdentifierInfo}>({});
  const [isLoadingIdentifiers, setIsLoadingIdentifiers] = useState(false);
  
  // State for managing collapsed state of each graph type
  const [collapsedGraphs, setCollapsedGraphs] = useState<{[key: string]: boolean}>({
    waterfall: true,
    contribution: true,
    'actual-vs-predicted': true,
    beta: true,
    elasticity: true,
    roi: true,
    averages: true,
    's-curve': true
  });
  // Initialize from store if available, otherwise empty
  const [selectedIdentifierValues, setSelectedIdentifierValues] = useState<{[key: string]: string[]}>(
    data.selectedIdentifierValues || {}
  );

  // Exhibition functionality
  const { toast } = useToast();
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const exhibitionSelections = React.useMemo<EvaluateModelsFeatureExhibitionSelection[]>(() => {
    return Array.isArray(atom?.settings?.exhibitionSelections)
      ? atom.settings.exhibitionSelections
      : [];
  }, [atom?.settings?.exhibitionSelections]);

  // Deep clone utility function
  const cloneDeep = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => cloneDeep(item));
    if (typeof obj === 'object') {
      const cloned: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cloned[key] = cloneDeep(obj[key]);
        }
      }
      return cloned;
    }
    return obj;
  };

  // Create selection descriptor for exhibition
  const createSelectionDescriptor = (
    graph: { id: string; name: string; type: string; selected: boolean },
    componentType: EvaluateModelsFeatureExhibitionComponentType,
    combinationName?: string,
  ) => {
    const key = combinationName ? `graph-${graph.id}-${combinationName}` : `graph-${graph.id}`;
    const label = combinationName ? `${graph.name} - ${combinationName}` : graph.name;
    return { key, label };
  };

  // Update exhibition selection
  // Helper function to get the current chart type for a graph/combination (matches render logic)
  const getCurrentChartType = (graphType: string, combinationName: string): string => {
    switch (graphType) {
      case 'waterfall':
        return waterfallChartTypes[combinationName] || 'bar_chart';
      case 'elasticity':
        return elasticityChartTypes[combinationName] || 'bar_chart';
      case 'contribution':
        return contributionChartTypes[combinationName] || 'pie_chart';
      case 'roi':
        return roiChartTypes[combinationName] || 'line_chart';
      case 'beta':
        return betaCoefficientsChartTypes[combinationName] || 'bar_chart';
      case 'actual-vs-predicted':
        return actualVsPredictedChartTypes[combinationName] || 'line_chart';
      case 'averages':
        return averagesChartTypes[combinationName] || 'bar_chart';
      case 's-curve':
        return 'line_chart'; // S-curves are always line charts
      default:
        return 'bar_chart';
    }
  };

  const updateExhibitionSelection = React.useCallback(
    (
      graph: { id: string; name: string; type: string; selected: boolean },
      componentType: EvaluateModelsFeatureExhibitionComponentType,
      checked: boolean | "indeterminate",
      combinationName?: string,
    ) => {
      const descriptor = createSelectionDescriptor(graph, componentType, combinationName);
      const existingIndex = exhibitionSelections.findIndex((entry) => entry.key === descriptor.key);
      const nextChecked = checked === true;

      if (nextChecked) {
        // Get the CURRENT chart type (what's actually rendered right now)
        const chartTypePreference = combinationName ? getCurrentChartType(graph.type, combinationName) : 'bar_chart';
        
        console.log('📊 Capturing CURRENT chart type for', graph.type, combinationName, ':', chartTypePreference);

        const graphStateSnapshot: EvaluateModelsFeatureExhibitionSelectionGraphState = {
          graphType: graph.type,
          graphName: graph.name,
          graphId: combinationName ? `${graph.id}-${combinationName}` : graph.id,
          selected: graph.selected,
          combinationName: combinationName,
          chartTypePreference: chartTypePreference,
        };

        // Generate chart data for the specific combination based on graph type
        let chartData = [];
        if (combinationName) {
          // Handle different graph types
          switch (graph.type) {
            case 'waterfall':
              if (yoyGrowthData) {
                const yoyData = yoyGrowthData.find(item => item.combination_id === combinationName);
                if (yoyData && yoyData.waterfall) {
                  chartData = yoyData.waterfall.labels.map((label: string, index: number) => ({
                    name: label,
                    value: yoyData.waterfall.values[index] || 0
                  }));
                }
              }
              break;
            
            case 'elasticity':
              if (elasticityData[combinationName]?.elasticity_data) {
                chartData = elasticityData[combinationName].elasticity_data.map((item: any) => ({
                  name: item.name,
                  value: item.value
                }));
              }
              break;
            
            case 'contribution':
              if (contributionData[combinationName]) {
                chartData = contributionData[combinationName].map((item: any) => ({
                  name: item.name || item.label || item.x,
                  value: item.value || item.y || 0
                }));
              }
              break;
            
            case 'roi':
              if (roiData[combinationName]?.roi_data) {
                chartData = roiData[combinationName].roi_data.map((item: any) => ({
                  name: item.name || item.label,
                  value: item.value || item.roi || 0
                }));
              }
              break;
            
            case 'beta':
              if (betaData[combinationName]?.beta_data) {
                chartData = betaData[combinationName].beta_data.map((item: any) => ({
                  name: item.name || item.label,
                  value: item.value || item.beta || 0
                }));
              }
              break;
            
            case 'actual-vs-predicted':
              if (actualVsPredictedData[combinationName]?.actual_values && actualVsPredictedData[combinationName]?.predicted_values) {
                const combinationData = actualVsPredictedData[combinationName];
                chartData = combinationData.actual_values.map((actual: number, index: number) => ({
                  actual: actual,
                  predicted: combinationData.predicted_values[index] || 0
                })).sort((a, b) => a.actual - b.actual);
              }
              break;
            
            case 's-curve':
              if (sCurveData[combinationName]?.curve_data) {
                chartData = sCurveData[combinationName].curve_data.map((item: any) => ({
                  name: item.name || item.x,
                  value: item.value || item.y || 0
                }));
              }
              break;
            
            case 'averages':
              if (averagesData[combinationName]?.averages_data) {
                chartData = averagesData[combinationName].averages_data.map((item: any) => ({
                  name: item.name,
                  value: item.value
                }));
              }
              break;
            
            default:
              console.warn(`Unknown graph type: ${graph.type}`);
          }
        }

        const graphContextSnapshot: EvaluateModelsFeatureExhibitionSelectionContext = {
          selectedDataframe: data.selectedDataframe,
          scope: data.scope,
          selectedCombinations: data.selectedCombinations ? cloneDeep(data.selectedCombinations) : undefined,
          identifiers: data.identifiers ? cloneDeep(data.identifiers) : undefined,
          modelResults: data.modelResults ? cloneDeep(data.modelResults) : undefined,
          identifiersData: data.identifiersData ? cloneDeep(data.identifiersData) : undefined,
          selectedIdentifierValues: data.selectedIdentifierValues ? cloneDeep(data.selectedIdentifierValues) : undefined,
          chartData: chartData,
          chartConfig: combinationName ? getChartConfigForGraphType(graph.type, combinationName) : undefined,
        };

        const selectionSnapshot: EvaluateModelsFeatureExhibitionSelection = {
          key: descriptor.key,
          graphId: combinationName ? `${graph.id}-${combinationName}` : graph.id,
          graphTitle: combinationName ? `${graph.name} - ${combinationName}` : graph.name,
          componentType,
          graphState: graphStateSnapshot,
          graphContext: graphContextSnapshot,
          capturedAt: new Date().toISOString(),
        };

        const nextSelections = [...exhibitionSelections];
        if (existingIndex >= 0) {
          nextSelections[existingIndex] = {
            ...nextSelections[existingIndex],
            ...selectionSnapshot,
          };
        } else {
          nextSelections.push(selectionSnapshot);
        }
        updateSettings(atomId, { exhibitionSelections: nextSelections });
      } else if (existingIndex >= 0) {
        const nextSelections = exhibitionSelections.filter((entry) => entry.key !== descriptor.key);
        updateSettings(atomId, { exhibitionSelections: nextSelections });
      }
    },
    [exhibitionSelections, data, atomId, updateSettings, yoyGrowthData, elasticityData, contributionData, roiData, betaData, actualVsPredictedData, sCurveData, averagesData],
  );

  // Stage selection for exhibition
  // Function to get current chart configuration for a graph type and combination
  const getChartConfigForGraphType = (graphType: string, combinationName: string) => {
    switch (graphType) {
      case 'waterfall':
        return {
          theme: settings[`waterfallChartThemes_${combinationName}`] || waterfallChartThemes[combinationName] || 'default',
          showGrid: settings[`waterfallChartGridToggle_${combinationName}`] !== undefined ? settings[`waterfallChartGridToggle_${combinationName}`] : (waterfallChartGridToggle[combinationName] !== undefined ? waterfallChartGridToggle[combinationName] : true),
          showLegend: settings[`waterfallChartLegendToggle_${combinationName}`] !== undefined ? settings[`waterfallChartLegendToggle_${combinationName}`] : (waterfallChartLegendToggle[combinationName] !== undefined ? waterfallChartLegendToggle[combinationName] : false),
          showAxisLabels: settings[`waterfallChartAxisLabelsToggle_${combinationName}`] !== undefined ? settings[`waterfallChartAxisLabelsToggle_${combinationName}`] : (waterfallChartAxisLabelsToggle[combinationName] !== undefined ? waterfallChartAxisLabelsToggle[combinationName] : true),
          showDataLabels: settings[`waterfallChartDataLabels_${combinationName}`] !== undefined ? settings[`waterfallChartDataLabels_${combinationName}`] : (waterfallChartDataLabels[combinationName] !== undefined ? waterfallChartDataLabels[combinationName] : true),
          sortOrder: settings[`waterfallChartSortOrder_${combinationName}`] || waterfallChartSortOrder[combinationName] || null,
          chartType: settings[`waterfallChartTypes_${combinationName}`] || waterfallChartTypes[combinationName] || 'bar_chart',
        };
      case 'contribution':
        return {
          theme: settings[`contributionChartThemes_${combinationName}`] || contributionChartThemes[combinationName] || 'default',
          showGrid: settings[`contributionChartGridToggle_${combinationName}`] !== undefined ? settings[`contributionChartGridToggle_${combinationName}`] : (contributionChartGridToggle[combinationName] !== undefined ? contributionChartGridToggle[combinationName] : true),
          showLegend: settings[`contributionChartLegendToggle_${combinationName}`] !== undefined ? settings[`contributionChartLegendToggle_${combinationName}`] : (contributionChartLegendToggle[combinationName] !== undefined ? contributionChartLegendToggle[combinationName] : false),
          showAxisLabels: settings[`contributionChartAxisLabelsToggle_${combinationName}`] !== undefined ? settings[`contributionChartAxisLabelsToggle_${combinationName}`] : (contributionChartAxisLabelsToggle[combinationName] !== undefined ? contributionChartAxisLabelsToggle[combinationName] : true),
          showDataLabels: settings[`contributionChartDataLabels_${combinationName}`] !== undefined ? settings[`contributionChartDataLabels_${combinationName}`] : (contributionChartDataLabels[combinationName] !== undefined ? contributionChartDataLabels[combinationName] : false),
          sortOrder: settings[`contributionChartSortOrder_${combinationName}`] || contributionChartSortOrder[combinationName] || null,
          chartType: settings[`contributionChartTypes_${combinationName}`] || contributionChartTypes[combinationName] || 'pie_chart',
        };
      case 'actual-vs-predicted':
        return {
          theme: settings[`actualVsPredictedChartThemes_${combinationName}`] || actualVsPredictedChartThemes[combinationName] || 'default',
          showGrid: settings[`actualVsPredictedChartGridToggle_${combinationName}`] !== undefined ? settings[`actualVsPredictedChartGridToggle_${combinationName}`] : (actualVsPredictedChartGridToggle[combinationName] !== undefined ? actualVsPredictedChartGridToggle[combinationName] : true),
          showLegend: settings[`actualVsPredictedChartLegendToggle_${combinationName}`] !== undefined ? settings[`actualVsPredictedChartLegendToggle_${combinationName}`] : (actualVsPredictedChartLegendToggle[combinationName] !== undefined ? actualVsPredictedChartLegendToggle[combinationName] : false),
          showAxisLabels: settings[`actualVsPredictedChartAxisLabelsToggle_${combinationName}`] !== undefined ? settings[`actualVsPredictedChartAxisLabelsToggle_${combinationName}`] : (actualVsPredictedChartAxisLabelsToggle[combinationName] !== undefined ? actualVsPredictedChartAxisLabelsToggle[combinationName] : true),
          showDataLabels: settings[`actualVsPredictedChartDataLabels_${combinationName}`] !== undefined ? settings[`actualVsPredictedChartDataLabels_${combinationName}`] : (actualVsPredictedChartDataLabels[combinationName] !== undefined ? actualVsPredictedChartDataLabels[combinationName] : false),
          sortOrder: settings[`actualVsPredictedChartSortOrder_${combinationName}`] || actualVsPredictedChartSortOrder[combinationName] || null,
          chartType: settings[`actualVsPredictedChartTypes_${combinationName}`] || actualVsPredictedChartTypes[combinationName] || 'scatter_chart',
        };
      case 'elasticity':
        return {
          theme: settings[`elasticityChartThemes_${combinationName}`] || elasticityChartThemes[combinationName] || 'default',
          showGrid: settings[`elasticityChartGridToggle_${combinationName}`] !== undefined ? settings[`elasticityChartGridToggle_${combinationName}`] : (elasticityChartGridToggle[combinationName] !== undefined ? elasticityChartGridToggle[combinationName] : true),
          showLegend: settings[`elasticityChartLegendToggle_${combinationName}`] !== undefined ? settings[`elasticityChartLegendToggle_${combinationName}`] : (elasticityChartLegendToggle[combinationName] !== undefined ? elasticityChartLegendToggle[combinationName] : false),
          showAxisLabels: settings[`elasticityChartAxisLabelsToggle_${combinationName}`] !== undefined ? settings[`elasticityChartAxisLabelsToggle_${combinationName}`] : (elasticityChartAxisLabelsToggle[combinationName] !== undefined ? elasticityChartAxisLabelsToggle[combinationName] : true),
          showDataLabels: settings[`elasticityChartDataLabels_${combinationName}`] !== undefined ? settings[`elasticityChartDataLabels_${combinationName}`] : (elasticityChartDataLabels[combinationName] !== undefined ? elasticityChartDataLabels[combinationName] : true),
          sortOrder: settings[`elasticityChartSortOrder_${combinationName}`] || elasticityChartSortOrder[combinationName] || null,
          chartType: settings[`elasticityChartTypes_${combinationName}`] || elasticityChartTypes[combinationName] || 'bar_chart',
        };
      case 'roi':
        return {
          theme: settings[`roiChartThemes_${combinationName}`] || roiChartThemes[combinationName] || 'default',
          showGrid: settings[`roiChartGridToggle_${combinationName}`] !== undefined ? settings[`roiChartGridToggle_${combinationName}`] : (roiChartGridToggle[combinationName] !== undefined ? roiChartGridToggle[combinationName] : true),
          showLegend: settings[`roiChartLegendToggle_${combinationName}`] !== undefined ? settings[`roiChartLegendToggle_${combinationName}`] : (roiChartLegendToggle[combinationName] !== undefined ? roiChartLegendToggle[combinationName] : false),
          showAxisLabels: settings[`roiChartAxisLabelsToggle_${combinationName}`] !== undefined ? settings[`roiChartAxisLabelsToggle_${combinationName}`] : (roiChartAxisLabelsToggle[combinationName] !== undefined ? roiChartAxisLabelsToggle[combinationName] : true),
          showDataLabels: settings[`roiChartDataLabels_${combinationName}`] !== undefined ? settings[`roiChartDataLabels_${combinationName}`] : (roiChartDataLabels[combinationName] !== undefined ? roiChartDataLabels[combinationName] : false),
          sortOrder: settings[`roiChartSortOrder_${combinationName}`] || roiChartSortOrder[combinationName] || null,
          chartType: settings[`roiChartTypes_${combinationName}`] || roiChartTypes[combinationName] || 'bar_chart',
        };
      case 'beta':
        return {
          theme: settings[`betaCoefficientsChartThemes_${combinationName}`] || betaCoefficientsChartThemes[combinationName] || 'default',
          showGrid: settings[`betaCoefficientsChartGridToggle_${combinationName}`] !== undefined ? settings[`betaCoefficientsChartGridToggle_${combinationName}`] : (betaCoefficientsChartGridToggle[combinationName] !== undefined ? betaCoefficientsChartGridToggle[combinationName] : true),
          showLegend: settings[`betaCoefficientsChartLegendToggle_${combinationName}`] !== undefined ? settings[`betaCoefficientsChartLegendToggle_${combinationName}`] : (betaCoefficientsChartLegendToggle[combinationName] !== undefined ? betaCoefficientsChartLegendToggle[combinationName] : false),
          showAxisLabels: settings[`betaCoefficientsChartAxisLabelsToggle_${combinationName}`] !== undefined ? settings[`betaCoefficientsChartAxisLabelsToggle_${combinationName}`] : (betaCoefficientsChartAxisLabelsToggle[combinationName] !== undefined ? betaCoefficientsChartAxisLabelsToggle[combinationName] : true),
          showDataLabels: settings[`betaCoefficientsChartDataLabels_${combinationName}`] !== undefined ? settings[`betaCoefficientsChartDataLabels_${combinationName}`] : (betaCoefficientsChartDataLabels[combinationName] !== undefined ? betaCoefficientsChartDataLabels[combinationName] : true),
          sortOrder: settings[`betaCoefficientsChartSortOrder_${combinationName}`] || betaCoefficientsChartSortOrder[combinationName] || null,
          chartType: settings[`betaCoefficientsChartTypes_${combinationName}`] || betaCoefficientsChartTypes[combinationName] || 'bar_chart',
        };
      case 'averages':
        return {
          theme: settings[`averagesChartThemes_${combinationName}`] || averagesChartThemes[combinationName] || 'default',
          showGrid: settings[`averagesChartGridToggle_${combinationName}`] !== undefined ? settings[`averagesChartGridToggle_${combinationName}`] : (averagesChartGridToggle[combinationName] !== undefined ? averagesChartGridToggle[combinationName] : true),
          showLegend: settings[`averagesChartLegendToggle_${combinationName}`] !== undefined ? settings[`averagesChartLegendToggle_${combinationName}`] : (averagesChartLegendToggle[combinationName] !== undefined ? averagesChartLegendToggle[combinationName] : false),
          showAxisLabels: settings[`averagesChartAxisLabelsToggle_${combinationName}`] !== undefined ? settings[`averagesChartAxisLabelsToggle_${combinationName}`] : (averagesChartAxisLabelsToggle[combinationName] !== undefined ? averagesChartAxisLabelsToggle[combinationName] : true),
          showDataLabels: settings[`averagesChartDataLabels_${combinationName}`] !== undefined ? settings[`averagesChartDataLabels_${combinationName}`] : (averagesChartDataLabels[combinationName] !== undefined ? averagesChartDataLabels[combinationName] : true),
          sortOrder: settings[`averagesChartSortOrder_${combinationName}`] || averagesChartSortOrder[combinationName] || null,
          chartType: settings[`averagesChartTypes_${combinationName}`] || averagesChartTypes[combinationName] || 'bar_chart',
        };
      default:
        return {
          theme: 'default',
          showGrid: true,
          showLegend: false,
          showAxisLabels: true,
          showDataLabels: false,
          sortOrder: null,
          chartType: 'bar_chart',
        };
    }
  };

  const stageSelectionForExhibition = React.useCallback(
    (
      graph: { id: string; name: string; type: string; selected: boolean },
      componentType: EvaluateModelsFeatureExhibitionComponentType,
      combinationName?: string,
    ) => {
      updateExhibitionSelection(graph, componentType, true, combinationName);
      toast({
        title: 'Graph staged for exhibition',
        description: combinationName ? `${graph.name} - ${combinationName} has been staged for exhibition.` : `${graph.name} has been staged for exhibition.`,
      });
    },
    [updateExhibitionSelection, toast],
  );
  
  // State for contribution chart types and themes (similar to explore atom)
  const [contributionChartTypes, setContributionChartTypes] = useState<{[key: string]: string}>({});
  const [contributionChartThemes, setContributionChartThemes] = useState<{[key: string]: string}>({});
  const [contributionChartGridToggle, setContributionChartGridToggle] = useState<{[key: string]: boolean}>({});
  const [contributionChartLegendToggle, setContributionChartLegendToggle] = useState<{[key: string]: boolean}>({});
  const [contributionChartAxisLabelsToggle, setContributionChartAxisLabelsToggle] = useState<{[key: string]: boolean}>({});
  
  // State for actual vs predicted chart types and themes
  const [actualVsPredictedChartTypes, setActualVsPredictedChartTypes] = useState<{[key: string]: string}>({});
  const [actualVsPredictedChartThemes, setActualVsPredictedChartThemes] = useState<{[key: string]: string}>({});
  const [actualVsPredictedChartGridToggle, setActualVsPredictedChartGridToggle] = useState<{[key: string]: boolean}>({});
  const [actualVsPredictedChartLegendToggle, setActualVsPredictedChartLegendToggle] = useState<{[key: string]: boolean}>({});
  const [actualVsPredictedChartAxisLabelsToggle, setActualVsPredictedChartAxisLabelsToggle] = useState<{[key: string]: boolean}>({});
  
  // State for beta coefficients chart types and themes
  const [betaCoefficientsChartTypes, setBetaCoefficientsChartTypes] = useState<{[key: string]: string}>({});
  const [betaCoefficientsChartThemes, setBetaCoefficientsChartThemes] = useState<{[key: string]: string}>({});
  const [betaCoefficientsChartGridToggle, setBetaCoefficientsChartGridToggle] = useState<{[key: string]: boolean}>({});
  const [betaCoefficientsChartLegendToggle, setBetaCoefficientsChartLegendToggle] = useState<{[key: string]: boolean}>({});
  const [betaCoefficientsChartAxisLabelsToggle, setBetaCoefficientsChartAxisLabelsToggle] = useState<{[key: string]: boolean}>({});
  
  // State for elasticity chart types and themes
  const [elasticityChartTypes, setElasticityChartTypes] = useState<{[key: string]: string}>({});
  const [elasticityChartThemes, setElasticityChartThemes] = useState<{[key: string]: string}>({});
  const [elasticityChartGridToggle, setElasticityChartGridToggle] = useState<{[key: string]: boolean}>({});
  const [elasticityChartLegendToggle, setElasticityChartLegendToggle] = useState<{[key: string]: boolean}>({});
  const [elasticityChartAxisLabelsToggle, setElasticityChartAxisLabelsToggle] = useState<{[key: string]: boolean}>({});
  
  // State for ROI chart types and themes
  const [roiChartTypes, setRoiChartTypes] = useState<{[key: string]: string}>({});
  const [roiChartThemes, setRoiChartThemes] = useState<{[key: string]: string}>({});
  const [roiChartGridToggle, setRoiChartGridToggle] = useState<{[key: string]: boolean}>({});
  const [roiChartLegendToggle, setRoiChartLegendToggle] = useState<{[key: string]: boolean}>({});
  const [roiChartAxisLabelsToggle, setRoiChartAxisLabelsToggle] = useState<{[key: string]: boolean}>({});
  
  // State for averages chart types and themes
  const [averagesChartTypes, setAveragesChartTypes] = useState<{[key: string]: string}>({});
  const [averagesChartThemes, setAveragesChartThemes] = useState<{[key: string]: string}>({});
  const [averagesChartGridToggle, setAveragesChartGridToggle] = useState<{[key: string]: boolean}>({});
  const [averagesChartLegendToggle, setAveragesChartLegendToggle] = useState<{[key: string]: boolean}>({});
  const [averagesChartAxisLabelsToggle, setAveragesChartAxisLabelsToggle] = useState<{[key: string]: boolean}>({});
  
  // State for waterfall chart types and themes
  const [waterfallChartTypes, setWaterfallChartTypes] = useState<{[key: string]: string}>({});
  const [waterfallChartThemes, setWaterfallChartThemes] = useState<{[key: string]: string}>({});
  const [waterfallChartGridToggle, setWaterfallChartGridToggle] = useState<{[key: string]: boolean}>({});
  const [waterfallChartLegendToggle, setWaterfallChartLegendToggle] = useState<{[key: string]: boolean}>({});
  const [waterfallChartAxisLabelsToggle, setWaterfallChartAxisLabelsToggle] = useState<{[key: string]: boolean}>({});
  
  // State for S-curve chart types and themes
  const [sCurveChartTypes, setSCurveChartTypes] = useState<{[key: string]: string}>({});
  const [sCurveChartThemes, setSCurveChartThemes] = useState<{[key: string]: string}>({});
  const [sCurveChartGridToggle, setSCurveChartGridToggle] = useState<{[key: string]: boolean}>({});
  const [sCurveChartLegendToggle, setSCurveChartLegendToggle] = useState<{[key: string]: boolean}>({});
  const [sCurveChartAxisLabelsToggle, setSCurveChartAxisLabelsToggle] = useState<{[key: string]: boolean}>({});
  
  // State for data labels for each chart type
  const [contributionChartDataLabels, setContributionChartDataLabels] = useState<{[key: string]: boolean}>({});
  const [actualVsPredictedChartDataLabels, setActualVsPredictedChartDataLabels] = useState<{[key: string]: boolean}>({});
  const [betaCoefficientsChartDataLabels, setBetaCoefficientsChartDataLabels] = useState<{[key: string]: boolean}>({});
  const [elasticityChartDataLabels, setElasticityChartDataLabels] = useState<{[key: string]: boolean}>({});
  const [roiChartDataLabels, setRoiChartDataLabels] = useState<{[key: string]: boolean}>({});
  const [averagesChartDataLabels, setAveragesChartDataLabels] = useState<{[key: string]: boolean}>({});
  const [waterfallChartDataLabels, setWaterfallChartDataLabels] = useState<{[key: string]: boolean}>({});
  
  // State for sort order for each chart type
  const [contributionChartSortOrder, setContributionChartSortOrder] = useState<{[key: string]: 'asc' | 'desc' | null}>({});
  const [roiChartSortOrder, setRoiChartSortOrder] = useState<{[key: string]: 'asc' | 'desc' | null}>({});
  const [actualVsPredictedChartSortOrder, setActualVsPredictedChartSortOrder] = useState<{[key: string]: 'asc' | 'desc' | null}>({});
  const [betaCoefficientsChartSortOrder, setBetaCoefficientsChartSortOrder] = useState<{[key: string]: 'asc' | 'desc' | null}>({});
  const [elasticityChartSortOrder, setElasticityChartSortOrder] = useState<{[key: string]: 'asc' | 'desc' | null}>({});
  const [averagesChartSortOrder, setAveragesChartSortOrder] = useState<{[key: string]: 'asc' | 'desc' | null}>({});
  const [waterfallChartSortOrder, setWaterfallChartSortOrder] = useState<{[key: string]: 'asc' | 'desc' | null}>({});
  
  useEffect(() => {
    const fetchScope = async () => {
      if (data.selectedDataframe) {
        try {
          const response = await fetch(`${EVALUATE_API}/get-scope?object_name=${encodeURIComponent(data.selectedDataframe)}`);
          if (response.ok) {
            const data = await resolveTaskResponse(await response.json());
            setCurrentScope(data.scope);
          } else {
            console.warn('Failed to fetch scope from dataset');
            setCurrentScope('');
          }
        } catch (error) {
          console.error('Error fetching scope:', error);
          setCurrentScope('');
        }
      } else {
        setCurrentScope('');
      }
    };
    
    fetchScope();
  }, [data.selectedDataframe]);

  // Sync chart themes and types from settings when settings change (e.g., after loading from MongoDB)
  useEffect(() => {
    // Sync all chart themes from settings
    const allCombinations = selectedCombinations || [];
    const themeKeys = [
      'waterfallChartThemes',
      'contributionChartThemes',
      'roiChartThemes',
      'actualVsPredictedChartThemes',
      'betaCoefficientsChartThemes',
      'elasticityChartThemes',
      'averagesChartThemes'
    ];
    
    allCombinations.forEach((combinationName: string) => {
      themeKeys.forEach(themeKey => {
        const settingsKey = `${themeKey}_${combinationName}`;
        const savedTheme = settings[settingsKey];
        if (savedTheme !== undefined) {
          // Update the corresponding state
          switch (themeKey) {
            case 'waterfallChartThemes':
              setWaterfallChartThemes(prev => ({ ...prev, [combinationName]: savedTheme }));
              break;
            case 'contributionChartThemes':
              setContributionChartThemes(prev => ({ ...prev, [combinationName]: savedTheme }));
              break;
            case 'roiChartThemes':
              setRoiChartThemes(prev => ({ ...prev, [combinationName]: savedTheme }));
              break;
            case 'actualVsPredictedChartThemes':
              setActualVsPredictedChartThemes(prev => ({ ...prev, [combinationName]: savedTheme }));
              break;
            case 'betaCoefficientsChartThemes':
              setBetaCoefficientsChartThemes(prev => ({ ...prev, [combinationName]: savedTheme }));
              break;
            case 'elasticityChartThemes':
              setElasticityChartThemes(prev => ({ ...prev, [combinationName]: savedTheme }));
              break;
            case 'averagesChartThemes':
              setAveragesChartThemes(prev => ({ ...prev, [combinationName]: savedTheme }));
              break;
          }
        }
      });
    });
    // Only depend on settings and selectedCombinations, not state variables
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, selectedCombinations]);

  // Fetch YoY growth data when dataset and combinations are selected
  useEffect(() => {
    const fetchYoyGrowthData = async () => {
      if (data.selectedDataframe && selectedCombinations.length > 0) {
        setIsLoadingYoyData(true);
        try {
          // Get environment variables like column classifier
          const envStr = localStorage.getItem('env');
          const env = envStr ? JSON.parse(envStr) : {};
          const clientName = env.CLIENT_NAME || '';
          const appName = env.APP_NAME || '';
          const projectName = env.PROJECT_NAME || '';
          
          const response = await fetch(
            `${EVALUATE_API}/yoy-growth?` + 
            `results_file_key=${encodeURIComponent(data.selectedDataframe)}` +
            `&client_name=${encodeURIComponent(clientName)}` +
            `&app_name=${encodeURIComponent(appName)}` +
            `&project_name=${encodeURIComponent(projectName)}`
          );
          
          if (response.ok) {
            const result = await resolveTaskResponse(await response.json());
            console.log('🔍 DEBUG: YoY Backend response:', result);
            // Handle array of results for multiple combinations
            if (result && result.results && Array.isArray(result.results)) {
              setYoyGrowthData(result.results);
            } else {
              setYoyGrowthData([]);
            }
          } else {
            console.warn('Failed to fetch YoY growth data');
            setYoyGrowthData([]);
          }
        } catch (error) {
          console.error('Error fetching YoY growth data:', error);
          setYoyGrowthData([]);
        } finally {
          setIsLoadingYoyData(false);
        }
      } else {
        setYoyGrowthData([]);
      }
    };
    
    fetchYoyGrowthData();
  }, [data.selectedDataframe, selectedCombinations, settings.clientName, settings.appName, settings.projectName]);

  // Fetch contribution data when dataset and combinations are selected
  useEffect(() => {
    const fetchContributionData = async () => {
      if (data.selectedDataframe && selectedCombinations.length > 0) {
        setIsLoadingContributionData(true);
        try {
          // Get environment variables like column classifier
          const envStr = localStorage.getItem('env');
          const env = envStr ? JSON.parse(envStr) : {};
          const clientName = env.CLIENT_NAME || '';
          const appName = env.APP_NAME || '';
          const projectName = env.PROJECT_NAME || '';
          
          const newContributionData: {[key: string]: any[]} = {};
          
          // Fetch contribution data for each combination
          for (const combination of selectedCombinations) {
            try {
              const response = await fetch(
                `${EVALUATE_API}/contribution?` + 
                `results_file_key=${encodeURIComponent(data.selectedDataframe)}` +
                `&combination_id=${encodeURIComponent(combination)}` +
                `&client_name=${encodeURIComponent(clientName)}` +
                `&app_name=${encodeURIComponent(appName)}` +
                `&project_name=${encodeURIComponent(projectName)}`
              );
              
              if (response.ok) {
                const result = await resolveTaskResponse(await response.json());
                newContributionData[combination] = result.contribution_data || [];
              } else {
                console.warn(`Failed to fetch contribution data for combination: ${combination}`);
                newContributionData[combination] = [];
              }
            } catch (error) {
              console.error(`Error fetching contribution data for combination ${combination}:`, error);
              newContributionData[combination] = [];
            }
          }
          
          setContributionData(newContributionData);
        } catch (error) {
          console.error('Error fetching contribution data:', error);
          setContributionData({});
        } finally {
          setIsLoadingContributionData(false);
        }
      } else {
        setContributionData({});
      }
    };
    
    fetchContributionData();
  }, [data.selectedDataframe, selectedCombinations, settings.clientName, settings.appName, settings.projectName]);

  // Fetch beta data when dataset and combinations are selected
  useEffect(() => {
    const fetchBetaData = async () => {
      if (data.selectedDataframe && selectedCombinations.length > 0) {
        setIsLoadingBetaData(true);
        try {
          // Get environment variables like column classifier
          const envStr = localStorage.getItem('env');
          const env = envStr ? JSON.parse(envStr) : {};
          const clientName = env.CLIENT_NAME || '';
          const appName = env.APP_NAME || '';
          const projectName = env.PROJECT_NAME || '';
          
          const betaDataMap: {[key: string]: any} = {};
          
          for (const combination of selectedCombinations) {
            const response = await fetch(
              `${EVALUATE_API}/beta?` + 
              `results_file_key=${encodeURIComponent(data.selectedDataframe)}` +
              `&combination_id=${encodeURIComponent(combination)}` +
              `&client_name=${encodeURIComponent(clientName)}` +
              `&app_name=${encodeURIComponent(appName)}` +
              `&project_name=${encodeURIComponent(projectName)}`
            );
            
            if (response.ok) {
              const result = await resolveTaskResponse(await response.json());
              betaDataMap[combination] = result;
            } else {
              console.warn(`Failed to fetch beta data for combination: ${combination}`);
              betaDataMap[combination] = { beta_data: [] };
            }
          }
          
          setBetaData(betaDataMap);
        } catch (error) {
          console.error('Error fetching beta data:', error);
          setBetaData({});
        } finally {
          setIsLoadingBetaData(false);
        }
      } else {
        setBetaData({});
      }
    };
    
    fetchBetaData();
  }, [data.selectedDataframe, selectedCombinations, settings.clientName, settings.appName, settings.projectName]);

  // Fetch elasticity data when dataset and combinations are selected
  useEffect(() => {
    const fetchElasticityData = async () => {
      if (data.selectedDataframe && selectedCombinations.length > 0) {
        setIsLoadingElasticityData(true);
        try {
          // Get environment variables like column classifier
          const envStr = localStorage.getItem('env');
          const env = envStr ? JSON.parse(envStr) : {};
          const clientName = env.CLIENT_NAME || '';
          const appName = env.APP_NAME || '';
          const projectName = env.PROJECT_NAME || '';
          
          const elasticityDataMap: {[key: string]: any} = {};
          
          for (const combination of selectedCombinations) {
            const response = await fetch(
              `${EVALUATE_API}/elasticity?` + 
              `results_file_key=${encodeURIComponent(data.selectedDataframe)}` +
              `&combination_id=${encodeURIComponent(combination)}` +
              `&client_name=${encodeURIComponent(clientName)}` +
              `&app_name=${encodeURIComponent(appName)}` +
              `&project_name=${encodeURIComponent(projectName)}`
            );
            
            if (response.ok) {
              const result = await resolveTaskResponse(await response.json());
              elasticityDataMap[combination] = result;
            } else {
              console.warn(`Failed to fetch elasticity data for combination: ${combination}`);
              elasticityDataMap[combination] = { elasticity_data: [] };
            }
          }
          
          setElasticityData(elasticityDataMap);
        } catch (error) {
          console.error('Error fetching elasticity data:', error);
          setElasticityData({});
        } finally {
          setIsLoadingElasticityData(false);
        }
      } else {
        setElasticityData({});
      }
    };
    
    fetchElasticityData();
  }, [data.selectedDataframe, selectedCombinations, settings.clientName, settings.appName, settings.projectName]);

  // Fetch ROI data when dataset and combinations are selected
  useEffect(() => {
    const fetchRoiData = async () => {
      if (data.selectedDataframe && selectedCombinations.length > 0) {
        setIsLoadingRoiData(true);
        try {
          // Get environment variables like column classifier
          const envStr = localStorage.getItem('env');
          const env = envStr ? JSON.parse(envStr) : {};
          const clientName = env.CLIENT_NAME || '';
          const appName = env.APP_NAME || '';
          const projectName = env.PROJECT_NAME || '';
          
          const roiDataMap: {[key: string]: any} = {};
          
          for (const combination of selectedCombinations) {
            const response = await fetch(
              `${EVALUATE_API}/roi?` + 
              `results_file_key=${encodeURIComponent(data.selectedDataframe)}` +
              `&combination_id=${encodeURIComponent(combination)}` +
              `&client_name=${encodeURIComponent(clientName)}` +
              `&app_name=${encodeURIComponent(appName)}` +
              `&project_name=${encodeURIComponent(projectName)}`
            );
            
            if (response.ok) {
              const result = await resolveTaskResponse(await response.json());
              roiDataMap[combination] = result;
            } else {
              console.warn(`Failed to fetch ROI data for combination: ${combination}`);
              roiDataMap[combination] = { roi_data: [] };
            }
          }
          
          setRoiData(roiDataMap);
        } catch (error) {
          console.error('Error fetching ROI data:', error);
          setRoiData({});
        } finally {
          setIsLoadingRoiData(false);
        }
      } else {
        setRoiData({});
      }
    };
    
    fetchRoiData();
  }, [data.selectedDataframe, selectedCombinations, settings.clientName, settings.appName, settings.projectName]);

  // Fetch S-curve data when dataset and combinations are selected
  useEffect(() => {
    const fetchSCurveData = async () => {
      if (data.selectedDataframe && selectedCombinations.length > 0) {
        setIsLoadingSCurveData(true);
        try {
          // Get environment variables like column classifier
          const envStr = localStorage.getItem('env');
          const env = envStr ? JSON.parse(envStr) : {};
          const clientName = env.CLIENT_NAME || '';
          const appName = env.APP_NAME || '';
          const projectName = env.PROJECT_NAME || '';
          
          const response = await fetch(
            `${EVALUATE_API}/s-curve?` + 
            `results_file_key=${encodeURIComponent(data.selectedDataframe)}` +
            `&client_name=${encodeURIComponent(clientName)}` +
            `&app_name=${encodeURIComponent(appName)}` +
            `&project_name=${encodeURIComponent(projectName)}`
          );
          
          if (response.ok) {
            const result = await resolveTaskResponse(await response.json());
            console.log('🔍 S-curve data received:', result);
            console.log('🔍 S-curve keys:', result.s_curves ? Object.keys(result.s_curves) : 'No s_curves');
            setSCurveData(result);
          } else {
            console.warn('Failed to fetch S-curve data');
            setSCurveData({});
          }
        } catch (error) {
          console.error('Error fetching S-curve data:', error);
          setSCurveData({});
        } finally {
          setIsLoadingSCurveData(false);
        }
      } else {
        setSCurveData({});
      }
    };
    
    fetchSCurveData();
  }, [data.selectedDataframe, selectedCombinations, settings.clientName, settings.appName, settings.projectName]);

  // Function to fetch application type
  const fetchApplicationType = async () => {
    try {
      setIsLoadingApplicationType(true);
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      const baseUrl = `${EVALUATE_API}/application-type`;
      
      const params = new URLSearchParams({
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      });

      const response = await fetch(`${baseUrl}?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch application type');
      }
      
      const result = await resolveTaskResponse(await response.json());
      
      if (result && result.application_type) {
        setApplicationType(result.application_type);
        onDataChange({ applicationType: result.application_type });
        console.log('🔍 Application type received:', result.application_type);
      }
      
    } catch (error) {
      console.error('Error fetching application type:', error);
      setApplicationType('general');
      onDataChange({ applicationType: 'general' });
    } finally {
      setIsLoadingApplicationType(false);
    }
  };

  // Fetch application type when component mounts
  useEffect(() => {
    if (atomId) {
      fetchApplicationType();
    }
  }, [atomId]);

  // Fetch averages data when dataset and combinations are selected
  useEffect(() => {
    const fetchAveragesData = async () => {
      if (data.selectedDataframe && selectedCombinations.length > 0) {
        setIsLoadingAveragesData(true);
        try {
          // Get environment variables like column classifier
          const envStr = localStorage.getItem('env');
          const env = envStr ? JSON.parse(envStr) : {};
          const clientName = env.CLIENT_NAME || '';
          const appName = env.APP_NAME || '';
          const projectName = env.PROJECT_NAME || '';
          
          const averagesDataMap: {[key: string]: any} = {};
          
          for (const combination of selectedCombinations) {
            const response = await fetch(
              `${EVALUATE_API}/averages?` + 
              `results_file_key=${encodeURIComponent(data.selectedDataframe)}` +
              `&combination_id=${encodeURIComponent(combination)}` +
              `&client_name=${encodeURIComponent(clientName)}` +
              `&app_name=${encodeURIComponent(appName)}` +
              `&project_name=${encodeURIComponent(projectName)}`
            );
            
            if (response.ok) {
              const result = await resolveTaskResponse(await response.json());
              averagesDataMap[combination] = result;
            } else {
              console.warn(`Failed to fetch averages data for combination: ${combination}`);
              averagesDataMap[combination] = { averages_data: [] };
            }
          }
          
          setAveragesData(averagesDataMap);
        } catch (error) {
          console.error('Error fetching averages data:', error);
          setAveragesData({});
        } finally {
          setIsLoadingAveragesData(false);
        }
      } else {
        setAveragesData({});
      }
    };
    
    fetchAveragesData();
  }, [data.selectedDataframe, selectedCombinations, settings.clientName, settings.appName, settings.projectName]);

  // Fetch actual vs predicted data when dataset and combinations are selected
  useEffect(() => {
    const fetchActualVsPredictedData = async () => {
      if (data.selectedDataframe && selectedCombinations.length > 0) {
        setIsLoadingActualVsPredictedData(true);
        try {
          // Get environment variables like column classifier
          const envStr = localStorage.getItem('env');
          const env = envStr ? JSON.parse(envStr) : {};
          const clientName = env.CLIENT_NAME || '';
          const appName = env.APP_NAME || '';
          const projectName = env.PROJECT_NAME || '';
          
          const response = await fetch(
            `${EVALUATE_API}/selected/actual-vs-predicted?` + 
            `results_file_key=${encodeURIComponent(data.selectedDataframe)}` +
            `&client_name=${encodeURIComponent(clientName)}` +
            `&app_name=${encodeURIComponent(appName)}` +
            `&project_name=${encodeURIComponent(projectName)}`
          );
          
          if (response.ok) {
            const result = await resolveTaskResponse(await response.json());
            console.log('🔍 DEBUG: Actual vs Predicted Backend response:', result);
            
            // Transform the data to be organized by combination
            if (result && result.items && Array.isArray(result.items)) {
              console.log('🔍 DEBUG: Backend items:', result.items);
              const transformedData: {[key: string]: any} = {};
              result.items.forEach((item: any) => {
                console.log('🔍 DEBUG: Processing item:', item);
                console.log('🔍 DEBUG: Item combination_id:', item.combination_id);
                console.log('🔍 DEBUG: Item actual_values:', item.actual_values);
                console.log('🔍 DEBUG: Item predicted_values:', item.predicted_values);
                if (item.combination_id) {
                  transformedData[item.combination_id] = item;
                }
              });
              console.log('🔍 DEBUG: Transformed data:', transformedData);
              setActualVsPredictedData(transformedData);
            } else {
              setActualVsPredictedData({});
            }
          } else {
            console.warn('Failed to fetch actual vs predicted data');
            setActualVsPredictedData({});
          }
        } catch (error) {
          console.error('Error fetching actual vs predicted data:', error);
          setActualVsPredictedData({});
        } finally {
          setIsLoadingActualVsPredictedData(false);
        }
      } else {
        setActualVsPredictedData({});
      }
    };
    
    fetchActualVsPredictedData();
  }, [data.selectedDataframe, selectedCombinations, settings.clientName, settings.appName, settings.projectName]);

  // Fetch identifiers when dataset is selected
  useEffect(() => {
    const fetchIdentifiers = async () => {
      if (data.selectedDataframe) {
        setIsLoadingIdentifiers(true);
        try {
          const url = `${EVALUATE_API}/get-identifiers?` + 
            `object_name=${encodeURIComponent(data.selectedDataframe)}` +
            `&bucket=${encodeURIComponent('trinity')}`;
          console.log('🔍 DEBUG: Fetching identifiers from URL:', url);
          console.log('🔍 DEBUG: EVALUATE_API value:', EVALUATE_API);
          
          const response = await fetch(url);
          
          if (response.ok) {
            const result = await resolveTaskResponse(await response.json());
            console.log('🔍 DEBUG: Identifiers Backend response:', result);
            if (result && result.identifiers) {
              setIdentifiersData(result.identifiers);
            } else {
              setIdentifiersData({});
            }
          } else {
            console.warn('Failed to fetch identifiers data');
            setIdentifiersData({});
          }
        } catch (error) {
          console.error('Error fetching identifiers data:', error);
          setIdentifiersData({});
        } finally {
          setIsLoadingIdentifiers(false);
        }
      } else {
        setIdentifiersData({});
      }
    };
    
    fetchIdentifiers();
  }, [data.selectedDataframe]);

  // Re-fetch combinations when identifier values change
  useEffect(() => {
    const fetchFilteredCombinations = async () => {
      const key = data.selectedDataframe;
      if (!key) return;
      
      let url = `${EVALUATE_API}/get-combinations?object_name=${encodeURIComponent(key)}`;
      
      // Add identifier values as query parameter if available
      if (selectedIdentifierValues && Object.keys(selectedIdentifierValues).length > 0) {
        url += `&identifier_values=${encodeURIComponent(JSON.stringify(selectedIdentifierValues))}`;
      }
      
      try {
        const response = await fetch(url);
        const result = await resolveTaskResponse(await response.json());
        
        if (result.combinations && Array.isArray(result.combinations)) {
          console.log('🔍 Re-fetched combinations based on identifier filters:', result.combinations);
          // Update the selected combinations to match the filtered ones
          onDataChange({ selectedCombinations: result.combinations });
        }
      } catch (error) {
        console.error('Error fetching filtered combinations:', error);
      }
    };
    
    // Only fetch if we have a dataframe and identifier values have been set
    if (data.selectedDataframe && Object.keys(selectedIdentifierValues).length > 0) {
      fetchFilteredCombinations();
    }
  }, [data.selectedDataframe, selectedIdentifierValues]);

  // Initialize selected identifier values with "Select All" when identifiers data changes
  // Only initialize if not already set in the store
  useEffect(() => {
    if (Object.keys(identifiersData).length > 0 && !data.selectedIdentifierValues) {
      const initialSelectedValues: {[key: string]: string[]} = {};
      Object.entries(identifiersData).forEach(([identifierName, identifierInfo]) => {
        const info = identifierInfo as IdentifierInfo;
        if (info.unique_values && info.unique_values.length > 0) {
          initialSelectedValues[identifierName] = [...info.unique_values];
        }
      });
      setSelectedIdentifierValues(initialSelectedValues);
      
      // Also store in main data so settings component can access it
      onDataChange({ selectedIdentifierValues: initialSelectedValues });
    }
    }, [identifiersData, data.selectedIdentifierValues]);
  
  // Sync local state with store when store changes (for expanded mode sync)
  useEffect(() => {
    if (data.selectedIdentifierValues) {
      setSelectedIdentifierValues(data.selectedIdentifierValues);
    }
  }, [data.selectedIdentifierValues]);



  // Handle identifier value selection (multi-select)
  const toggleIdentifierValue = (identifierName: string, value: string, checked: boolean) => {
    const currentSelectedValues = selectedIdentifierValues[identifierName] || [];
    
    console.log('🔍 Toggling identifier value:', { identifierName, value, checked, currentSelectedValues });
    
    if (checked) {
      // Add value if not already selected
      if (!currentSelectedValues.includes(value)) {
        const newSelectedValues = [...currentSelectedValues, value];
        const updatedAllValues = {
          ...selectedIdentifierValues,
          [identifierName]: newSelectedValues
        };
        
        setSelectedIdentifierValues(updatedAllValues);
        
        // Update main data so settings component can access it
        onDataChange({ selectedIdentifierValues: updatedAllValues });
        
        console.log('🔍 Updated selectedIdentifierValues (added):', updatedAllValues);
      }
    } else {
      // Remove value if selected
      const newSelectedValues = currentSelectedValues.filter(v => v !== value);
      const updatedAllValues = {
        ...selectedIdentifierValues,
        [identifierName]: newSelectedValues
      };
      
      setSelectedIdentifierValues(updatedAllValues);
      
      // Update main data so settings component can access it
      onDataChange({ selectedIdentifierValues: updatedAllValues });
      
      console.log('🔍 Updated selectedIdentifierValues (removed):', updatedAllValues);
    }
  };

  const toggleGraphCollapse = (graphType: string) => {
    setCollapsedGraphs(prev => ({
      ...prev,
      [graphType]: !prev[graphType]
    }));
  };

  // Handler for expander buttons - expands section first if collapsed, then opens dialog
  const handleExpanderClick = (graphType: string, setDialogOpen: (open: boolean) => void) => {
    // Check if section is collapsed
    if (collapsedGraphs[graphType]) {
      // Mark as auto-expanded (so we can collapse it again when dialog closes)
      setAutoExpandedSections(prev => ({
        ...prev,
        [graphType]: true
      }));
      // First, expand the section
      setCollapsedGraphs(prev => ({
        ...prev,
        [graphType]: false
      }));
      // Wait for animation to complete, then open dialog
      setTimeout(() => {
        setDialogOpen(true);
      }, 50);
    } else {
      // Section is already expanded, open dialog immediately
      setDialogOpen(true);
    }
  };

  // Handler for dialog close - collapses sections that were auto-expanded
  const handleDialogClose = (graphType: string, setDialogOpen: (open: boolean) => void, open: boolean) => {
    setDialogOpen(open);
    // If dialog is closing and this section was auto-expanded, collapse it again
    if (!open && autoExpandedSections[graphType]) {
      setCollapsedGraphs(prev => ({
        ...prev,
        [graphType]: true
      }));
      // Clear the auto-expanded flag
      setAutoExpandedSections(prev => {
        const updated = { ...prev };
        delete updated[graphType];
        return updated;
      });
    }
  };

  // Handle contribution chart type change
  const handleContributionChartTypeChange = (combinationName: string, newType: string) => {
    setContributionChartTypes(prev => ({
      ...prev,
      [combinationName]: newType
    }));
  };

  // Handle contribution chart theme change
  const handleContributionChartThemeChange = (combinationName: string, newTheme: string) => {
    setContributionChartThemes(prev => ({
      ...prev,
      [combinationName]: newTheme
    }));
    // Save to settings for persistence
    updateSettings(atomId, { [`contributionChartThemes_${combinationName}`]: newTheme });
  };

  // Handle actual vs predicted chart type change
  const handleActualVsPredictedChartTypeChange = (combinationName: string, newType: string) => {
    setActualVsPredictedChartTypes(prev => ({
      ...prev,
      [combinationName]: newType
    }));
  };

  // Handle actual vs predicted chart theme change
  const handleActualVsPredictedChartThemeChange = (combinationName: string, newTheme: string) => {
    setActualVsPredictedChartThemes(prev => ({
      ...prev,
      [combinationName]: newTheme
    }));
    // Save to settings for persistence
    updateSettings(atomId, { [`actualVsPredictedChartThemes_${combinationName}`]: newTheme });
  };

  // Handle beta coefficients chart type change
  const handleBetaCoefficientsChartTypeChange = (combinationName: string, newType: string) => {
    setBetaCoefficientsChartTypes(prev => ({
      ...prev,
      [combinationName]: newType
    }));
  };

  // Handle beta coefficients chart theme change
  const handleBetaCoefficientsChartThemeChange = (combinationName: string, newTheme: string) => {
    setBetaCoefficientsChartThemes(prev => ({
      ...prev,
      [combinationName]: newTheme
    }));
    // Save to settings for persistence
    updateSettings(atomId, { [`betaCoefficientsChartThemes_${combinationName}`]: newTheme });
  };

  // Handle elasticity chart type change
  const handleElasticityChartTypeChange = (combinationName: string, newType: string) => {
    setElasticityChartTypes(prev => ({
      ...prev,
      [combinationName]: newType
    }));
  };

  // Handle elasticity chart theme change
  const handleElasticityChartThemeChange = (combinationName: string, newTheme: string) => {
    setElasticityChartThemes(prev => ({
      ...prev,
      [combinationName]: newTheme
    }));
    // Save to settings for persistence
    updateSettings(atomId, { [`elasticityChartThemes_${combinationName}`]: newTheme });
  };

  // Handle ROI chart type change
  const handleRoiChartTypeChange = (combinationName: string, newType: string) => {
    setRoiChartTypes(prev => ({
      ...prev,
      [combinationName]: newType
    }));
  };

  // Handle ROI chart theme change
  const handleRoiChartThemeChange = (combinationName: string, newTheme: string) => {
    setRoiChartThemes(prev => ({
      ...prev,
      [combinationName]: newTheme
    }));
    // Save to settings for persistence
    updateSettings(atomId, { [`roiChartThemes_${combinationName}`]: newTheme });
  };

  // Handle averages chart type change
  const handleAveragesChartTypeChange = (combinationName: string, newType: string) => {
    setAveragesChartTypes(prev => ({
      ...prev,
      [combinationName]: newType
    }));
  };

  // Handle averages chart theme change
  const handleAveragesChartThemeChange = (combinationName: string, newTheme: string) => {
    setAveragesChartThemes(prev => ({
      ...prev,
      [combinationName]: newTheme
    }));
    // Save to settings for persistence
    updateSettings(atomId, { [`averagesChartThemes_${combinationName}`]: newTheme });
  };

  // Handle waterfall chart type change
  const handleWaterfallChartTypeChange = (combinationName: string, newType: string) => {
    setWaterfallChartTypes(prev => ({
      ...prev,
      [combinationName]: newType
    }));
  };

  // Handle waterfall chart theme change
  const handleWaterfallChartThemeChange = (combinationName: string, newTheme: string) => {
    setWaterfallChartThemes(prev => ({
      ...prev,
      [combinationName]: newTheme
    }));
    // Save to settings for persistence
    updateSettings(atomId, { [`waterfallChartThemes_${combinationName}`]: newTheme });
  };

  // Handle waterfall chart grid toggle
  const handleWaterfallChartGridToggle = (combinationName: string, enabled: boolean) => {
    setWaterfallChartGridToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle waterfall chart legend toggle
  const handleWaterfallChartLegendToggle = (combinationName: string, enabled: boolean) => {
    setWaterfallChartLegendToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle waterfall chart axis labels toggle
  const handleWaterfallChartAxisLabelsToggle = (combinationName: string, enabled: boolean) => {
    setWaterfallChartAxisLabelsToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle contribution chart grid toggle
  const handleContributionChartGridToggle = (combinationName: string, enabled: boolean) => {
    setContributionChartGridToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle contribution chart legend toggle
  const handleContributionChartLegendToggle = (combinationName: string, enabled: boolean) => {
    setContributionChartLegendToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle contribution chart axis labels toggle
  const handleContributionChartAxisLabelsToggle = (combinationName: string, enabled: boolean) => {
    setContributionChartAxisLabelsToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle actual vs predicted chart grid toggle
  const handleActualVsPredictedChartGridToggle = (combinationName: string, enabled: boolean) => {
    setActualVsPredictedChartGridToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle actual vs predicted chart legend toggle
  const handleActualVsPredictedChartLegendToggle = (combinationName: string, enabled: boolean) => {
    setActualVsPredictedChartLegendToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle actual vs predicted chart axis labels toggle
  const handleActualVsPredictedChartAxisLabelsToggle = (combinationName: string, enabled: boolean) => {
    setActualVsPredictedChartAxisLabelsToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle beta coefficients chart grid toggle
  const handleBetaCoefficientsChartGridToggle = (combinationName: string, enabled: boolean) => {
    setBetaCoefficientsChartGridToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle beta coefficients chart legend toggle
  const handleBetaCoefficientsChartLegendToggle = (combinationName: string, enabled: boolean) => {
    setBetaCoefficientsChartLegendToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle beta coefficients chart axis labels toggle
  const handleBetaCoefficientsChartAxisLabelsToggle = (combinationName: string, enabled: boolean) => {
    setBetaCoefficientsChartAxisLabelsToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle elasticity chart grid toggle
  const handleElasticityChartGridToggle = (combinationName: string, enabled: boolean) => {
    setElasticityChartGridToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle elasticity chart legend toggle
  const handleElasticityChartLegendToggle = (combinationName: string, enabled: boolean) => {
    setElasticityChartLegendToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle elasticity chart axis labels toggle
  const handleElasticityChartAxisLabelsToggle = (combinationName: string, enabled: boolean) => {
    setElasticityChartAxisLabelsToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle ROI chart grid toggle
  const handleRoiChartGridToggle = (combinationName: string, enabled: boolean) => {
    setRoiChartGridToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle ROI chart legend toggle
  const handleRoiChartLegendToggle = (combinationName: string, enabled: boolean) => {
    setRoiChartLegendToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle ROI chart axis labels toggle
  const handleRoiChartAxisLabelsToggle = (combinationName: string, enabled: boolean) => {
    setRoiChartAxisLabelsToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle averages chart grid toggle
  const handleAveragesChartGridToggle = (combinationName: string, enabled: boolean) => {
    setAveragesChartGridToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle averages chart legend toggle
  const handleAveragesChartLegendToggle = (combinationName: string, enabled: boolean) => {
    setAveragesChartLegendToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle averages chart axis labels toggle
  const handleAveragesChartAxisLabelsToggle = (combinationName: string, enabled: boolean) => {
    setAveragesChartAxisLabelsToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle S-curve chart grid toggle
  const handleSCurveChartGridToggle = (combinationName: string, enabled: boolean) => {
    setSCurveChartGridToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle S-curve chart legend toggle
  const handleSCurveChartLegendToggle = (combinationName: string, enabled: boolean) => {
    setSCurveChartLegendToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle S-curve chart axis labels toggle
  const handleSCurveChartAxisLabelsToggle = (combinationName: string, enabled: boolean) => {
    setSCurveChartAxisLabelsToggle(prev => ({
      ...prev,
      [combinationName]: enabled
    }));
  };

  // Handle data label toggles for each chart type
  const handleContributionChartDataLabelsChange = (combinationName: string, showDataLabels: boolean) => {
    setContributionChartDataLabels(prev => ({
      ...prev,
      [combinationName]: showDataLabels
    }));
  };

  const handleActualVsPredictedChartDataLabelsChange = (combinationName: string, showDataLabels: boolean) => {
    setActualVsPredictedChartDataLabels(prev => ({
      ...prev,
      [combinationName]: showDataLabels
    }));
  };

  const handleBetaCoefficientsChartDataLabelsChange = (combinationName: string, showDataLabels: boolean) => {
    setBetaCoefficientsChartDataLabels(prev => ({
      ...prev,
      [combinationName]: showDataLabels
    }));
  };

  const handleElasticityChartDataLabelsChange = (combinationName: string, showDataLabels: boolean) => {
    setElasticityChartDataLabels(prev => ({
      ...prev,
      [combinationName]: showDataLabels
    }));
  };

  const handleRoiChartDataLabelsChange = (combinationName: string, showDataLabels: boolean) => {
    setRoiChartDataLabels(prev => ({
      ...prev,
      [combinationName]: showDataLabels
    }));
  };

  const handleAveragesChartDataLabelsChange = (combinationName: string, showDataLabels: boolean) => {
    setAveragesChartDataLabels(prev => ({
      ...prev,
      [combinationName]: showDataLabels
    }));
  };

  const handleWaterfallChartDataLabelsChange = (combinationName: string, showDataLabels: boolean) => {
    setWaterfallChartDataLabels(prev => ({
      ...prev,
      [combinationName]: showDataLabels
    }));
  };

  // Handle sort order changes for each chart type
  const handleContributionChartSortOrderChange = (combinationName: string, sortOrder: 'asc' | 'desc' | null) => {
    setContributionChartSortOrder(prev => ({
      ...prev,
      [combinationName]: sortOrder
    }));
    // Save to settings for persistence
    updateSettings(atomId, { [`contributionChartSortOrder_${combinationName}`]: sortOrder });
  };

  const handleActualVsPredictedChartSortOrderChange = (combinationName: string, sortOrder: 'asc' | 'desc' | null) => {
    setActualVsPredictedChartSortOrder(prev => ({
      ...prev,
      [combinationName]: sortOrder
    }));
    // Save to settings for persistence
    updateSettings(atomId, { [`actualVsPredictedChartSortOrder_${combinationName}`]: sortOrder });
  };

  const handleBetaCoefficientsChartSortOrderChange = (combinationName: string, sortOrder: 'asc' | 'desc' | null) => {
    setBetaCoefficientsChartSortOrder(prev => ({
      ...prev,
      [combinationName]: sortOrder
    }));
    // Save to settings for persistence
    updateSettings(atomId, { [`betaCoefficientsChartSortOrder_${combinationName}`]: sortOrder });
  };

  const handleElasticityChartSortOrderChange = (combinationName: string, sortOrder: 'asc' | 'desc' | null) => {
    setElasticityChartSortOrder(prev => ({
      ...prev,
      [combinationName]: sortOrder
    }));
    // Save to settings for persistence
    updateSettings(atomId, { [`elasticityChartSortOrder_${combinationName}`]: sortOrder });
  };

  const handleRoiChartSortOrderChange = (combinationName: string, sortOrder: 'asc' | 'desc' | null) => {
    setRoiChartSortOrder(prev => ({
      ...prev,
      [combinationName]: sortOrder
    }));
    // Save to settings for persistence
    updateSettings(atomId, { [`roiChartSortOrder_${combinationName}`]: sortOrder });
  };

  const handleAveragesChartSortOrderChange = (combinationName: string, sortOrder: 'asc' | 'desc' | null) => {
    setAveragesChartSortOrder(prev => ({
      ...prev,
      [combinationName]: sortOrder
    }));
    // Save to settings for persistence
    updateSettings(atomId, { [`averagesChartSortOrder_${combinationName}`]: sortOrder });
  };

  const handleWaterfallChartSortOrderChange = (combinationName: string, sortOrder: 'asc' | 'desc' | null) => {
    setWaterfallChartSortOrder(prev => ({
      ...prev,
      [combinationName]: sortOrder
    }));
    // Save to settings for persistence
    updateSettings(atomId, { [`waterfallChartSortOrder_${combinationName}`]: sortOrder });
  };

  // Handle sort column changes for each chart type
  const handleWaterfallChartSortColumnChange = (combinationName: string, column: string) => {
    updateSettings(atomId, { [`waterfallChartSortColumn_${combinationName}`]: column });
  };

  const handleContributionChartSortColumnChange = (combinationName: string, column: string) => {
    updateSettings(atomId, { [`contributionChartSortColumn_${combinationName}`]: column });
  };

  const handleActualVsPredictedChartSortColumnChange = (combinationName: string, column: string) => {
    updateSettings(atomId, { [`actualVsPredictedChartSortColumn_${combinationName}`]: column });
  };

  const handleBetaCoefficientsChartSortColumnChange = (combinationName: string, column: string) => {
    updateSettings(atomId, { [`betaCoefficientsChartSortColumn_${combinationName}`]: column });
  };

  const handleElasticityChartSortColumnChange = (combinationName: string, column: string) => {
    updateSettings(atomId, { [`elasticityChartSortColumn_${combinationName}`]: column });
  };

  const handleRoiChartSortColumnChange = (combinationName: string, column: string) => {
    updateSettings(atomId, { [`roiChartSortColumn_${combinationName}`]: column });
  };

  const handleAveragesChartSortColumnChange = (combinationName: string, column: string) => {
    updateSettings(atomId, { [`averagesChartSortColumn_${combinationName}`]: column });
  };

  // Handle series settings changes for each chart type
  const handleWaterfallChartSeriesSettingsChange = (combinationName: string, newSeriesSettings: Record<string, { color?: string; showDataLabels?: boolean }>) => {
    updateSettings(atomId, { [`waterfallChartSeriesSettings_${combinationName}`]: newSeriesSettings });
  };

  const handleContributionChartSeriesSettingsChange = (combinationName: string, newSeriesSettings: Record<string, { color?: string; showDataLabels?: boolean }>) => {
    updateSettings(atomId, { [`contributionChartSeriesSettings_${combinationName}`]: newSeriesSettings });
  };

  const handleActualVsPredictedChartSeriesSettingsChange = (combinationName: string, newSeriesSettings: Record<string, { color?: string; showDataLabels?: boolean }>) => {
    updateSettings(atomId, { [`actualVsPredictedChartSeriesSettings_${combinationName}`]: newSeriesSettings });
  };

  const handleBetaCoefficientsChartSeriesSettingsChange = (combinationName: string, newSeriesSettings: Record<string, { color?: string; showDataLabels?: boolean }>) => {
    updateSettings(atomId, { [`betaCoefficientsChartSeriesSettings_${combinationName}`]: newSeriesSettings });
  };

  const handleElasticityChartSeriesSettingsChange = (combinationName: string, newSeriesSettings: Record<string, { color?: string; showDataLabels?: boolean }>) => {
    updateSettings(atomId, { [`elasticityChartSeriesSettings_${combinationName}`]: newSeriesSettings });
  };

  const handleRoiChartSeriesSettingsChange = (combinationName: string, newSeriesSettings: Record<string, { color?: string; showDataLabels?: boolean }>) => {
    updateSettings(atomId, { [`roiChartSeriesSettings_${combinationName}`]: newSeriesSettings });
  };

  const handleAveragesChartSeriesSettingsChange = (combinationName: string, newSeriesSettings: Record<string, { color?: string; showDataLabels?: boolean }>) => {
    updateSettings(atomId, { [`averagesChartSeriesSettings_${combinationName}`]: newSeriesSettings });
  };

  // Ensure graphs data is available with defaults
  const defaultGraphs = [
    { id: '1', name: 'Waterfall Chart', type: 'waterfall', selected: true },
    { id: '2', name: 'Contribution Chart', type: 'contribution', selected: true },
    { id: '3', name: 'Actual vs Predicted', type: 'actual-vs-predicted', selected: true },
    { id: '4', name: 'Elasticity', type: 'elasticity', selected: true },
    { id: '5', name: 'ROI', type: 'roi', selected: true },
    { id: '6', name: 'Beta', type: 'beta', selected: true },
    { id: '7', name: 'Averages', type: 'averages', selected: true },
    // Only include S-curve for MMM applications
    ...(applicationType === 'mmm' ? [{ id: '8', name: 'S-Curve Analysis', type: 's-curve', selected: true }] : [])
  ];
  const graphs = data.graphs || defaultGraphs;
  const selectedGraphs = graphs.filter(graph => graph.selected);
  
  console.log('🔍 Canvas Debug - data.graphs:', data.graphs);
  console.log('🔍 Canvas Debug - selectedGraphs:', selectedGraphs);
  console.log('🔍 Canvas Debug - graphs with selected=true:', graphs.filter(g => g.selected === true));
  
  // Debug logging
  console.log('Canvas Debug:', {
    dataGraphs: data.graphs,
    graphs: graphs,
    selectedGraphs: selectedGraphs,
    waterfallGraphs: selectedGraphs.filter(g => g.type === 'waterfall'),
    contributionGraphs: selectedGraphs.filter(g => g.type === 'contribution'),
    selectedCombinations: data.selectedCombinations,
    allSelectedCombinations: selectedCombinations,
    dropdownCombinations: data.selectedCombinations || []
  });
  
  // Combinations are already filtered by the backend based on selectedIdentifierValues
  // The Settings component re-fetches combinations when identifier values change
  const filteredCombinations = selectedCombinations;

  const addComment = (chartId: string) => {
    const commentText = newComments[chartId]?.trim();
    if (!commentText) return;

    const comment: Comment = {
      id: `comment_${Date.now()}`,
      text: commentText,
      timestamp: new Date().toLocaleString()
    };

    onDataChange({
      comments: {
        ...comments,
        [chartId]: [...(comments[chartId] || []), comment]
      },
      newComments: {
        ...newComments,
        [chartId]: ""
      }
    });
  };

  const deleteComment = (chartId: string, commentId: string) => {
    onDataChange({
      comments: {
        ...comments,
        [chartId]: comments[chartId]?.filter(comment => comment.id !== commentId) || []
      }
    });
  };



  const renderWaterfallChart = (combinationName: string) => {
    const chartId = `waterfall-${combinationName}`;
    
    // Find YoY data for this specific combination
    const yoyData = yoyGrowthData.find(item => item.combination_id === combinationName);
    
    console.log('🔍 DEBUG: YoY data for', combinationName, ':', yoyData);
    
    if (isLoadingYoyData) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200 min-w-[600px]">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">Loading YoY data...</p>
          </div>
        </div>
      );
    }
    
    if (!yoyData) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200 min-w-[600px]">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">No data available</p>
          </div>
        </div>
      );
    }
    
    // Transform waterfall data for the chart (same as select atom)
    const chartData = yoyData.waterfall.labels.map((label: string, index: number) => ({
      name: label,
      value: yoyData.waterfall.values[index] || 0
    }));
    
    console.log('🔍 DEBUG: Waterfall chart data:', chartData);
    
    // Get chart type and theme for this combination - prioritize settings over state
    const chartType = settings[`waterfallChartTypes_${combinationName}`] || waterfallChartTypes[combinationName] || 'bar_chart';
    const chartTheme = settings[`waterfallChartThemes_${combinationName}`] || waterfallChartThemes[combinationName] || 'default';
    const showDataLabels = waterfallChartDataLabels[combinationName] !== undefined ? waterfallChartDataLabels[combinationName] : true;
    const sortOrder = waterfallChartSortOrder[combinationName] || null;
    const showGrid = waterfallChartGridToggle[combinationName] !== undefined ? waterfallChartGridToggle[combinationName] : true;
    const showLegend = waterfallChartLegendToggle[combinationName] !== undefined ? waterfallChartLegendToggle[combinationName] : (chartType === 'pie_chart');
    const showAxisLabels = waterfallChartAxisLabelsToggle[combinationName] !== undefined ? waterfallChartAxisLabelsToggle[combinationName] : true;
    const isExpanded = !collapsedGraphs.waterfall;
    
    const rendererProps = {
      key: `waterfall-chart-${combinationName}-${chartType}-${chartTheme}`,
      type: chartType as 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart',
      data: chartData,
      xField: 'name',
      yField: 'value',
      xKey: 'name',
      yKey: 'value',
      xAxisLabel: 'Period',
      yAxisLabel: 'Value',
      theme: chartTheme,
      enableScroll: false,
      width: 0,
      height: isExpanded ? 350 : 400,
      showDataLabels: showDataLabels,
      showLegend: showLegend,
      showGrid: showGrid,
      showAxisLabels: showAxisLabels,
      sortOrder: sortOrder,
      onThemeChange: (newTheme: string) => handleWaterfallChartThemeChange(combinationName, newTheme),
      onChartTypeChange: (newType: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart') => handleWaterfallChartTypeChange(combinationName, newType),
      onDataLabelsToggle: (newShowDataLabels: boolean) => handleWaterfallChartDataLabelsChange(combinationName, newShowDataLabels),
      onSortChange: (newSortOrder: 'asc' | 'desc' | null) => handleWaterfallChartSortOrderChange(combinationName, newSortOrder),
      sortColumn: settings[`waterfallChartSortColumn_${combinationName}`],
      onSortColumnChange: (column: string) => handleWaterfallChartSortColumnChange(combinationName, column),
      seriesSettings: effectiveSettings[`waterfallChartSeriesSettings_${combinationName}`] || {},
      onSeriesSettingsChange: (newSeriesSettings: Record<string, { color?: string; showDataLabels?: boolean }>) => handleWaterfallChartSeriesSettingsChange(combinationName, newSeriesSettings),
      onGridToggle: (enabled: boolean) => handleWaterfallChartGridToggle(combinationName, enabled),
      onLegendToggle: (enabled: boolean) => handleWaterfallChartLegendToggle(combinationName, enabled),
      onAxisLabelsToggle: (enabled: boolean) => handleWaterfallChartAxisLabelsToggle(combinationName, enabled)
    };

    // Check if this combination is selected for exhibition
    const waterfallGraphDef = data.graphs?.find(g => g.type === 'waterfall');
    const waterfallDescriptor = waterfallGraphDef ? createSelectionDescriptor(waterfallGraphDef, 'graph', combinationName) : null;
    const isWaterfallSelected = waterfallDescriptor ? exhibitionSelections.some((entry) => entry.key === waterfallDescriptor.key) : false;
    
    return (
      <div key={chartId} className={`bg-white rounded-lg p-4 shadow-sm border-2 ${
        isWaterfallSelected ? 'border-amber-400 bg-amber-50/30' : 'border-orange-100/50'
      } hover:shadow-md transition-all duration-200 ${isExpanded ? 'min-w-[500px]' : 'min-w-[600px]'}`}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <h5 className="text-sm font-medium text-orange-800 mb-3 cursor-pointer hover:text-orange-600 transition-colors">
              {combinationName} 
            </h5>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
            <ContextMenuItem
              onClick={() => {
                const graph = data.graphs?.find(g => g.type === 'waterfall');
                if (graph) {
                  stageSelectionForExhibition(graph, 'graph', combinationName);
                }
              }}
            >
              Exhibit this component
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <div className={`w-full ${isExpanded ? 'h-[350px]' : 'h-[400px]'}`}>
          <RechartsChartRenderer {...rendererProps} />
        </div>
        
        {/* Comment Section */}
        {renderCommentSection(chartId)}
      </div>
    );
  };

  const renderContributionChart = (combinationName: string) => {
    const chartId = `contribution-${combinationName}`;
    
    // Get contribution data for this combination
    const combinationContributionData = contributionData[combinationName] || [];
    
    if (isLoadingContributionData) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200 min-w-[600px]">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">Loading contribution data...</p>
          </div>
        </div>
      );
    }
    
    if (!combinationContributionData || combinationContributionData.length === 0) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200 min-w-[600px]">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">No contribution data available</p>
          </div>
        </div>
      );
    }
    
    // Transform contribution data for the chart
    const contributionChartData = combinationContributionData.map((contribution, index) => ({
      name: contribution.name,
      value: Math.abs(contribution.value)
    }));
    
    // console.log('🔍 DEBUG: Contribution chart data for', combinationName, ':', contributionChartData);
    
    // Get chart type and theme for this combination (default to pie_chart) - prioritize settings over state
    const chartType = settings[`contributionChartTypes_${combinationName}`] || contributionChartTypes[combinationName] || 'pie_chart';
    const chartTheme = settings[`contributionChartThemes_${combinationName}`] || contributionChartThemes[combinationName] || 'default';
    const showDataLabels = contributionChartDataLabels[combinationName] !== undefined ? contributionChartDataLabels[combinationName] : false;
    const sortOrder = contributionChartSortOrder[combinationName] || null;
    const showGrid = contributionChartGridToggle[combinationName] !== undefined ? contributionChartGridToggle[combinationName] : true;
    const showLegend = contributionChartLegendToggle[combinationName] !== undefined ? contributionChartLegendToggle[combinationName] : (chartType === 'pie_chart');
    const showAxisLabels = contributionChartAxisLabelsToggle[combinationName] !== undefined ? contributionChartAxisLabelsToggle[combinationName] : true;
    const isExpanded = !collapsedGraphs.contribution;
    
    // Prepare props for RechartsChartRenderer
    const rendererProps = {
      key: `contribution-chart-${combinationName}-${chartType}-${chartTheme}`,
      type: chartType as 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart',
      data: contributionChartData,
      xField: 'name',
      yField: 'value',
      xKey: 'name',
      yKey: 'value',
      xAxisLabel: 'Variable',
      yAxisLabel: 'Contribution',
      theme: chartTheme,
      enableScroll: false,
      width: 0,
      height: isExpanded ? 350 : 400,
      showDataLabels: showDataLabels,
      showLegend: showLegend,
      showGrid: showGrid,
      showAxisLabels: showAxisLabels,
      sortOrder: sortOrder,
      onThemeChange: (newTheme: string) => handleContributionChartThemeChange(combinationName, newTheme),
      onChartTypeChange: (newType: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart') => handleContributionChartTypeChange(combinationName, newType),
      onDataLabelsToggle: (newShowDataLabels: boolean) => handleContributionChartDataLabelsChange(combinationName, newShowDataLabels),
      onSortChange: (newSortOrder: 'asc' | 'desc' | null) => handleContributionChartSortOrderChange(combinationName, newSortOrder),
      sortColumn: settings[`contributionChartSortColumn_${combinationName}`],
      onSortColumnChange: (column: string) => handleContributionChartSortColumnChange(combinationName, column),
      seriesSettings: effectiveSettings[`contributionChartSeriesSettings_${combinationName}`] || {},
      onSeriesSettingsChange: (newSeriesSettings: Record<string, { color?: string; showDataLabels?: boolean }>) => handleContributionChartSeriesSettingsChange(combinationName, newSeriesSettings),
      onGridToggle: (enabled: boolean) => handleContributionChartGridToggle(combinationName, enabled),
      onLegendToggle: (enabled: boolean) => handleContributionChartLegendToggle(combinationName, enabled),
      onAxisLabelsToggle: (enabled: boolean) => handleContributionChartAxisLabelsToggle(combinationName, enabled)
    };

    // Check if this combination is selected for exhibition
    const contributionGraphDef = data.graphs?.find(g => g.type === 'contribution');
    const contributionDescriptor = contributionGraphDef ? createSelectionDescriptor(contributionGraphDef, 'graph', combinationName) : null;
    const isContributionSelected = contributionDescriptor ? exhibitionSelections.some((entry) => entry.key === contributionDescriptor.key) : false;
    
    return (
      <div key={chartId} className={`bg-white rounded-lg p-4 shadow-sm border-2 ${
        isContributionSelected ? 'border-amber-400 bg-amber-50/30' : 'border-orange-100/50'
      } hover:shadow-md transition-all duration-200 ${isExpanded ? 'min-w-[500px]' : 'min-w-[600px]'}`}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <h5 className="text-sm font-medium text-orange-800 mb-3 cursor-pointer hover:text-orange-600 transition-colors">
              {combinationName} 
            </h5>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
            <ContextMenuItem
              onClick={() => {
                const graph = data.graphs?.find(g => g.type === 'contribution');
                if (graph) {
                  stageSelectionForExhibition(graph, 'graph', combinationName);
                }
              }}
            >
              Exhibit this component
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <div className={`w-full ${isExpanded ? 'h-[350px]' : 'h-[400px]'}`}>
          <RechartsChartRenderer {...rendererProps} />
        </div>
        
        {/* Comment Section */}
        {renderCommentSection(chartId)}
      </div>
    );
  };

  const renderROIChart = (combinationName: string) => {
    const chartId = `roi-${combinationName}`;
    
    // Get ROI data for this combination
    const combinationRoiDataResult = roiData[combinationName] || {};
    const combinationRoiData = combinationRoiDataResult.roi_data || [];
    
    if (isLoadingRoiData) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-purple-100/50 hover:shadow-md transition-all duration-200 min-w-[600px]">
          <h5 className="text-sm font-medium text-purple-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-purple-600 text-center">Loading ROI data...</p>
          </div>
        </div>
      );
    }
    
    if (!combinationRoiData || combinationRoiData.length === 0) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-purple-100/50 hover:shadow-md transition-all duration-200 min-w-[600px]">
          <h5 className="text-sm font-medium text-purple-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-purple-600 text-center">No ROI data available</p>
          </div>
        </div>
      );
    }
    
    // Transform ROI data for the chart
    const roiChartData = combinationRoiData.map((roi, index) => ({
      name: roi.name,
      value: roi.value
    }));
    
    // Get chart type and theme for this combination (default to bar_chart)
    const chartType = settings[`roiChartTypes_${combinationName}`] || roiChartTypes[combinationName] || 'bar_chart';
    const chartTheme = settings[`roiChartThemes_${combinationName}`] || roiChartThemes[combinationName] || 'default';
    const showDataLabels = roiChartDataLabels[combinationName] !== undefined ? roiChartDataLabels[combinationName] : false;
    const sortOrder = roiChartSortOrder[combinationName] || null;
    const showGrid = roiChartGridToggle[combinationName] !== undefined ? roiChartGridToggle[combinationName] : true;
    const showLegend = roiChartLegendToggle[combinationName] !== undefined ? roiChartLegendToggle[combinationName] : (chartType === 'pie_chart');
    const showAxisLabels = roiChartAxisLabelsToggle[combinationName] !== undefined ? roiChartAxisLabelsToggle[combinationName] : true;
    const isExpanded = !collapsedGraphs.roi;
    
    // Prepare props for RechartsChartRenderer
    const rendererProps = {
      key: `roi-chart-${combinationName}-${chartType}-${chartTheme}`,
      type: chartType as 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart',
      data: roiChartData,
      xField: 'name',
      yField: 'value',
      xKey: 'name',
      yKey: 'value',
      xAxisLabel: 'Variable',
      yAxisLabel: 'ROI',
      theme: chartTheme,
      enableScroll: false,
      width: 0,
      height: isExpanded ? 350 : 400,
      showDataLabels: showDataLabels,
      showLegend: showLegend,
      showGrid: showGrid,
      showAxisLabels: showAxisLabels,
      sortOrder: sortOrder,
      onThemeChange: (newTheme: string) => handleRoiChartThemeChange(combinationName, newTheme),
      onChartTypeChange: (newType: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart') => handleRoiChartTypeChange(combinationName, newType),
      onDataLabelsToggle: (newShowDataLabels: boolean) => handleRoiChartDataLabelsChange(combinationName, newShowDataLabels),
      onSortChange: (newSortOrder: 'asc' | 'desc' | null) => handleRoiChartSortOrderChange(combinationName, newSortOrder),
      sortColumn: settings[`roiChartSortColumn_${combinationName}`],
      onSortColumnChange: (column: string) => handleRoiChartSortColumnChange(combinationName, column),
      seriesSettings: effectiveSettings[`roiChartSeriesSettings_${combinationName}`] || {},
      onSeriesSettingsChange: (newSeriesSettings: Record<string, { color?: string; showDataLabels?: boolean }>) => handleRoiChartSeriesSettingsChange(combinationName, newSeriesSettings),
      onGridToggle: (enabled: boolean) => handleRoiChartGridToggle(combinationName, enabled),
      onLegendToggle: (enabled: boolean) => handleRoiChartLegendToggle(combinationName, enabled),
      onAxisLabelsToggle: (enabled: boolean) => handleRoiChartAxisLabelsToggle(combinationName, enabled)
    };

    // Check if this combination is selected for exhibition
    const roiGraphDef = data.graphs?.find(g => g.type === 'roi');
    const roiDescriptor = roiGraphDef ? createSelectionDescriptor(roiGraphDef, 'graph', combinationName) : null;
    const isRoiSelected = roiDescriptor ? exhibitionSelections.some((entry) => entry.key === roiDescriptor.key) : false;
    
    return (
      <div key={chartId} className={`bg-white rounded-lg p-4 shadow-sm border-2 ${
        isRoiSelected ? 'border-amber-400 bg-amber-50/30' : 'border-purple-100/50'
      } hover:shadow-md transition-all duration-200 ${isExpanded ? 'min-w-[500px]' : 'min-w-[600px]'}`}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <h5 className="text-sm font-medium text-purple-800 mb-3 cursor-pointer hover:text-purple-600 transition-colors">
              {combinationName} 
            </h5>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
            <ContextMenuItem
              onClick={() => {
                const graph = data.graphs?.find(g => g.type === 'roi');
                if (graph) {
                  stageSelectionForExhibition(graph, 'graph', combinationName);
                }
              }}
            >
              Exhibit this component
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <div className={`w-full ${isExpanded ? 'h-[350px]' : 'h-[400px]'}`}>
          <RechartsChartRenderer {...rendererProps} />
        </div>
        
        {/* Comment Section */}
        {renderCommentSection(chartId)}
      </div>
    );
  };

  const renderActualVsPredictedChart = (combinationName: string) => {
    const chartId = `actual-vs-predicted-${combinationName}`;
    
    // Get actual vs predicted data for this combination
    const combinationData = actualVsPredictedData[combinationName];
    
    console.log('🔍 DEBUG: renderActualVsPredictedChart called for:', combinationName);
    console.log('🔍 DEBUG: combinationData:', combinationData);
    console.log('🔍 DEBUG: actualVsPredictedData keys:', Object.keys(actualVsPredictedData));
    
    if (isLoadingActualVsPredictedData) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200 min-w-[600px]">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">Loading actual vs predicted data...</p>
          </div>
        </div>
      );
    }
    
    if (!combinationData || !combinationData.actual_values || !combinationData.predicted_values) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200 min-w-[600px]">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">No actual vs predicted data available</p>
          </div>
        </div>
      );
    }
    
    // Prefer dates from backend for X-axis; fallback to index
    const dateArray: string[] | undefined = combinationData.dates || combinationData.date_values || combinationData.timestamps;
    let chartData = combinationData.actual_values.map((actual: number, index: number) => ({
      date: dateArray && dateArray[index] !== undefined ? normalizeToDateString(dateArray[index]) : index,
      index,
      actual: actual,
      predicted: combinationData.predicted_values[index] || 0
    }));
    // If dates provided for every point, sort by date ascending to draw a proper time series
    const useDates = !!(dateArray && dateArray.length === chartData.length);
    if (useDates) {
      chartData = chartData.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    
    console.log('🔍 DEBUG: Actual vs Predicted chart data:', chartData);
    
    // Get chart type and theme for this combination (default to line_chart)
    const chartType = settings[`actualVsPredictedChartTypes_${combinationName}`] || actualVsPredictedChartTypes[combinationName] || 'line_chart';
    const chartTheme = settings[`actualVsPredictedChartThemes_${combinationName}`] || actualVsPredictedChartThemes[combinationName] || 'default';
    const showDataLabels = actualVsPredictedChartDataLabels[combinationName] !== undefined ? actualVsPredictedChartDataLabels[combinationName] : false;
    const sortOrder = actualVsPredictedChartSortOrder[combinationName] || null;
    const showGrid = actualVsPredictedChartGridToggle[combinationName] !== undefined ? actualVsPredictedChartGridToggle[combinationName] : true;
    const showLegend = actualVsPredictedChartLegendToggle[combinationName] !== undefined ? actualVsPredictedChartLegendToggle[combinationName] : (chartType === 'pie_chart');
    const showAxisLabels = actualVsPredictedChartAxisLabelsToggle[combinationName] !== undefined ? actualVsPredictedChartAxisLabelsToggle[combinationName] : true;
    const isExpanded = !collapsedGraphs['actual-vs-predicted'];
    
    // Prepare props for RechartsChartRenderer
    const rendererProps = {
      key: `actual-vs-predicted-chart-${combinationName}-${chartType}-${chartTheme}`,
      type: chartType as 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart',
      data: chartData,
      xField: useDates ? 'date' : 'index',
      yField: 'actual',
      yFields: ['actual','predicted'],
      xKey: useDates ? 'date' : 'index',
      yKey: 'actual',
      xAxisLabel: useDates ? 'Date' : 'Index',
      yAxisLabel: 'Value',
      theme: chartTheme,
      enableScroll: false,
      width: 0,
      height: isExpanded ? 350 : 400,
      showDataLabels: showDataLabels,
      showLegend: showLegend,
      showGrid: showGrid,
      showAxisLabels: showAxisLabels,
      sortOrder: sortOrder,
      onThemeChange: (newTheme: string) => handleActualVsPredictedChartThemeChange(combinationName, newTheme),
      onChartTypeChange: (newType: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart') => handleActualVsPredictedChartTypeChange(combinationName, newType),
      onDataLabelsToggle: (newShowDataLabels: boolean) => handleActualVsPredictedChartDataLabelsChange(combinationName, newShowDataLabels),
      onSortChange: (newSortOrder: 'asc' | 'desc' | null) => handleActualVsPredictedChartSortOrderChange(combinationName, newSortOrder),
      sortColumn: settings[`actualVsPredictedChartSortColumn_${combinationName}`],
      onSortColumnChange: (column: string) => handleActualVsPredictedChartSortColumnChange(combinationName, column),
      seriesSettings: effectiveSettings[`actualVsPredictedChartSeriesSettings_${combinationName}`] || {},
      onSeriesSettingsChange: (newSeriesSettings: Record<string, { color?: string; showDataLabels?: boolean }>) => handleActualVsPredictedChartSeriesSettingsChange(combinationName, newSeriesSettings),
      onGridToggle: (enabled: boolean) => handleActualVsPredictedChartGridToggle(combinationName, enabled),
      onLegendToggle: (enabled: boolean) => handleActualVsPredictedChartLegendToggle(combinationName, enabled),
      onAxisLabelsToggle: (enabled: boolean) => handleActualVsPredictedChartAxisLabelsToggle(combinationName, enabled)
    };

    // Check if this combination is selected for exhibition
    const actualVsPredictedGraphDef = data.graphs?.find(g => g.type === 'actual-vs-predicted');
    const actualVsPredictedDescriptor = actualVsPredictedGraphDef ? createSelectionDescriptor(actualVsPredictedGraphDef, 'graph', combinationName) : null;
    const isActualVsPredictedSelected = actualVsPredictedDescriptor ? exhibitionSelections.some((entry) => entry.key === actualVsPredictedDescriptor.key) : false;
    
    return (
      <div key={chartId} className={`bg-white rounded-lg p-4 shadow-sm border-2 ${
        isActualVsPredictedSelected ? 'border-amber-400 bg-amber-50/30' : 'border-orange-100/50'
      } hover:shadow-md transition-all duration-200 ${isExpanded ? 'min-w-[500px]' : 'min-w-[600px]'}`}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <h5 className="text-sm font-medium text-orange-800 mb-3 cursor-pointer hover:text-orange-600 transition-colors">
              {combinationName} 
            </h5>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
            <ContextMenuItem
              onClick={() => {
                const graph = data.graphs?.find(g => g.type === 'actual-vs-predicted');
                if (graph) {
                  stageSelectionForExhibition(graph, 'graph', combinationName);
                }
              }}
            >
              Exhibit this component
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <div className={`w-full ${isExpanded ? 'h-[350px]' : 'h-[400px]'}`}>
          <RechartsChartRenderer {...rendererProps} />
        </div>
        <div className="mt-2 space-y-1">
          <div className="text-xs text-orange-600">
            Model: {combinationData.model_name || 'Unknown'}
          </div>
        </div>
        
        {/* Comment Section */}
        {renderCommentSection(chartId)}
      </div>
    );
  };

  // Render Beta Chart
  const renderBetaChart = (combinationName: string) => {
    const chartId = `beta-${combinationName}`;
    
    if (isLoadingBetaData) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200 min-w-[600px]">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">Loading beta data...</p>
          </div>
        </div>
      );
    }
    
    const combinationData = betaData[combinationName];
    if (!combinationData || !combinationData.beta_data || combinationData.beta_data.length === 0) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200 min-w-[600px]">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">No beta data available</p>
          </div>
        </div>
      );
    }
    
    const chartData = combinationData.beta_data.map((item: any, index: number) => ({
      name: item.name,
      value: item.value
    }));
    
    // Get chart type and theme for this combination
    const chartType = settings[`betaCoefficientsChartTypes_${combinationName}`] || betaCoefficientsChartTypes[combinationName] || 'bar_chart';
    const chartTheme = settings[`betaCoefficientsChartThemes_${combinationName}`] || betaCoefficientsChartThemes[combinationName] || 'default';
    const showDataLabels = betaCoefficientsChartDataLabels[combinationName] !== undefined ? betaCoefficientsChartDataLabels[combinationName] : true;
    const sortOrder = betaCoefficientsChartSortOrder[combinationName] || null;
    const showGrid = betaCoefficientsChartGridToggle[combinationName] !== undefined ? betaCoefficientsChartGridToggle[combinationName] : true;
    const showLegend = betaCoefficientsChartLegendToggle[combinationName] !== undefined ? betaCoefficientsChartLegendToggle[combinationName] : (chartType === 'pie_chart');
    const showAxisLabels = betaCoefficientsChartAxisLabelsToggle[combinationName] !== undefined ? betaCoefficientsChartAxisLabelsToggle[combinationName] : true;
    const isExpanded = !collapsedGraphs.beta;
    
    const rendererProps = {
      key: `beta-chart-${combinationName}-${chartType}-${chartTheme}`,
      type: chartType as 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart',
      data: chartData,
      xField: 'name',
      yField: 'value',
      xKey: 'name',
      yKey: 'value',
      xAxisLabel: 'Feature',
      yAxisLabel: 'Beta Coefficient',
      theme: chartTheme,
      enableScroll: false,
      width: 0,
      height: isExpanded ? 350 : 400,
      showDataLabels: showDataLabels,
      showLegend: showLegend,
      showGrid: showGrid,
      showAxisLabels: showAxisLabels,
      sortOrder: sortOrder,
      onThemeChange: (newTheme: string) => handleBetaCoefficientsChartThemeChange(combinationName, newTheme),
      onChartTypeChange: (newType: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart') => handleBetaCoefficientsChartTypeChange(combinationName, newType),
      onDataLabelsToggle: (newShowDataLabels: boolean) => handleBetaCoefficientsChartDataLabelsChange(combinationName, newShowDataLabels),
      onSortChange: (newSortOrder: 'asc' | 'desc' | null) => handleBetaCoefficientsChartSortOrderChange(combinationName, newSortOrder),
      sortColumn: settings[`betaCoefficientsChartSortColumn_${combinationName}`],
      onSortColumnChange: (column: string) => handleBetaCoefficientsChartSortColumnChange(combinationName, column),
      seriesSettings: effectiveSettings[`betaCoefficientsChartSeriesSettings_${combinationName}`] || {},
      onSeriesSettingsChange: (newSeriesSettings: Record<string, { color?: string; showDataLabels?: boolean }>) => handleBetaCoefficientsChartSeriesSettingsChange(combinationName, newSeriesSettings),
      onGridToggle: (enabled: boolean) => handleBetaCoefficientsChartGridToggle(combinationName, enabled),
      onLegendToggle: (enabled: boolean) => handleBetaCoefficientsChartLegendToggle(combinationName, enabled),
      onAxisLabelsToggle: (enabled: boolean) => handleBetaCoefficientsChartAxisLabelsToggle(combinationName, enabled)
    };

    // Check if this combination is selected for exhibition
    const betaGraphDef = data.graphs?.find(g => g.type === 'beta');
    const betaDescriptor = betaGraphDef ? createSelectionDescriptor(betaGraphDef, 'graph', combinationName) : null;
    const isBetaSelected = betaDescriptor ? exhibitionSelections.some((entry) => entry.key === betaDescriptor.key) : false;
    
    return (
      <div key={chartId} className={`bg-white rounded-lg p-4 shadow-sm border-2 ${
        isBetaSelected ? 'border-amber-400 bg-amber-50/30' : 'border-orange-100/50'
      } hover:shadow-md transition-all duration-200 ${isExpanded ? 'min-w-[500px]' : 'min-w-[600px]'}`}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <h5 className="text-sm font-medium text-orange-800 mb-3 cursor-pointer hover:text-orange-600 transition-colors">
              {combinationName}
            </h5>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
            <ContextMenuItem
              onClick={() => {
                const graph = data.graphs?.find(g => g.type === 'beta');
                if (graph) {
                  stageSelectionForExhibition(graph, 'graph', combinationName);
                }
              }}
            >
              Exhibit this component
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <div className={`w-full ${isExpanded ? 'h-[350px]' : 'h-[400px]'}`}>
          <RechartsChartRenderer {...rendererProps} />
        </div>
        
        {/* Comment Section */}
        {renderCommentSection(chartId)}
      </div>
    );
  };

  // Render Elasticity Chart
  const renderElasticityChart = (combinationName: string) => {
    const chartId = `elasticity-${combinationName}`;
    
    if (isLoadingElasticityData) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200 min-w-[600px]">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">Loading elasticity data...</p>
          </div>
        </div>
      );
    }
    
    const combinationData = elasticityData[combinationName];
    if (!combinationData || !combinationData.elasticity_data || combinationData.elasticity_data.length === 0) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200 min-w-[600px]">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">No elasticity data available</p>
          </div>
        </div>
      );
    }
    
    const chartData = combinationData.elasticity_data.map((item: any, index: number) => ({
      name: item.name,
      value: item.value
    }));
    
    // Get chart type and theme for this combination
    const chartType = settings[`elasticityChartTypes_${combinationName}`] || elasticityChartTypes[combinationName] || 'bar_chart';
    const chartTheme = settings[`elasticityChartThemes_${combinationName}`] || elasticityChartThemes[combinationName] || 'default';
    const showDataLabels = elasticityChartDataLabels[combinationName] !== undefined ? elasticityChartDataLabels[combinationName] : true;
    const sortOrder = elasticityChartSortOrder[combinationName] || null;
    const showGrid = elasticityChartGridToggle[combinationName] !== undefined ? elasticityChartGridToggle[combinationName] : true;
    const showLegend = elasticityChartLegendToggle[combinationName] !== undefined ? elasticityChartLegendToggle[combinationName] : (chartType === 'pie_chart');
    const showAxisLabels = elasticityChartAxisLabelsToggle[combinationName] !== undefined ? elasticityChartAxisLabelsToggle[combinationName] : true;
    const isExpanded = !collapsedGraphs.elasticity;
    
    const rendererProps = {
      key: `elasticity-chart-${combinationName}-${chartType}-${chartTheme}`,
      type: chartType as 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart',
      data: chartData,
      xField: 'name',
      yField: 'value',
      xKey: 'name',
      yKey: 'value',
      xAxisLabel: 'Feature',
      yAxisLabel: 'Elasticity',
      theme: chartTheme,
      enableScroll: false,
      width: 0,
      height: isExpanded ? 350 : 400,
      showDataLabels: showDataLabels,
      showLegend: showLegend,
      showGrid: showGrid,
      showAxisLabels: showAxisLabels,
      sortOrder: sortOrder,
      onThemeChange: (newTheme: string) => handleElasticityChartThemeChange(combinationName, newTheme),
      onChartTypeChange: (newType: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart') => handleElasticityChartTypeChange(combinationName, newType),
      onDataLabelsToggle: (newShowDataLabels: boolean) => handleElasticityChartDataLabelsChange(combinationName, newShowDataLabels),
      onSortChange: (newSortOrder: 'asc' | 'desc' | null) => handleElasticityChartSortOrderChange(combinationName, newSortOrder),
      sortColumn: settings[`elasticityChartSortColumn_${combinationName}`],
      onSortColumnChange: (column: string) => handleElasticityChartSortColumnChange(combinationName, column),
      seriesSettings: effectiveSettings[`elasticityChartSeriesSettings_${combinationName}`] || {},
      onSeriesSettingsChange: (newSeriesSettings: Record<string, { color?: string; showDataLabels?: boolean }>) => handleElasticityChartSeriesSettingsChange(combinationName, newSeriesSettings),
      onGridToggle: (enabled: boolean) => handleElasticityChartGridToggle(combinationName, enabled),
      onLegendToggle: (enabled: boolean) => handleElasticityChartLegendToggle(combinationName, enabled),
      onAxisLabelsToggle: (enabled: boolean) => handleElasticityChartAxisLabelsToggle(combinationName, enabled)
    };

    // Check if this combination is selected for exhibition
    const elasticityGraphDef = data.graphs?.find(g => g.type === 'elasticity');
    const elasticityDescriptor = elasticityGraphDef ? createSelectionDescriptor(elasticityGraphDef, 'graph', combinationName) : null;
    const isElasticitySelected = elasticityDescriptor ? exhibitionSelections.some((entry) => entry.key === elasticityDescriptor.key) : false;
    
    return (
      <div key={chartId} className={`bg-white rounded-lg p-4 shadow-sm border-2 ${
        isElasticitySelected ? 'border-amber-400 bg-amber-50/30' : 'border-orange-100/50'
      } hover:shadow-md transition-all duration-200 ${isExpanded ? 'min-w-[500px]' : 'min-w-[600px]'}`}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <h5 className="text-sm font-medium text-orange-800 mb-3 cursor-pointer hover:text-orange-600 transition-colors">
              {combinationName}
            </h5>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
            <ContextMenuItem
              onClick={() => {
                const graph = data.graphs?.find(g => g.type === 'elasticity');
                if (graph) {
                  stageSelectionForExhibition(graph, 'graph', combinationName);
                }
              }}
            >
              Exhibit this component
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <div className={`w-full ${isExpanded ? 'h-[350px]' : 'h-[400px]'}`}>
          <RechartsChartRenderer {...rendererProps} />
        </div>
        
        {/* Comment Section */}
        {renderCommentSection(chartId)}
      </div>
    );
  };

  // Render S-Curve Chart
  const renderSCurveChart = (combinationName: string) => {
    const chartId = `s-curve-${combinationName}`;
    
    if (isLoadingSCurveData) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200 min-w-[800px]">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">Loading S-curve data...</p>
          </div>
        </div>
      );
    }
    
    // Check if we have overall S-curve data
    if (!sCurveData || !sCurveData.success || !sCurveData.s_curves) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200 min-w-[800px]">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">No S-curve data available</p>
          </div>
        </div>
      );
    }
    
    // Find all s-curve keys that match this combination
    // Backend returns keys like "Combination_Model", we need to match by combination prefix
    const matchingKeys = Object.keys(sCurveData.s_curves).filter(key => 
      key.startsWith(combinationName + '_')
    );
    
    if (matchingKeys.length === 0) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200 min-w-[800px]">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">No S-curve data for this combination</p>
          </div>
        </div>
      );
    }
    
    // Get the first matching combination-model pair
    const firstMatchingKey = matchingKeys[0];
    const combinationSCurveData = sCurveData.s_curves[firstMatchingKey];
    
    // Check if this combination has s_curves data
    if (!combinationSCurveData || !combinationSCurveData.success || !combinationSCurveData.s_curves) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200 min-w-[800px]">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">No S-curve variables available</p>
          </div>
        </div>
      );
    }
    
    // Get the first 2 variables for display (similar to select models)
    const sCurves = combinationSCurveData.s_curves;
    const variables = Object.keys(sCurves).slice(0, 2);
    
    if (variables.length === 0) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200 min-w-[800px]">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">No S-curve variables available</p>
          </div>
        </div>
      );
    }
    
    const isExpanded = !collapsedGraphs['s-curve'];

    // Check if this combination is selected for exhibition
    const sCurveGraphDef = data.graphs?.find(g => g.type === 's-curve');
    const sCurveDescriptor = sCurveGraphDef ? createSelectionDescriptor(sCurveGraphDef, 'graph', combinationName) : null;
    const isSCurveSelected = sCurveDescriptor ? exhibitionSelections.some((entry) => entry.key === sCurveDescriptor.key) : false;
    
    return (
      <div key={chartId} className={`bg-white rounded-lg p-4 shadow-sm border-2 ${
        isSCurveSelected ? 'border-amber-400 bg-amber-50/30' : 'border-orange-100/50'
      } hover:shadow-md transition-all duration-200 min-w-[800px]`}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <h5 className="text-sm font-medium text-orange-800 mb-3 cursor-pointer hover:text-orange-600 transition-colors">
              {combinationName}
            </h5>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
            <ContextMenuItem
              onClick={() => {
                const graph = data.graphs?.find(g => g.type === 's-curve');
                if (graph) {
                  stageSelectionForExhibition(graph, 'graph', combinationName);
                }
              }}
            >
              Exhibit this component
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <div className="grid grid-cols-2 gap-6">
          {variables.map((variable, index) => {
            const curveData = sCurves[variable];
            const chartData = curveData.percent_changes.map((change: number, idx: number) => ({
              percentage: change,
              volume: curveData.total_volumes[idx] || 0
            }));
            
            // Get chart configuration for this combination and variable
            const chartKey = `${combinationName}_${variable}`;
            const chartType = sCurveChartTypes[chartKey] || 'line_chart';
            const chartTheme = sCurveChartThemes[chartKey] || 'default';
            const showGrid = sCurveChartGridToggle[chartKey] !== undefined ? sCurveChartGridToggle[chartKey] : true;
            const showLegend = sCurveChartLegendToggle[chartKey] !== undefined ? sCurveChartLegendToggle[chartKey] : false;
            const showAxisLabels = sCurveChartAxisLabelsToggle[chartKey] !== undefined ? sCurveChartAxisLabelsToggle[chartKey] : true;
            
            return (
              <div key={`${variable}-${index}`} className="border border-gray-200 rounded-lg p-4 min-w-[350px]">
                <div className="w-full h-[400px]">
                  <SCurveChartRenderer
                    data={(curveData.media_values || []).map((reach: number, idx: number) => ({
                      x: reach || 0,
                      y: curveData.total_volumes[idx] || 0,
                      percent_change: (curveData.percent_changes || [])[idx] || 0
                    }))}
                    curveAnalysis={curveData.curve_analysis}
                    xAxisLabel="Reach"
                    yAxisLabel="Volume"
                    theme={chartTheme}
                    enableScroll={false}
                    width={0}
                    height={400}
                    showDataLabels={false}
                    showLegend={showLegend}
                    showGrid={showGrid}
                    showAxisLabels={showAxisLabels}
                    showMinMaxLines={true}
                    onThemeChange={(newTheme: string) => {
                      setSCurveChartThemes(prev => ({ ...prev, [chartKey]: newTheme }));
                    }}
                    onGridToggle={(enabled: boolean) => handleSCurveChartGridToggle(chartKey, enabled)}
                    onLegendToggle={(enabled: boolean) => handleSCurveChartLegendToggle(chartKey, enabled)}
                    onAxisLabelsToggle={(enabled: boolean) => handleSCurveChartAxisLabelsToggle(chartKey, enabled)}
                  />
                </div>
                
              </div>
            );
          })}
        </div>
        
        {/* Comment Section */}
        {renderCommentSection(chartId)}
      </div>
    );
  };

  // Render Averages Chart
  const renderAveragesChart = (combinationName: string) => {
    const chartId = `averages-${combinationName}`;
    
    if (isLoadingAveragesData) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200 min-w-[600px]">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">Loading averages data...</p>
          </div>
        </div>
      );
    }
    
    const combinationData = averagesData[combinationName];
    if (!combinationData || !combinationData.averages_data || combinationData.averages_data.length === 0) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200 min-w-[600px]">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">No averages data available</p>
          </div>
        </div>
      );
    }
    
    const chartData = combinationData.averages_data.map((item: any, index: number) => ({
      name: item.name,
      value: item.value
    }));
    
    // Get chart type and theme for this combination
    const chartType = settings[`averagesChartTypes_${combinationName}`] || averagesChartTypes[combinationName] || 'bar_chart';
    const chartTheme = settings[`averagesChartThemes_${combinationName}`] || averagesChartThemes[combinationName] || 'default';
    const showDataLabels = averagesChartDataLabels[combinationName] !== undefined ? averagesChartDataLabels[combinationName] : true;
    const sortOrder = averagesChartSortOrder[combinationName] || null;
    const showGrid = averagesChartGridToggle[combinationName] !== undefined ? averagesChartGridToggle[combinationName] : true;
    const showLegend = averagesChartLegendToggle[combinationName] !== undefined ? averagesChartLegendToggle[combinationName] : (chartType === 'pie_chart');
    const showAxisLabels = averagesChartAxisLabelsToggle[combinationName] !== undefined ? averagesChartAxisLabelsToggle[combinationName] : true;
    const isExpanded = !collapsedGraphs.averages;
    
    const rendererProps = {
      key: `averages-chart-${combinationName}-${chartType}-${chartTheme}`,
      type: chartType as 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart',
      data: chartData,
      xField: 'name',
      yField: 'value',
      xKey: 'name',
      yKey: 'value',
      xAxisLabel: 'Feature',
      yAxisLabel: 'Average',
      theme: chartTheme,
      enableScroll: false,
      width: 0,
      height: isExpanded ? 350 : 400,
      showDataLabels: showDataLabels,
      showLegend: showLegend,
      showGrid: showGrid,
      showAxisLabels: showAxisLabels,
      sortOrder: sortOrder,
      onThemeChange: (newTheme: string) => handleAveragesChartThemeChange(combinationName, newTheme),
      onChartTypeChange: (newType: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart') => handleAveragesChartTypeChange(combinationName, newType),
      onDataLabelsToggle: (newShowDataLabels: boolean) => handleAveragesChartDataLabelsChange(combinationName, newShowDataLabels),
      onSortChange: (newSortOrder: 'asc' | 'desc' | null) => handleAveragesChartSortOrderChange(combinationName, newSortOrder),
      sortColumn: settings[`averagesChartSortColumn_${combinationName}`],
      onSortColumnChange: (column: string) => handleAveragesChartSortColumnChange(combinationName, column),
      seriesSettings: effectiveSettings[`averagesChartSeriesSettings_${combinationName}`] || {},
      onSeriesSettingsChange: (newSeriesSettings: Record<string, { color?: string; showDataLabels?: boolean }>) => handleAveragesChartSeriesSettingsChange(combinationName, newSeriesSettings),
      onGridToggle: (enabled: boolean) => handleAveragesChartGridToggle(combinationName, enabled),
      onLegendToggle: (enabled: boolean) => handleAveragesChartLegendToggle(combinationName, enabled),
      onAxisLabelsToggle: (enabled: boolean) => handleAveragesChartAxisLabelsToggle(combinationName, enabled)
    };

    // Check if this combination is selected for exhibition
    const averagesGraphDef = data.graphs?.find(g => g.type === 'averages');
    const averagesDescriptor = averagesGraphDef ? createSelectionDescriptor(averagesGraphDef, 'graph', combinationName) : null;
    const isAveragesSelected = averagesDescriptor ? exhibitionSelections.some((entry) => entry.key === averagesDescriptor.key) : false;
    
    return (
      <div key={chartId} className={`bg-white rounded-lg p-4 shadow-sm border-2 ${
        isAveragesSelected ? 'border-amber-400 bg-amber-50/30' : 'border-orange-100/50'
      } hover:shadow-md transition-all duration-200 ${isExpanded ? 'min-w-[500px]' : 'min-w-[600px]'}`}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <h5 className="text-sm font-medium text-orange-800 mb-3 cursor-pointer hover:text-orange-600 transition-colors">
              {combinationName}
            </h5>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
            <ContextMenuItem
              onClick={() => {
                const graph = data.graphs?.find(g => g.type === 'averages');
                if (graph) {
                  stageSelectionForExhibition(graph, 'graph', combinationName);
                }
              }}
            >
              Exhibit this component
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <div className={`w-full ${isExpanded ? 'h-[350px]' : 'h-[400px]'}`}>
          <RechartsChartRenderer {...rendererProps} />
        </div>
        
        {/* Comment Section */}
        {renderCommentSection(chartId)}
      </div>
    );
  };

  // Cardinality view functions
  const fetchCardinalityData = async () => {
    if (!data.selectedDataframe) return;
    
    setCardinalityLoading(true);
    setCardinalityError(null);
    
    try {
      // Extract the object name by removing the prefix (default_client/default_app/default_project/)
      // The groupby endpoint will add the prefix back, so we need to pass the path without the prefix
      let objectName = data.selectedDataframe;
      if (data.selectedDataframe.includes('/')) {
        const parts = data.selectedDataframe.split('/');
        // Remove the first 3 parts (default_client/default_app/default_project)
        if (parts.length > 3) {
          objectName = parts.slice(3).join('/');
        } else {
          // If less than 3 parts, just use the last part
          objectName = parts[parts.length - 1];
        }
      }
      
      // Use GROUPBY_API cardinality endpoint instead of FEATURE_OVERVIEW_API
      const url = `${GROUPBY_API}/cardinality?object_name=${encodeURIComponent(objectName)}`;
      const res = await fetch(url);
      const data_result = await res.json();
      
      if (data_result.status === 'SUCCESS' && data_result.cardinality) {
        setCardinalityData(data_result.cardinality);
      } else {
        setCardinalityError(data_result.error || 'Failed to fetch cardinality data');
      }
    } catch (e: any) {
      setCardinalityError(e.message || 'Error fetching cardinality data');
    } finally {
      setCardinalityLoading(false);
    }
  };

  const displayedCardinality = useMemo(() => {
    console.log('🔍 displayedCardinality recalculating:', { cardinalityData: cardinalityData.length, columnFilters, sortColumn, sortDirection });
    let filtered = cardinalityData.filter(c => c.unique_count > 0);

    // Apply column filters
    Object.entries(columnFilters).forEach(([column, filterValues]) => {
      if (Array.isArray(filterValues) && filterValues.length > 0) {
        console.log('🔍 Applying filter:', { column, filterValues });
        filtered = filtered.filter(row => {
          const cellValue = String(row[column] || '');
          return filterValues.includes(cellValue);
        });
      }
    });

    // Apply sorting
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];
        if (aVal === bVal) return 0;
        let comparison = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }
        return sortDirection === 'desc' ? -comparison : comparison;
      });
    }

    console.log('🔍 displayedCardinality result:', { originalCount: cardinalityData.length, filteredCount: filtered.length, filtered });
    return filtered;
  }, [cardinalityData, columnFilters, sortColumn, sortDirection]);

  const getUniqueColumnValues = (column: string): string[] => {
    if (!cardinalityData.length) return [];

    // Apply other active filters to get hierarchical filtering
    const otherFilters = Object.entries(columnFilters).filter(([key]) => key !== column);
    let dataToUse = cardinalityData;

    if (otherFilters.length > 0) {
      dataToUse = cardinalityData.filter(item => {
        return otherFilters.every(([filterColumn, filterValues]) => {
          if (!Array.isArray(filterValues) || filterValues.length === 0) return true;
          const cellValue = String(item[filterColumn] || '');
          return filterValues.includes(cellValue);
        });
      });
    }

    const values = dataToUse.map(item => String(item[column] || ''));
    const uniqueValues = Array.from(new Set(values));
    return uniqueValues.sort() as string[];
  };

  const handleSort = (column: string, direction?: 'asc' | 'desc') => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        onDataChange({ sortDirection: 'desc' });
      } else if (sortDirection === 'desc') {
        onDataChange({ 
          sortColumn: '',
          sortDirection: 'asc'
        });
      }
    } else {
      onDataChange({
        sortColumn: column,
        sortDirection: direction || 'asc'
      });
    }
  };

  const handleColumnFilter = (column: string, values: string[]) => {
    console.log('🔍 handleColumnFilter called:', { column, values, currentFilters: columnFilters });
    onDataChange({
      columnFilters: {
        ...columnFilters,
        [column]: values
      }
    });
  };

  const clearColumnFilter = (column: string) => {
    const newFilters = { ...columnFilters };
    delete newFilters[column];
    onDataChange({ columnFilters: newFilters });
  };

  const FilterMenu = ({ column }: { column: string }) => {
    const uniqueValues = getUniqueColumnValues(column);
    const current = columnFilters[column] || [];
    const [temp, setTemp] = useState<string[]>(current);

    // Sync temp state with global state when it changes
    useEffect(() => {
      setTemp(current);
    }, [current]);

    const toggleVal = (val: string) => {
      setTemp(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));
    };

    const selectAll = () => {
      setTemp(temp.length === uniqueValues.length ? [] : uniqueValues);
    };

    const apply = () => handleColumnFilter(column, temp);

    return (
      <div className="w-64 max-h-80 overflow-y-auto">
        <div className="p-2 border-b">
          <div className="flex items-center space-x-2 mb-2">
            <Checkbox checked={temp.length === uniqueValues.length} onCheckedChange={selectAll} />
            <span className="text-sm font-medium">Select All</span>
          </div>
        </div>
        <div className="p-2 space-y-1">
          {uniqueValues.map((v, i) => (
            <div key={i} className="flex items-center space-x-2">
              <Checkbox checked={temp.includes(v)} onCheckedChange={() => toggleVal(v)} />
              <span className="text-sm">{v}</span>
            </div>
          ))}
        </div>
        <div className="p-2 border-t flex space-x-2">
          <Button size="sm" onClick={apply}>Apply</Button>
          <Button size="sm" variant="outline" onClick={() => setTemp(current)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  // Fetch cardinality data when dataset changes
  useEffect(() => {
    if (data.selectedDataframe) {
      fetchCardinalityData();
    }
  }, [data.selectedDataframe]);

  // Show placeholder when no dataframe is selected
  if (!data.selectedDataframe) {
    return (
      <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 via-orange-50/30 to-orange-50/50 overflow-y-auto relative">
        <div className="absolute inset-0 opacity-20">
          <svg width="80" height="80" viewBox="0 0 80 80" className="absolute inset-0 w-full h-full">
            <defs>
              <pattern id="emptyGrid" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgb(148 163 184 / 0.15)" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#emptyGrid)" />
          </svg>
        </div>

        <div className="relative z-10 flex items-center justify-center h-full">
          <div className="text-center max-w-md">
            <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-300">
              <BarChart3 className="w-12 h-12 text-white drop-shadow-lg" />
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-orange-500 to-orange-600 bg-clip-text text-transparent">
              Evaluate Models Operation
            </h3>
            <p className="text-gray-600 mb-6 text-lg font-medium leading-relaxed">
              Select a dataframe from the properties panel to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Inject custom scrollbar styles */}
      <style>{customScrollbarStyles}</style>


      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">

        {/* Cardinality View */}
        <div className="mb-6">
          <Table
            headers={[
              <ContextMenu key="Column">
                <ContextMenuTrigger asChild>
                  <div className="flex items-center gap-1 cursor-pointer">
                    Column
                    {sortColumn === 'column' && (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="flex items-center">
                      <ArrowUp className="w-4 h-4 mr-2" /> Sort
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                      <ContextMenuItem onClick={() => handleSort('column', 'asc')}>
                        <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => handleSort('column', 'desc')}>
                        <ArrowDown className="w-4 h-4 mr-2" /> Descending
                      </ContextMenuItem>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuSeparator />
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="flex items-center">
                      <FilterIcon className="w-4 h-4 mr-2" /> Filter
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-0">
                      <FilterMenu column="column" />
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  {columnFilters['column']?.length > 0 && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => clearColumnFilter('column')}>
                        Clear Filter
                      </ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>,
              <ContextMenu key="Data type">
                <ContextMenuTrigger asChild>
                  <div className="flex items-center gap-1 cursor-pointer">
                    Data type
                    {sortColumn === 'data_type' && (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="flex items-center">
                      <ArrowUp className="w-4 h-4 mr-2" /> Sort
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                      <ContextMenuItem onClick={() => handleSort('data_type', 'asc')}>
                        <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => handleSort('data_type', 'desc')}>
                        <ArrowDown className="w-4 h-4 mr-2" /> Descending
                      </ContextMenuItem>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuSeparator />
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="flex items-center">
                      <FilterIcon className="w-4 h-4 mr-2" /> Filter
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-0">
                      <FilterMenu column="data_type" />
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  {columnFilters['data_type']?.length > 0 && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => clearColumnFilter('data_type')}>
                        Clear Filter
                      </ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>,
              <ContextMenu key="Unique count">
                <ContextMenuTrigger asChild>
                  <div className="flex items-center gap-1 cursor-pointer">
                    Unique count
                    {sortColumn === 'unique_count' && (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="flex items-center">
                      <ArrowUp className="w-4 h-4 mr-2" /> Sort
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                      <ContextMenuItem onClick={() => handleSort('unique_count', 'asc')}>
                        <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => handleSort('unique_count', 'desc')}>
                        <ArrowDown className="w-4 h-4 mr-2" /> Descending
                      </ContextMenuItem>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuSeparator />
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="flex items-center">
                      <FilterIcon className="w-4 h-4 mr-2" /> Filter
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-0">
                      <FilterMenu column="unique_count" />
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  {columnFilters['unique_count']?.length > 0 && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => clearColumnFilter('unique_count')}>
                        Clear Filter
                      </ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>,
              "Sample values"
            ]}
            colClasses={["w-[25%]", "w-[20%]", "w-[20%]", "w-[35%]"]}
            bodyClassName="max-h-80 overflow-y-auto"
            borderColor={`border-${evaluateModelsFeature.color.replace('bg-', '')}`}
            customHeader={{
              title: "Cardinality View",
              subtitle: "Click Here to View Data",
              subtitleClickable: !!inputFileName && !!atomId,
              onSubtitleClick: handleViewDataClick
            }}
            defaultMinimized={true}
          >
            {cardinalityLoading ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-500">
                  Loading cardinality data...
                </td>
              </tr>
            ) : cardinalityError ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-red-500">
                  Error loading cardinality data: {cardinalityError}
                </td>
              </tr>
            ) : displayedCardinality.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-500">
                  No cardinality data available
                </td>
              </tr>
            ) : (
              displayedCardinality.map((row, index) => (
                <tr key={index} className="table-row">
                  <td className="table-cell-primary">{row.column}</td>
                  <td className="table-cell">{row.data_type}</td>
                  <td className="table-cell">{row.unique_count.toLocaleString()}</td>
                  <td className="table-cell">
                    <div className="flex flex-wrap items-center gap-1">
                      {Array.isArray(row.unique_values) && row.unique_values.length > 0 ? (
                        <>
                          {row.unique_values.slice(0, 2).map((val: any, i: number) => (
                            <span
                              key={i}
                              className="inline-block bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs mr-1 mb-1"
                            >
                              {String(val)}
                            </span>
                          ))}
                          {row.unique_values.length > 2 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex items-center gap-0.5 text-xs text-slate-600 font-medium cursor-pointer">
                                  <Plus className="w-3 h-3" />
                                  {row.unique_values.length - 2}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs max-w-xs whitespace-pre-wrap">
                                {row.unique_values
                                  .slice(2)
                                  .map((val: any) => String(val))
                                  .join(', ')}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </Table>
        </div>

        {/* Identifiers Display */}
        <Card className="mb-6">
          <div className="py-2 px-4 border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary" />
                Identifiers
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setScopeSectionExpanded(!scopeSectionExpanded)}
                className="h-6 w-6 p-0"
              >
                {scopeSectionExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
          {scopeSectionExpanded && (
            <div className="p-4">
              {isLoadingIdentifiers ? (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">Loading identifiers...</p>
                </div>
              ) : Object.keys(identifiersData).length > 0 ? (
                <div className="flex flex-wrap gap-4 items-start">
                  {Object.entries(identifiersData).map(([identifierName, identifierInfo]) => {
                    const info = identifierInfo as IdentifierInfo;
                    const selectedValues = selectedIdentifierValues[identifierName] || [];
                    
                    return (
                      <div key={identifierName} className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-medium text-foreground mb-2">
                          {identifierName}
                          {info.column_name && (
                            <span className="text-xs text-muted-foreground ml-2">
                              {/* (Column: {info.column_name}) */}
                            </span>
                          )}
                        </label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button 
                              variant="outline" 
                              className="w-full justify-between border-orange-200 focus:border-orange-400"
                              disabled={!info.unique_values || info.unique_values.length === 0}
                            >
                              <span>
                                {selectedValues.length > 0
                                  ? `${selectedValues.length} value${selectedValues.length > 1 ? 's' : ''} selected`
                                  : "Select values"
                                }
                              </span>
                              <ChevronDown className="w-4 h-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="bg-white border-gray-200 max-h-60 overflow-y-auto w-56 p-2" onPointerDownOutside={(e) => e.preventDefault()}>
                            {info.unique_values && info.unique_values.length > 0 ? (
                              <>
                                <div className="flex items-center gap-2 py-1">
                                  <Checkbox
                                    checked={selectedValues.length === info.unique_values.length}
                                    onCheckedChange={(checked) => {
                                      console.log('🔍 Select All toggled:', { identifierName, checked, uniqueValues: info.unique_values });
                                      if (checked) {
                                        // Select all
                                        const newSelectedValues = [...info.unique_values];
                                        const updatedAllValues = {
                                          ...selectedIdentifierValues,
                                          [identifierName]: newSelectedValues
                                        };
                                        
                                        setSelectedIdentifierValues(updatedAllValues);
                                        
                                        // Update main data
                                        onDataChange({ selectedIdentifierValues: updatedAllValues });
                                        
                                        console.log('🔍 Selected all values for', identifierName, ':', updatedAllValues);
                                      } else {
                                        // Deselect all
                                        const newSelectedValues: string[] = [];
                                        const updatedAllValues = {
                                          ...selectedIdentifierValues,
                                          [identifierName]: newSelectedValues
                                        };
                                        
                                        setSelectedIdentifierValues(updatedAllValues);
                                        
                                        // Update main data
                                        onDataChange({ selectedIdentifierValues: updatedAllValues });
                                        
                                        console.log('🔍 Deselected all values for', identifierName, ':', updatedAllValues);
                                      }
                                    }}
                                  />
                                  <span className="text-sm font-medium">Select All</span>
                                </div>
                                {info.unique_values.map((value, index) => {
                                  const isChecked = selectedValues.includes(value);
                                  return (
                                    <div key={index} className="flex items-center gap-2 py-1">
                                      <Checkbox
                                        checked={isChecked}
                                        onCheckedChange={(checked) => toggleIdentifierValue(identifierName, value, !!checked)}
                                      />
                                      <span className="text-sm">{value}</span>
                                    </div>
                                  );
                                })}
                              </>
                            ) : (
                              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                No values found
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">
                    {data.selectedDataframe && selectedCombinations.length > 0 
                      ? "No identifiers found for the selected file and combinations"
                      : "Select a file and combinations to view identifiers"
                    }
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Instructional text for exhibition */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">Right-click a combination name to stage it for exhibition.</p>
        </div>

        {/* Waterfall Charts Section */}
        {selectedGraphs.some(g => g.type === 'waterfall') && data.selectedDataframe && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Waterfall chart</h3>
              <div className="flex items-center gap-2">
                <Dialog open={waterfallDialogOpen} onOpenChange={(open) => handleDialogClose('waterfall', setWaterfallDialogOpen, open)}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label="Expand waterfall charts"
                    onClick={() => handleExpanderClick('waterfall', setWaterfallDialogOpen)}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                  <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
                    <div className="space-y-6">
                      <h2 className="text-xl font-semibold">Waterfall Charts - Expanded View</h2>
                      <div className="grid grid-cols-2 gap-6">
                        {filteredCombinations.map(combination => 
                          <div key={combination} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                            {renderWaterfallChart(combination)}
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => toggleGraphCollapse('waterfall')}
                >
                  {collapsedGraphs.waterfall ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            {!collapsedGraphs.waterfall && (
              <div className="flex gap-4 overflow-x-auto pb-4 min-h-0 custom-scrollbar-orange">
                {filteredCombinations.map(combination => 
                  renderWaterfallChart(combination)
                )}
              </div>
            )}
          </div>
        )}

        {/* Contribution Charts Section */}
        {selectedGraphs.some(g => g.type === 'contribution') && data.selectedDataframe && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Contribution Chart</h3>
              <div className="flex items-center gap-2">
                <Dialog open={contributionDialogOpen} onOpenChange={(open) => handleDialogClose('contribution', setContributionDialogOpen, open)}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label="Expand contribution charts"
                    onClick={() => handleExpanderClick('contribution', setContributionDialogOpen)}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                  <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
                    <div className="space-y-6">
                      <h2 className="text-xl font-semibold">Contribution Charts - Expanded View</h2>
                      <div className="grid grid-cols-2 gap-6">
                        {filteredCombinations.map(combination => 
                          <div key={combination} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                            {renderContributionChart(combination)}
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => toggleGraphCollapse('contribution')}
                >
                  {collapsedGraphs.contribution ? (
                    <ChevronDown className="h-4 w-4" />
                ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            {!collapsedGraphs.contribution && (
              <div className="flex gap-4 overflow-x-auto pb-4 min-h-0 custom-scrollbar-orange">
                {filteredCombinations.map(combination => 
                  renderContributionChart(combination)
                )}
              </div>
            )}
          </div>
        )}

        {/* ROI Charts Section */}
        {selectedGraphs.some(g => g.type === 'roi') && data.selectedDataframe && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">ROI Chart</h3>
              <div className="flex items-center gap-2">
                <Dialog open={roiDialogOpen} onOpenChange={(open) => handleDialogClose('roi', setRoiDialogOpen, open)}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label="Expand ROI charts"
                    onClick={() => handleExpanderClick('roi', setRoiDialogOpen)}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                  <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
                    <div className="space-y-6">
                      <h2 className="text-xl font-semibold">ROI Charts - Expanded View</h2>
                      <div className="grid grid-cols-2 gap-6">
                        {filteredCombinations.map(combination => 
                          <div key={combination} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                            {renderROIChart(combination)}
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => toggleGraphCollapse('roi')}
                >
                  {collapsedGraphs.roi ? (
                    <ChevronDown className="h-4 w-4" />
                ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            {!collapsedGraphs.roi && (
              <div className="flex gap-4 overflow-x-auto pb-4 min-h-0 custom-scrollbar-purple">
                {filteredCombinations.map(combination => 
                  renderROIChart(combination)
                )}
              </div>
            )}
          </div>
        )}

        {/* Actual vs Predicted Charts Section */}
        {selectedGraphs.some(g => g.type === 'actual-vs-predicted') && data.selectedDataframe && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Actual vs Predicted</h3>
              <div className="flex items-center gap-2">
                <Dialog open={actualVsPredictedDialogOpen} onOpenChange={(open) => handleDialogClose('actual-vs-predicted', setActualVsPredictedDialogOpen, open)}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label="Expand actual vs predicted charts"
                    onClick={() => handleExpanderClick('actual-vs-predicted', setActualVsPredictedDialogOpen)}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                  <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
                    <div className="space-y-6">
                      <h2 className="text-xl font-semibold">Actual vs Predicted Charts - Expanded View</h2>
                      <div className="grid grid-cols-2 gap-6">
                        {filteredCombinations.map(combination => 
                          <div key={combination} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                            {renderActualVsPredictedChart(combination)}
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => toggleGraphCollapse('actual-vs-predicted')}
                >
                  {collapsedGraphs['actual-vs-predicted'] ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            {!collapsedGraphs['actual-vs-predicted'] && (
              <div className="flex gap-4 overflow-x-auto pb-4 min-h-0 custom-scrollbar-orange">
                {filteredCombinations.map(combination => 
                  renderActualVsPredictedChart(combination)
                )}
              </div>
            )}
          </div>
        )}

        {/* Beta Charts Section */}
        {selectedGraphs.some(g => g.type === 'beta') && data.selectedDataframe && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Beta Coefficients</h3>
              <div className="flex items-center gap-2">
                <Dialog open={betaDialogOpen} onOpenChange={(open) => handleDialogClose('beta', setBetaDialogOpen, open)}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label="Expand beta charts"
                    onClick={() => handleExpanderClick('beta', setBetaDialogOpen)}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                  <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
                    <div className="space-y-6">
                      <h2 className="text-xl font-semibold">Beta Charts - Expanded View</h2>
                      <div className="grid grid-cols-2 gap-6">
                        {filteredCombinations.map(combination => 
                          <div key={combination} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                            {renderBetaChart(combination)}
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => toggleGraphCollapse('beta')}
                >
                  {collapsedGraphs.beta ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            {!collapsedGraphs.beta && (
              <div className="flex gap-4 overflow-x-auto pb-4 min-h-0 custom-scrollbar-orange">
                {filteredCombinations.map(combination => 
                  renderBetaChart(combination)
                )}
              </div>
            )}
          </div>
        )}

        {/* Elasticity Charts Section */}
        {selectedGraphs.some(g => g.type === 'elasticity') && data.selectedDataframe && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Elasticity</h3>
              <div className="flex items-center gap-2">
                <Dialog open={elasticityDialogOpen} onOpenChange={(open) => handleDialogClose('elasticity', setElasticityDialogOpen, open)}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label="Expand elasticity charts"
                    onClick={() => handleExpanderClick('elasticity', setElasticityDialogOpen)}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                  <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
                    <div className="space-y-6">
                      <h2 className="text-xl font-semibold">Elasticity Charts - Expanded View</h2>
                      <div className="grid grid-cols-2 gap-6">
                        {filteredCombinations.map(combination => 
                          <div key={combination} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                            {renderElasticityChart(combination)}
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => toggleGraphCollapse('elasticity')}
                >
                  {collapsedGraphs.elasticity ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            {!collapsedGraphs.elasticity && (
              <div className="flex gap-4 overflow-x-auto pb-4 min-h-0 custom-scrollbar-orange">
                {filteredCombinations.map(combination => 
                  renderElasticityChart(combination)
                )}
              </div>
            )}
          </div>
        )}

        {/* Averages Charts Section */}
        {selectedGraphs.some(g => g.type === 'averages') && data.selectedDataframe && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Averages</h3>
              <div className="flex items-center gap-2">
                <Dialog open={averagesDialogOpen} onOpenChange={(open) => handleDialogClose('averages', setAveragesDialogOpen, open)}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label="Expand averages charts"
                    onClick={() => handleExpanderClick('averages', setAveragesDialogOpen)}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                  <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
                    <div className="space-y-6">
                      <h2 className="text-xl font-semibold">Averages Charts - Expanded View</h2>
                      <div className="grid grid-cols-2 gap-6">
                        {filteredCombinations.map(combination => 
                          <div key={combination} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                            {renderAveragesChart(combination)}
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => toggleGraphCollapse('averages')}
                >
                  {collapsedGraphs.averages ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            {!collapsedGraphs.averages && (
              <div className="flex gap-4 overflow-x-auto pb-4 min-h-0 custom-scrollbar-orange">
                {filteredCombinations.map(combination => 
                  renderAveragesChart(combination)
                )}
              </div>
            )}
          </div>
        )}

        {/* S-Curve Charts Section - Only for MMM applications */}
        {applicationType === 'mmm' && selectedGraphs.some(g => g.type === 's-curve') && data.selectedDataframe && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">S-Curve Analysis</h3>
              <div className="flex items-center gap-2">
                <Dialog open={sCurveDialogOpen} onOpenChange={(open) => handleDialogClose('s-curve', setSCurveDialogOpen, open)}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label="Expand S-curve charts"
                    onClick={() => handleExpanderClick('s-curve', setSCurveDialogOpen)}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                  <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
                    <div className="space-y-6">
                      <h2 className="text-xl font-semibold">S-Curve Charts - Expanded View</h2>
                      <div className="flex flex-col gap-6">
                        {filteredCombinations.map(combination => 
                          <div key={combination} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                            {renderSCurveChart(combination)}
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => toggleGraphCollapse('s-curve')}
                >
                  {collapsedGraphs['s-curve'] ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            {!collapsedGraphs['s-curve'] && (
              <div className="flex gap-4 overflow-x-auto pb-4 min-h-0 custom-scrollbar">
                {filteredCombinations.map(combination => 
                  renderSCurveChart(combination)
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EvaluateModelsFeatureCanvas;


