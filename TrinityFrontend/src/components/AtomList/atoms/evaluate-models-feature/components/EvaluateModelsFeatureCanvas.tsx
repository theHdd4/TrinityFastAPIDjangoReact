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
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip as RechartsTooltip, ScatterChart, Scatter } from 'recharts';
import { Maximize2, X, MessageSquare, Send, Edit3, Trash2, Filter, ChevronDown, ChevronRight, ChevronUp, ArrowUp, ArrowDown, Filter as FilterIcon, Plus } from 'lucide-react';
import { EvaluateModelsFeatureData, EvaluateModelsFeatureSettings } from '../EvaluateModelsFeatureAtom';
import { EVALUATE_API, FEATURE_OVERVIEW_API } from '@/lib/api';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
  settings: EvaluateModelsFeatureSettings;
  onDataChange: (data: Partial<EvaluateModelsFeatureData>) => void;
  onSettingsChange: (settings: Partial<EvaluateModelsFeatureSettings>) => void;
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
  // Get input file name for clickable subtitle
  const inputFileName = data.selectedDataframe || '';

  // Handle opening the input file in a new tab
  const handleViewDataClick = () => {
    if (inputFileName && atomId) {
      window.open(`/dataframe?name=${encodeURIComponent(inputFileName)}`, '_blank');
    }
  };

  // Comment state management
  const [comments, setComments] = useState<Record<string, Array<{id: string, text: string, timestamp: string}>>>({});
  const [newComments, setNewComments] = useState<Record<string, string>>({});
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
        setComments(prev => ({
          ...prev,
          [chartId]: [...(prev[chartId] || []), newCommentObj]
        }));
        setNewComments(prev => ({ ...prev, [chartId]: '' }));
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
    const chartComments = comments[chartId] || [];
    const newComment = newComments[chartId] || '';
    const isSavingChart = isSaving[chartId] || false;

    return (
      <div className="mt-4 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">

        
        {/* Display existing comments */}
        <div className="space-y-3 mb-4 max-h-48 overflow-y-auto custom-scrollbar-orange">
          {chartComments.map((comment) => (
            <div key={comment.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span className="text-gray-400 text-xs font-medium">{new Date(comment.timestamp).toLocaleString()}</span>
                </div>
                <button
                  onClick={() => deleteComment(chartId, comment.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors duration-200 p-1 hover:bg-red-50 rounded"
                  title="Delete comment"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <p className="text-gray-700 text-sm leading-relaxed">{comment.text}</p>
            </div>
          ))}
        </div>
        
        {/* Add new comment */}
        <div className="flex gap-3">
          <textarea
            value={newComment}
            onChange={(e) => setNewComments(prev => ({ ...prev, [chartId]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (newComment.trim() && !isSavingChart) {
                  saveComment(chartId);
                }
              }
            }}
            placeholder="Add your notes or comments here... (Press Enter to save)"
            rows={3}
            className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none transition-all duration-200"
          />
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
  const [averagesData, setAveragesData] = useState<{[key: string]: any}>({});
  const [isLoadingAveragesData, setIsLoadingAveragesData] = useState(false);
  
  // Cardinality view state
  const [cardinalityData, setCardinalityData] = useState<any[]>([]);
  const [cardinalityLoading, setCardinalityLoading] = useState(false);
  const [cardinalityError, setCardinalityError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [columnFilters, setColumnFilters] = useState<{ [key: string]: string[] }>({});
  
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
    averages: true
  });
  const [selectedIdentifierValues, setSelectedIdentifierValues] = useState<{[key: string]: string[]}>({});
  
  useEffect(() => {
    const fetchScope = async () => {
      if (data.selectedDataframe) {
        try {
          const response = await fetch(`${EVALUATE_API}/get-scope?object_name=${encodeURIComponent(data.selectedDataframe)}`);
          if (response.ok) {
            const data = await response.json();
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
            const result = await response.json();
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
                const result = await response.json();
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
              const result = await response.json();
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
              const result = await response.json();
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
              const result = await response.json();
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
            const result = await response.json();
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
            const result = await response.json();
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

  // Initialize selected identifier values with "Select All" when identifiers data changes
  useEffect(() => {
    if (Object.keys(identifiersData).length > 0) {
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
    }, [identifiersData]);



  // Handle identifier value selection (multi-select)
  const toggleIdentifierValue = (identifierName: string, value: string, checked: boolean) => {
    const currentSelectedValues = selectedIdentifierValues[identifierName] || [];
    
    if (checked) {
      // Add value if not already selected
      if (!currentSelectedValues.includes(value)) {
        const newSelectedValues = [...currentSelectedValues, value];
        setSelectedIdentifierValues(prev => ({
          ...prev,
          [identifierName]: newSelectedValues
        }));
        
        // Update main data so settings component can access it
        onDataChange({ 
          selectedIdentifierValues: {
            ...data.selectedIdentifierValues,
            [identifierName]: newSelectedValues
          }
        });
      }
    } else {
      // Remove value if selected
      const newSelectedValues = currentSelectedValues.filter(v => v !== value);
      setSelectedIdentifierValues(prev => ({
        ...prev,
        [identifierName]: newSelectedValues
      }));
      
      // Update main data so settings component can access it
      onDataChange({ 
        selectedIdentifierValues: {
          ...data.selectedIdentifierValues,
          [identifierName]: newSelectedValues
        }
      });
    }
  };

  const toggleGraphCollapse = (graphType: string) => {
    setCollapsedGraphs(prev => ({
      ...prev,
      [graphType]: !prev[graphType]
    }));
  };

  // Ensure graphs data is available with defaults
  const defaultGraphs = [
    { id: '1', name: 'Waterfall Chart', type: 'waterfall', selected: true },
    { id: '2', name: 'Contribution Chart', type: 'contribution', selected: true },
    { id: '3', name: 'Actual vs Predicted', type: 'actual-vs-predicted', selected: true },
    { id: '4', name: 'Elasticity', type: 'elasticity', selected: true },
    { id: '5', name: 'Beta', type: 'beta', selected: true },
    { id: '6', name: 'Averages', type: 'averages', selected: true },
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
  
  // Use all selected combinations since we removed the filter dropdown
  const filteredCombinations = selectedCombinations;

  const addComment = (chartId: string) => {
    const commentText = newComments[chartId]?.trim();
    if (!commentText) return;

    const comment: Comment = {
      id: `comment_${Date.now()}`,
      text: commentText,
      timestamp: new Date().toLocaleString()
    };

    setComments(prev => ({
      ...prev,
      [chartId]: [...(prev[chartId] || []), comment]
    }));

          setNewComments(prev => ({ ...prev, [chartId]: "" }));
  };

  const deleteComment = (chartId: string, commentId: string) => {
    setComments(prev => ({
      ...prev,
      [chartId]: prev[chartId]?.filter(comment => comment.id !== commentId) || []
    }));
  };



  const renderWaterfallChart = (combinationName: string) => {
    const chartId = `waterfall-${combinationName}`;
    
    // Find YoY data for this specific combination
    const yoyData = yoyGrowthData.find(item => item.combination_id === combinationName);
    
    console.log('🔍 DEBUG: YoY data for', combinationName, ':', yoyData);
    
    if (isLoadingYoyData) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">Loading YoY data...</p>
          </div>
        </div>
      );
    }
    
    if (!yoyData) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
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
    
    return (
      <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
        <h5 className="text-sm font-medium text-orange-800 mb-3">
          {combinationName} 
        </h5>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={chartData}>
            <Bar 
              dataKey="value" 
              fill={getColor(2)}
              radius={4} 
            />
            <XAxis dataKey="name" fontSize={10} />
            <YAxis fontSize={10} />
            <RechartsTooltip 
              formatter={(value: any) => [value.toFixed(2), 'Value']}
              labelFormatter={(label) => `Period: ${label}`}
            />
          </BarChart>
        </ResponsiveContainer>
        
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
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">Loading contribution data...</p>
          </div>
        </div>
      );
    }
    
    if (!combinationContributionData || combinationContributionData.length === 0) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">No contribution data available</p>
          </div>
        </div>
      );
    }
    
    // Transform contribution data for the pie chart
    const contributionChartData = combinationContributionData.map((contribution, index) => ({
      name: contribution.name,
      value: Math.abs(contribution.value),
      color: `hsl(${(index * 60) % 360}, 70%, 50%)`
    }));
    
    return (
      <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
        <h5 className="text-sm font-medium text-orange-800 mb-3">
          {combinationName} 
        </h5>
        <ResponsiveContainer width="100%" height={150}>
          <PieChart>
            <Pie
              data={contributionChartData}
              cx="50%"
              cy="50%"
              innerRadius={30}
              outerRadius={70}
              paddingAngle={2}
              dataKey="value"
            >
              {contributionChartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <RechartsTooltip 
              formatter={(value: any, name: any) => [value.toFixed(2), name]}
              labelFormatter={(label) => `Variable: ${label}`}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-2 space-y-1 max-h-20 overflow-y-auto">
          {contributionChartData.map((item, i) => (
            <div key={i} className="text-xs flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: item.color }}
              ></div>
              <span className="text-orange-600">
                {item.name}: {item.value.toFixed(2)}
              </span>
            </div>
          ))}
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
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">Loading actual vs predicted data...</p>
          </div>
        </div>
      );
    }
    
    if (!combinationData || !combinationData.actual_values || !combinationData.predicted_values) {
      return (
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
          <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
          <div className="h-[150px] flex items-center justify-center">
            <p className="text-xs text-orange-600 text-center">No actual vs predicted data available</p>
          </div>
        </div>
      );
    }
    
    // Transform data for scatter chart and sort by actual values (low to high) - same as select atom
    const chartData = combinationData.actual_values.map((actual: number, index: number) => ({
      actual: actual,
      predicted: combinationData.predicted_values[index] || 0
    })).sort((a, b) => a.actual - b.actual); // Sort by actual values (low to high)
    
    console.log('🔍 DEBUG: Actual vs Predicted chart data:', chartData);
    
    // Calculate dynamic domain ranges with padding - same as select atom
    const actualMin = Math.min(...chartData.map(d => d.actual));
    const actualMax = Math.max(...chartData.map(d => d.actual));
    const predictedMin = Math.min(...chartData.map(d => d.predicted));
    const predictedMax = Math.max(...chartData.map(d => d.predicted));
    
    // Add 10% padding to the ranges for better visualization
    const actualPadding = (actualMax - actualMin) * 0.1;
    const predictedPadding = (predictedMax - predictedMin) * 0.1;
    
    const xDomain = [Math.max(0, actualMin - actualPadding), actualMax + actualPadding];
    const yDomain = [Math.max(0, predictedMin - predictedPadding), predictedMax + predictedPadding];
    
    console.log('🔍 DEBUG: Dynamic axis domains - X:', xDomain, 'Y:', yDomain);
    
    return (
      <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
        <h5 className="text-sm font-medium text-orange-800 mb-3">
          {combinationName} 
        </h5>
        <ResponsiveContainer width="100%" height={150}>
          <ScatterChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="actual" 
              name="Actual" 
              fontSize={10}
              label={{ value: 'Actual', position: 'insideBottom', offset: -5 }}
              domain={xDomain}
              tickFormatter={(value) => Math.round(value).toString()}
            />
            <YAxis 
              dataKey="predicted" 
              name="Predicted" 
              fontSize={10}
              label={{ value: 'Predicted', position: 'insideLeft', angle: -90, offset: 0 }}
              domain={yDomain}
              tickFormatter={(value) => Math.round(value).toString()}
            />
            <RechartsTooltip 
              formatter={(value: any, name: any) => [value.toFixed(2), name]}
              labelFormatter={(label) => `Data Point`}
            />
            <Scatter 
              dataKey="predicted" 
              fill={getColor(0)}
              name="Predicted vs Actual"
            />
          </ScatterChart>
        </ResponsiveContainer>
        <div className="mt-2 space-y-1">
          <div className="text-xs text-orange-600">
            Model: {combinationData.model_name || 'Unknown'}
          </div>
          {/* <div className="text-xs text-orange-600">
            Data Points: {chartData.length}
          </div>
          {combinationData.performance_metrics && (
            <div className="text-xs text-orange-600">
              R²: {combinationData.performance_metrics.r2?.toFixed(3) || 'N/A'}
            </div>
          )} */}
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
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
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
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
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
    
    return (
      <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
        <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={10} />
            <YAxis fontSize={10} />
            <RechartsTooltip formatter={(value: any) => [value.toFixed(4), 'Beta']} />
            <Bar dataKey="value" fill={getColor(0)} />
          </BarChart>
        </ResponsiveContainer>
        
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
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
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
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
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
    
    return (
      <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
        <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={10} />
            <YAxis fontSize={10} />
            <RechartsTooltip formatter={(value: any) => [value.toFixed(4), 'Elasticity']} />
            <Bar dataKey="value" fill={getColor(1)} />
          </BarChart>
        </ResponsiveContainer>
        
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
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
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
        <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
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
    
    return (
      <div key={chartId} className="bg-white rounded-lg p-4 shadow-sm border border-orange-100/50 hover:shadow-md transition-all duration-200">
        <h5 className="text-sm font-medium text-orange-800 mb-3">{combinationName}</h5>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={10} />
            <YAxis fontSize={10} />
            <RechartsTooltip formatter={(value: any) => [value.toFixed(2), 'Average']} />
            <Bar dataKey="value" fill="#8B5CF6" />
          </BarChart>
        </ResponsiveContainer>
        
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
      // Add .arrow extension if not present, like other atoms do
      const objectName = data.selectedDataframe.endsWith('.arrow') ? data.selectedDataframe : `${data.selectedDataframe}.arrow`;
      const res = await fetch(
        `${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(objectName)}`
      );
      
      if (!res.ok) {
        setCardinalityError('Failed to fetch cardinality data');
        return;
      }
      
      const response = await res.json();
      const summary = Array.isArray(response.summary) ? response.summary.filter(Boolean) : [];
      
      // Transform the data to match the expected format
      const cardinalityData = summary.map((col: any) => ({
        column: col.column,
        data_type: col.data_type,
        unique_count: col.unique_count,
        unique_values: col.unique_values || []
      }));
      
      setCardinalityData(cardinalityData);
    } catch (e: any) {
      setCardinalityError(e.message || 'Error fetching cardinality data');
    } finally {
      setCardinalityLoading(false);
    }
  };

  const displayedCardinality = useMemo(() => {
    let filtered = cardinalityData.filter(c => c.unique_count > 0);

    // Apply column filters
    Object.entries(columnFilters).forEach(([column, filterValues]) => {
      if (Array.isArray(filterValues) && filterValues.length > 0) {
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
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn('');
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection(direction || 'asc');
    }
  };

  const handleColumnFilter = (column: string, values: string[]) => {
    setColumnFilters(prev => ({
      ...prev,
      [column]: values
    }));
  };

  const clearColumnFilter = (column: string) => {
    setColumnFilters(prev => {
      const cpy = { ...prev };
      delete cpy[column];
      return cpy;
    });
  };

  const FilterMenu = ({ column }: { column: string }) => {
    const uniqueValues = getUniqueColumnValues(column);
    const current = columnFilters[column] || [];
    const [temp, setTemp] = useState<string[]>(current);

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
                                <div className="flex items-center gap-2 py-1 border-b mb-2">
                                  <Checkbox
                                    checked={selectedValues.length === info.unique_values.length}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        // Select all
                                        const newSelectedValues = [...info.unique_values];
                                        setSelectedIdentifierValues(prev => ({
                                          ...prev,
                                          [identifierName]: newSelectedValues
                                        }));
                                        
                                        // Update main data
                                        onDataChange({ 
                                          selectedIdentifierValues: {
                                            ...data.selectedIdentifierValues,
                                            [identifierName]: newSelectedValues
                                          }
                                        });
                                      } else {
                                        // Deselect all
                                        const newSelectedValues: string[] = [];
                                        setSelectedIdentifierValues(prev => ({
                                          ...prev,
                                          [identifierName]: newSelectedValues
                                        }));
                                        
                                        // Update main data
                                        onDataChange({ 
                                          selectedIdentifierValues: {
                                            ...data.selectedIdentifierValues,
                                            [identifierName]: newSelectedValues
                                          }
                                        });
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

        {/* Waterfall Charts Section */}
        {selectedGraphs.some(g => g.type === 'waterfall') && data.selectedDataframe && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Waterfall chart</h3>
              <div className="flex items-center gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      aria-label="Expand waterfall charts"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
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
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      aria-label="Expand contribution charts"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
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

        {/* Actual vs Predicted Charts Section */}
        {selectedGraphs.some(g => g.type === 'actual-vs-predicted') && data.selectedDataframe && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Actual vs Predicted</h3>
              <div className="flex items-center gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      aria-label="Expand actual vs predicted charts"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
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
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      aria-label="Expand beta charts"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
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
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      aria-label="Expand elasticity charts"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
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
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      aria-label="Expand averages charts"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
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
      </div>
    </div>
  );
};

export default EvaluateModelsFeatureCanvas;