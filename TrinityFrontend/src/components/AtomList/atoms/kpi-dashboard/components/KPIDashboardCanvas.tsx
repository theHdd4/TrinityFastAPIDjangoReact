import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, GripVertical, ChevronDown, Type, BarChart3, Lightbulb, HelpCircle, Quote, Blocks, LayoutGrid, Table2, ImageIcon, Zap, MessageSquare, Search, X, Target, AlertCircle, CheckCircle, ArrowLeft, ArrowRight, Star, Award, Flame, ArrowUp, ArrowDown, MoreVertical, Filter, Eye, EyeOff, Minus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { chartMakerApi } from '@/components/AtomList/atoms/chart-maker/services/chartMakerApi';
import { migrateLegacyChart, buildTracesForAPI, validateChart } from '@/components/AtomList/atoms/chart-maker/utils/traceUtils';
import type { KPIDashboardData, KPIDashboardSettings } from '../KPIDashboardAtom';
import { ElementType } from './ElementDropdown';
import ElementRenderer from './ElementRenderer';
import ChartElement from './ChartElement';
import TableElement from './TableElement';
import ElementMenuDropdown from './ElementMenuDropdown';
import { TextBoxToolbar } from '@/components/LaboratoryMode/components/CanvasArea/text-box/TextBoxToolbar';
import { TEXT_STYLE_OPTIONS, getTextStyleProperties } from '@/components/LaboratoryMode/components/CanvasArea/text-box/constants';
import type { TextStylePreset } from '@/components/LaboratoryMode/components/CanvasArea/text-box/types';
import { KPI_DASHBOARD_API, LABORATORY_API, IMAGES_API } from '@/lib/api';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { TrendingUp } from 'lucide-react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface KPIDashboardCanvasProps {
  atomId: string;
  data: KPIDashboardData | null;
  settings: KPIDashboardSettings;
  onDataUpload: (data: KPIDashboardData) => void;
  onSettingsChange: (settings: Partial<KPIDashboardSettings>) => void;
}

type LayoutType = '4-box' | '3-box' | '2-box' | '1-box';
type TextStyleOption = 'header' | 'sub-header' | 'paragraph';

interface LayoutBox {
  id: string;
  elementType?: ElementType;
  width?: number;
  // Text box properties
  text?: string;
  textStyle?: TextStyleOption;
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
  backgroundColor?: string;
  isTextSaved?: boolean; // Track if text is in "saved" (preview-only) mode
  // Insights panel properties
  insightsHeading?: string;
  insightsContent?: string;
  isInsightsSaved?: boolean;
  // Q&A properties
  qaQuestionContent?: string;
  qaAnswerContent?: string;
  isQASaved?: boolean;
  qaHasBeenInteracted?: boolean;
  // Metric card properties
  metricLabel?: string;
  metricValue?: string;
  metricUnit?: string;
  changeValue?: number;
  changeType?: 'positive' | 'negative' | 'neutral';
  metricColor?: string;
  showTrend?: boolean;
  valueFormat?: 'none' | 'thousands' | 'millions' | 'billions' | 'lakhs'; // Format for displaying values
  valueDecimalPlaces?: number; // Number of decimal places for the main value
  showGrowthRate?: boolean; // Show growth rate comparison
  growthRateDecimalPlaces?: number; // Number of decimal places for growth rate
  comparisonIdentifier?: string; // Identifier to vary for comparison (e.g., "year", "brand")
  comparisonIdentifierValue?: string; // Value of the identifier to compare with
  growthRateValue?: number; // Calculated growth rate percentage
  absoluteDifferenceValue?: number; // Calculated absolute difference
  comparisonDisplayType?: 'growthRate' | 'absoluteDifference'; // Display type for comparison
  comparisonValue?: string; // Value of the comparison variable
  // Config variable fields
  variableId?: string;
  variableName?: string;
  variableNameKey?: string;
  formula?: string;
  value?: string;
  description?: string;
  usageSummary?: string;
  cardId?: string;
  atomId?: string;
  originCardId?: string;
  originVariableId?: string;
  clientId?: string;
  appId?: string;
  projectId?: string;
  projectName?: string;
  additionalLine?: string; // Additional editable gray text line
  createdAt?: string;
  updatedAt?: string;
  // Caption properties
  captionText?: string;
  captionContent?: string;
  captionFontSize?: number;
  captionColor?: string;
  captionAlign?: 'left' | 'center' | 'right';
  captionStyle?: 'normal' | 'italic' | 'bold';
  captionLogoType?: 'trending-up' | 'arrow-up' | 'arrow-up-right' | 'trending-up-circle' | 'line-chart';
  captionLogoColor?: string;
  isCaptionSaved?: boolean;
  // Interactive blocks properties - two boxes side by side
  // Box 1 properties
  interactiveBlock1Heading?: string;
  interactiveBlock1Icon?: string; // Icon name (e.g., 'Zap', 'Target')
  interactiveBlock1Content?: string; // HTML content with bullet points
  interactiveBlock1Background?: string;
  isInteractiveBlock1Saved?: boolean;
  // Box 2 properties
  interactiveBlock2Heading?: string;
  interactiveBlock2Icon?: string; // Icon name (e.g., 'Zap', 'Target')
  interactiveBlock2Content?: string; // HTML content with bullet points
  interactiveBlock2Background?: string;
  isInteractiveBlock2Saved?: boolean;
  // Chart properties - stores chart configuration
  chartConfig?: any; // ChartMakerConfig with rendered chart data
  // Table properties - stores table configuration and data
  tableSettings?: {
    mode?: 'load' | 'blank';
    sourceFile?: string;
    tableId?: string;
    tableData?: any;
    visibleColumns?: string[];
    columnOrder?: string[];
    columnWidths?: Record<string, number>;
    rowHeight?: number;
    showRowNumbers?: boolean;
    showSummaryRow?: boolean;
    frozenColumns?: number;
    filters?: Record<string, any>;
    sortConfig?: Array<{column: string; direction: 'asc' | 'desc'}>;
    currentPage?: number;
    pageSize?: number;
    layout?: {
      headerRow?: boolean;
      totalRow?: boolean;
      bandedRows?: boolean;
      bandedColumns?: boolean;
      firstColumn?: boolean;
      lastColumn?: boolean;
    };
    design?: {
      theme?: string;
      borderStyle?: 'all' | 'none' | 'outside' | 'horizontal' | 'vertical' | 'header';
    };
    totalRowConfig?: Record<string, 'sum' | 'average' | 'count' | 'min' | 'max' | 'none'>;
    blankTableConfig?: {
      rows?: number;
      columns?: number;
      columnNames?: string[];
      useHeaderRow?: boolean;
      created?: boolean;
    };
  };
  // Image properties (ready for implementation)
  imageUrl?: string;
  imageAlt?: string;
  imageWidth?: string;
  imageHeight?: string;
  imageObjectFit?: 'cover' | 'contain' | 'fill';
  imageBorderRadius?: string;
}

interface Layout {
  id: string;
  type: LayoutType;
  boxes: LayoutBox[];
  height?: number;
}

interface ConfigVariable {
  id: string;
  variableName: string;
  formula?: string;
  value?: string;
  description?: string;
  usageSummary?: string;
  cardId?: string;
  atomId?: string;
  originCardId?: string;
  originVariableId?: string;
  clientId?: string;
  appId?: string;
  projectId?: string;
  projectName?: string;
  createdAt?: string;
  updatedAt?: string;
  variableNameKey?: string;
}

const KPIDashboardCanvas: React.FC<KPIDashboardCanvasProps> = ({
  atomId,
  data,
  settings,
  onDataUpload,
  onSettingsChange
}) => {
  // Expose settings to child components via context or prop drilling
  // For now, settings is already available in the component scope
  const [layouts, setLayouts] = useState<Layout[]>(settings.layouts || []);
  const [selectKey, setSelectKey] = useState(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [variables, setVariables] = useState<ConfigVariable[]>([]);
  const metricsInputs = useLaboratoryStore(state => state.metricsInputs);
  
  // State for deletion confirmation dialog
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteType, setDeleteType] = useState<'row' | 'element' | null>(null);
  const [pendingDeleteLayoutId, setPendingDeleteLayoutId] = useState<string | null>(null);
  const [pendingDeleteBoxId, setPendingDeleteBoxId] = useState<string | null>(null);
  
  // Load layouts from settings on mount
  useEffect(() => {
    if (settings.layouts && settings.layouts.length > 0) {
      setLayouts(settings.layouts);
    }
  }, [settings.layouts]);

  // Fetch variables from MongoDB on mount and when refresh trigger changes
  useEffect(() => {
    const fetchVariables = async () => {
      try {
        const projectContext = getActiveProjectContext();
        if (!projectContext) {
          console.warn('⚠️ No project context found, skipping variable fetch');
          return;
        }

        const params = new URLSearchParams({
          clientId: projectContext.client_name,
          appId: projectContext.app_name,
          projectId: projectContext.project_name,
        });

        const response = await fetch(`${LABORATORY_API}/variables?${params.toString()}`, {
          credentials: 'include',
        });

        if (response.ok) {
          const result = await response.json();
          if (result.variables && Array.isArray(result.variables)) {
            const mappedVariables: ConfigVariable[] = result.variables.map((v: any) => ({
              id: v.id || '',
              variableName: v.variableName || '',
              formula: v.formula,
              value: v.value,
              description: v.description,
              usageSummary: v.usageSummary,
              cardId: v.cardId,
              atomId: v.atomId,
              originCardId: v.originCardId,
              originVariableId: v.originVariableId,
              clientId: v.clientId,
              appId: v.appId,
              projectId: v.projectId,
              projectName: v.projectName,
              createdAt: v.createdAt,
              updatedAt: v.updatedAt,
              variableNameKey: v.variableNameKey,
            }));
            setVariables(mappedVariables);
            console.log('✅ Loaded variables:', mappedVariables.length);
          }
        } else {
          console.warn('⚠️ Failed to fetch variables:', response.statusText);
        }
      } catch (error) {
        console.error('❌ Error fetching variables:', error);
      }
    };

    fetchVariables();
  }, [metricsInputs.variablesRefreshTrigger]);
  
  // Save layouts to MongoDB with debouncing
  useEffect(() => {
    // Skip save on initial mount when layouts is empty
    if (layouts.length === 0) {
      return;
    }
    
    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Debounce save by 1 second
    saveTimeoutRef.current = setTimeout(() => {
      saveLayoutsToMongoDB(layouts);
    }, 1000);
    
    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [layouts]);

  // Save interaction settings when they change (debounced)
  useEffect(() => {
    // Skip save on initial mount when layouts is empty
    if (layouts.length === 0) {
      return;
    }
    
    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Debounce save by 1 second
    saveTimeoutRef.current = setTimeout(() => {
      saveLayoutsToMongoDB(layouts);
    }, 1000);
    
    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [settings.editInteractionsMode, settings.elementInteractions]);
  
  const saveLayoutsToMongoDB = async (layoutsToSave: Layout[]) => {
    try {
      const projectContext = getActiveProjectContext();
      if (!projectContext) {
        console.warn('⚠️ No project context found, skipping MongoDB save');
        return;
      }
      
      console.log('💾 Saving KPI Dashboard to MongoDB...', {
        atomId: atomId,
        layouts: layoutsToSave.length,
        boxes: layoutsToSave.reduce((sum, layout) => sum + layout.boxes.length, 0)
      });
      
      // ✅ STEP 1: Build complete payload with ALL settings and metadata
      const payload = {
        layouts: layoutsToSave,
        title: settings.title || 'KPI Dashboard',
        metricColumns: settings.metricColumns || [],
        changeColumns: settings.changeColumns || [],
        insights: settings.insights || '',
        editInteractionsMode: settings.editInteractionsMode || false,
        elementInteractions: settings.elementInteractions || {},
        // Add metadata for debugging and versioning
        savedAt: new Date().toISOString(),
        version: '1.0',
      };
      
      // ✅ STEP 2: Save to atom_list_configuration collection (with atom_id for per-instance storage)
      const response = await fetch(
        `${KPI_DASHBOARD_API}/save-config?` +
        `client_name=${encodeURIComponent(projectContext.client_name)}&` +
        `app_name=${encodeURIComponent(projectContext.app_name)}&` +
        `project_name=${encodeURIComponent(projectContext.project_name)}&` +
        `atom_id=${encodeURIComponent(atomId)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(payload),
        }
      );
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ KPI Dashboard saved to atom_list_configuration:', {
          collection: result.collection,
          operation: result.operation,
          mongo_id: result.mongo_id
        });
        
        // ✅ STEP 3: Update laboratory store (triggers autosave if enabled)
        // This ensures django_atom_list_configuration stays in sync
        onSettingsChange({ 
          layouts: layoutsToSave,
          title: payload.title,
          metricColumns: payload.metricColumns,
          changeColumns: payload.changeColumns,
          insights: payload.insights,
          editInteractionsMode: payload.editInteractionsMode,
          elementInteractions: payload.elementInteractions,
        });
        
        console.log('✅ Laboratory store updated (autosave will sync to django_atom_list_configuration)');
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to save KPI Dashboard:', response.statusText, errorText);
      }
    } catch (error) {
      console.error('❌ Error saving KPI Dashboard to MongoDB:', error);
    }
  };

  const elementTypes: { value: ElementType; label: string; icon: React.ElementType; description: string }[] = [
    { value: 'text-box', label: 'Text Box', icon: Type, description: 'Rich text content' },
    { value: 'metric-card', label: 'Metric Card', icon: BarChart3, description: 'KPI with value & trend' },
    { value: 'insight-panel', label: 'Insight Panel', icon: Lightbulb, description: 'Key insights list' },
    { value: 'qa', label: 'Q&A Block', icon: HelpCircle, description: 'Question & answer' },
    { value: 'caption', label: 'Caption', icon: Quote, description: 'Descriptive caption' },
    { value: 'interactive-blocks', label: 'Interactive Block', icon: Blocks, description: 'Dynamic content' },
    { value: 'chart', label: 'Chart', icon: BarChart3, description: 'Data visualizations' },
    { value: 'table', label: 'Table', icon: Table2, description: 'Structured data display' },
    { value: 'image', label: 'Image', icon: ImageIcon, description: 'Visual content' },
  ];

  const layoutOptions: { value: LayoutType; label: string; columns: number }[] = [
    { value: '4-box', label: '4 Columns', columns: 4 },
    { value: '3-box', label: '3 Columns', columns: 3 },
    { value: '2-box', label: '2 Columns', columns: 2 },
    { value: '1-box', label: '1 Column', columns: 1 },
  ];

  const getBoxCount = (layoutType: LayoutType): number => {
    switch (layoutType) {
      case '4-box': return 4;
      case '3-box': return 3;
      case '2-box': return 2;
      case '1-box': return 1;
      default: return 1;
    }
  };

  const getDefaultWidth = (layoutType: LayoutType): number => {
    switch (layoutType) {
      case '4-box': return 3;
      case '3-box': return 4;
      case '2-box': return 6;
      case '1-box': return 12;
      default: return 12;
    }
  };

  // Redistribute widths evenly when boxes are deleted
  // Grid uses 12 columns, so distribute evenly: 1 box = 12, 2 boxes = 6 each, 3 boxes = 4 each, 4 boxes = 3 each
  const redistributeBoxWidths = (boxes: LayoutBox[]): LayoutBox[] => {
    if (boxes.length === 0) return boxes;
    
    const totalColumns = 12;
    const widthPerBox = Math.floor(totalColumns / boxes.length);
    
    return boxes.map(box => ({
      ...box,
      width: widthPerBox
    }));
  };

  const getFilledCount = (layout: Layout) => 
    layout.boxes.filter(b => b.elementType).length;

  const handleSelectLayout = (layoutType: LayoutType) => {
    const boxCount = getBoxCount(layoutType);
    const defaultWidth = getDefaultWidth(layoutType);
    const newLayout: Layout = {
      id: `layout-${Date.now()}`,
      type: layoutType,
      boxes: Array.from({ length: boxCount }, (_, idx) => ({
        id: `box-${Date.now()}-${idx}`,
        elementType: undefined,
        width: defaultWidth
      })),
      height: 220
    };
    setLayouts([...layouts, newLayout]);
    // Force reset the select dropdown to allow selecting the same option again
    setSelectKey(prev => prev + 1);
  };

  const handleElementSelect = (layoutId: string, boxId: string, elementType: ElementType) => {
    setLayouts(layouts.map(layout => {
      if (layout.id === layoutId) {
        return {
          ...layout,
          boxes: layout.boxes.map(box => 
            box.id === boxId 
              ? { 
                  ...box, 
                  elementType,
                  // Initialize element-specific properties with defaults
                  ...(elementType === 'text-box' ? {
                    text: box.text || '',
                    textStyle: box.textStyle || 'paragraph',
                    fontSize: box.fontSize || 18,
                    fontFamily: box.fontFamily || 'DM Sans',
                    bold: box.bold || false,
                    italic: box.italic || false,
                    underline: box.underline || false,
                    strikethrough: box.strikethrough || false,
                    align: box.align || 'left',
                    color: box.color || '#6B7280',
                    backgroundColor: box.backgroundColor || 'transparent'
                  } : elementType === 'insight-panel' ? {
                    insightsHeading: box.insightsHeading || 'KEY INSIGHTS',
                    insightsContent: box.insightsContent || '<div style="display: flex; align-items: flex-start; margin-bottom: 8px;"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="margin-right: 8px; margin-top: 2px; flex-shrink: 0;"><circle cx="10" cy="10" r="9" stroke="#1A73E8" stroke-width="2" fill="none"/><path d="M6 10L8.5 12.5L14 7" stroke="#1A73E8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg><span contenteditable="true" style="outline: none;">Your first insight here</span></div>',
                    isInsightsSaved: box.isInsightsSaved || false,
                    backgroundColor: box.backgroundColor || 'linear-gradient(135deg, #EBF4FF 0%, #E0F2FE 50%, #DBEAFE 100%)'
                  } : elementType === 'qa' ? {
                    qaQuestionContent: box.qaQuestionContent || '',
                    qaAnswerContent: box.qaAnswerContent || '',
                    isQASaved: box.isQASaved || false,
                    qaHasBeenInteracted: box.qaHasBeenInteracted || false,
                    fontFamily: box.fontFamily || 'DM Sans'
                  } : elementType === 'metric-card' ? {
                    // Metric card properties with variable support
                    metricLabel: box.metricLabel || box.variableName || 'Sample Metric',
                    metricValue: box.metricValue || box.value || '0',
                    metricUnit: box.metricUnit || '',
                    changeValue: box.changeValue || 0,
                    changeType: box.changeType || 'positive', // 'positive' | 'negative' | 'neutral'
                    metricColor: box.metricColor || '#10B981',
                    showTrend: box.showTrend !== undefined ? box.showTrend : true,
                    valueFormat: box.valueFormat || 'none', // Format for displaying values
                    valueDecimalPlaces: box.valueDecimalPlaces !== undefined ? box.valueDecimalPlaces : 1,
                    showGrowthRate: box.showGrowthRate || false,
                    growthRateDecimalPlaces: box.growthRateDecimalPlaces !== undefined ? box.growthRateDecimalPlaces : 1,
                    comparisonIdentifier: box.comparisonIdentifier,
                    comparisonIdentifierValue: box.comparisonIdentifierValue,
                    growthRateValue: box.growthRateValue,
                    absoluteDifferenceValue: box.absoluteDifferenceValue,
                    comparisonDisplayType: box.comparisonDisplayType || 'growthRate',
                    comparisonValue: box.comparisonValue,
                    // Variable fields
                    variableId: box.variableId,
                    variableName: box.variableName,
                    variableNameKey: box.variableNameKey,
                    formula: box.formula,
                    value: box.value,
                    description: box.description,
                    usageSummary: box.usageSummary,
                    cardId: box.cardId,
                    atomId: box.atomId,
                    originCardId: box.originCardId,
                    originVariableId: box.originVariableId,
                    clientId: box.clientId,
                    appId: box.appId,
                    projectId: box.projectId,
                    projectName: box.projectName,
                    additionalLine: box.additionalLine,
                    createdAt: box.createdAt,
                    updatedAt: box.updatedAt
                  } : elementType === 'caption' ? {
                    // Caption properties
                    captionText: box.captionText || '',
                    captionContent: box.captionContent !== undefined ? box.captionContent : '',
                    captionFontSize: box.captionFontSize || 16,
                    captionColor: box.captionColor || '#111827',
                    captionAlign: box.captionAlign || 'left',
                    captionStyle: box.captionStyle || 'normal', // 'normal' | 'italic' | 'bold'
                    captionLogoType: box.captionLogoType || 'trending-up',
                    captionLogoColor: box.captionLogoColor || '#10B981',
                    fontFamily: box.fontFamily || 'DM Sans',
                    backgroundColor: box.backgroundColor || 'transparent'
                  } : elementType === 'interactive-blocks' ? {
                    // Interactive blocks properties - two boxes side by side
                    // Box 1 (left) - Key Drivers
                    interactiveBlock1Heading: box.interactiveBlock1Heading || 'KEY DRIVERS',
                    interactiveBlock1Icon: box.interactiveBlock1Icon || 'Zap',
                    interactiveBlock1Content: box.interactiveBlock1Content || '<div style="display: flex; align-items: flex-start; margin-bottom: 8px;"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="margin-right: 8px; margin-top: 2px; flex-shrink: 0;"><circle cx="10" cy="10" r="6" fill="#10B981"/></svg><span contenteditable="true" style="outline: none;">Your first point here</span></div>',
                    interactiveBlock1Background: box.interactiveBlock1Background || 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 50%, #A7F3D0 100%)',
                    isInteractiveBlock1Saved: box.isInteractiveBlock1Saved || false,
                    // Box 2 (right) - Opportunities/Actions
                    interactiveBlock2Heading: box.interactiveBlock2Heading || 'OPPORTUNITIES/ACTIONS',
                    interactiveBlock2Icon: box.interactiveBlock2Icon || 'Target',
                    interactiveBlock2Content: box.interactiveBlock2Content || '<div style="display: flex; align-items: flex-start; margin-bottom: 8px;"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="margin-right: 8px; margin-top: 2px; flex-shrink: 0;"><circle cx="10" cy="10" r="6" fill="#F59E0B"/></svg><span contenteditable="true" style="outline: none;">Your first point here</span></div>',
                    interactiveBlock2Background: box.interactiveBlock2Background || 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 50%, #FDE68A 100%)',
                    isInteractiveBlock2Saved: box.isInteractiveBlock2Saved || false
                  } : elementType === 'chart' ? {
                    // Chart properties - chartConfig contains the chart configuration
                    chartConfig: box.chartConfig || undefined
                  } : elementType === 'table' ? {
                    // Table properties - use tableSettings
                    tableSettings: box.tableSettings || undefined
                  } : elementType === 'image' ? {
                    // Image properties (ready for implementation)
                    imageUrl: box.imageUrl || '',
                    imageAlt: box.imageAlt || '',
                    imageWidth: box.imageWidth || '100%',
                    imageHeight: box.imageHeight || 'auto',
                    imageObjectFit: box.imageObjectFit || 'cover', // 'cover' | 'contain' | 'fill'
                    imageBorderRadius: box.imageBorderRadius || '8px'
                  } : {})
                } 
              : box
          )
        };
      }
      return layout;
    }));
  };

  const handleTextBoxUpdate = (layoutId: string, boxId: string, updates: Partial<LayoutBox>) => {
    setLayouts(layouts.map(layout => {
      if (layout.id === layoutId) {
        return {
          ...layout,
          boxes: layout.boxes.map(box => 
            box.id === boxId ? { ...box, ...updates } : box
          )
        };
      }
      return layout;
    }));
  };

  const handleDeleteLayout = (layoutId: string) => {
    setPendingDeleteLayoutId(layoutId);
    setPendingDeleteBoxId(null);
    setDeleteType('row');
    setShowDeleteConfirmation(true);
  };

  const confirmDeleteLayout = () => {
    if (pendingDeleteLayoutId) {
      setLayouts(layouts.filter(layout => layout.id !== pendingDeleteLayoutId));
    }
    setShowDeleteConfirmation(false);
    setPendingDeleteLayoutId(null);
    setDeleteType(null);
  };

  const handleAddRowAbove = (layoutId: string) => {
    setLayouts((currentLayouts) => {
      const layoutIndex = currentLayouts.findIndex(layout => layout.id === layoutId);
      if (layoutIndex === -1) return currentLayouts;

      const referenceLayout = currentLayouts[layoutIndex];
      const newLayout: Layout = {
        id: `layout-${Date.now()}`,
        type: referenceLayout.type,
        boxes: Array.from({ length: getBoxCount(referenceLayout.type) }, (_, idx) => ({
          id: `box-${Date.now()}-${idx}`,
          elementType: undefined,
          width: getDefaultWidth(referenceLayout.type)
        })),
        height: referenceLayout.height || 220
      };

      const newLayouts = [...currentLayouts];
      newLayouts.splice(layoutIndex, 0, newLayout);
      return newLayouts;
    });
  };

  const handleAddRowBelow = (layoutId: string) => {
    setLayouts((currentLayouts) => {
      const layoutIndex = currentLayouts.findIndex(layout => layout.id === layoutId);
      if (layoutIndex === -1) return currentLayouts;

      const referenceLayout = currentLayouts[layoutIndex];
      const newLayout: Layout = {
        id: `layout-${Date.now()}`,
        type: referenceLayout.type,
        boxes: Array.from({ length: getBoxCount(referenceLayout.type) }, (_, idx) => ({
          id: `box-${Date.now()}-${idx}`,
          elementType: undefined,
          width: getDefaultWidth(referenceLayout.type)
        })),
        height: referenceLayout.height || 220
      };

      const newLayouts = [...currentLayouts];
      newLayouts.splice(layoutIndex + 1, 0, newLayout);
      return newLayouts;
    });
  };

  const handleDeleteBox = (layoutId: string, boxId: string) => {
    setPendingDeleteLayoutId(layoutId);
    setPendingDeleteBoxId(boxId);
    setDeleteType('element');
    setShowDeleteConfirmation(true);
  };

  const confirmDeleteBox = () => {
    if (pendingDeleteLayoutId && pendingDeleteBoxId) {
      setLayouts((currentLayouts) => {
        const updatedLayouts = currentLayouts.map(layout => {
          if (layout.id === pendingDeleteLayoutId) {
            const updatedBoxes = layout.boxes.filter(box => box.id !== pendingDeleteBoxId);
            // If no boxes left, remove the entire layout
            if (updatedBoxes.length === 0) {
              return null; // Will be filtered out
            }
            // Redistribute widths evenly to fill available space
            const redistributedBoxes = redistributeBoxWidths(updatedBoxes);
            return {
              ...layout,
              boxes: redistributedBoxes
            };
          }
          return layout;
        }).filter(layout => layout !== null) as Layout[];
        return updatedLayouts;
      });
      
      // Clear selection if deleted box was selected
      const selectedBoxIds = settings.selectedBoxIds || [];
      if (selectedBoxIds.includes(pendingDeleteBoxId)) {
        const updatedSelectedBoxIds = selectedBoxIds.filter(id => id !== pendingDeleteBoxId);
        onSettingsChange({ 
          selectedBoxIds: updatedSelectedBoxIds.length > 0 ? updatedSelectedBoxIds : undefined,
          selectedBoxId: settings.selectedBoxId === pendingDeleteBoxId ? undefined : settings.selectedBoxId
        });
      }
    }
    setShowDeleteConfirmation(false);
    setPendingDeleteLayoutId(null);
    setPendingDeleteBoxId(null);
    setDeleteType(null);
  };

  const handleDeleteSelectedBoxes = () => {
    const selectedBoxIds = settings.selectedBoxIds || [];
    if (selectedBoxIds.length === 0) return;

    setLayouts((currentLayouts) => {
      const updatedLayouts = currentLayouts.map(layout => {
        const updatedBoxes = layout.boxes.filter(box => !selectedBoxIds.includes(box.id));
        // If no boxes left, remove the entire layout
        if (updatedBoxes.length === 0) {
          return null; // Will be filtered out
        }
        // Redistribute widths evenly to fill available space
        const redistributedBoxes = redistributeBoxWidths(updatedBoxes);
        return {
          ...layout,
          boxes: redistributedBoxes
        };
      }).filter(layout => layout !== null) as Layout[];
      return updatedLayouts;
    });
    
    // Clear selection
    onSettingsChange({ 
      selectedBoxIds: undefined,
      selectedBoxId: undefined
    });
  };

  const handleAddElement = (layoutId: string, boxId: string, position: 'left' | 'right' | 'above' | 'below') => {
    setLayouts((currentLayouts) => {
      const layoutIndex = currentLayouts.findIndex(layout => layout.id === layoutId);
      if (layoutIndex === -1) return currentLayouts;

      const layout = currentLayouts[layoutIndex];
      const boxIndex = layout.boxes.findIndex(box => box.id === boxId);
      if (boxIndex === -1) return currentLayouts;

      // Handle above/below positions - create new row
      if (position === 'above' || position === 'below') {
        const newLayout: Layout = {
          id: `layout-${Date.now()}`,
          type: layout.type,
          boxes: Array.from({ length: getBoxCount(layout.type) }, (_, idx) => ({
            id: `box-${Date.now()}-${idx}`,
            elementType: undefined,
            width: getDefaultWidth(layout.type)
          })),
          height: layout.height || 220
        };

        const newLayouts = [...currentLayouts];
        if (position === 'above') {
          newLayouts.splice(layoutIndex, 0, newLayout);
        } else {
          newLayouts.splice(layoutIndex + 1, 0, newLayout);
        }
        return newLayouts;
      }

      // Handle left/right positions - add to same row
      return currentLayouts.map(l => {
        if (l.id === layoutId) {
          const defaultWidth = getDefaultWidth(layout.type);
          const newBox: LayoutBox = {
            id: `box-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            elementType: undefined,
            width: defaultWidth
          };

          const newBoxes = [...layout.boxes];
          if (position === 'left') {
            newBoxes.splice(boxIndex, 0, newBox);
          } else {
            newBoxes.splice(boxIndex + 1, 0, newBox);
          }

          // Redistribute widths evenly after adding new box
          const redistributedBoxes = redistributeBoxWidths(newBoxes);
          
          return {
            ...layout,
            boxes: redistributedBoxes
          };
        }
        return l;
      });
    });
  };

  const handleLayoutHeightChange = (layoutId: string, newHeight: number) => {
    const clampedHeight = Math.max(120, Math.min(800, newHeight));
    setLayouts(layouts.map(layout => 
      layout.id === layoutId ? { ...layout, height: clampedHeight } : layout
    ));
  };

  const handleResizeStart = (layoutId: string, startY: number, currentHeight: number) => {
    const startHeight = currentHeight || 220;
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - startY;
      const newHeight = startHeight + deltaY;
      handleLayoutHeightChange(layoutId, newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  // Helper function to format active global filters
  const getFormattedGlobalFilters = (): string | null => {
    const globalFilters = settings.globalFilters || {};
    const enabledIdentifiers = settings.enabledGlobalFilterIdentifiers || [];
    
    // Get active filter values in the order of enabled identifiers
    const activeFilterValues: string[] = [];
    
    // If enabled identifiers exist, use them to preserve order
    if (enabledIdentifiers.length > 0) {
      enabledIdentifiers.forEach(identifier => {
        const filterConfig = globalFilters[identifier];
        if (filterConfig && typeof filterConfig === 'object' && 'values' in filterConfig && Array.isArray(filterConfig.values) && filterConfig.values.length > 0) {
          // Join multiple values with comma, then add to the list
          activeFilterValues.push(filterConfig.values.join(', '));
        }
      });
    } else {
      // If no enabled identifiers, use all active filters
      Object.entries(globalFilters).forEach(([identifier, filterConfig]) => {
        if (filterConfig && typeof filterConfig === 'object' && 'values' in filterConfig && Array.isArray(filterConfig.values) && filterConfig.values.length > 0) {
          activeFilterValues.push(filterConfig.values.join(', '));
        }
      });
    }
    
    // Return null if no active filters, otherwise join with pipe
    return activeFilterValues.length > 0 ? activeFilterValues.join(' | ') : null;
  };

  // Check if first element is a text box
  const isFirstElementTextBox = (): boolean => {
    if (layouts.length === 0) return false;
    const firstLayout = layouts[0];
    if (!firstLayout.boxes || firstLayout.boxes.length === 0) return false;
    const firstBox = firstLayout.boxes[0];
    return firstBox.elementType === 'text-box';
  };

  return (
    <div className="h-full w-full overflow-y-auto p-8 bg-gradient-to-br from-background via-muted/5 to-background relative" style={{ minWidth: 0, minHeight: 0 }}>
      <div className="w-full space-y-6" style={{ minWidth: 0, width: '100%' }}>
        {/* Empty State */}
        {layouts.length === 0 && (
          <div className="relative group">
            <div className="absolute -inset-2 bg-gradient-to-br from-primary/10 via-transparent to-primary/5 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative flex flex-col items-center justify-center py-24 px-8 border-2 border-dashed border-border/60 rounded-2xl bg-gradient-to-br from-card/50 to-muted/20 backdrop-blur-sm shadow-[0_4px_24px_-8px_hsl(var(--foreground)/0.05)]">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-xl animate-pulse" />
                <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-6 shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.3)]">
                  <Plus className="w-10 h-10 text-primary" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Start Building Your Dashboard</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md mb-8">
                Add rows to your dashboard using the options below. Each row can contain multiple elements for a flexible layout.
              </p>
              <div className="flex gap-3 flex-wrap justify-center">
                {layoutOptions.map(option => (
                  <Button
                    key={option.value}
                    variant="outline"
                    onClick={() => handleSelectLayout(option.value)}
                    className="gap-3 h-12 px-5 bg-card/80 hover:bg-primary/5 border-border/60 hover:border-primary/40 shadow-[0_4px_12px_-4px_hsl(var(--foreground)/0.08)] hover:shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.2)] transition-all duration-300"
                  >
                    <div className="flex gap-1">
                      {Array.from({ length: option.columns }).map((_, i) => (
                        <div key={i} className="w-2.5 h-5 bg-primary/30 rounded-sm" />
                      ))}
                    </div>
                    <span className="font-medium">{option.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Common Delete Icon for Multi-Selection */}
        {settings.selectedBoxIds && settings.selectedBoxIds.length > 1 && (
          <div className="fixed top-4 right-4 z-50">
            <button
              onClick={handleDeleteSelectedBoxes}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl"
              title={`Delete ${settings.selectedBoxIds.length} selected boxes`}
            >
              <Trash2 className="w-4 h-4" />
              <span className="font-medium">Delete {settings.selectedBoxIds.length} Selected</span>
            </button>
          </div>
        )}

        {/* Global Filters Display - Top Right (when first element is not a text box) */}
        {layouts.length > 0 && !isFirstElementTextBox() && getFormattedGlobalFilters() && (
          <div className="absolute top-8 right-8 z-40">
            <div 
              className="text-gray-600"
              style={{
                fontSize: '22px',
                fontFamily: 'DM Sans, sans-serif',
                fontWeight: 'bold',
                letterSpacing: '-0.01em',
                lineHeight: '1.2'
              }}
            >
              {getFormattedGlobalFilters()}
            </div>
          </div>
        )}

        {/* Layout Rows */}
        {layouts.length > 0 && (
          <div className="space-y-4" style={{ paddingTop: '16px' }}>
            {layouts.map((layout, rowIndex) => (
              <div
                key={layout.id}
                className="group relative"
              >
                {/* Ambient glow */}
                <div className="absolute -inset-2 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                <div 
                  className="relative bg-transparent border border-gray-200/30 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-1 flex flex-col"
                  style={{ height: `${layout.height || 220}px`, overflow: 'visible' }}
                >
                  {/* Row menu dropdown for the entire layout */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="absolute top-1 right-1 p-1.5 rounded-lg hover:bg-gray-50 transition-colors opacity-0 group-hover:opacity-100 z-30"
                        title="Row options"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="w-3.5 h-3.5 text-gray-500 hover:text-gray-700" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddRowAbove(layout.id);
                        }}
                        className="flex items-center gap-2"
                      >
                        <ArrowUp className="w-4 h-4" />
                        <span>Add Row Above</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddRowBelow(layout.id);
                        }}
                        className="flex items-center gap-2"
                      >
                        <ArrowDown className="w-4 h-4" />
                        <span>Add Row Below</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteLayout(layout.id);
                        }}
                        className="flex items-center gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete Row</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Row Content */}
                  <div className="grid grid-cols-12 gap-2" style={{ height: 'calc(100% - 8px)', overflow: 'visible', minWidth: 0, width: '100%' }}>
                    {layout.boxes.map((box, boxIndex) => (
                      <ElementBox
                        key={box.id}
                        box={box}
                        layoutId={layout.id}
                        boxId={box.id}
                        width={box.width || getDefaultWidth(layout.type)}
                        layoutHeight={layout.height || 220}
                        elementTypes={elementTypes}
                        onSelectElement={(type) => handleElementSelect(layout.id, box.id, type)}
                        onTextBoxUpdate={handleTextBoxUpdate}
                        variables={variables}
                        defaultValueFormat={'none'}
                        settings={settings}
                        onSettingsChange={onSettingsChange}
                        data={data}
                        atomId={atomId}
                        onDeleteBox={handleDeleteBox}
                        onAddElement={handleAddElement}
                        boxesInRow={layout.boxes.length}
                        isFirstElement={rowIndex === 0 && boxIndex === 0}
                        formattedGlobalFilters={getFormattedGlobalFilters()}
                      />
                    ))}
                  </div>

                  {/* Resize handle for the entire layout at the bottom */}
                  <div
                    className="absolute left-0 right-0 bottom-0 h-2 cursor-row-resize hover:bg-gray-100/50 transition-colors flex items-center justify-center"
                    style={{ zIndex: 10001 }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleResizeStart(layout.id, e.clientY, layout.height || 220);
                    }}
                    title="Drag to resize entire layout height"
                  >
                    <div className="h-0.5 w-10 bg-gray-800 rounded-full hover:bg-black transition-colors"></div>
                  </div>
                </div>
              </div>
            ))}

            {/* Add Row Section */}
            <div className="relative">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
              <div className="relative flex justify-center">
                <div className="bg-background px-6 py-1">
                  <TooltipProvider>
                    <Select 
                      key={selectKey}
                      onValueChange={(value: LayoutType) => handleSelectLayout(value)}
                    >
                      <SelectTrigger className="w-[200px] h-11 bg-card hover:bg-primary/5 border-border/60 hover:border-primary/40 shadow-[0_4px_16px_-4px_hsl(var(--foreground)/0.1)] hover:shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.2)] transition-all duration-300 rounded-xl">
                        <div className="flex items-center gap-2">
                          <Plus className="w-4 h-4 text-primary" />
                          <span className="font-medium">Add New Row</span>
                        </div>
                      </SelectTrigger>
                      <SelectContent className="shadow-[0_12px_40px_-12px_hsl(var(--foreground)/0.2)] border-border/60 rounded-xl">
                        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/40 mb-1">
                          Select Layout
                        </div>
                        {layoutOptions.map(option => (
                          <SelectItem 
                            key={option.value} 
                            value={option.value} 
                            className="cursor-pointer rounded-lg mx-1 my-0.5"
                            disabled={false}
                          >
                            <div className="flex items-center gap-4 py-1">
                              <div className="flex gap-1 p-2 bg-muted/50 rounded-md">
                                {Array.from({ length: option.columns }).map((_, i) => (
                                  <div key={i} className="w-3 h-5 bg-primary/30 rounded-sm" />
                                ))}
                              </div>
                              <span className="font-medium">{option.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Deletion Confirmation Dialog */}
      <Dialog open={showDeleteConfirmation} onOpenChange={(open) => {
        setShowDeleteConfirmation(open);
        if (!open) {
          // Reset state when dialog is closed (via Cancel, X, or clicking outside)
          setPendingDeleteLayoutId(null);
          setPendingDeleteBoxId(null);
          setDeleteType(null);
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {deleteType === 'row' ? 'Delete row?' : 'Delete element?'}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this {deleteType === 'row' ? 'row' : 'element'}? This will remove it and all its associated content. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteConfirmation(false);
                setPendingDeleteLayoutId(null);
                setPendingDeleteBoxId(null);
                setDeleteType(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteType === 'row') {
                  confirmDeleteLayout();
                } else if (deleteType === 'element') {
                  confirmDeleteBox();
                }
              }}
            >
              Yes, delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface ElementBoxProps {
  box: LayoutBox;
  layoutId: string;
  boxId: string;
  width: number;
  layoutHeight: number;
  elementTypes: { value: ElementType; label: string; icon: React.ElementType; description: string }[];
  onSelectElement: (type: ElementType) => void;
  onTextBoxUpdate: (layoutId: string, boxId: string, updates: Partial<LayoutBox>) => void;
  variables?: ConfigVariable[];
  defaultValueFormat?: 'none' | 'thousands' | 'millions' | 'billions' | 'lakhs';
  settings: KPIDashboardSettings;
  onSettingsChange: (settings: Partial<KPIDashboardSettings>) => void;
  data: KPIDashboardData | null;
  atomId: string; // CRITICAL: Required for TableElement to work correctly
  onDeleteBox: (layoutId: string, boxId: string) => void;
  onAddElement: (layoutId: string, boxId: string, position: 'left' | 'right' | 'above' | 'below') => void;
  boxesInRow: number; // Number of boxes in the current row
  isFirstElement?: boolean; // Whether this is the first element on the dashboard
  formattedGlobalFilters?: string | null; // Formatted global filters string
}

const ElementBox: React.FC<ElementBoxProps> = ({ 
  box, 
  layoutId, 
  boxId, 
  width,
  layoutHeight,
  elementTypes, 
  onSelectElement, 
  onTextBoxUpdate,
  variables = [],
  isFirstElement = false,
  formattedGlobalFilters = null,
  defaultValueFormat = 'none',
  settings,
  onSettingsChange,
  data,
  atomId,
  onDeleteBox,
  onAddElement,
  boxesInRow
}) => {
  // Multi-selection handler
  const handleBoxClick = (e: React.MouseEvent) => {
    // Don't handle selection if clicking on buttons or inputs
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) {
      return;
    }

    const selectedBoxIds = settings.selectedBoxIds || [];
    
    if (e.ctrlKey || e.metaKey) {
      // Multi-select mode
      e.stopPropagation();
      if (selectedBoxIds.includes(boxId)) {
        // Deselect
        const updated = selectedBoxIds.filter(id => id !== boxId);
        onSettingsChange({ 
          selectedBoxIds: updated.length > 0 ? updated : undefined,
          selectedBoxId: settings.selectedBoxId === boxId ? undefined : settings.selectedBoxId
        });
      } else {
        // Add to selection
        onSettingsChange({ 
          selectedBoxIds: [...selectedBoxIds, boxId],
          selectedBoxId: boxId
        });
      }
    } else {
      // Single select
      e.stopPropagation();
      onSettingsChange({ 
        selectedBoxId: boxId,
        selectedBoxIds: undefined
      });
    }
  };

  // Check if this box is selected
  const isSelected = settings.selectedBoxId === boxId;
  const isMultiSelected = settings.selectedBoxIds?.includes(boxId) || false;
  const selectionClass = isMultiSelected || isSelected 
    ? 'ring-2 ring-blue-500 ring-offset-2 bg-blue-50/30' 
    : '';
  const [isEditMode, setIsEditMode] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showTextBoxToolbar, setShowTextBoxToolbar] = useState(false);
  const [showInsightsToolbar, setShowInsightsToolbar] = useState(false);
  const [showLogoControls, setShowLogoControls] = useState(false);
  const [currentCursorStyle, setCurrentCursorStyle] = useState<TextStyleOption>(box.textStyle || 'paragraph');
  const [headingCursorStyle, setHeadingCursorStyle] = useState<TextStyleOption>('header');
  const [contentCursorStyle, setContentCursorStyle] = useState<TextStyleOption>('paragraph');
  // Q&A formatting states - Question
  const [qaQuestionBold, setQAQuestionBold] = useState(false);
  const [qaQuestionItalic, setQAQuestionItalic] = useState(false);
  const [qaQuestionUnderline, setQAQuestionUnderline] = useState(false);
  const [qaQuestionStrikethrough, setQAQuestionStrikethrough] = useState(false);
  const [qaQuestionFontSize, setQAQuestionFontSize] = useState(16);
  const [qaQuestionTextStyle, setQAQuestionTextStyle] = useState<TextStyleOption>(box.textStyle || 'paragraph');
  // Q&A formatting states - Answer
  const [qaAnswerBold, setQAAnswerBold] = useState(false);
  const [qaAnswerItalic, setQAAnswerItalic] = useState(false);
  const [qaAnswerUnderline, setQAAnswerUnderline] = useState(false);
  const [qaAnswerStrikethrough, setQAAnswerStrikethrough] = useState(false);
  const [qaAnswerFontSize, setQAAnswerFontSize] = useState(16);
  const [qaAnswerTextStyle, setQAAnswerTextStyle] = useState<TextStyleOption>(box.textStyle || 'paragraph');
  // Active Q&A field
  const [activeQAField, setActiveQAField] = useState<'question' | 'answer' | null>(null);
  // Insights formatting states
  const [insightsBold, setInsightsBold] = useState(false);
  const [insightsItalic, setInsightsItalic] = useState(false);
  const [insightsUnderline, setInsightsUnderline] = useState(false);
  const [insightsStrikethrough, setInsightsStrikethrough] = useState(false);
  const [insightsFontSize, setInsightsFontSize] = useState(16);
  const [insightsTextStyle, setInsightsTextStyle] = useState<TextStyleOption>(box.textStyle || 'paragraph');
  // Interactive Block formatting states - Box 1
  const [interactiveBlock1Bold, setInteractiveBlock1Bold] = useState(false);
  const [interactiveBlock1Italic, setInteractiveBlock1Italic] = useState(false);
  const [interactiveBlock1Underline, setInteractiveBlock1Underline] = useState(false);
  const [interactiveBlock1Strikethrough, setInteractiveBlock1Strikethrough] = useState(false);
  const [interactiveBlock1FontSize, setInteractiveBlock1FontSize] = useState(16);
  const [interactiveBlock1TextStyle, setInteractiveBlock1TextStyle] = useState<TextStyleOption>(box.textStyle || 'paragraph');
  const [showInteractiveBlock1Toolbar, setShowInteractiveBlock1Toolbar] = useState(false);
  // Interactive Block formatting states - Box 2
  const [interactiveBlock2Bold, setInteractiveBlock2Bold] = useState(false);
  const [interactiveBlock2Italic, setInteractiveBlock2Italic] = useState(false);
  const [interactiveBlock2Underline, setInteractiveBlock2Underline] = useState(false);
  const [interactiveBlock2Strikethrough, setInteractiveBlock2Strikethrough] = useState(false);
  const [interactiveBlock2FontSize, setInteractiveBlock2FontSize] = useState(16);
  const [interactiveBlock2TextStyle, setInteractiveBlock2TextStyle] = useState<TextStyleOption>(box.textStyle || 'paragraph');
  const [showInteractiveBlock2Toolbar, setShowInteractiveBlock2Toolbar] = useState(false);
  // State for icon popovers
  const [block1IconPopoverOpen, setBlock1IconPopoverOpen] = useState(false);
  const [block2IconPopoverOpen, setBlock2IconPopoverOpen] = useState(false);
  // State for bullet point color popovers
  const [block1BulletPopoverOpen, setBlock1BulletPopoverOpen] = useState(false);
  const [block2BulletPopoverOpen, setBlock2BulletPopoverOpen] = useState(false);
  const block1BulletTriggerRef = useRef<HTMLButtonElement>(null);
  const block2BulletTriggerRef = useRef<HTMLButtonElement>(null);
  // State for variable selection dialog (used for metric cards)
  const [showVariableDialog, setShowVariableDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [variableDialogPosition, setVariableDialogPosition] = useState<{ side: 'right' | 'left'; width: number; top: number }>({ side: 'right', width: 500, top: 0 });
  const metricCardRef = useRef<HTMLDivElement>(null);
  
  const textRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const qaQuestionRef = useRef<HTMLDivElement>(null);
  const qaAnswerRef = useRef<HTMLDivElement>(null);
  const isAnswerTypingRef = useRef<boolean>(false);
  const interactiveBlock1ContentRef = useRef<HTMLDivElement>(null);
  const interactiveBlock2ContentRef = useRef<HTMLDivElement>(null);
  // Image resize state and refs
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const [isImageHovered, setIsImageHovered] = useState(false);
  // Image upload state (only for image elements)
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  
  // Metric card filter state - moved to top level to avoid conditional hook calls
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [identifierOptions, setIdentifierOptions] = useState<Record<string, string[]>>({});
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({});
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [availableVariables, setAvailableVariables] = useState<any[]>([]);
  // Metric card hover state for showing/hiding editable fields
  const [isMetricCardHovered, setIsMetricCardHovered] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  
  // Chart filter state - moved to top level to avoid conditional hook calls
  const [filterEditorOpen, setFilterEditorOpen] = useState(false);
  const [uniqueValues, setUniqueValues] = useState<Record<string, string[]>>({});
  const [loadingUniqueValues, setLoadingUniqueValues] = useState(false);
  const [tempFilters, setTempFilters] = useState<Record<string, string[]>>({});
  const [expandedIdentifiers, setExpandedIdentifiers] = useState<Record<string, boolean>>({});
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  
  const selectedElement = elementTypes.find(e => e.value === box.elementType);
  
  // Calculate dropdown position and size when dialog opens (only for metric-card)
  useEffect(() => {
    // Only run this effect for metric-card elements
    if (box.elementType !== 'metric-card') return;
    
    if (showVariableDialog && metricCardRef.current) {
      const calculatePosition = () => {
        const cardElement = metricCardRef.current;
        if (!cardElement) return;

        // Find the canvas container - look for the main canvas wrapper
        // Start from the card and traverse up to find the canvas container
        let current: HTMLElement | null = cardElement.parentElement;
        let canvasContainer: HTMLElement | null = null;
        
        // Look for the grid container or layout container
        while (current && !canvasContainer) {
          const style = window.getComputedStyle(current);
          // Check if this is likely the canvas container (has grid or is the main wrapper)
          if (current.classList.contains('grid') || 
              current.style.overflow === 'visible' ||
              current.getAttribute('style')?.includes('overflow: visible')) {
            canvasContainer = current;
            break;
          }
          current = current.parentElement;
        }
        
        // Fallback to finding the main canvas wrapper or use viewport
        if (!canvasContainer) {
          canvasContainer = cardElement.closest('.h-full') as HTMLElement;
        }
        if (!canvasContainer) {
          canvasContainer = document.body;
        }

        const cardRect = cardElement.getBoundingClientRect();
        const containerRect = canvasContainer.getBoundingClientRect();
        
        // Calculate available space to the right and left within the container
        const spaceRight = containerRect.right - cardRect.right - 16; // 16px margin
        const spaceLeft = cardRect.left - containerRect.left - 16; // 16px margin
        
        // Preferred width
        const preferredWidth = 500;
        const minWidth = 350;
        const maxWidth = 600;
        
        let side: 'right' | 'left' = 'right';
        let width = preferredWidth;
        
        // Check if we have enough space on the right
        if (spaceRight >= minWidth) {
          side = 'right';
          width = Math.min(preferredWidth, spaceRight, maxWidth);
        } else if (spaceLeft >= minWidth) {
          // Use left side if right doesn't have enough space
          side = 'left';
          width = Math.min(preferredWidth, spaceLeft, maxWidth);
        } else {
          // Use whichever side has more space, but constrain to available
          if (spaceRight >= spaceLeft && spaceRight > 0) {
            side = 'right';
            width = Math.max(minWidth, Math.min(preferredWidth, spaceRight));
          } else if (spaceLeft > 0) {
            side = 'left';
            width = Math.max(minWidth, Math.min(preferredWidth, spaceLeft));
          } else {
            // If no space on either side, use minimum width and prefer right
            side = 'right';
            width = minWidth;
          }
        }

        // Calculate top position (align with card top)
        const top = 0;

        setVariableDialogPosition({ side, width, top });
      };

      // Use requestAnimationFrame to ensure DOM is updated
      const timeoutId = setTimeout(() => {
        requestAnimationFrame(calculatePosition);
      }, 0);

      // Recalculate on window resize and scroll
      window.addEventListener('resize', calculatePosition);
      window.addEventListener('scroll', calculatePosition, true);

      return () => {
        clearTimeout(timeoutId);
        window.removeEventListener('resize', calculatePosition);
        window.removeEventListener('scroll', calculatePosition, true);
      };
    } else {
      // Reset position when dialog closes
      setVariableDialogPosition({ side: 'right', width: 500, top: 0 });
    }
  }, [showVariableDialog, box.elementType]);
  
  // Track cursor position and update current style
  const updateCursorStyleFromSelection = () => {
    if (!textRef.current) return;
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const element = container.nodeType === 3 ? container.parentElement : container as HTMLElement;
    
    if (element && textRef.current.contains(element)) {
      const computedStyle = window.getComputedStyle(element);
      const fontSize = parseInt(computedStyle.fontSize);
      
      // Detect which style based on font size
      if (fontSize >= 34) {
        setCurrentCursorStyle('header');
      } else if (fontSize >= 20) {
        setCurrentCursorStyle('sub-header');
      } else {
        setCurrentCursorStyle('paragraph');
      }
    }
  };

  // Handle double-click to enter edit mode
  const handleDoubleClick = () => {
    if (box.elementType) {
      setIsEditMode(true);
    }
  };

  // When an element is selected, exit edit mode
  const handleElementChange = (value: ElementType) => {
    onSelectElement(value);
    setIsEditMode(false);
  };

  // Handle text content update
  useEffect(() => {
    if (box.elementType === 'text-box' && textRef.current && !isEditing && !box.isTextSaved) {
      const content = box.text || '';
      if (textRef.current.innerHTML !== content) {
        textRef.current.innerHTML = content;
      }
    }
  }, [box.text, box.elementType, isEditing, box.isTextSaved]);

  // Sync current cursor style with box style changes
  useEffect(() => {
    if (box.textStyle) {
      setCurrentCursorStyle(box.textStyle);
    }
  }, [box.textStyle]);

  // Initialize content HTML for insights panel, Q&A, caption, and interactive blocks
  useEffect(() => {
    if (box.elementType === 'insight-panel' && contentRef.current && box.insightsContent !== undefined && !isEditing) {
      if (contentRef.current.innerHTML !== box.insightsContent) {
        contentRef.current.innerHTML = box.insightsContent;
      }
    }
    if (box.elementType === 'interactive-blocks' && interactiveBlock1ContentRef.current && box.interactiveBlock1Content !== undefined && !isEditing) {
      if (interactiveBlock1ContentRef.current.innerHTML !== box.interactiveBlock1Content) {
        interactiveBlock1ContentRef.current.innerHTML = box.interactiveBlock1Content;
      }
    }
    if (box.elementType === 'interactive-blocks' && interactiveBlock2ContentRef.current && box.interactiveBlock2Content !== undefined && !isEditing) {
      if (interactiveBlock2ContentRef.current.innerHTML !== box.interactiveBlock2Content) {
        interactiveBlock2ContentRef.current.innerHTML = box.interactiveBlock2Content;
      }
    }
    if (box.elementType === 'caption' && contentRef.current) {
      // Only sync if we're not actively editing
      if (!isEditing && !isEditMode) {
        const currentContent = contentRef.current.innerHTML.trim();
        const savedContent = (box.captionContent || '').trim();
        // Only update if saved content exists and is different from current
        if (savedContent !== '' && currentContent !== savedContent) {
          contentRef.current.innerHTML = box.captionContent;
        } else if (savedContent === '' && currentContent === '') {
          // Ensure empty contentEditable has a br for proper editing
          if (!contentRef.current.innerHTML || contentRef.current.innerHTML.trim() === '') {
            contentRef.current.innerHTML = '<br>';
          }
        }
      }
    }
    if (box.elementType === 'qa' && qaQuestionRef.current && box.qaQuestionContent !== undefined && !isEditing) {
      if (qaQuestionRef.current.innerHTML !== box.qaQuestionContent) {
        qaQuestionRef.current.innerHTML = box.qaQuestionContent;
      }
    }
    if (box.elementType === 'qa' && qaAnswerRef.current && box.qaAnswerContent !== undefined && !isEditing && activeQAField !== 'answer' && !isAnswerTypingRef.current) {
      const savedContent = box.qaAnswerContent || '';
      const currentContent = qaAnswerRef.current.innerHTML.trim() || '';
      const savedContentTrimmed = savedContent.trim() || '';
      
      // Always sync saved content when:
      // 1. Saved content exists and is different from current (restore saved content)
      // 2. Current is empty/undefined but saved has content (initial load or reappear)
      // Don't sync if user is actively typing (handled by isAnswerTypingRef)
      if (savedContentTrimmed !== '' && (savedContentTrimmed !== currentContent || !currentContent)) {
        qaAnswerRef.current.innerHTML = savedContent;
        // CRITICAL: Re-enable contentEditable after setting innerHTML
        qaAnswerRef.current.contentEditable = 'true';
      } else if (savedContentTrimmed === '' && (currentContent === '' || !qaAnswerRef.current.innerHTML || qaAnswerRef.current.innerHTML === '<br>')) {
        // Both empty - ensure it's ready for editing
        if (qaAnswerRef.current.innerHTML && qaAnswerRef.current.innerHTML !== '') {
          qaAnswerRef.current.innerHTML = '';
        }
        // Ensure contentEditable is enabled
        qaAnswerRef.current.contentEditable = 'true';
      }
    }
  }, [box.insightsContent, box.captionContent, box.qaQuestionContent, box.qaAnswerContent, box.elementType, isEditing, activeQAField]);

  // Fix: Re-initialize Answer box editor when it becomes visible again
  // This runs when activeQAField changes to 'question' (making Answer visible) or when Answer box reappears
  useEffect(() => {
    if (box.elementType === 'qa') {
      const qaHasBeenInteracted = box.qaHasBeenInteracted ?? false;
      const qaAnswerContent = box.qaAnswerContent ?? '';
      const isAnswerVisible = !qaHasBeenInteracted || 
                              (qaAnswerContent && qaAnswerContent.trim() !== '' && qaAnswerContent !== '<br>') || 
                              activeQAField !== null;
      
      // When Answer box becomes visible (especially when reappearing), ensure it's properly initialized
      if (isAnswerVisible && qaAnswerRef.current) {
        // Use multiple animation frames to ensure DOM is fully ready
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (qaAnswerRef.current) {
                // CRITICAL: ALWAYS force contentEditable to be true
                qaAnswerRef.current.contentEditable = 'true';
                
                // Remove any attributes that might prevent editing
                qaAnswerRef.current.removeAttribute('disabled');
                qaAnswerRef.current.removeAttribute('readonly');
                qaAnswerRef.current.setAttribute('tabindex', '0');
                
                // Only sync content if we're not actively editing Answer, not typing
                if (activeQAField !== 'answer' && !isAnswerTypingRef.current && !isEditing && box.qaAnswerContent !== undefined) {
                  const savedContent = box.qaAnswerContent || '';
                  const currentContent = qaAnswerRef.current.innerHTML.trim() || '';
                  const savedContentTrimmed = savedContent.trim() || '';
                  
                  // Sync saved content when Answer box becomes visible
                  if (savedContentTrimmed !== '' && savedContentTrimmed !== currentContent) {
                    qaAnswerRef.current.innerHTML = savedContent;
                    // Re-enable contentEditable after setting innerHTML
                    qaAnswerRef.current.contentEditable = 'true';
                  } else if (savedContentTrimmed === '' && (currentContent === '' || !qaAnswerRef.current.innerHTML || qaAnswerRef.current.innerHTML === '<br>')) {
                    // Both are empty - ensure editable structure
                    qaAnswerRef.current.innerHTML = '';
                    qaAnswerRef.current.contentEditable = 'true';
                  }
                }
                
                // Force contentEditable one more time to ensure it's enabled
                qaAnswerRef.current.contentEditable = 'true';
              }
            }, 50); // Slightly longer delay to ensure DOM is ready
          });
        });
      }
    }
  }, [box.elementType, box.qaHasBeenInteracted, box.qaAnswerContent, activeQAField, isEditing]);

  // CRITICAL: Re-initialize Answer box when it becomes visible (especially when reappearing)
  useEffect(() => {
    if (box.elementType === 'qa') {
      const qaHasBeenInteracted = box.qaHasBeenInteracted ?? false;
      const qaAnswerContent = box.qaAnswerContent ?? '';
      const isAnswerVisible = !qaHasBeenInteracted || 
                              (qaAnswerContent && qaAnswerContent.trim() !== '' && qaAnswerContent !== '<br>') || 
                              activeQAField === 'answer' ||
                              activeQAField === 'question';
      
      // When Answer box becomes visible (especially when reappearing), fully initialize it
      if (isAnswerVisible && qaAnswerRef.current) {
        // Use multiple animation frames to ensure DOM is fully ready
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (qaAnswerRef.current) {
                // CRITICAL: Force contentEditable to be true - do this MULTIPLE times
                qaAnswerRef.current.contentEditable = 'true';
                qaAnswerRef.current.contentEditable = 'true'; // Force twice
                
                // Remove any attributes that might prevent editing
                qaAnswerRef.current.removeAttribute('disabled');
                qaAnswerRef.current.removeAttribute('readonly');
                qaAnswerRef.current.setAttribute('tabindex', '0');
                
                // Remove any style that might prevent editing
                qaAnswerRef.current.style.pointerEvents = 'auto';
                qaAnswerRef.current.style.userSelect = 'text';
                
                // Restore content if needed (but don't overwrite if user is typing)
                if (!isAnswerTypingRef.current && box.qaAnswerContent && box.qaAnswerContent.trim() !== '' && box.qaAnswerContent !== '<br>') {
                  const currentContent = qaAnswerRef.current.innerHTML.trim() || '';
                  if (currentContent === '' || currentContent === '<br>') {
                    qaAnswerRef.current.innerHTML = box.qaAnswerContent;
                  }
                }
                
                // Force contentEditable multiple times to ensure it sticks
                qaAnswerRef.current.contentEditable = 'true';
                
                // Final verification - log if still not editable (for debugging)
                if (qaAnswerRef.current.contentEditable !== 'true') {
                  console.warn('⚠️ Answer box contentEditable is not true after initialization!');
                  // Force it one more time
                  qaAnswerRef.current.setAttribute('contenteditable', 'true');
                }
              }
            }, 50); // Shorter delay for faster response
          });
        });
      }
    }
  }, [box.elementType, box.qaHasBeenInteracted, box.qaAnswerContent, activeQAField]);

  // CRITICAL: Additional effect specifically for when Answer box reappears after Question is clicked
  // This ensures Answer is ready to edit when switching from Question to Answer
  useEffect(() => {
    if (box.elementType === 'qa' && activeQAField === 'question' && qaAnswerRef.current) {
      // Answer box just became visible because Question was clicked
      // Prepare it for immediate editing
      const initializeForEditing = () => {
        if (qaAnswerRef.current) {
          qaAnswerRef.current.contentEditable = 'true';
          qaAnswerRef.current.removeAttribute('disabled');
          qaAnswerRef.current.removeAttribute('readonly');
          qaAnswerRef.current.setAttribute('tabindex', '0');
          qaAnswerRef.current.style.pointerEvents = 'auto';
          qaAnswerRef.current.style.userSelect = 'text';
        }
      };
      
      // Initialize immediately
      initializeForEditing();
      
      // Also initialize after a short delay to ensure it's ready
      const timeout = setTimeout(initializeForEditing, 100);
      return () => clearTimeout(timeout);
    }
  }, [box.elementType, activeQAField]);

  // Image resize effect - only active when resizing an image element
  useEffect(() => {
    if (!isResizing || box.elementType !== 'image') return;

    const handleMouseMove = (e: MouseEvent) => {
      if (imageRef.current) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;
        
        // Calculate new dimensions maintaining aspect ratio
        const aspectRatio = resizeStart.width / resizeStart.height;
        let newWidth = resizeStart.width + deltaX;
        let newHeight = resizeStart.height + deltaY;
        
        // Maintain aspect ratio based on which dimension changed more
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          newHeight = newWidth / aspectRatio;
        } else {
          newWidth = newHeight * aspectRatio;
        }
        
        // Update image dimensions
        imageRef.current.style.width = `${newWidth}px`;
        imageRef.current.style.height = `${newHeight}px`;
      }
    };

    const handleMouseUp = () => {
      if (imageRef.current && isResizing) {
        const finalWidth = imageRef.current.style.width;
        const finalHeight = imageRef.current.style.height;
        onTextBoxUpdate(layoutId, boxId, {
          imageWidth: finalWidth,
          imageHeight: finalHeight,
        });
      }
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStart, layoutId, boxId, onTextBoxUpdate, box.elementType]);

  // Fetch filter options for metric cards when variable is selected or filter menu opens
  useEffect(() => {
    // Only run for metric cards
    if (box.elementType !== 'metric-card') {
      return;
    }

    const variableKey = box.variableNameKey || box.variableName;
    
    if (!variableKey) {
      setIdentifierOptions({});
      setSelectedFilters({});
      setAvailableVariables([]);
      return;
    }
    
    // Fetch options when variable is available (will be used when menu opens)
    
    const fetchVariableOptions = async () => {
      setLoadingFilters(true);
      try {
        const projectContext = getActiveProjectContext();
        if (!projectContext) return;

        const params = new URLSearchParams({
          clientId: projectContext.client_name,
          appId: projectContext.app_name,
          projectId: projectContext.project_name,
        });

        const response = await fetch(`${LABORATORY_API}/variables?${params.toString()}`, {
          credentials: 'include',
        });

        if (response.ok) {
          const result = await response.json();
          if (result.variables && Array.isArray(result.variables)) {
            const currentKey = box.variableNameKey || box.variableName || '';
            const currentKeyParts = currentKey.split('_');
            const basePattern = currentKeyParts.slice(0, 2).join('_');
            
            const relatedVariables = result.variables.filter((v: any) => {
              const vKey = v.variableNameKey || v.variableName;
              if (!vKey) return false;
              return vKey.startsWith(basePattern + '_') || vKey === basePattern;
            });
            
            setAvailableVariables(relatedVariables);
            
            // Parse identifiers from current variable
            const currentVariableIdentifiers: Set<string> = new Set();
            if (currentKey) {
              const parts = currentKey.split('_');
              const identifierTypes = ['brand', 'channel', 'year', 'month', 'week', 'region', 'category', 'segment'];
              
              let i = 2;
              while (i < parts.length) {
                const key = parts[i].toLowerCase();
                if (identifierTypes.includes(key) && i + 1 < parts.length) {
                  currentVariableIdentifiers.add(key);
                  let nextIndex = i + 2;
                  while (nextIndex < parts.length) {
                    const nextPart = parts[nextIndex].toLowerCase();
                    if (!identifierTypes.includes(nextPart)) {
                      nextIndex++;
                    } else {
                      break;
                    }
                  }
                  i = nextIndex;
                } else {
                  i++;
                }
              }
            }
            
            // Parse identifier values from all related variables
            const identifierMap: Record<string, Set<string>> = {};
            relatedVariables.forEach((v: any) => {
              const vKey = v.variableNameKey || v.variableName;
              if (vKey) {
                const parts = vKey.split('_');
                const identifierTypes = ['brand', 'channel', 'year', 'month', 'week', 'region', 'category', 'segment'];
                
                let i = 2;
                while (i < parts.length) {
                  const key = parts[i].toLowerCase();
                  if (identifierTypes.includes(key) && currentVariableIdentifiers.has(key) && i + 1 < parts.length) {
                    let value = parts[i + 1];
                    let nextIndex = i + 2;
                    while (nextIndex < parts.length) {
                      const nextPart = parts[nextIndex].toLowerCase();
                      if (!identifierTypes.includes(nextPart)) {
                        value += '_' + parts[nextIndex];
                        nextIndex++;
                      } else {
                        break;
                      }
                    }
                    if (!identifierMap[key]) {
                      identifierMap[key] = new Set();
                    }
                    identifierMap[key].add(value);
                    i = nextIndex;
                  } else {
                    i++;
                  }
                }
              }
            });
            
            const options: Record<string, string[]> = {};
            currentVariableIdentifiers.forEach(key => {
              if (identifierMap[key]) {
                options[key] = Array.from(identifierMap[key]).sort();
              }
            });
            
            setIdentifierOptions(options);
            
            // Set initial filter values from current variable
            if (currentKey) {
              const parts = currentKey.split('_');
              const currentFilters: Record<string, string> = {};
              const identifierTypes = ['brand', 'channel', 'year', 'month', 'week', 'region', 'category', 'segment'];
              
              let i = 2;
              while (i < parts.length) {
                const key = parts[i].toLowerCase();
                if (identifierTypes.includes(key) && currentVariableIdentifiers.has(key) && i + 1 < parts.length) {
                  let value = parts[i + 1];
                  let nextIndex = i + 2;
                  while (nextIndex < parts.length) {
                    const nextPart = parts[nextIndex].toLowerCase();
                    if (!identifierTypes.includes(nextPart)) {
                      value += '_' + parts[nextIndex];
                      nextIndex++;
                    } else {
                      break;
                    }
                  }
                  if (options[key]) {
                    currentFilters[key] = value;
                  }
                  i = nextIndex;
                } else {
                  i++;
                }
              }
              setSelectedFilters(currentFilters);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch variable options:', error);
      } finally {
        setLoadingFilters(false);
      }
    };

    fetchVariableOptions();
  }, [box.elementType, box.variableNameKey, box.variableName, filterMenuOpen]);

  // Fetch unique values for chart filter columns
  useEffect(() => {
    // Only run for charts
    if (box.elementType !== 'chart') {
      return;
    }

    if (!filterEditorOpen) return;

    // Parse chartConfig if it's a string (from MongoDB)
    let chartConfig: any = undefined;
    if (box.chartConfig) {
      if (typeof box.chartConfig === 'string') {
        try {
          chartConfig = JSON.parse(box.chartConfig);
        } catch (e) {
          console.error('Failed to parse chartConfig:', e);
          return;
        }
      } else {
        chartConfig = box.chartConfig;
      }
    }

    if (!chartConfig || !data) return;

    const fetchUniqueValues = async () => {
      setLoadingUniqueValues(true);
      try {
        const dataSource = (settings as any).selectedFile || (settings as any).dataSource;
        let objectName = dataSource || data.fileName;
        
        if (!objectName) {
          setLoadingUniqueValues(false);
          return;
        }

        if (!objectName.endsWith('.arrow')) {
          objectName += '.arrow';
        }

        const uploadResponse = await chartMakerApi.loadSavedDataframe(objectName);
        const fileId = uploadResponse.file_id;

        // Get all columns
        const allColumnsResponse = await chartMakerApi.getAllColumns(fileId);
        const allColumns = allColumnsResponse.columns || [];

        // Get unique values for all columns
        const uniqueValuesResponse = await chartMakerApi.getUniqueValues(fileId, allColumns);
        setUniqueValues(uniqueValuesResponse.values || {});
      } catch (error) {
        console.error('Error fetching unique values:', error);
      } finally {
        setLoadingUniqueValues(false);
      }
    };

    fetchUniqueValues();
    
    // Initialize temp filters with current filters
    const chartFilters = chartConfig?.filters || {};
    const currentFilters: Record<string, string[]> = {};
    Object.entries(chartFilters).forEach(([key, values]) => {
      currentFilters[key] = Array.isArray(values) ? values : [values];
    });
    setTempFilters(currentFilters);
  }, [box.elementType, box.chartConfig, filterEditorOpen, data, settings]);

  // Initialize expanded state for first few identifiers when filter editor opens
  useEffect(() => {
    if (!filterEditorOpen || box.elementType !== 'chart' || !data) return;
    
    const getFilterableColumns = () => {
      if (!data || !data.headers) return [];
      const chartConfig = box.chartConfig ? (typeof box.chartConfig === 'string' ? JSON.parse(box.chartConfig) : box.chartConfig) : null;
      if (!chartConfig) return [];
      const xAxis = chartConfig?.xAxis;
      const yAxis = chartConfig?.yAxis;
      return (data.headers as string[]).filter((col: string) => col !== xAxis && col !== yAxis);
    };
    
    const filterableColumns = getFilterableColumns();
    const newExpanded: Record<string, boolean> = {};
    filterableColumns.slice(0, 3).forEach(col => {
      if (expandedIdentifiers[col] === undefined) {
        newExpanded[col] = true;
      }
    });
    if (Object.keys(newExpanded).length > 0) {
      setExpandedIdentifiers(prev => ({ ...prev, ...newExpanded }));
    }
  }, [filterEditorOpen, box.elementType, box.chartConfig, data, expandedIdentifiers]);

  // If element is selected and NOT in edit mode, show the full element
  if (box.elementType && !isEditMode) {
    // Special handling for text-box - show editable interface with full toolbar
    if (box.elementType === 'text-box') {
      const handleTextInput = () => {
        if (textRef.current) {
          onTextBoxUpdate(layoutId, boxId, { text: textRef.current.innerHTML });
        }
      };

      const handleStyleChange = (style: TextStyleOption) => {
        const styleProps = getTextStyleProperties(style);
        onTextBoxUpdate({
          textStyle: style,
          ...styleProps
        });
      };

      const handleApplyTextStyle = (preset: TextStylePreset) => {
        onTextBoxUpdate({
          fontSize: preset.fontSize,
          bold: preset.bold || false,
          italic: preset.italic || false,
          underline: preset.underline || false,
          strikethrough: preset.strikethrough || false,
        });
      };

      const handleSave = () => {
        onTextBoxUpdate({ isTextSaved: true });
      };

      const handleEdit = () => {
        onTextBoxUpdate({ isTextSaved: false });
      };

      // Preview mode - show only the formatted text (no header, no buttons)
      if (box.isTextSaved) {
        return (
          <div 
            className={`relative group/box ${selectionClass}`}
            style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column' }}
            onDoubleClick={handleEdit}
            onClick={handleBoxClick}
            title="Double-click to edit, Ctrl+Click to multi-select"
          >
            {/* Three-dots menu - visible on hover */}
            <ElementMenuDropdown
              elementTypes={elementTypes}
              onElementChange={handleElementChange}
              boxId={boxId}
              layoutId={layoutId}
              onDeleteBox={onDeleteBox}
              onAddElement={onAddElement}
              selectedBoxIds={settings.selectedBoxIds}
              boxesInRow={boxesInRow}
            />
            <div className="relative w-full flex-1 rounded-xl overflow-hidden bg-white">
              {/* Display formatted text only - no borders, no headers */}
              <div 
                className="w-full h-full p-4 overflow-auto cursor-pointer hover:bg-gray-50/50 transition-colors"
                style={{
                  fontSize: `${box.fontSize || 18}px`,
                  fontFamily: box.fontFamily || 'DM Sans, sans-serif',
                  fontWeight: (box.bold || box.textStyle === 'header' || box.textStyle === 'sub-header') ? 'bold' : 'normal',
                  fontStyle: box.italic ? 'italic' : 'normal',
                  textDecoration: `${box.underline ? 'underline' : ''} ${box.strikethrough ? 'line-through' : ''}`.trim(),
                  textAlign: box.align || 'left',
                  color: box.color || (box.textStyle === 'paragraph' ? '#6B7280' : '#111827'),
                  backgroundColor: box.backgroundColor || 'transparent',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  letterSpacing: '-0.01em',
                  lineHeight: '1.2',
                }}
                dangerouslySetInnerHTML={{ __html: box.text || 'No text entered' }}
              />
            </div>
            {/* Global Filters Display - Below Text Box on Right (when first element) */}
            {isFirstElement && formattedGlobalFilters && (
              <div className="w-full flex justify-end mt-2 pr-4">
                <div 
                  className="text-gray-600"
                  style={{
                    fontSize: '22px',
                    fontFamily: 'DM Sans, sans-serif',
                    fontWeight: 'bold',
                    letterSpacing: '-0.01em',
                    lineHeight: '1.2'
                  }}
                >
                  {formattedGlobalFilters}
                </div>
              </div>
            )}
          </div>
        );
      }
      
      // Edit mode - toolbar HOVERING above, text box separate below
      
      // Helper functions for selection-based formatting
      const applyFormatToSelection = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        handleTextInput(); // Save changes
      };

      // Get default size based on current style
      const getDefaultSizeForStyle = (style?: TextStyleOption): number => {
        switch (style) {
          case 'header': return 36;
          case 'sub-header': return 22;
          case 'paragraph': return 18;
          default: return 18;
        }
      };

      const handleStyleChangeForSelection = (style: TextStyleOption) => {
        const defaultSize = getDefaultSizeForStyle(style);
        const defaultColor = style === 'paragraph' ? '#6B7280' : '#111827';
        const isBold = style === 'header' || style === 'sub-header';
        
        console.log('Style changed to:', style, 'Size:', defaultSize, 'Bold:', isBold);
        
        // Update the current cursor style
        setCurrentCursorStyle(style);
        
        // Update the default style for new text
        onTextBoxUpdate({ 
          textStyle: style,
          fontSize: defaultSize,
          color: defaultColor,
          bold: isBold
        });
        
        // Focus the text editor and apply style at cursor position
        if (textRef.current) {
          textRef.current.focus();
          
          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0) return;
          
          // If there's selected text, apply formatting to it
          if (selection.toString()) {
            // Wrap selected text in a span with the new style
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.style.fontSize = `${defaultSize}px`;
            span.style.color = defaultColor;
            span.style.fontWeight = isBold ? 'bold' : 'normal';
            span.style.fontFamily = 'DM Sans, sans-serif';
            span.style.letterSpacing = '-0.01em';
            span.style.lineHeight = '1.2';
            
            const fragment = range.extractContents();
            span.appendChild(fragment);
            range.insertNode(span);
            
            // Move cursor to end of span
            const newRange = document.createRange();
            newRange.setStartAfter(span);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          } else {
            // No selection, just cursor - insert a styled span for upcoming text
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.style.fontSize = `${defaultSize}px`;
            span.style.color = defaultColor;
            span.style.fontWeight = isBold ? 'bold' : 'normal';
            span.style.fontFamily = 'DM Sans, sans-serif';
            span.style.letterSpacing = '-0.01em';
            span.style.lineHeight = '1.2';
            span.setAttribute('data-style', style);
            span.innerHTML = '&nbsp;'; // Non-breaking space to hold the style
            
            range.insertNode(span);
            
            // Move cursor inside the span
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            newRange.collapse(false);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
          
          handleTextInput();
        }
      };

      const currentDefaultSize = getDefaultSizeForStyle(box.textStyle);
      
      return (
        <div 
          className={`relative group/box ${selectionClass}`}
          onClick={handleBoxClick} 
          style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column' }}
        >
          {/* Three-dots menu - visible on hover */}
          <ElementMenuDropdown
            elementTypes={elementTypes}
            onElementChange={handleElementChange}
            boxId={boxId}
            layoutId={layoutId}
            onDeleteBox={onDeleteBox}
            onAddElement={onAddElement}
            selectedBoxIds={settings.selectedBoxIds}
            boxesInRow={boxesInRow}
          />
          {/* Toolbar - visible only when text box is focused */}
          {showTextBoxToolbar && (
            <div className="absolute left-0 right-0 flex items-center gap-2 bg-white rounded-lg shadow-2xl p-2 border border-gray-200" style={{ top: '-76px', zIndex: 10000 }} onMouseDown={(e) => e.preventDefault()}>
            <div className="flex-1 overflow-x-auto">
              <TextBoxToolbar
                textStyle={currentCursorStyle}
                onTextStyleChange={handleStyleChangeForSelection}
                fontFamily={box.fontFamily || 'DM Sans'}
                onFontFamilyChange={(font) => applyFormatToSelection('fontName', font)}
                fontSize={box.fontSize || currentDefaultSize}
                onIncreaseFontSize={() => {
                  const selection = window.getSelection();
                  if (selection && selection.toString()) {
                    // If text is selected, increase size of selection
                    const currentSize = parseInt(window.getComputedStyle(selection.anchorNode?.parentElement || document.body).fontSize) || currentDefaultSize;
                    applyFormatToSelection('fontSize', `${currentSize + 1}px`);
                  } else {
                    // Manually increase from current size
                    onTextBoxUpdate({ fontSize: (box.fontSize || currentDefaultSize) + 1 });
                  }
                }}
                onDecreaseFontSize={() => {
                  const selection = window.getSelection();
                  if (selection && selection.toString()) {
                    // If text is selected, decrease size of selection
                    const currentSize = parseInt(window.getComputedStyle(selection.anchorNode?.parentElement || document.body).fontSize) || currentDefaultSize;
                    applyFormatToSelection('fontSize', `${Math.max(currentSize - 1, 8)}px`);
                  } else {
                    // Manually decrease from current size
                    onTextBoxUpdate({ fontSize: Math.max((box.fontSize || currentDefaultSize) - 1, 8) });
                  }
                }}
                onApplyTextStyle={handleApplyTextStyle}
                bold={box.bold || false}
                italic={box.italic || false}
                underline={box.underline || false}
                strikethrough={box.strikethrough || false}
                onToggleBold={() => applyFormatToSelection('bold')}
                onToggleItalic={() => applyFormatToSelection('italic')}
                onToggleUnderline={() => applyFormatToSelection('underline')}
                onToggleStrikethrough={() => applyFormatToSelection('strikeThrough')}
                align={box.align || 'left'}
                onAlign={(align) => {
                  applyFormatToSelection('justify' + (align === 'left' ? 'Left' : align === 'center' ? 'Center' : 'Right'));
                }}
                color={box.color || '#111827'}
                onColorChange={(color) => applyFormatToSelection('foreColor', color)}
                backgroundColor={box.backgroundColor || 'transparent'}
                onBackgroundColorChange={(backgroundColor) => applyFormatToSelection('backColor', backgroundColor)}
                onDelete={handleDoubleClick}
              />
            </div>
            </div>
          )}
          
          {/* Text box ONLY - no border, completely separate from toolbar */}
          <div className="w-full flex-1 rounded-xl overflow-hidden bg-white relative">
            {/* Custom formatted placeholder - only showing Header and Sub-Header styles */}
            {(!box.text || box.text === '') && (
              <div className="absolute inset-0 p-4 pointer-events-none">
                <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#111827', fontFamily: 'DM Sans', marginBottom: '4px', letterSpacing: '-0.02em', lineHeight: '1.1' }}>
                  For your title, select Header in the formatting options
                </div>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#111827', fontFamily: 'DM Sans', marginBottom: '6px', letterSpacing: '-0.01em', lineHeight: '1.2' }}>
                  If you want a sub-header, select Sub Header in the options
                </div>
                <div style={{ fontSize: '16px', fontWeight: 'normal', color: '#6B7280', fontFamily: 'DM Sans', letterSpacing: '-0.01em', lineHeight: '1.5' }}>
                  For your primary context, select Paragraph. And yes, these are the only 3 font size options for now.
                </div>
              </div>
            )}
            
            <div 
              ref={textRef}
              contentEditable
              className="kpi-text-editor w-full h-full p-4 overflow-auto outline-none cursor-text relative z-10"
              style={{
                fontFamily: box.fontFamily || 'DM Sans, sans-serif',
                backgroundColor: box.backgroundColor || 'transparent',
                minHeight: '50px',
                letterSpacing: '-0.01em',
                lineHeight: '1.2',
              }}
              onInput={handleTextInput}
              onFocus={(e) => {
                setIsEditing(true);
                setShowTextBoxToolbar(true);
              }}
              onBlur={(e) => {
                const relatedTarget = e.relatedTarget as HTMLElement;
                if (!relatedTarget || !relatedTarget.closest('[data-text-toolbar-root]')) {
                  setIsEditing(false);
                  setShowTextBoxToolbar(false);
                }
              }}
              onClick={updateCursorStyleFromSelection}
              onKeyUp={updateCursorStyleFromSelection}
              onKeyDown={(e) => {
                // Apply current style to new text being typed
                if (e.key.length === 1 || e.key === 'Enter') {
                  const selection = window.getSelection();
                  if (!selection || selection.rangeCount === 0) return;
                  
                  const range = selection.getRangeAt(0);
                  const container = range.commonAncestorContainer;
                  
                  // Check if we're typing in an unstyled area
                  if (container === textRef.current || (container.parentElement === textRef.current && container.nodeType === 3)) {
                    // We're in the root, need to apply styling
                    setTimeout(() => {
                      const sel = window.getSelection();
                      if (!sel || sel.rangeCount === 0) return;
                      
                      const r = sel.getRangeAt(0);
                      const node = r.commonAncestorContainer;
                      
                      if (node.nodeType === 3 && node.parentElement === textRef.current) {
                        // Wrap the text node in a styled span
                        const span = document.createElement('span');
                        const styleToUse = box.textStyle || 'paragraph';
                        const size = getDefaultSizeForStyle(styleToUse);
                        const color = styleToUse === 'paragraph' ? '#6B7280' : '#111827';
                        const bold = styleToUse === 'header' || styleToUse === 'sub-header';
                        
                        span.style.fontSize = `${size}px`;
                        span.style.color = color;
                        span.style.fontWeight = bold ? 'bold' : 'normal';
                        span.style.fontFamily = 'DM Sans, sans-serif';
                        span.style.letterSpacing = '-0.01em';
                        span.style.lineHeight = '1.2';
                        
                        const parent = node.parentElement;
                        if (parent) {
                          parent.insertBefore(span, node);
                          span.appendChild(node);
                        }
                        
                        handleTextInput();
                      }
                    }, 10);
                  }
                }
              }}
              suppressContentEditableWarning
            />
          </div>
          {/* Global Filters Display - Below Text Box on Right (when first element) */}
          {isFirstElement && formattedGlobalFilters && (
            <div className="w-full flex justify-end mt-2 pr-4">
              <div 
                className="text-gray-600"
                style={{
                  fontSize: '22px',
                  fontFamily: 'DM Sans, sans-serif',
                  fontWeight: 'bold',
                  letterSpacing: '-0.01em',
                  lineHeight: '1.2'
                }}
              >
                {formattedGlobalFilters}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Special handling for insight-panel - editable heading and content with bullets
    if (box.elementType === 'insight-panel') {
      // Ensure default values are set
      const insightsHeading = box.insightsHeading ?? 'KEY INSIGHTS';
      const insightsContent = box.insightsContent ?? '';
      const isInsightsSaved = box.isInsightsSaved ?? false;
      const backgroundColor = box.backgroundColor || 'linear-gradient(135deg, #EBF4FF 0%, #E0F2FE 50%, #DBEAFE 100%)';
      const contentFontFamily = box.fontFamily || 'DM Sans';

      const handleContentInput = () => {
        if (contentRef.current) {
          onTextBoxUpdate({ insightsContent: contentRef.current.innerHTML });
        }
      };

      const handleSaveInsights = () => {
        onTextBoxUpdate({ isInsightsSaved: true });
      };

      const handleEditInsights = () => {
        onTextBoxUpdate({ isInsightsSaved: false });
      };

      // EXACT same format apply as text-box
      // Update toolbar state based on cursor position
      const updateInsightsFormatState = () => {
        if (!contentRef.current) return;
        
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        
        const range = selection.getRangeAt(0);
        const element = range.commonAncestorContainer.nodeType === 3 
          ? range.commonAncestorContainer.parentElement 
          : range.commonAncestorContainer as HTMLElement;
        
        if (element && contentRef.current.contains(element)) {
          const computedStyle = window.getComputedStyle(element);
          
          // Update font size
          const fontSize = parseInt(computedStyle.fontSize) || 16;
          setInsightsFontSize(fontSize);
          
          // Detect text style based on font size (same as text-box)
          if (fontSize >= 34) {
            setInsightsTextStyle('header');
          } else if (fontSize >= 20) {
            setInsightsTextStyle('sub-header');
          } else {
            setInsightsTextStyle('paragraph');
          }
          
          // Update bold
          const fontWeight = computedStyle.fontWeight;
          setInsightsBold(fontWeight === 'bold' || fontWeight === '700' || parseInt(fontWeight) >= 600);
          
          // Update italic
          setInsightsItalic(computedStyle.fontStyle === 'italic');
          
          // Update underline and strikethrough
          const textDecoration = computedStyle.textDecoration;
          setInsightsUnderline(textDecoration.includes('underline'));
          setInsightsStrikethrough(textDecoration.includes('line-through'));
        }
      };

      const applyFormatToContent = (command: string, value?: string) => {
        // Ensure content is focused before executing command
        if (contentRef.current) {
          contentRef.current.focus();
        }
        document.execCommand(command, false, value);
        handleContentInput(); // Save changes immediately
        // Update toolbar state after formatting
        setTimeout(updateInsightsFormatState, 10);
      };

      // Get current font size for the toolbar display
      const getCurrentContentSize = (): number => {
        return insightsFontSize;
      };

      // Get default size based on style - same as text-box
      const getDefaultSizeForInsightsStyle = (style?: TextStyleOption): number => {
        switch (style) {
          case 'header': return 36;
          case 'sub-header': return 22;
          case 'paragraph': return 18;
          default: return 18;
        }
      };

      // Handle style change for Insights - EXACT same as text-box
      const handleInsightsStyleChangeForSelection = (style: TextStyleOption) => {
        const defaultSize = getDefaultSizeForInsightsStyle(style);
        const defaultColor = style === 'paragraph' ? '#6B7280' : '#111827';
        const isBold = style === 'header' || style === 'sub-header';
        
        // Update the current cursor style
        setInsightsTextStyle(style);
        setInsightsFontSize(defaultSize);
        setInsightsBold(isBold);
        
        // Update the default style for new text
        onTextBoxUpdate({ 
          textStyle: style,
          fontSize: defaultSize,
          color: defaultColor,
          bold: isBold
        });
        
        // Focus the text editor and apply style at cursor position
        if (contentRef.current) {
          contentRef.current.focus();
          
          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0) return;
          
          // If there's selected text, apply formatting to it
          if (selection.toString()) {
            // Wrap selected text in a span with the new style
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.style.fontSize = `${defaultSize}px`;
            span.style.color = defaultColor;
            span.style.fontWeight = isBold ? 'bold' : 'normal';
            span.style.fontFamily = `${contentFontFamily}, sans-serif`;
            span.style.letterSpacing = '-0.01em';
            span.style.lineHeight = '1.2';
            
            const fragment = range.extractContents();
            span.appendChild(fragment);
            range.insertNode(span);
            
            // Move cursor to end of span
            const newRange = document.createRange();
            newRange.setStartAfter(span);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          } else {
            // No selection, just cursor - insert a styled span for upcoming text
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.style.fontSize = `${defaultSize}px`;
            span.style.color = defaultColor;
            span.style.fontWeight = isBold ? 'bold' : 'normal';
            span.style.fontFamily = `${contentFontFamily}, sans-serif`;
            span.style.letterSpacing = '-0.01em';
            span.style.lineHeight = '1.2';
            span.setAttribute('data-style', style);
            span.innerHTML = '&nbsp;'; // Non-breaking space to hold the style
            
            range.insertNode(span);
            
            // Move cursor inside the span
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            newRange.collapse(false);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
          
          handleContentInput();
          setTimeout(updateInsightsFormatState, 10);
        }
      };


      // Preview mode - show only formatted insights
      if (isInsightsSaved) {
        return (
          <div 
            className={`relative group/box ${selectionClass}`}
          onClick={handleBoxClick} 
            style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}
            onDoubleClick={handleEditInsights}
            title="Double-click to edit"
          >
            <div 
              className="relative w-full h-full rounded-xl overflow-hidden p-6 shadow-md border border-blue-200"
              style={{
                background: backgroundColor
              }}
            >
              {/* Icon and Heading */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center shadow-md">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div 
                  style={{
                    fontSize: '22px',
                    fontWeight: 'bold',
                    color: '#1E40AF',
                    fontFamily: 'DM Sans, sans-serif',
                    letterSpacing: '0.05em',
                  }}
                  dangerouslySetInnerHTML={{ __html: insightsHeading || 'KEY INSIGHTS' }}
                />
              </div>

              {/* Content with bullets */}
              <div 
                style={{
                  fontSize: '16px',
                  color: '#111827',
                  fontFamily: 'DM Sans, sans-serif',
                  lineHeight: '1.6',
                }}
                dangerouslySetInnerHTML={{ __html: insightsContent || '<p>Put your insights here</p>' }}
              />
            </div>
          </div>
        );
      }

      // Edit mode - show editable heading and content
      return (
        <div 
          className="relative group/box flex flex-col gap-3" 
          style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}
        >
          {/* Three-dots menu - visible on hover */}
          <ElementMenuDropdown
            elementTypes={elementTypes}
            onElementChange={handleElementChange}
            boxId={boxId}
            layoutId={layoutId}
            onDeleteBox={onDeleteBox}
            onAddElement={onAddElement}
            selectedBoxIds={settings.selectedBoxIds}
            boxesInRow={boxesInRow}
          />

          {/* Toolbar - visible only when content is focused */}
          {showInsightsToolbar && (
            <div className="absolute left-0 right-0 flex flex-col gap-2" style={{ top: '-76px', zIndex: 10000 }} onMouseDown={(e) => e.preventDefault()}>
              {/* Formatting toolbar with background color included */}
              <div className="flex items-center gap-2 bg-white rounded-lg shadow-xl p-2 border border-gray-200">
                <div className="flex-1 overflow-x-auto">
                <TextBoxToolbar
                  textStyle={insightsTextStyle}
                  onTextStyleChange={handleInsightsStyleChangeForSelection}
                  fontFamily={contentFontFamily}
                  onFontFamilyChange={(font) => {
                    applyFormatToContent('fontName', font);
                    onTextBoxUpdate({ fontFamily: font });
                  }}
                    fontSize={insightsFontSize}
                    onIncreaseFontSize={() => {
                      const selection = window.getSelection();
                      if (selection && selection.toString()) {
                        const currentSize = parseInt(window.getComputedStyle(selection.anchorNode?.parentElement || document.body).fontSize) || insightsFontSize;
                        applyFormatToContent('fontSize', `${currentSize + 1}px`);
                      } else {
                        const newSize = insightsFontSize + 1;
                        setInsightsFontSize(newSize);
                        if (contentRef.current) {
                          contentRef.current.focus();
                          document.execCommand('fontSize', false, '7');
                          const fontElements = contentRef.current.querySelectorAll('font[size="7"]');
                          fontElements.forEach((el) => {
                            const span = document.createElement('span');
                            span.style.fontSize = `${newSize}px`;
                            span.innerHTML = el.innerHTML;
                            el.replaceWith(span);
                          });
                          handleContentInput();
                        }
                      }
                    }}
                    onDecreaseFontSize={() => {
                      const selection = window.getSelection();
                      if (selection && selection.toString()) {
                        const currentSize = parseInt(window.getComputedStyle(selection.anchorNode?.parentElement || document.body).fontSize) || insightsFontSize;
                        applyFormatToContent('fontSize', `${Math.max(currentSize - 1, 8)}px`);
                      } else {
                        const newSize = Math.max(insightsFontSize - 1, 8);
                        setInsightsFontSize(newSize);
                        if (contentRef.current) {
                          contentRef.current.focus();
                          document.execCommand('fontSize', false, '7');
                          const fontElements = contentRef.current.querySelectorAll('font[size="7"]');
                          fontElements.forEach((el) => {
                            const span = document.createElement('span');
                            span.style.fontSize = `${newSize}px`;
                            span.innerHTML = el.innerHTML;
                            el.replaceWith(span);
                          });
                          handleContentInput();
                        }
                      }
                    }}
                    onApplyTextStyle={() => {}}
                    bold={insightsBold}
                    italic={insightsItalic}
                    underline={insightsUnderline}
                    strikethrough={insightsStrikethrough}
                    onToggleBold={() => applyFormatToContent('bold')}
                    onToggleItalic={() => applyFormatToContent('italic')}
                    onToggleUnderline={() => applyFormatToContent('underline')}
                    onToggleStrikethrough={() => applyFormatToContent('strikeThrough')}
                    align="left"
                    onAlign={(align) => applyFormatToContent('justify' + (align === 'left' ? 'Left' : align === 'center' ? 'Center' : 'Right'))}
                    onBulletedList={() => applyFormatToContent('insertUnorderedList')}
                    onNumberedList={() => applyFormatToContent('insertOrderedList')}
                    color="#111827"
                    onColorChange={(color) => applyFormatToContent('foreColor', color)}
                    backgroundColor={backgroundColor}
                    onBackgroundColorChange={(bg) => onTextBoxUpdate({ backgroundColor: bg })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Insights Panel Card */}
          <div className="relative w-full flex-1" style={{ minHeight: 0 }}>
            <div 
              className="w-full h-full rounded-xl overflow-hidden p-6 shadow-lg border-2 border-blue-300"
              style={{
                background: backgroundColor
              }}
            >
              {/* Icon and Simple Heading */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center shadow-md shrink-0">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <input
                  type="text"
                  value={insightsHeading}
                  onChange={(e) => onTextBoxUpdate({ insightsHeading: e.target.value })}
                  className="flex-1 outline-none cursor-text bg-transparent border-none"
                  style={{
                    fontSize: '22px',
                    fontWeight: 'bold',
                    color: '#1E40AF',
                    fontFamily: 'DM Sans, sans-serif',
                    letterSpacing: '0.05em',
                  }}
                  placeholder="KEY INSIGHTS"
                />
              </div>

              {/* Editable Content with Blue Tick Bullets */}
              <div className="relative">
                <div 
                  ref={contentRef}
                  contentEditable
                  className="outline-none cursor-text relative z-10"
                  style={{
                    fontFamily: `${contentFontFamily}, sans-serif`,
                    backgroundColor: 'transparent',
                    minHeight: '50px',
                    fontSize: '16px',
                    lineHeight: '1.8',
                  }}
                  onInput={handleContentInput}
                  onFocus={() => {
                    setIsEditing(true);
                    setShowInsightsToolbar(true);
                    updateInsightsFormatState();
                  }}
                  onBlur={(e) => {
                    const relatedTarget = e.relatedTarget as HTMLElement;
                    if (!relatedTarget || !relatedTarget.closest('[data-text-toolbar-root]')) {
                      setIsEditing(false);
                      setShowInsightsToolbar(false);
                    }
                  }}
                  onClick={updateInsightsFormatState}
                  onKeyUp={updateInsightsFormatState}
                  onMouseUp={updateInsightsFormatState}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      
                      const selection = window.getSelection();
                      if (!selection || selection.rangeCount === 0) return;
                      
                      const range = selection.getRangeAt(0);
                      
                      // Create new tick bullet line
                      const newLineDiv = document.createElement('div');
                      newLineDiv.style.display = 'flex';
                      newLineDiv.style.alignItems = 'flex-start';
                      newLineDiv.style.marginBottom = '8px';
                      
                      // Create SVG tick icon
                      const svgNS = "http://www.w3.org/2000/svg";
                      const svg = document.createElementNS(svgNS, 'svg');
                      svg.setAttribute('width', '20');
                      svg.setAttribute('height', '20');
                      svg.setAttribute('viewBox', '0 0 20 20');
                      svg.setAttribute('fill', 'none');
                      svg.style.marginRight = '8px';
                      svg.style.marginTop = '2px';
                      svg.style.flexShrink = '0';
                      svg.style.pointerEvents = 'none';
                      
                      const circle = document.createElementNS(svgNS, 'circle');
                      circle.setAttribute('cx', '10');
                      circle.setAttribute('cy', '10');
                      circle.setAttribute('r', '9');
                      circle.setAttribute('stroke', '#1A73E8');
                      circle.setAttribute('stroke-width', '2');
                      circle.setAttribute('fill', 'none');
                      
                      const path = document.createElementNS(svgNS, 'path');
                      path.setAttribute('d', 'M6 10L8.5 12.5L14 7');
                      path.setAttribute('stroke', '#1A73E8');
                      path.setAttribute('stroke-width', '2');
                      path.setAttribute('stroke-linecap', 'round');
                      path.setAttribute('stroke-linejoin', 'round');
                      path.setAttribute('fill', 'none');
                      
                      svg.appendChild(circle);
                      svg.appendChild(path);
                      
                      // Create text span
                      const textSpan = document.createElement('span');
                      textSpan.innerHTML = '&nbsp;';
                      textSpan.style.flex = '1';
                      
                      newLineDiv.appendChild(svg);
                      newLineDiv.appendChild(textSpan);
                      
                      // Insert the new line after current line
                      const currentNode = range.startContainer;
                      let currentLine = currentNode.nodeType === 3 ? currentNode.parentElement : currentNode as HTMLElement;
                      
                      // Find the parent div (tick bullet line)
                      while (currentLine && currentLine !== contentRef.current && currentLine.parentElement !== contentRef.current) {
                        currentLine = currentLine.parentElement;
                      }
                      
                      if (currentLine && currentLine.parentElement === contentRef.current) {
                        // Insert after current line
                        currentLine.parentNode?.insertBefore(newLineDiv, currentLine.nextSibling);
                      } else {
                        // Fallback: append to end
                        contentRef.current?.appendChild(newLineDiv);
                      }
                      
                      // Position cursor in the text span
                      const newRange = document.createRange();
                      newRange.setStart(textSpan.firstChild || textSpan, 0);
                      newRange.collapse(true);
                      selection.removeAllRanges();
                      selection.addRange(newRange);
                      
                      handleContentInput();
                    } else if (e.key === 'Backspace') {
                      // Prevent deleting the first tick bullet
                      const allDivs = contentRef.current?.querySelectorAll('div[style*="display: flex"]');
                      if (allDivs && allDivs.length === 1) {
                        const selection = window.getSelection();
                        if (selection && selection.rangeCount > 0) {
                          const range = selection.getRangeAt(0);
                          const currentNode = range.startContainer;
                          
                          // Check if we're at the start of the first tick's text
                          if (range.startOffset === 0 || (currentNode.textContent === '\u00A0' && range.startOffset <= 1)) {
                            e.preventDefault();
                            return;
                          }
                        }
                      }
                    }
                  }}
                  suppressContentEditableWarning
                />
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Helper function to render icon by name
    const renderIcon = (iconName: string, className: string = "w-6 h-6") => {
      const iconMap: { [key: string]: React.ReactNode } = {
        'Zap': <Zap className={className} />,
        'Target': <Target className={className} />,
        'TrendingUp': <TrendingUp className={className} />,
        'AlertCircle': <AlertCircle className={className} />,
        'CheckCircle': <CheckCircle className={className} />,
        'ArrowRight': <ArrowRight className={className} />,
        'Star': <Star className={className} />,
        'Award': <Award className={className} />,
        'Flame': <Flame className={className} />,
        'Lightbulb': <Lightbulb className={className} />,
        'HelpCircle': <HelpCircle className={className} />,
      };
      return iconMap[iconName] || <Zap className={className} />;
    };
    
    // Special handling for Interactive Block - Two boxes side by side
    if (box.elementType === 'interactive-blocks') {
      // Box 1 properties
      const block1Heading = box.interactiveBlock1Heading ?? 'KEY DRIVERS';
      const block1Icon = box.interactiveBlock1Icon ?? 'Zap';
      const block1Content = box.interactiveBlock1Content ?? '';
      const block1Background = box.interactiveBlock1Background || 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 50%, #A7F3D0 100%)';
      const isBlock1Saved = box.isInteractiveBlock1Saved ?? false;
      const block1FontFamily = box.fontFamily || 'DM Sans';
      
      // Box 2 properties
      const block2Heading = box.interactiveBlock2Heading ?? 'OPPORTUNITIES/ACTIONS';
      const block2Icon = box.interactiveBlock2Icon ?? 'Target';
      const block2Content = box.interactiveBlock2Content ?? '';
      const block2Background = box.interactiveBlock2Background || 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 50%, #FDE68A 100%)';
      const isBlock2Saved = box.isInteractiveBlock2Saved ?? false;
      const block2FontFamily = box.fontFamily || 'DM Sans';

      // Box 1 handlers
      const handleBlock1ContentInput = () => {
        if (interactiveBlock1ContentRef.current) {
          onTextBoxUpdate(layoutId, boxId, { interactiveBlock1Content: interactiveBlock1ContentRef.current.innerHTML });
        }
      };

      const handleSaveBlock1 = () => {
        onTextBoxUpdate(layoutId, boxId, { isInteractiveBlock1Saved: true });
      };

      const handleEditBlock1 = () => {
        onTextBoxUpdate(layoutId, boxId, { isInteractiveBlock1Saved: false });
      };

      // Box 2 handlers
      const handleBlock2ContentInput = () => {
        if (interactiveBlock2ContentRef.current) {
          onTextBoxUpdate(layoutId, boxId, { interactiveBlock2Content: interactiveBlock2ContentRef.current.innerHTML });
        }
      };

      const handleSaveBlock2 = () => {
        onTextBoxUpdate(layoutId, boxId, { isInteractiveBlock2Saved: true });
      };

      const handleEditBlock2 = () => {
        onTextBoxUpdate(layoutId, boxId, { isInteractiveBlock2Saved: false });
      };

      // Format state update functions (similar to Insights)
      const updateBlock1FormatState = () => {
        if (!interactiveBlock1ContentRef.current) return;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        const element = range.commonAncestorContainer.nodeType === 3 
          ? range.commonAncestorContainer.parentElement 
          : range.commonAncestorContainer as HTMLElement;
        if (element && interactiveBlock1ContentRef.current.contains(element)) {
          const computedStyle = window.getComputedStyle(element);
          const fontSize = parseInt(computedStyle.fontSize) || 16;
          setInteractiveBlock1FontSize(fontSize);
          if (fontSize >= 34) {
            setInteractiveBlock1TextStyle('header');
          } else if (fontSize >= 20) {
            setInteractiveBlock1TextStyle('sub-header');
          } else {
            setInteractiveBlock1TextStyle('paragraph');
          }
          const fontWeight = computedStyle.fontWeight;
          setInteractiveBlock1Bold(fontWeight === 'bold' || fontWeight === '700' || parseInt(fontWeight) >= 600);
          setInteractiveBlock1Italic(computedStyle.fontStyle === 'italic');
          const textDecoration = computedStyle.textDecoration;
          setInteractiveBlock1Underline(textDecoration.includes('underline'));
          setInteractiveBlock1Strikethrough(textDecoration.includes('line-through'));
        }
      };

      const updateBlock2FormatState = () => {
        if (!interactiveBlock2ContentRef.current) return;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        const element = range.commonAncestorContainer.nodeType === 3 
          ? range.commonAncestorContainer.parentElement 
          : range.commonAncestorContainer as HTMLElement;
        if (element && interactiveBlock2ContentRef.current.contains(element)) {
          const computedStyle = window.getComputedStyle(element);
          const fontSize = parseInt(computedStyle.fontSize) || 16;
          setInteractiveBlock2FontSize(fontSize);
          if (fontSize >= 34) {
            setInteractiveBlock2TextStyle('header');
          } else if (fontSize >= 20) {
            setInteractiveBlock2TextStyle('sub-header');
          } else {
            setInteractiveBlock2TextStyle('paragraph');
          }
          const fontWeight = computedStyle.fontWeight;
          setInteractiveBlock2Bold(fontWeight === 'bold' || fontWeight === '700' || parseInt(fontWeight) >= 600);
          setInteractiveBlock2Italic(computedStyle.fontStyle === 'italic');
          const textDecoration = computedStyle.textDecoration;
          setInteractiveBlock2Underline(textDecoration.includes('underline'));
          setInteractiveBlock2Strikethrough(textDecoration.includes('line-through'));
        }
      };

      const applyFormatToBlock1Content = (command: string, value?: string) => {
        if (interactiveBlock1ContentRef.current) {
          interactiveBlock1ContentRef.current.focus();
        }
        document.execCommand(command, false, value);
        handleBlock1ContentInput();
        setTimeout(updateBlock1FormatState, 10);
      };

      const applyFormatToBlock2Content = (command: string, value?: string) => {
        if (interactiveBlock2ContentRef.current) {
          interactiveBlock2ContentRef.current.focus();
        }
        document.execCommand(command, false, value);
        handleBlock2ContentInput();
        setTimeout(updateBlock2FormatState, 10);
      };

      const getDefaultSizeForBlockStyle = (style?: TextStyleOption): number => {
        switch (style) {
          case 'header': return 36;
          case 'sub-header': return 22;
          case 'paragraph': return 18;
          default: return 18;
        }
      };

      const handleBlock1StyleChange = (style: TextStyleOption) => {
        const defaultSize = getDefaultSizeForBlockStyle(style);
        const defaultColor = style === 'paragraph' ? '#6B7280' : '#111827';
        const isBold = style === 'header' || style === 'sub-header';
        setInteractiveBlock1TextStyle(style);
        setInteractiveBlock1FontSize(defaultSize);
        setInteractiveBlock1Bold(isBold);
        if (interactiveBlock1ContentRef.current) {
          interactiveBlock1ContentRef.current.focus();
          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0) return;
          if (selection.toString()) {
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.style.fontSize = `${defaultSize}px`;
            span.style.color = defaultColor;
            span.style.fontWeight = isBold ? 'bold' : 'normal';
            span.style.fontFamily = `${block1FontFamily}, sans-serif`;
            const fragment = range.extractContents();
            span.appendChild(fragment);
            range.insertNode(span);
            const newRange = document.createRange();
            newRange.setStartAfter(span);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
          handleBlock1ContentInput();
          setTimeout(updateBlock1FormatState, 10);
        }
      };

      const handleBlock2StyleChange = (style: TextStyleOption) => {
        const defaultSize = getDefaultSizeForBlockStyle(style);
        const defaultColor = style === 'paragraph' ? '#6B7280' : '#111827';
        const isBold = style === 'header' || style === 'sub-header';
        setInteractiveBlock2TextStyle(style);
        setInteractiveBlock2FontSize(defaultSize);
        setInteractiveBlock2Bold(isBold);
        if (interactiveBlock2ContentRef.current) {
          interactiveBlock2ContentRef.current.focus();
          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0) return;
          if (selection.toString()) {
            const range = selection.getRangeAt(0);
            const span = document.createElement('span');
            span.style.fontSize = `${defaultSize}px`;
            span.style.color = defaultColor;
            span.style.fontWeight = isBold ? 'bold' : 'normal';
            span.style.fontFamily = `${block2FontFamily}, sans-serif`;
            const fragment = range.extractContents();
            span.appendChild(fragment);
            range.insertNode(span);
            const newRange = document.createRange();
            newRange.setStartAfter(span);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
          handleBlock2ContentInput();
          setTimeout(updateBlock2FormatState, 10);
        }
      };

      // Create bold dot bullet SVG - with hover dropdown indicator
      const createTickBullet = (color: string = '#1A73E8', isBlock1: boolean = true) => {
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        svg.setAttribute('viewBox', '0 0 20 20');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('data-bullet-color', color);
        svg.setAttribute('data-bullet-block', isBlock1 ? '1' : '2');
        svg.style.marginRight = '8px';
        svg.style.marginTop = '2px';
        svg.style.flexShrink = '0';
        svg.style.cursor = 'pointer';
        svg.style.pointerEvents = 'auto';
        svg.classList.add('bullet-point-clickable', 'bullet-hover-group');
        
        // Create bold dot (filled circle)
        const dot = document.createElementNS(svgNS, 'circle');
        dot.setAttribute('cx', '10');
        dot.setAttribute('cy', '10');
        dot.setAttribute('r', '6');
        dot.setAttribute('fill', color);
        dot.setAttribute('stroke', 'none');
        
        // Add chevron dropdown indicator (hidden by default, shows on hover)
        const chevron = document.createElementNS(svgNS, 'path');
        chevron.setAttribute('d', 'M14 7L10 11L6 7');
        chevron.setAttribute('stroke', '#6B7280');
        chevron.setAttribute('stroke-width', '1.5');
        chevron.setAttribute('stroke-linecap', 'round');
        chevron.setAttribute('stroke-linejoin', 'round');
        chevron.setAttribute('fill', 'none');
        chevron.setAttribute('class', 'bullet-chevron-indicator');
        chevron.style.opacity = '0';
        chevron.style.transition = 'opacity 0.2s';
        chevron.style.transform = 'translate(2px, 2px) scale(0.6)';
        chevron.setAttribute('transform', 'translate(2, 2) scale(0.6)');
        
        svg.appendChild(dot);
        svg.appendChild(chevron);
        return svg;
      };


      // Update bullet point color
      const updateBulletPointColor = (color: string, isBlock1: boolean) => {
        const contentRef = isBlock1 ? interactiveBlock1ContentRef : interactiveBlock2ContentRef;
        if (!contentRef.current) return;
        
        const bullets = contentRef.current.querySelectorAll(`svg[data-bullet-block="${isBlock1 ? '1' : '2'}"]`);
        bullets.forEach((bullet) => {
          const svg = bullet as SVGElement;
          const circle = svg.querySelector('circle');
          // Update the fill color of the dot (not stroke, since it's a filled circle now)
          if (circle) {
            circle.setAttribute('fill', color);
            // Remove stroke if it exists (for backward compatibility)
            circle.removeAttribute('stroke');
          }
          svg.setAttribute('data-bullet-color', color);
        });
        
        if (isBlock1) {
          handleBlock1ContentInput();
          setBlock1BulletPopoverOpen(false);
        } else {
          handleBlock2ContentInput();
          setBlock2BulletPopoverOpen(false);
        }
      };

      // Preview mode - both boxes saved
      if (isBlock1Saved && isBlock2Saved) {
        return (
          <div 
            className={`relative group/box ${selectionClass}`}
          onClick={handleBoxClick} 
            style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}
            onDoubleClick={() => {
              handleEditBlock1();
              handleEditBlock2();
            }}
            title="Double-click to edit"
          >
            {/* Three-dots menu - visible on hover */}
            <ElementMenuDropdown
              elementTypes={elementTypes}
              onElementChange={handleElementChange}
              boxId={boxId}
              layoutId={layoutId}
              onDeleteBox={onDeleteBox}
              onAddElement={onAddElement}
              selectedBoxIds={settings.selectedBoxIds}
              boxesInRow={boxesInRow}
            />
            <div className="flex gap-4 h-full">
              {/* Box 1 - Key Drivers */}
              <div 
                className="flex-1 rounded-xl overflow-hidden p-6 shadow-md border border-green-200"
                style={{ background: block1Background }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center shadow-md">
                    {renderIcon(block1Icon, "w-6 h-6 text-white")}
                  </div>
                  <div 
                    style={{
                      fontSize: '22px',
                      fontWeight: 'bold',
                      color: '#059669',
                      fontFamily: 'DM Sans, sans-serif',
                      letterSpacing: '0.05em',
                    }}
                    dangerouslySetInnerHTML={{ __html: block1Heading }}
                  />
                </div>
                <div 
                  style={{
                    fontSize: '16px',
                    color: '#111827',
                    fontFamily: 'DM Sans, sans-serif',
                    lineHeight: '1.6',
                  }}
                  dangerouslySetInnerHTML={{ __html: block1Content || '<p>Put your content here</p>' }}
                />
              </div>

              {/* Box 2 - Opportunities/Actions */}
              <div 
                className="flex-1 rounded-xl overflow-hidden p-6 shadow-md border border-yellow-200"
                style={{ background: block2Background }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-yellow-500 flex items-center justify-center shadow-md">
                    {renderIcon(block2Icon, "w-6 h-6 text-white")}
                  </div>
                  <div 
                    style={{
                      fontSize: '22px',
                      fontWeight: 'bold',
                      color: '#D97706',
                      fontFamily: 'DM Sans, sans-serif',
                      letterSpacing: '0.05em',
                    }}
                    dangerouslySetInnerHTML={{ __html: block2Heading }}
                  />
                </div>
                <div 
                  style={{
                    fontSize: '16px',
                    color: '#111827',
                    fontFamily: 'DM Sans, sans-serif',
                    lineHeight: '1.6',
                  }}
                  dangerouslySetInnerHTML={{ __html: block2Content || '<p>Put your content here</p>' }}
                />
              </div>
            </div>
          </div>
        );
      }

      // Edit mode - show editable boxes
      return (
        <div 
          className="relative group/box flex flex-col gap-3" 
          style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}
        >
          {/* Three-dots menu - visible on hover */}
          <ElementMenuDropdown
            elementTypes={elementTypes}
            onElementChange={handleElementChange}
            boxId={boxId}
            layoutId={layoutId}
            onDeleteBox={onDeleteBox}
            onAddElement={onAddElement}
            selectedBoxIds={settings.selectedBoxIds}
            boxesInRow={boxesInRow}
          />
          {/* Toolbars for both boxes */}
          {showInteractiveBlock1Toolbar && (
            <div className="absolute left-0 right-0 flex flex-col gap-2" style={{ top: '-76px', zIndex: 10000 }} onMouseDown={(e) => e.preventDefault()}>
              <div className="flex items-center gap-2 bg-white rounded-lg shadow-xl p-2 border border-gray-200">
                <div className="flex-1 overflow-x-auto">
                  <TextBoxToolbar
                    textStyle={interactiveBlock1TextStyle}
                    onTextStyleChange={handleBlock1StyleChange}
                    fontFamily={block1FontFamily}
                    onFontFamilyChange={(font) => {
                      applyFormatToBlock1Content('fontName', font);
                      onTextBoxUpdate(layoutId, boxId, { fontFamily: font });
                    }}
                    fontSize={interactiveBlock1FontSize}
                    onIncreaseFontSize={() => {
                      const selection = window.getSelection();
                      if (selection && selection.toString()) {
                        const currentSize = parseInt(window.getComputedStyle(selection.anchorNode?.parentElement || document.body).fontSize) || interactiveBlock1FontSize;
                        applyFormatToBlock1Content('fontSize', `${currentSize + 1}px`);
                      } else {
                        const newSize = interactiveBlock1FontSize + 1;
                        setInteractiveBlock1FontSize(newSize);
                        if (interactiveBlock1ContentRef.current) {
                          interactiveBlock1ContentRef.current.focus();
                          document.execCommand('fontSize', false, '7');
                          const fontElements = interactiveBlock1ContentRef.current.querySelectorAll('font[size="7"]');
                          fontElements.forEach((el) => {
                            const span = document.createElement('span');
                            span.style.fontSize = `${newSize}px`;
                            span.innerHTML = el.innerHTML;
                            el.replaceWith(span);
                          });
                          handleBlock1ContentInput();
                        }
                      }
                    }}
                    onDecreaseFontSize={() => {
                      const selection = window.getSelection();
                      if (selection && selection.toString()) {
                        const currentSize = parseInt(window.getComputedStyle(selection.anchorNode?.parentElement || document.body).fontSize) || interactiveBlock1FontSize;
                        applyFormatToBlock1Content('fontSize', `${Math.max(currentSize - 1, 8)}px`);
                      } else {
                        const newSize = Math.max(interactiveBlock1FontSize - 1, 8);
                        setInteractiveBlock1FontSize(newSize);
                        if (interactiveBlock1ContentRef.current) {
                          interactiveBlock1ContentRef.current.focus();
                          document.execCommand('fontSize', false, '7');
                          const fontElements = interactiveBlock1ContentRef.current.querySelectorAll('font[size="7"]');
                          fontElements.forEach((el) => {
                            const span = document.createElement('span');
                            span.style.fontSize = `${newSize}px`;
                            span.innerHTML = el.innerHTML;
                            el.replaceWith(span);
                          });
                          handleBlock1ContentInput();
                        }
                      }
                    }}
                    bold={interactiveBlock1Bold}
                    italic={interactiveBlock1Italic}
                    underline={interactiveBlock1Underline}
                    strikethrough={interactiveBlock1Strikethrough}
                    onToggleBold={() => applyFormatToBlock1Content('bold')}
                    onToggleItalic={() => applyFormatToBlock1Content('italic')}
                    onToggleUnderline={() => applyFormatToBlock1Content('underline')}
                    onToggleStrikethrough={() => applyFormatToBlock1Content('strikeThrough')}
                    align="left"
                    onAlign={(align) => applyFormatToBlock1Content('justify' + (align === 'left' ? 'Left' : align === 'center' ? 'Center' : 'Right'))}
                    onBulletedList={() => applyFormatToBlock1Content('insertUnorderedList')}
                    onNumberedList={() => applyFormatToBlock1Content('insertOrderedList')}
                    color="#111827"
                    onColorChange={(color) => applyFormatToBlock1Content('foreColor', color)}
                    backgroundColor={block1Background}
                    onBackgroundColorChange={(bg) => onTextBoxUpdate(layoutId, boxId, { interactiveBlock1Background: bg })}
                  />
                </div>
              </div>
            </div>
          )}

          {showInteractiveBlock2Toolbar && (
            <div className="absolute left-0 right-0 flex flex-col gap-2" style={{ top: '-76px', zIndex: 10000 }} onMouseDown={(e) => e.preventDefault()}>
              <div className="flex items-center gap-2 bg-white rounded-lg shadow-xl p-2 border border-gray-200">
                <div className="flex-1 overflow-x-auto">
                  <TextBoxToolbar
                    textStyle={interactiveBlock2TextStyle}
                    onTextStyleChange={handleBlock2StyleChange}
                    fontFamily={block2FontFamily}
                    onFontFamilyChange={(font) => {
                      applyFormatToBlock2Content('fontName', font);
                      onTextBoxUpdate(layoutId, boxId, { fontFamily: font });
                    }}
                    fontSize={interactiveBlock2FontSize}
                    onIncreaseFontSize={() => {
                      const selection = window.getSelection();
                      if (selection && selection.toString()) {
                        const currentSize = parseInt(window.getComputedStyle(selection.anchorNode?.parentElement || document.body).fontSize) || interactiveBlock2FontSize;
                        applyFormatToBlock2Content('fontSize', `${currentSize + 1}px`);
                      } else {
                        const newSize = interactiveBlock2FontSize + 1;
                        setInteractiveBlock2FontSize(newSize);
                        if (interactiveBlock2ContentRef.current) {
                          interactiveBlock2ContentRef.current.focus();
                          document.execCommand('fontSize', false, '7');
                          const fontElements = interactiveBlock2ContentRef.current.querySelectorAll('font[size="7"]');
                          fontElements.forEach((el) => {
                            const span = document.createElement('span');
                            span.style.fontSize = `${newSize}px`;
                            span.innerHTML = el.innerHTML;
                            el.replaceWith(span);
                          });
                          handleBlock2ContentInput();
                        }
                      }
                    }}
                    onDecreaseFontSize={() => {
                      const selection = window.getSelection();
                      if (selection && selection.toString()) {
                        const currentSize = parseInt(window.getComputedStyle(selection.anchorNode?.parentElement || document.body).fontSize) || interactiveBlock2FontSize;
                        applyFormatToBlock2Content('fontSize', `${Math.max(currentSize - 1, 8)}px`);
                      } else {
                        const newSize = Math.max(interactiveBlock2FontSize - 1, 8);
                        setInteractiveBlock2FontSize(newSize);
                        if (interactiveBlock2ContentRef.current) {
                          interactiveBlock2ContentRef.current.focus();
                          document.execCommand('fontSize', false, '7');
                          const fontElements = interactiveBlock2ContentRef.current.querySelectorAll('font[size="7"]');
                          fontElements.forEach((el) => {
                            const span = document.createElement('span');
                            span.style.fontSize = `${newSize}px`;
                            span.innerHTML = el.innerHTML;
                            el.replaceWith(span);
                          });
                          handleBlock2ContentInput();
                        }
                      }
                    }}
                    bold={interactiveBlock2Bold}
                    italic={interactiveBlock2Italic}
                    underline={interactiveBlock2Underline}
                    strikethrough={interactiveBlock2Strikethrough}
                    onToggleBold={() => applyFormatToBlock2Content('bold')}
                    onToggleItalic={() => applyFormatToBlock2Content('italic')}
                    onToggleUnderline={() => applyFormatToBlock2Content('underline')}
                    onToggleStrikethrough={() => applyFormatToBlock2Content('strikeThrough')}
                    align="left"
                    onAlign={(align) => applyFormatToBlock2Content('justify' + (align === 'left' ? 'Left' : align === 'center' ? 'Center' : 'Right'))}
                    onBulletedList={() => applyFormatToBlock2Content('insertUnorderedList')}
                    onNumberedList={() => applyFormatToBlock2Content('insertOrderedList')}
                    color="#111827"
                    onColorChange={(color) => applyFormatToBlock2Content('foreColor', color)}
                    backgroundColor={block2Background}
                    onBackgroundColorChange={(bg) => onTextBoxUpdate(layoutId, boxId, { interactiveBlock2Background: bg })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Two boxes side by side */}
          <div className="flex gap-4 h-full">
            {/* Box 1 - Key Drivers */}
            <div className="relative flex-1" style={{ minHeight: 0 }}>
              <div 
                className="w-full h-full rounded-xl overflow-hidden p-6 shadow-lg border-2 border-green-300"
                style={{ background: block1Background }}
              >
                <div className="flex items-start gap-3 mb-4">
                  <Select
                    value={block1Icon}
                    onValueChange={(value) => onTextBoxUpdate(layoutId, boxId, { interactiveBlock1Icon: value })}
                  >
                    <SelectTrigger className="w-10 h-10 p-0 border-2 border-green-500 rounded-lg bg-green-500 hover:bg-green-600 shrink-0 group relative justify-center [&>svg:last-of-type]:opacity-0 [&>svg:last-of-type]:group-hover:opacity-100 [&>svg:last-of-type]:transition-opacity [&>svg:last-of-type]:absolute [&>svg:last-of-type]:right-0.5 [&>svg:last-of-type]:bottom-0.5 [&>svg:last-of-type]:w-3 [&>svg:last-of-type]:h-3 [&>svg:last-of-type]:z-10">
                      <div className="w-full h-full flex items-center justify-center text-white">
                        {renderIcon(block1Icon, "w-6 h-6")}
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Zap">{renderIcon('Zap', "w-4 h-4 mr-2")} Zap</SelectItem>
                      <SelectItem value="Target">{renderIcon('Target', "w-4 h-4 mr-2")} Target</SelectItem>
                      <SelectItem value="TrendingUp">{renderIcon('TrendingUp', "w-4 h-4 mr-2")} TrendingUp</SelectItem>
                      <SelectItem value="AlertCircle">{renderIcon('AlertCircle', "w-4 h-4 mr-2")} AlertCircle</SelectItem>
                      <SelectItem value="CheckCircle">{renderIcon('CheckCircle', "w-4 h-4 mr-2")} CheckCircle</SelectItem>
                      <SelectItem value="ArrowRight">{renderIcon('ArrowRight', "w-4 h-4 mr-2")} ArrowRight</SelectItem>
                      <SelectItem value="Star">{renderIcon('Star', "w-4 h-4 mr-2")} Star</SelectItem>
                      <SelectItem value="Award">{renderIcon('Award', "w-4 h-4 mr-2")} Award</SelectItem>
                      <SelectItem value="Flame">{renderIcon('Flame', "w-4 h-4 mr-2")} Flame</SelectItem>
                      <SelectItem value="Lightbulb">{renderIcon('Lightbulb', "w-4 h-4 mr-2")} Lightbulb</SelectItem>
                      <SelectItem value="HelpCircle">{renderIcon('HelpCircle', "w-4 h-4 mr-2")} HelpCircle</SelectItem>
                    </SelectContent>
                  </Select>
                  <input
                    type="text"
                    value={block1Heading}
                    onChange={(e) => onTextBoxUpdate(layoutId, boxId, { interactiveBlock1Heading: e.target.value })}
                    className="flex-1 outline-none cursor-text bg-transparent border-none"
                    style={{
                      fontSize: '22px',
                      fontWeight: 'bold',
                      color: '#059669',
                      fontFamily: 'DM Sans, sans-serif',
                      letterSpacing: '0.05em',
                    }}
                    placeholder="KEY DRIVERS"
                  />
                </div>
                <div className="relative">
                  <Popover open={block1BulletPopoverOpen} onOpenChange={setBlock1BulletPopoverOpen}>
                    <PopoverTrigger asChild>
                      <button
                        ref={block1BulletTriggerRef}
                        type="button"
                        className="absolute opacity-0 pointer-events-none w-20 h-20"
                        style={{ display: 'none' }}
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold mb-2">Bullet Point Color</p>
                        <div className="grid grid-cols-4 gap-2">
                          {['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#6366F1'].map((color) => (
                            <button
                              key={color}
                              type="button"
                              className="w-8 h-8 rounded border-2 border-gray-300 hover:border-gray-500 transition-colors"
                              style={{ backgroundColor: color }}
                              onClick={() => updateBulletPointColor(color, true)}
                            />
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <div 
                    ref={interactiveBlock1ContentRef}
                    contentEditable
                    className="outline-none cursor-text relative z-10 group/bullet"
                    style={{
                      fontFamily: `${block1FontFamily}, sans-serif`,
                      backgroundColor: 'transparent',
                      minHeight: '50px',
                      fontSize: '16px',
                      lineHeight: '1.8',
                    }}
                    onInput={handleBlock1ContentInput}
                    onFocus={() => {
                      setIsEditing(true);
                      setShowInteractiveBlock1Toolbar(true);
                      updateBlock1FormatState();
                    }}
                    onBlur={(e) => {
                      const relatedTarget = e.relatedTarget as HTMLElement;
                      if (!relatedTarget || !relatedTarget.closest('[data-text-toolbar-root]')) {
                        setIsEditing(false);
                        setShowInteractiveBlock1Toolbar(false);
                      }
                    }}
                    onMouseMove={(e) => {
                      const target = e.target as HTMLElement;
                      const svg = target.closest('svg[data-bullet-color]') as SVGElement;
                      if (svg) {
                        const chevron = svg.querySelector('.bullet-chevron-indicator') as SVGElement;
                        if (chevron) {
                          chevron.style.opacity = '1';
                        }
                      }
                    }}
                    onMouseLeave={() => {
                      const bullets = interactiveBlock1ContentRef.current?.querySelectorAll('svg[data-bullet-color] .bullet-chevron-indicator');
                      bullets?.forEach((chevron) => {
                        (chevron as SVGElement).style.opacity = '0';
                      });
                    }}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      const svg = target.closest('svg[data-bullet-color]') as SVGElement;
                      if (svg) {
                        e.preventDefault();
                        e.stopPropagation();
                        const isBlock1Bullet = svg.getAttribute('data-bullet-block') === '1';
                        if (isBlock1Bullet) {
                          // Position the trigger button at the bullet point location
                          const rect = svg.getBoundingClientRect();
                          if (block1BulletTriggerRef.current) {
                            block1BulletTriggerRef.current.style.position = 'fixed';
                            block1BulletTriggerRef.current.style.left = `${rect.left}px`;
                            block1BulletTriggerRef.current.style.top = `${rect.top}px`;
                            block1BulletTriggerRef.current.style.width = `${rect.width}px`;
                            block1BulletTriggerRef.current.style.height = `${rect.height}px`;
                            block1BulletTriggerRef.current.style.display = 'block';
                            block1BulletTriggerRef.current.click();
                          }
                        } else {
                          const rect = svg.getBoundingClientRect();
                          if (block2BulletTriggerRef.current) {
                            block2BulletTriggerRef.current.style.position = 'fixed';
                            block2BulletTriggerRef.current.style.left = `${rect.left}px`;
                            block2BulletTriggerRef.current.style.top = `${rect.top}px`;
                            block2BulletTriggerRef.current.style.width = `${rect.width}px`;
                            block2BulletTriggerRef.current.style.height = `${rect.height}px`;
                            block2BulletTriggerRef.current.style.display = 'block';
                            block2BulletTriggerRef.current.click();
                          }
                        }
                      } else {
                        updateBlock1FormatState();
                      }
                    }}
                    onKeyUp={updateBlock1FormatState}
                    onMouseUp={updateBlock1FormatState}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        const selection = window.getSelection();
                        if (!selection || selection.rangeCount === 0) return;
                        const range = selection.getRangeAt(0);
                        const newLineDiv = document.createElement('div');
                        newLineDiv.style.display = 'flex';
                        newLineDiv.style.alignItems = 'flex-start';
                        newLineDiv.style.marginBottom = '8px';
                        const svg = createTickBullet('#10B981', true);
                        const textSpan = document.createElement('span');
                        textSpan.innerHTML = '&nbsp;';
                        textSpan.style.flex = '1';
                        newLineDiv.appendChild(svg);
                        newLineDiv.appendChild(textSpan);
                        const currentNode = range.startContainer;
                        let currentLine = currentNode.nodeType === 3 ? currentNode.parentElement : currentNode as HTMLElement;
                        while (currentLine && currentLine !== interactiveBlock1ContentRef.current && currentLine.parentElement !== interactiveBlock1ContentRef.current) {
                          currentLine = currentLine.parentElement;
                        }
                        if (currentLine && currentLine.parentElement === interactiveBlock1ContentRef.current) {
                          currentLine.parentNode?.insertBefore(newLineDiv, currentLine.nextSibling);
                        } else {
                          interactiveBlock1ContentRef.current?.appendChild(newLineDiv);
                        }
                        const newRange = document.createRange();
                        newRange.setStart(textSpan.firstChild || textSpan, 0);
                        newRange.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                        handleBlock1ContentInput();
                      }
                    }}
                    suppressContentEditableWarning
                  />
                </div>
              </div>
            </div>

            {/* Box 2 - Opportunities/Actions */}
            <div className="relative flex-1" style={{ minHeight: 0 }}>
              <div 
                className="w-full h-full rounded-xl overflow-hidden p-6 shadow-lg border-2 border-yellow-300"
                style={{ background: block2Background }}
              >
                <div className="flex items-start gap-3 mb-4">
                  <Select
                    value={block2Icon}
                    onValueChange={(value) => onTextBoxUpdate(layoutId, boxId, { interactiveBlock2Icon: value })}
                  >
                    <SelectTrigger className="w-10 h-10 p-0 border-2 border-yellow-500 rounded-lg bg-yellow-500 hover:bg-yellow-600 shrink-0 group relative justify-center [&>svg:last-of-type]:opacity-0 [&>svg:last-of-type]:group-hover:opacity-100 [&>svg:last-of-type]:transition-opacity [&>svg:last-of-type]:absolute [&>svg:last-of-type]:right-0.5 [&>svg:last-of-type]:bottom-0.5 [&>svg:last-of-type]:w-3 [&>svg:last-of-type]:h-3 [&>svg:last-of-type]:z-10">
                      <div className="w-full h-full flex items-center justify-center text-white">
                        {renderIcon(block2Icon, "w-6 h-6")}
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Zap">{renderIcon('Zap', "w-4 h-4 mr-2")} Zap</SelectItem>
                      <SelectItem value="Target">{renderIcon('Target', "w-4 h-4 mr-2")} Target</SelectItem>
                      <SelectItem value="TrendingUp">{renderIcon('TrendingUp', "w-4 h-4 mr-2")} TrendingUp</SelectItem>
                      <SelectItem value="AlertCircle">{renderIcon('AlertCircle', "w-4 h-4 mr-2")} AlertCircle</SelectItem>
                      <SelectItem value="CheckCircle">{renderIcon('CheckCircle', "w-4 h-4 mr-2")} CheckCircle</SelectItem>
                      <SelectItem value="ArrowRight">{renderIcon('ArrowRight', "w-4 h-4 mr-2")} ArrowRight</SelectItem>
                      <SelectItem value="Star">{renderIcon('Star', "w-4 h-4 mr-2")} Star</SelectItem>
                      <SelectItem value="Award">{renderIcon('Award', "w-4 h-4 mr-2")} Award</SelectItem>
                      <SelectItem value="Flame">{renderIcon('Flame', "w-4 h-4 mr-2")} Flame</SelectItem>
                      <SelectItem value="Lightbulb">{renderIcon('Lightbulb', "w-4 h-4 mr-2")} Lightbulb</SelectItem>
                      <SelectItem value="HelpCircle">{renderIcon('HelpCircle', "w-4 h-4 mr-2")} HelpCircle</SelectItem>
                    </SelectContent>
                  </Select>
                  <input
                    type="text"
                    value={block2Heading}
                    onChange={(e) => onTextBoxUpdate(layoutId, boxId, { interactiveBlock2Heading: e.target.value })}
                    className="flex-1 outline-none cursor-text bg-transparent border-none"
                    style={{
                      fontSize: '22px',
                      fontWeight: 'bold',
                      color: '#D97706',
                      fontFamily: 'DM Sans, sans-serif',
                      letterSpacing: '0.05em',
                    }}
                    placeholder="OPPORTUNITIES/ACTIONS"
                  />
                </div>
                <div className="relative">
                  <Popover open={block2BulletPopoverOpen} onOpenChange={setBlock2BulletPopoverOpen}>
                    <PopoverTrigger asChild>
                      <button
                        ref={block2BulletTriggerRef}
                        type="button"
                        className="absolute opacity-0 pointer-events-none w-20 h-20"
                        style={{ display: 'none' }}
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold mb-2">Bullet Point Color</p>
                        <div className="grid grid-cols-4 gap-2">
                          {['#F59E0B', '#3B82F6', '#8B5CF6', '#10B981', '#EF4444', '#EC4899', '#06B6D4', '#6366F1'].map((color) => (
                            <button
                              key={color}
                              type="button"
                              className="w-8 h-8 rounded border-2 border-gray-300 hover:border-gray-500 transition-colors"
                              style={{ backgroundColor: color }}
                              onClick={() => updateBulletPointColor(color, false)}
                            />
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <div 
                    ref={interactiveBlock2ContentRef}
                    contentEditable
                    className="outline-none cursor-text relative z-10 group/bullet"
                    style={{
                      fontFamily: `${block2FontFamily}, sans-serif`,
                      backgroundColor: 'transparent',
                      minHeight: '50px',
                      fontSize: '16px',
                      lineHeight: '1.8',
                    }}
                    onInput={handleBlock2ContentInput}
                    onFocus={() => {
                      setIsEditing(true);
                      setShowInteractiveBlock2Toolbar(true);
                      updateBlock2FormatState();
                    }}
                    onBlur={(e) => {
                      const relatedTarget = e.relatedTarget as HTMLElement;
                      if (!relatedTarget || !relatedTarget.closest('[data-text-toolbar-root]')) {
                        setIsEditing(false);
                        setShowInteractiveBlock2Toolbar(false);
                      }
                    }}
                    onMouseMove={(e) => {
                      const target = e.target as HTMLElement;
                      const svg = target.closest('svg[data-bullet-color]') as SVGElement;
                      if (svg) {
                        const chevron = svg.querySelector('.bullet-chevron-indicator') as SVGElement;
                        if (chevron) {
                          chevron.style.opacity = '1';
                        }
                      }
                    }}
                    onMouseLeave={() => {
                      const bullets = interactiveBlock2ContentRef.current?.querySelectorAll('svg[data-bullet-color] .bullet-chevron-indicator');
                      bullets?.forEach((chevron) => {
                        (chevron as SVGElement).style.opacity = '0';
                      });
                    }}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      const svg = target.closest('svg[data-bullet-color]') as SVGElement;
                      if (svg) {
                        e.preventDefault();
                        e.stopPropagation();
                        const isBlock1Bullet = svg.getAttribute('data-bullet-block') === '1';
                        if (isBlock1Bullet) {
                          // Position the trigger button at the bullet point location
                          const rect = svg.getBoundingClientRect();
                          if (block1BulletTriggerRef.current) {
                            block1BulletTriggerRef.current.style.position = 'fixed';
                            block1BulletTriggerRef.current.style.left = `${rect.left}px`;
                            block1BulletTriggerRef.current.style.top = `${rect.top}px`;
                            block1BulletTriggerRef.current.style.width = `${rect.width}px`;
                            block1BulletTriggerRef.current.style.height = `${rect.height}px`;
                            block1BulletTriggerRef.current.style.display = 'block';
                            block1BulletTriggerRef.current.click();
                          }
                        } else {
                          const rect = svg.getBoundingClientRect();
                          if (block2BulletTriggerRef.current) {
                            block2BulletTriggerRef.current.style.position = 'fixed';
                            block2BulletTriggerRef.current.style.left = `${rect.left}px`;
                            block2BulletTriggerRef.current.style.top = `${rect.top}px`;
                            block2BulletTriggerRef.current.style.width = `${rect.width}px`;
                            block2BulletTriggerRef.current.style.height = `${rect.height}px`;
                            block2BulletTriggerRef.current.style.display = 'block';
                            block2BulletTriggerRef.current.click();
                          }
                        }
                      } else {
                        updateBlock2FormatState();
                      }
                    }}
                    onKeyUp={updateBlock2FormatState}
                    onMouseUp={updateBlock2FormatState}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        const selection = window.getSelection();
                        if (!selection || selection.rangeCount === 0) return;
                        const range = selection.getRangeAt(0);
                        const newLineDiv = document.createElement('div');
                        newLineDiv.style.display = 'flex';
                        newLineDiv.style.alignItems = 'flex-start';
                        newLineDiv.style.marginBottom = '8px';
                        const svg = createTickBullet('#F59E0B', false);
                        const textSpan = document.createElement('span');
                        textSpan.innerHTML = '&nbsp;';
                        textSpan.style.flex = '1';
                        newLineDiv.appendChild(svg);
                        newLineDiv.appendChild(textSpan);
                        const currentNode = range.startContainer;
                        let currentLine = currentNode.nodeType === 3 ? currentNode.parentElement : currentNode as HTMLElement;
                        while (currentLine && currentLine !== interactiveBlock2ContentRef.current && currentLine.parentElement !== interactiveBlock2ContentRef.current) {
                          currentLine = currentLine.parentElement;
                        }
                        if (currentLine && currentLine.parentElement === interactiveBlock2ContentRef.current) {
                          currentLine.parentNode?.insertBefore(newLineDiv, currentLine.nextSibling);
                        } else {
                          interactiveBlock2ContentRef.current?.appendChild(newLineDiv);
                        }
                        const newRange = document.createRange();
                        newRange.setStart(textSpan.firstChild || textSpan, 0);
                        newRange.collapse(true);
                        selection.removeAllRanges();
                        selection.addRange(newRange);
                        handleBlock2ContentInput();
                      }
                    }}
                    suppressContentEditableWarning
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    // Special handling for Q&A - Two separate text boxes for Question and Answer
    if (box.elementType === 'qa') {
      const qaQuestionContent = box.qaQuestionContent ?? '';
      const qaAnswerContent = box.qaAnswerContent ?? '';
      const isQASaved = box.isQASaved ?? false;
      const qaFontFamily = box.fontFamily || 'DM Sans';
      const qaHasBeenInteracted = box.qaHasBeenInteracted ?? false;

      const handleQuestionInput = () => {
        if (qaQuestionRef.current) {
          onTextBoxUpdate(layoutId, boxId, { qaQuestionContent: qaQuestionRef.current.innerHTML });
        }
      };

      const handleAnswerInput = (e?: React.FormEvent<HTMLDivElement>) => {
        if (qaAnswerRef.current) {
          isAnswerTypingRef.current = true;
          const content = qaAnswerRef.current.innerHTML || '';
          
          // CRITICAL: Keep activeQAField as 'answer' while typing to prevent disappearing
          if (activeQAField !== 'answer') {
            setActiveQAField('answer');
          }
          
          // Ensure we're updating the state immediately - this saves to MongoDB via autosave
          onTextBoxUpdate(layoutId, boxId, { 
            qaAnswerContent: content,
            qaHasBeenInteracted: true 
          });
          
          // Also ensure contentEditable stays enabled
          if (qaAnswerRef.current.contentEditable !== 'true') {
            qaAnswerRef.current.contentEditable = 'true';
          }
          
          // Reset typing flag after a short delay to allow sync after typing stops
          setTimeout(() => {
            isAnswerTypingRef.current = false;
          }, 500);
        }
      };

      const applyFormatToQuestion = (command: string, value?: string) => {
        if (qaQuestionRef.current) {
          qaQuestionRef.current.focus();
        }
        document.execCommand(command, false, value);
        handleQuestionInput();
      };

      const applyFormatToAnswer = (command: string, value?: string) => {
        if (qaAnswerRef.current) {
          qaAnswerRef.current.focus();
        }
        document.execCommand(command, false, value);
        handleAnswerInput();
      };

      // Single container with both Question and Answer sections (always editable)
      return (
        <div 
          className={`relative group/box ${selectionClass}`}
          onClick={handleBoxClick} 
          style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}
        >
          {/* Three-dots menu - visible on hover */}
          <ElementMenuDropdown
            elementTypes={elementTypes}
            onElementChange={handleElementChange}
            boxId={boxId}
            layoutId={layoutId}
            onDeleteBox={onDeleteBox}
            onAddElement={onAddElement}
            selectedBoxIds={settings.selectedBoxIds}
            boxesInRow={boxesInRow}
          />

          {/* Toolbar - only show when a field is active */}
          {activeQAField && (
            <div className="absolute left-0 right-0 flex items-center gap-2 bg-white rounded-lg shadow-2xl p-2 border border-gray-200" style={{ top: '-76px', zIndex: 10000 }} onMouseDown={(e) => e.preventDefault()}>
              <div className="flex-1 overflow-x-auto">
                <TextBoxToolbar
                  textStyle={activeQAField === 'question' ? qaQuestionTextStyle : qaAnswerTextStyle}
                  onTextStyleChange={() => {}}
                  fontFamily={qaFontFamily}
                  onFontFamilyChange={(font) => {
                    if (activeQAField === 'question') {
                      applyFormatToQuestion('fontName', font);
                    } else {
                      applyFormatToAnswer('fontName', font);
                    }
                    onTextBoxUpdate(layoutId, boxId, { fontFamily: font });
                  }}
                  fontSize={activeQAField === 'question' ? qaQuestionFontSize : qaAnswerFontSize}
                  onIncreaseFontSize={() => {
                    const selection = window.getSelection();
                    if (selection && selection.toString()) {
                      const currentSize = parseInt(window.getComputedStyle(selection.anchorNode?.parentElement || document.body).fontSize) || (activeQAField === 'question' ? qaQuestionFontSize : qaAnswerFontSize);
                      if (activeQAField === 'question') {
                        applyFormatToQuestion('fontSize', `${currentSize + 1}px`);
                      } else {
                        applyFormatToAnswer('fontSize', `${currentSize + 1}px`);
                      }
                    }
                  }}
                  onDecreaseFontSize={() => {
                    const selection = window.getSelection();
                    if (selection && selection.toString()) {
                      const currentSize = parseInt(window.getComputedStyle(selection.anchorNode?.parentElement || document.body).fontSize) || (activeQAField === 'question' ? qaQuestionFontSize : qaAnswerFontSize);
                      if (activeQAField === 'question') {
                        applyFormatToQuestion('fontSize', `${Math.max(currentSize - 1, 8)}px`);
                      } else {
                        applyFormatToAnswer('fontSize', `${Math.max(currentSize - 1, 8)}px`);
                      }
                    }
                  }}
                  onApplyTextStyle={() => {}}
                  bold={activeQAField === 'question' ? qaQuestionBold : qaAnswerBold}
                  italic={activeQAField === 'question' ? qaQuestionItalic : qaAnswerItalic}
                  underline={activeQAField === 'question' ? qaQuestionUnderline : qaAnswerUnderline}
                  strikethrough={activeQAField === 'question' ? qaQuestionStrikethrough : qaAnswerStrikethrough}
                  onToggleBold={() => activeQAField === 'question' ? applyFormatToQuestion('bold') : applyFormatToAnswer('bold')}
                  onToggleItalic={() => activeQAField === 'question' ? applyFormatToQuestion('italic') : applyFormatToAnswer('italic')}
                  onToggleUnderline={() => activeQAField === 'question' ? applyFormatToQuestion('underline') : applyFormatToAnswer('underline')}
                  onToggleStrikethrough={() => activeQAField === 'question' ? applyFormatToQuestion('strikeThrough') : applyFormatToAnswer('strikeThrough')}
                  align="left"
                  onAlign={(align) => activeQAField === 'question' ? applyFormatToQuestion('justify' + (align === 'left' ? 'Left' : align === 'center' ? 'Center' : 'Right')) : applyFormatToAnswer('justify' + (align === 'left' ? 'Left' : align === 'center' ? 'Center' : 'Right'))}
                  onBulletedList={() => activeQAField === 'question' ? applyFormatToQuestion('insertUnorderedList') : applyFormatToAnswer('insertUnorderedList')}
                  onNumberedList={() => activeQAField === 'question' ? applyFormatToQuestion('insertOrderedList') : applyFormatToAnswer('insertOrderedList')}
                  color="#111827"
                  onColorChange={(color) => activeQAField === 'question' ? applyFormatToQuestion('foreColor', color) : applyFormatToAnswer('foreColor', color)}
                  backgroundColor="transparent"
                  onBackgroundColorChange={(bg) => activeQAField === 'question' ? applyFormatToQuestion('backColor', bg) : applyFormatToAnswer('backColor', bg)}
                />
              </div>
            </div>
          )}

          {/* Q&A Container - Both Question and Answer with left purple accent bar */}
          <div className="w-full h-full flex gap-3">
            {/* Left Purple Accent Bar */}
            <div className="w-1 bg-gradient-to-b from-purple-400 via-purple-500 to-purple-600 rounded-full" style={{ minHeight: '100%' }}></div>
            
            {/* Q&A Content */}
            <div className="flex-1 flex flex-col gap-3">
            {/* Question Section */}
            <div className="rounded-xl overflow-hidden bg-white shadow-md border border-gray-200">
              <div className="p-2">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center shadow-md shrink-0">
                    <HelpCircle className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 relative">
                    {(!qaQuestionContent || qaQuestionContent === '' || qaQuestionContent === '<br>') && (
                      <div 
                        className="absolute inset-0 pointer-events-none text-gray-400"
                        style={{
                          fontSize: '22px',
                          fontFamily: 'DM Sans, sans-serif',
                        }}
                      >
                        Question
                      </div>
                    )}
                    <div 
                      ref={qaQuestionRef}
                      contentEditable
                      className="outline-none cursor-text relative z-10 text-gray-800"
                      style={{
                        fontFamily: `${qaFontFamily}, sans-serif`,
                        backgroundColor: 'transparent',
                        minHeight: '40px',
                        fontSize: '22px',
                        lineHeight: '1.6',
                        fontWeight: 'bold',
                      }}
                      onInput={handleQuestionInput}
                    onFocus={() => {
                      setIsEditing(true);
                      setActiveQAField('question');
                      onTextBoxUpdate(layoutId, boxId, { qaHasBeenInteracted: true });
                    }}
                    onBlur={(e) => {
                      const relatedTarget = e.relatedTarget as HTMLElement;
                      // CRITICAL: Don't clear activeQAField immediately - wait to see if user is clicking Answer
                      if (!relatedTarget || !relatedTarget.closest('[data-text-toolbar-root]')) {
                        setIsEditing(false);
                        
                        // Wait to see if focus is moving to Answer box
                        setTimeout(() => {
                          // If focus moved to Answer box, keep Answer visible
                          if (document.activeElement === qaAnswerRef.current) {
                            // User is clicking Answer - don't clear, let Answer's handlers take over
                            // Answer's onFocus will set activeQAField to 'answer'
                            return;
                          }
                          // Only clear if focus didn't move to Answer
                          if (document.activeElement !== qaAnswerRef.current) {
                            setActiveQAField(null);
                          }
                        }, 100);
                      }
                    }}
                      suppressContentEditableWarning
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Answer Section - Visible initially, hides only if empty after interaction */}
            {/* Show Answer box if: never interacted, has content, or any field is active */}
            {/* CRITICAL: Keep visible when activeQAField is 'answer' or 'question' to prevent disappearing */}
            {(!qaHasBeenInteracted || 
              (qaAnswerContent && qaAnswerContent.trim() !== '' && qaAnswerContent !== '<br>') || 
              activeQAField === 'answer' ||
              activeQAField === 'question') && (
              <div 
                className="rounded-xl overflow-hidden bg-white shadow-md border border-gray-200 cursor-text"
                onMouseDownCapture={(e) => {
                  // CRITICAL: Use CAPTURE phase to set activeQAField BEFORE Question's blur runs
                  // Capture phase fires first, so this ensures Answer is active when switching from Question
                  setActiveQAField('answer');
                  setIsEditing(true);
                  onTextBoxUpdate(layoutId, boxId, { qaHasBeenInteracted: true });
                }}
                onMouseDown={(e) => {
                  // CRITICAL: Set activeQAField IMMEDIATELY when clicking Answer container
                  // This MUST happen BEFORE Question's blur handler runs
                  setActiveQAField('answer');
                  setIsEditing(true);
                  onTextBoxUpdate(layoutId, boxId, { qaHasBeenInteracted: true });
                  
                  // If clicking on the container (not the Answer div itself), focus the Answer div
                  if (e.target !== qaAnswerRef.current && !qaAnswerRef.current?.contains(e.target as Node)) {
                    // Focus immediately (synchronously) to take focus from Question
                    if (qaAnswerRef.current) {
                      qaAnswerRef.current.contentEditable = 'true';
                      qaAnswerRef.current.focus();
                    }
                  }
                }}
              >
                <div className="p-2 relative min-h-[80px]">
                  {(!qaAnswerContent || qaAnswerContent === '' || qaAnswerContent === '<br>') && (
                    <div 
                      className="absolute top-2 left-2 pointer-events-none text-gray-400"
                      style={{
                        fontSize: '22px',
                        fontFamily: 'DM Sans, sans-serif',
                      }}
                    >
                      Answer
                    </div>
                  )}
                  <div 
                    ref={(node) => {
                      qaAnswerRef.current = node;
                      // CRITICAL: Always ensure contentEditable is enabled when ref is set
                      // This runs every time the Answer box is rendered/mounted
                      if (node) {
                        // Set immediately (synchronous)
                        node.contentEditable = 'true';
                        node.removeAttribute('disabled');
                        node.removeAttribute('readonly');
                        node.setAttribute('tabindex', '0');
                        
                        // Then use requestAnimationFrame for async operations
                        requestAnimationFrame(() => {
                          if (node && node === qaAnswerRef.current) {
                            // Ensure it's still enabled
                            node.contentEditable = 'true';
                            
                            // If there's saved content, restore it
                            if (box.qaAnswerContent && box.qaAnswerContent.trim() !== '' && box.qaAnswerContent !== '<br>') {
                              const currentContent = node.innerHTML.trim() || '';
                              if (currentContent !== box.qaAnswerContent.trim() && currentContent === '') {
                                node.innerHTML = box.qaAnswerContent;
                                // Re-enable after setting content
                                node.contentEditable = 'true';
                              }
                            }
                            
                            // Final check - ensure contentEditable is enabled
                            if (node.contentEditable !== 'true') {
                              node.contentEditable = 'true';
                            }
                          }
                        });
                      }
                    }}
                    contentEditable={true}
                    className="w-full outline-none cursor-text relative z-10 text-gray-800"
                    style={{
                      fontFamily: `${qaFontFamily}, sans-serif`,
                      backgroundColor: 'transparent',
                      minHeight: '60px',
                      fontSize: '22px',
                      lineHeight: '1.6',
                      fontWeight: 'bold',
                      pointerEvents: 'auto',
                      userSelect: 'text',
                      WebkitUserSelect: 'text',
                      MozUserSelect: 'text',
                    }}
                    data-qa-answer-editor="true"
                    role="textbox"
                    aria-multiline="true"
                    onInput={(e) => {
                      // Ensure contentEditable stays enabled during input
                      if (qaAnswerRef.current && qaAnswerRef.current.contentEditable !== 'true') {
                        qaAnswerRef.current.contentEditable = 'true';
                      }
                      handleAnswerInput(e);
                    }}
                    onFocus={(e) => {
                      // CRITICAL: Ensure contentEditable is enabled and editor is active
                      if (qaAnswerRef.current) {
                        qaAnswerRef.current.contentEditable = 'true';
                        
                        // Ensure focus is maintained
                        if (document.activeElement !== qaAnswerRef.current) {
                          qaAnswerRef.current.focus();
                        }
                        
                        // Set cursor position
                        requestAnimationFrame(() => {
                          if (qaAnswerRef.current) {
                            const range = document.createRange();
                            const selection = window.getSelection();
                            if (selection) {
                              if (qaAnswerRef.current.childNodes.length > 0) {
                                range.selectNodeContents(qaAnswerRef.current);
                                range.collapse(false);
                              } else {
                                range.setStart(qaAnswerRef.current, 0);
                                range.collapse(true);
                              }
                              selection.removeAllRanges();
                              selection.addRange(range);
                            }
                          }
                        });
                      }
                      
                      // Activate editing state and bind toolbar
                      setIsEditing(true);
                      setActiveQAField('answer');
                      onTextBoxUpdate(layoutId, boxId, { qaHasBeenInteracted: true });
                    }}
                    onBlur={(e) => {
                      const relatedTarget = e.relatedTarget as HTMLElement;
                      // Only clear active field if not clicking on toolbar
                      if (!relatedTarget || !relatedTarget.closest('[data-text-toolbar-root]')) {
                        setIsEditing(false);
                        
                        // CRITICAL FIX: Don't clear activeQAField immediately on blur
                        // Wait to see if user is clicking on Question or outside
                        // Use longer delay to ensure mouse events complete
                        setTimeout(() => {
                          // Check if Answer box still has content
                          const hasContent = qaAnswerRef.current && 
                                           (qaAnswerRef.current.innerHTML.trim() !== '' && 
                                            qaAnswerRef.current.innerHTML.trim() !== '<br>');
                          
                          // Check if focus moved to Question box
                          if (document.activeElement === qaQuestionRef.current) {
                            // User clicked on Question - keep Answer visible if it has content
                            setActiveQAField('question');
                          } else if (document.activeElement !== qaAnswerRef.current) {
                            // Focus moved outside both fields
                            if (hasContent || (qaAnswerContent && qaAnswerContent.trim() !== '' && qaAnswerContent !== '<br>')) {
                              // Answer has content, keep it visible but clear active field
                              setActiveQAField(null);
                            } else {
                              // Answer is empty, hide it
                              setActiveQAField(null);
                            }
                          }
                          // If focus is still on Answer box, keep activeQAField as 'answer'
                        }, 200);
                      }
                    }}
                    onMouseDownCapture={(e) => {
                      // CRITICAL: Use CAPTURE phase to set activeQAField BEFORE Question's blur runs
                      // Capture phase fires FIRST, before any other handlers
                      // This ensures Answer becomes active even when switching from Question
                      setActiveQAField('answer');
                      setIsEditing(true);
                      onTextBoxUpdate(layoutId, boxId, { qaHasBeenInteracted: true });
                    }}
                    onMouseDown={(e) => {
                      // CRITICAL: Set activeQAField IMMEDIATELY on mouseDown
                      // DON'T stop propagation - we need default behavior for contentEditable
                      
                      // Set state IMMEDIATELY - this prevents Question's blur from clearing it
                      setActiveQAField('answer');
                      setIsEditing(true);
                      onTextBoxUpdate(layoutId, boxId, { qaHasBeenInteracted: true });
                      
                      if (qaAnswerRef.current) {
                        // Force contentEditable to be true IMMEDIATELY
                        qaAnswerRef.current.contentEditable = 'true';
                        qaAnswerRef.current.removeAttribute('disabled');
                        qaAnswerRef.current.removeAttribute('readonly');
                        
                        // Focus IMMEDIATELY (synchronously) to take focus from Question
                        // This prevents Question's blur from running or clears it faster
                        qaAnswerRef.current.focus();
                        
                        // Set cursor position in next frame
                        requestAnimationFrame(() => {
                          if (qaAnswerRef.current) {
                            const range = document.createRange();
                            const selection = window.getSelection();
                            if (selection) {
                              if (qaAnswerRef.current.childNodes.length > 0) {
                                range.selectNodeContents(qaAnswerRef.current);
                                range.collapse(false);
                              } else {
                                range.setStart(qaAnswerRef.current, 0);
                                range.collapse(true);
                              }
                              selection.removeAllRanges();
                              selection.addRange(range);
                            }
                            
                            // Ensure contentEditable is still enabled
                            qaAnswerRef.current.contentEditable = 'true';
                          }
                        });
                      }
                    }}
                    onClick={(e) => {
                      // CRITICAL: Ensure Answer box stays visible and editable when clicked
                      // DON'T prevent default - we need default click behavior for contentEditable
                      
                      // Immediately set activeQAField to prevent disappearing
                      setActiveQAField('answer');
                      setIsEditing(true);
                      onTextBoxUpdate(layoutId, boxId, { qaHasBeenInteracted: true });
                      
                      if (qaAnswerRef.current) {
                        // Force contentEditable to be true IMMEDIATELY
                        qaAnswerRef.current.contentEditable = 'true';
                        qaAnswerRef.current.removeAttribute('disabled');
                        qaAnswerRef.current.removeAttribute('readonly');
                        
                        // Focus immediately
                        qaAnswerRef.current.focus();
                        
                        // Set cursor position in next frame
                        requestAnimationFrame(() => {
                          if (qaAnswerRef.current) {
                            const range = document.createRange();
                            const selection = window.getSelection();
                            if (selection) {
                              if (qaAnswerRef.current.childNodes.length > 0) {
                                range.selectNodeContents(qaAnswerRef.current);
                                range.collapse(false); // Move to end
                              } else {
                                range.setStart(qaAnswerRef.current, 0);
                                range.collapse(true);
                              }
                              selection.removeAllRanges();
                              selection.addRange(range);
                            }
                            
                            // Ensure contentEditable is still enabled
                            qaAnswerRef.current.contentEditable = 'true';
                            
                            // Trigger focus event to ensure toolbar binds
                            const focusEvent = new FocusEvent('focus', { bubbles: true });
                            qaAnswerRef.current.dispatchEvent(focusEvent);
                          }
                        });
                      }
                    }}
                    onKeyDown={(e) => {
                      // Ensure contentEditable stays enabled on key press
                      if (qaAnswerRef.current) {
                        // Force enable immediately
                        qaAnswerRef.current.contentEditable = 'true';
                        qaAnswerRef.current.removeAttribute('disabled');
                        qaAnswerRef.current.removeAttribute('readonly');
                        
                        // Ensure focus is maintained
                        if (document.activeElement !== qaAnswerRef.current) {
                          qaAnswerRef.current.focus();
                        }
                        
                        // Keep activeQAField as 'answer' while typing
                        if (activeQAField !== 'answer') {
                          setActiveQAField('answer');
                        }
                      }
                    }}
                    onKeyUp={(e) => {
                      // Ensure contentEditable stays enabled after key release
                      if (qaAnswerRef.current) {
                        qaAnswerRef.current.contentEditable = 'true';
                        qaAnswerRef.current.removeAttribute('disabled');
                        qaAnswerRef.current.removeAttribute('readonly');
                      }
                    }}
                    onKeyPress={(e) => {
                      // Additional safeguard - ensure editability on key press
                      if (qaAnswerRef.current) {
                        qaAnswerRef.current.contentEditable = 'true';
                      }
                    }}
                    suppressContentEditableWarning
                  />
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      );
    }

    // Special handling for caption - similar to insights but without heading and ticks
    if (box.elementType === 'caption') {
      const captionContent = box.captionContent ?? '';
      const captionFontFamily = box.fontFamily || 'DM Sans';
      const captionLogoType = box.captionLogoType || 'trending-up';
      const captionLogoColor = box.captionLogoColor || '#10B981';
      const backgroundColor = box.backgroundColor || 'transparent';

      const handleCaptionInput = () => {
        if (contentRef.current) {
          onTextBoxUpdate(layoutId, boxId, { captionContent: contentRef.current.innerHTML });
        }
      };

      const handleLogoClick = () => {
        // Toggle logo controls when logo is clicked
        setShowLogoControls(!showLogoControls);
        // Also focus the editor when opening logo controls
        if (!showLogoControls && contentRef.current) {
          contentRef.current.focus();
          setIsEditing(true);
          setShowInsightsToolbar(true);
          updateCaptionFormatState();
        } else if (showLogoControls) {
          // If closing logo controls, also close text toolbar if not editing
          if (contentRef.current) {
            contentRef.current.blur();
          }
        }
      };

      // Formatting state management
      const updateCaptionFormatState = () => {
        if (!contentRef.current) return;
        
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        
        const range = selection.getRangeAt(0);
        const element = range.commonAncestorContainer.nodeType === 3 
          ? range.commonAncestorContainer.parentElement 
          : range.commonAncestorContainer as HTMLElement;
        
        if (element && contentRef.current.contains(element)) {
          const computedStyle = window.getComputedStyle(element);
          const fontSize = parseInt(computedStyle.fontSize) || 16;
          setInsightsFontSize(fontSize);
          
          if (fontSize >= 34) {
            setInsightsTextStyle('header');
          } else if (fontSize >= 20) {
            setInsightsTextStyle('sub-header');
          } else {
            setInsightsTextStyle('paragraph');
          }
          
          const fontWeight = computedStyle.fontWeight;
          setInsightsBold(fontWeight === 'bold' || fontWeight === '700' || parseInt(fontWeight) >= 600);
          setInsightsItalic(computedStyle.fontStyle === 'italic');
          
          const textDecoration = computedStyle.textDecoration;
          setInsightsUnderline(textDecoration.includes('underline'));
          setInsightsStrikethrough(textDecoration.includes('line-through'));
        }
      };

      const applyFormatToCaption = (command: string, value?: string) => {
        if (contentRef.current) {
          contentRef.current.focus();
        }
        document.execCommand(command, false, value);
        handleCaptionInput();
        setTimeout(updateCaptionFormatState, 10);
      };

      // Render logo based on type
      const renderLogo = (type: string, color: string) => {
        const logoSize = 24;
        switch (type) {
          case 'trending-up':
            return <TrendingUp className="w-6 h-6" style={{ color }} />;
          case 'arrow-up':
            return (
              <svg width={logoSize} height={logoSize} viewBox="0 0 24 24" fill="none" style={{ color }}>
                <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            );
          case 'arrow-up-right':
            return (
              <svg width={logoSize} height={logoSize} viewBox="0 0 24 24" fill="none" style={{ color }}>
                <path d="M7 17L17 7M7 7h10v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            );
          case 'trending-up-circle':
            return (
              <svg width={logoSize} height={logoSize} viewBox="0 0 24 24" fill="none" style={{ color }}>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 16l4-4-4-4M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            );
          case 'line-chart':
            return (
              <svg width={logoSize} height={logoSize} viewBox="0 0 24 24" fill="none" style={{ color }}>
                <polyline points="3 18 9 12 13 16 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="3" cy="18" r="2" fill="currentColor"/>
                <circle cx="9" cy="12" r="2" fill="currentColor"/>
                <circle cx="13" cy="16" r="2" fill="currentColor"/>
                <circle cx="21" cy="6" r="2" fill="currentColor"/>
              </svg>
            );
          default:
            return <TrendingUp className="w-6 h-6" style={{ color }} />;
        }
      };

      // Always in edit mode - no preview mode needed
      return (
        <div 
          className="relative group/box flex flex-col gap-3" 
          style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}
        >
          {/* Three-dots menu - visible on hover */}
          <ElementMenuDropdown
            elementTypes={elementTypes}
            onElementChange={handleElementChange}
            boxId={boxId}
            layoutId={layoutId}
            onDeleteBox={onDeleteBox}
            onAddElement={onAddElement}
            selectedBoxIds={settings.selectedBoxIds}
            boxesInRow={boxesInRow}
          />
          {/* Toolbar */}
          {showInsightsToolbar && (
            <div className="absolute left-0 right-0 flex flex-col gap-2" style={{ top: '-76px', zIndex: 10000 }} onMouseDown={(e) => e.preventDefault()}>
              <div className="flex items-center gap-2 bg-white rounded-lg shadow-xl p-2 border border-gray-200">
                <div className="flex-1 overflow-x-auto">
                  <TextBoxToolbar
                    textStyle={insightsTextStyle}
                    onTextStyleChange={(style) => {
                      const defaultSize = style === 'header' ? 36 : style === 'sub-header' ? 22 : 18;
                      const defaultColor = style === 'paragraph' ? '#6B7280' : '#111827';
                      const isBold = style === 'header' || style === 'sub-header';
                      setInsightsTextStyle(style);
                      setInsightsFontSize(defaultSize);
                      setInsightsBold(isBold);
                      onTextBoxUpdate(layoutId, boxId, { 
                        textStyle: style,
                        fontSize: defaultSize,
                        color: defaultColor,
                        bold: isBold
                      });
                    }}
                    fontFamily={captionFontFamily}
                    onFontFamilyChange={(font) => {
                      applyFormatToCaption('fontName', font);
                      onTextBoxUpdate(layoutId, boxId, { fontFamily: font });
                    }}
                    fontSize={insightsFontSize}
                    onIncreaseFontSize={() => {
                      const selection = window.getSelection();
                      if (selection && selection.toString()) {
                        const currentSize = parseInt(window.getComputedStyle(selection.anchorNode?.parentElement || document.body).fontSize) || insightsFontSize;
                        applyFormatToCaption('fontSize', `${currentSize + 1}px`);
                      }
                    }}
                    onDecreaseFontSize={() => {
                      const selection = window.getSelection();
                      if (selection && selection.toString()) {
                        const currentSize = parseInt(window.getComputedStyle(selection.anchorNode?.parentElement || document.body).fontSize) || insightsFontSize;
                        applyFormatToCaption('fontSize', `${Math.max(currentSize - 1, 8)}px`);
                      }
                    }}
                    onApplyTextStyle={() => {}}
                    bold={insightsBold}
                    italic={insightsItalic}
                    underline={insightsUnderline}
                    strikethrough={insightsStrikethrough}
                    onToggleBold={() => applyFormatToCaption('bold')}
                    onToggleItalic={() => applyFormatToCaption('italic')}
                    onToggleUnderline={() => applyFormatToCaption('underline')}
                    onToggleStrikethrough={() => applyFormatToCaption('strikeThrough')}
                    align={box.captionAlign || 'left'}
                    onAlign={(align) => {
                      applyFormatToCaption('justify' + (align === 'left' ? 'Left' : align === 'center' ? 'Center' : 'Right'));
                      onTextBoxUpdate(layoutId, boxId, { captionAlign: align });
                    }}
                    onBulletedList={() => {}}
                    onNumberedList={() => {}}
                    color={box.captionColor || '#111827'}
                    onColorChange={(color) => {
                      applyFormatToCaption('foreColor', color);
                      onTextBoxUpdate(layoutId, boxId, { captionColor: color });
                    }}
                    backgroundColor={backgroundColor}
                    onBackgroundColorChange={(bg) => onTextBoxUpdate(layoutId, boxId, { backgroundColor: bg })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Caption Panel Card */}
          <div className="relative w-full flex-1" style={{ minHeight: 0 }}>
            <div 
              className={`w-full h-full rounded-xl overflow-hidden p-6 shadow-md border transition-all ${
                (showInsightsToolbar || showLogoControls) ? 'border-2 border-green-300' : 'border border-gray-200'
              }`}
              style={{
                background: backgroundColor
              }}
            >
              {/* Logo and Caption Content - Side by side */}
              <div className="flex items-start gap-3">
                {/* Logo - Always visible, clickable to toggle edit */}
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center shadow-md shrink-0 cursor-pointer hover:opacity-80 transition-opacity" 
                  style={{ backgroundColor: `${captionLogoColor}20` }}
                  onClick={handleLogoClick}
                  title="Click to edit caption"
                >
                  {renderLogo(captionLogoType, captionLogoColor)}
                </div>
                
                {/* Caption Content - On the right of logo */}
                <div className="flex-1 relative">
                  {(!captionContent || captionContent === '' || captionContent === '<br>' || captionContent.trim() === '') && !isEditing && (
                    <div 
                      className="absolute top-0 left-0 pointer-events-none text-gray-400 z-0"
                      style={{
                        fontSize: `${box.captionFontSize || 16}px`,
                        fontFamily: `${captionFontFamily}, sans-serif`,
                      }}
                    >
                      Add your caption here...
                    </div>
                  )}
                  <div 
                    ref={contentRef}
                    contentEditable={true}
                    className="outline-none cursor-text relative z-10"
                    style={{
                      fontFamily: `${captionFontFamily}, sans-serif`,
                      backgroundColor: 'transparent',
                      minHeight: '50px',
                      fontSize: `${box.captionFontSize || 16}px`,
                      color: box.captionColor || '#111827',
                      lineHeight: '1.8',
                    }}
                    onInput={(e) => {
                      handleCaptionInput();
                      // Hide placeholder when user starts typing
                      if (contentRef.current && contentRef.current.textContent && contentRef.current.textContent.trim() !== '') {
                        setIsEditing(true);
                      }
                    }}
                    onFocus={() => {
                      setIsEditing(true);
                      setShowInsightsToolbar(true);
                      updateCaptionFormatState();
                      // Don't show logo controls when text box is focused
                      // Logo controls should only show when logo is clicked
                    }}
                    onBlur={(e) => {
                      const relatedTarget = e.relatedTarget as HTMLElement;
                      // Don't close if clicking on logo, logo controls, or formatting toolbar
                      if (relatedTarget && (
                        relatedTarget.closest('[data-text-toolbar-root]') ||
                        relatedTarget.closest('[title="Click to edit caption"]') ||
                        relatedTarget.closest('select') ||
                        relatedTarget.closest('input[type="color"]')
                      )) {
                        return;
                      }
                      setIsEditing(false);
                      setShowInsightsToolbar(false);
                      // Save content on blur
                      handleCaptionInput();
                    }}
                    onClick={updateCaptionFormatState}
                    onKeyUp={updateCaptionFormatState}
                    onMouseUp={updateCaptionFormatState}
                    suppressContentEditableWarning
                  />
                </div>
              </div>

              {/* Logo Selection and Color Picker - Only show when logo is clicked */}
              {showLogoControls && (
                <div className="flex items-center gap-2 mt-3">
                  <Select
                    value={captionLogoType}
                    onValueChange={(value) => onTextBoxUpdate(layoutId, boxId, { captionLogoType: value as any })}
                  >
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trending-up">Trending Up</SelectItem>
                      <SelectItem value="arrow-up">Arrow Up</SelectItem>
                      <SelectItem value="arrow-up-right">Arrow Up Right</SelectItem>
                      <SelectItem value="trending-up-circle">Trending Circle</SelectItem>
                      <SelectItem value="line-chart">Line Chart</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="color"
                    value={captionLogoColor}
                    onChange={(e) => onTextBoxUpdate(layoutId, boxId, { captionLogoColor: e.target.value })}
                    className="w-10 h-8 p-1 border rounded cursor-pointer"
                    title="Logo Color"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Special handling for metric-card
    if (box.elementType === 'metric-card') {
      // Check if variable is selected
      const hasVariable = box.variableId || box.variableNameKey || box.variableName;
      const metricLabel = hasVariable 
        ? (box.metricLabel || box.variableName || 'BRAND VALUE')
        : 'Please select a variable to show its metric value..';
      
      // Check if variable matches current global filters
      let metricValue = hasVariable 
        ? (box.metricValue || box.value || '0')
        : '';
      
      // If variable exists, check if it matches current global filters
      // Only check if element interaction is 'apply' (default) - ignore 'ignore' and 'not-apply' modes
      const elementInteraction = settings.elementInteractions?.[boxId] || 'apply';
      if (hasVariable && (box.variableNameKey || box.variableName) && elementInteraction === 'apply') {
        const variableKey = box.variableNameKey || box.variableName || '';
        const globalFilters = settings.globalFilters || {};
        const enabledIdentifiers = settings.enabledGlobalFilterIdentifiers || [];
        
        // Parse identifiers from variable key
        const parseIdentifiersFromKey = (vKey: string): Record<string, string> => {
          const parts = vKey.split('_');
          const identifierTypes = ['brand', 'channel', 'year', 'month', 'week', 'region', 'category', 'segment'];
          const vIdentifiers: Record<string, string> = {};
          
          let i = 2; // Skip first 2 parts (measure and aggregation)
          while (i < parts.length) {
            const key = parts[i]?.toLowerCase();
            if (identifierTypes.includes(key) && i + 1 < parts.length) {
              let val = parts[i + 1];
              let nextIndex = i + 2;
              
              while (nextIndex < parts.length) {
                const nextPart = parts[nextIndex]?.toLowerCase();
                if (!identifierTypes.includes(nextPart)) {
                  val += '_' + parts[nextIndex];
                  nextIndex++;
                } else {
                  break;
                }
              }
              
              vIdentifiers[key] = val;
              i = nextIndex;
            } else {
              i++;
            }
          }
          
          return vIdentifiers;
        };
        
        const variableIdentifiers = parseIdentifiersFromKey(variableKey);
        
        // Check if variable matches all active global filters
        // Only check enabled identifiers (or all if none are enabled)
        const identifiersToCheck = enabledIdentifiers.length > 0 
          ? enabledIdentifiers.map(id => id.toLowerCase())
          : Object.keys(globalFilters).map(id => id.toLowerCase());
        
        // Check if any active global filter doesn't match the variable
        let variableMatchesFilters = true;
        
        for (const identifier of identifiersToCheck) {
          const filterConfig = globalFilters[identifier];
          if (filterConfig && filterConfig.values && filterConfig.values.length > 0 && !filterConfig.values.includes('__all__')) {
            // This identifier has an active global filter
            const filterValue = filterConfig.values[0];
            const variableValue = variableIdentifiers[identifier];
            
            // If variable doesn't have this identifier or value doesn't match, it's invalid
            if (!variableValue || variableValue !== filterValue) {
              variableMatchesFilters = false;
              break;
            }
          }
        }
        
        // If variable doesn't match filters, show "-"
        if (!variableMatchesFilters) {
          metricValue = '-';
        }
      }
      
      const metricUnit = box.metricUnit || '';
      const changeValue = box.changeValue || 0;
      const changeType = box.changeType || 'positive';
      const showTrend = box.showTrend !== undefined ? box.showTrend : true;
      const showGrowthRate = box.showGrowthRate || false;
      // Use box-specific format or fall back to 'none' if not set
      const valueFormat = box.valueFormat || 'none';
      const valueDecimalPlaces = box.valueDecimalPlaces !== undefined ? box.valueDecimalPlaces : 1; // Default to 1 decimal place
      const growthRateDecimalPlaces = box.growthRateDecimalPlaces !== undefined ? box.growthRateDecimalPlaces : 1; // Default to 1 decimal place
      
      // Format number based on selected format
      const formatNumber = (value: string | number, format: 'none' | 'thousands' | 'millions' | 'billions' | 'lakhs', decimals: number = valueDecimalPlaces): string => {
        const numValue = typeof value === 'string' ? parseFloat(value.replace(/[^\d.-]/g, '')) : value;
        if (isNaN(numValue)) return value.toString();
        
        switch (format) {
          case 'thousands':
            if (Math.abs(numValue) >= 1000) {
              return `${(numValue / 1000).toFixed(decimals)}K`;
            }
            return numValue.toFixed(decimals);
          case 'millions':
            if (Math.abs(numValue) >= 1000000) {
              return `${(numValue / 1000000).toFixed(decimals)}M`;
            } else if (Math.abs(numValue) >= 1000) {
              return `${(numValue / 1000).toFixed(decimals)}K`;
            }
            return numValue.toFixed(decimals);
          case 'billions':
            if (Math.abs(numValue) >= 1000000000) {
              return `${(numValue / 1000000000).toFixed(decimals)}B`;
            } else if (Math.abs(numValue) >= 1000000) {
              return `${(numValue / 1000000).toFixed(decimals)}M`;
            } else if (Math.abs(numValue) >= 1000) {
              return `${(numValue / 1000).toFixed(decimals)}K`;
            }
            return numValue.toFixed(decimals);
          case 'lakhs':
            if (Math.abs(numValue) >= 100000) {
              return `${(numValue / 100000).toFixed(decimals)}L`;
            } else if (Math.abs(numValue) >= 1000) {
              return `${(numValue / 1000).toFixed(decimals)}K`;
            }
            return numValue.toFixed(decimals);
          default:
            return numValue.toFixed(decimals);
        }
      };
      
      // Format value with unit and format
      // If metricValue is "-", display it directly without formatting
      const displayValue = metricValue === '-' 
        ? '-' 
        : (metricUnit ? `${formatNumber(metricValue, valueFormat)}${metricUnit}` : formatNumber(metricValue, valueFormat));
      
      // Format change percentage
      const changePercentage = changeValue > 0 ? `+${changeValue}%` : `${changeValue}%`;
      const isPositive = changeType === 'positive';
      
      // Calculate growth rate or absolute difference if enabled
      let growthRatePercentage: number | null = null;
      let absoluteDifference: number | null = null;
      let isGrowthPositive = false;
      let isDifferencePositive = false;
      const comparisonDisplayType = box.comparisonDisplayType || 'growthRate';
      
      if (showGrowthRate && box.variableNameKey && box.comparisonIdentifier && box.comparisonIdentifierValue) {
        // Growth rate or absolute difference will be calculated and set via settings panel
        // For now, use the stored value if available
        if (comparisonDisplayType === 'growthRate' && box.growthRateValue !== undefined) {
          growthRatePercentage = box.growthRateValue;
          isGrowthPositive = growthRatePercentage > 0;
        } else if (comparisonDisplayType === 'absoluteDifference' && box.absoluteDifferenceValue !== undefined) {
          absoluteDifference = box.absoluteDifferenceValue;
          isDifferencePositive = absoluteDifference > 0;
        }
      }
      
      const handleLabelChange = (newLabel: string) => {
        // Only update the display label, NOT the variable name
        // The variable name should remain unchanged for filtering purposes
        onTextBoxUpdate(layoutId, boxId, { metricLabel: newLabel });
      };

      // Filter variables based on search query
      const filteredVariables = variables.filter((variable) => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        const name = (variable.variableName || '').toLowerCase();
        const value = (variable.value || '').toLowerCase();
        const description = (variable.description || '').toLowerCase();
        return name.includes(query) || value.includes(query) || description.includes(query);
      });

      const handleSelectVariable = (variable: ConfigVariable) => {
        // Use variableNameKey if available, otherwise use variableName as the key
        const variableKey = variable.variableNameKey || variable.variableName;
        
        onTextBoxUpdate(layoutId, boxId, {
          variableId: variable.id,
          variableName: variable.variableName,
          variableNameKey: variableKey, // Save the key (either variableNameKey or variableName)
          metricLabel: variable.variableName,
          metricValue: variable.value || '0',
          value: variable.value,
          formula: variable.formula,
          // DO NOT auto-populate description or projectName - these should only be set by user input
          // description: variable.description, // REMOVED - never auto-populate
          usageSummary: variable.usageSummary,
          cardId: variable.cardId,
          atomId: variable.atomId,
          originCardId: variable.originCardId,
          originVariableId: variable.originVariableId,
          clientId: variable.clientId,
          appId: variable.appId,
          projectId: variable.projectId,
          // projectName: variable.projectName, // REMOVED - never auto-populate
          createdAt: variable.createdAt,
          updatedAt: variable.updatedAt,
        });
        setShowVariableDialog(false);
        setSearchQuery('');
      };

      const handleAddVariableClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowVariableDialog(true);
      };

      const isSelected = settings.selectedBoxId === boxId;
      
      const handleMetricCardClick = (e: React.MouseEvent) => {
        // Only select if clicking on the card itself, not on buttons or inputs
        if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) {
          return;
        }
        // Use the common multi-selection handler
        handleBoxClick(e);
      };

      // Find matching variable based on selected filters
      const findMatchingVariable = (filters: Record<string, string>) => {
        const activeFilters = Object.entries(filters).filter(([_, val]) => val !== '');
        if (activeFilters.length === 0) return null;
        
        const identifierTypes = ['brand', 'channel', 'year', 'month', 'week', 'region', 'category', 'segment'];
        
        return availableVariables.find((v: any) => {
          const vKey = v.variableNameKey || v.variableName;
          if (!vKey) return false;
          const parts = vKey.split('_');
          const varIdentifiers: Record<string, string> = {};
          
          let i = 2;
          while (i < parts.length) {
            const key = parts[i].toLowerCase();
            if (identifierTypes.includes(key) && i + 1 < parts.length) {
              let value = parts[i + 1];
              let nextIndex = i + 2;
              while (nextIndex < parts.length) {
                const nextPart = parts[nextIndex].toLowerCase();
                if (!identifierTypes.includes(nextPart)) {
                  value += '_' + parts[nextIndex];
                  nextIndex++;
                } else {
                  break;
                }
              }
              if (identifierOptions[key]) {
                varIdentifiers[key] = value;
              }
              i = nextIndex;
            } else {
              i++;
            }
          }
          
          const allMatch = activeFilters.every(([key, val]) => varIdentifiers[key] === val);
          return allMatch;
        });
      };

      // Handle filter change
      const handleFilterChange = (identifier: string, value: string) => {
        const filterValue = value === '__all__' ? '' : value;
        const newFilters = { ...selectedFilters, [identifier]: filterValue };
        setSelectedFilters(newFilters);
        
        const matchingVar = findMatchingVariable(newFilters);
        if (matchingVar) {
          onTextBoxUpdate(layoutId, boxId, {
            variableId: matchingVar.id,
            variableName: matchingVar.variableName,
            variableNameKey: matchingVar.variableNameKey || matchingVar.variableName,
            metricValue: matchingVar.value || '0',
            value: matchingVar.value,
            metricLabel: box.metricLabel || matchingVar.variableName,
          });
        }
      };

      return (
        <div 
          className={`relative group/box ${selectionClass}`}
          style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}
          onClick={handleMetricCardClick}
        >
          {/* Three-dots menu - visible on hover */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="absolute top-2 right-2 z-20 p-1.5 bg-white rounded-full shadow-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-opacity opacity-0 group-hover/box:opacity-100 flex items-center justify-center"
                title="More options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
                  Change Element
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  {elementTypes.map((element) => {
                    const Icon = element.icon;
                    return (
                      <DropdownMenuItem
                        key={element.value}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleElementChange(element.value);
                        }}
                        className="flex items-center gap-2"
                      >
                        <Icon className="w-4 h-4" />
                        <span>{element.label}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleAddVariableClick(e as any); }}>
                {(!box.variableId && !box.variableNameKey) ? (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Variable
                  </>
                ) : (
                  <>
                    Change Variable
                  </>
                )}
              </DropdownMenuItem>
              {hasVariable && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub onOpenChange={(open) => setFilterMenuOpen(open)}>
                    <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
                      <Filter className="w-4 h-4 mr-2" />
                      Filter by Identifiers
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-64">
                      {loadingFilters ? (
                        <div className="p-3 text-center text-xs text-gray-500">
                          Loading filter options...
                        </div>
                      ) : Object.keys(identifierOptions).length > 0 ? (
                        Object.keys(identifierOptions).map((identifier) => {
                          const options = identifierOptions[identifier] || [];
                          const currentValue = selectedFilters[identifier] || '__all__';
                          
                          return (
                            <DropdownMenuSub key={identifier}>
                              <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
                                <span className="capitalize">{identifier.replace(/_/g, ' ')}</span>
                                {currentValue !== '__all__' && (
                                  <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                                    {String(currentValue).replace(/_/g, ' ')}
                                  </span>
                                )}
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent className="w-56">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFilterChange(identifier, '__all__');
                                  }}
                                  className={currentValue === '__all__' ? 'bg-blue-50' : ''}
                                >
                                  <span className="text-xs">All {identifier}s</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {options.map((value) => (
                                  <DropdownMenuItem
                                    key={value}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleFilterChange(identifier, value);
                                    }}
                                    className={currentValue === value ? 'bg-blue-50' : ''}
                                  >
                                    <span className="text-xs">{String(value).replace(/_/g, ' ')}</span>
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          );
                        })
                      ) : (
                        <div className="p-3 text-center text-xs text-gray-500">
                          No identifier filters available
                        </div>
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Element
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddElement(layoutId, boxId, 'left');
                    }}
                    className="flex items-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Add to the Left</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddElement(layoutId, boxId, 'right');
                    }}
                    className="flex items-center gap-2"
                  >
                    <ArrowRight className="w-4 h-4" />
                    <span>Add to the Right</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddElement(layoutId, boxId, 'above');
                    }}
                    className="flex items-center gap-2"
                  >
                    <ArrowUp className="w-4 h-4" />
                    <span>Add Above</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddElement(layoutId, boxId, 'below');
                    }}
                    className="flex items-center gap-2"
                  >
                    <ArrowDown className="w-4 h-4" />
                    <span>Add Below</span>
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteBox(layoutId, boxId);
                }}
                className="flex items-center gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Edit Interactions Controls - visible when Edit Interactions mode is enabled */}
          {settings.editInteractionsMode && (
            <div 
              className="absolute top-2 left-2 z-30 flex items-center gap-1 bg-white rounded-lg shadow-lg border border-gray-300 p-1"
              onClick={(e) => e.stopPropagation()}
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const currentInteraction = settings.elementInteractions?.[boxId] || 'apply';
                        const newInteraction = currentInteraction === 'apply' ? 'not-apply' : currentInteraction === 'not-apply' ? 'ignore' : 'apply';
                        onSettingsChange({
                          elementInteractions: {
                            ...(settings.elementInteractions || {}),
                            [boxId]: newInteraction
                          }
                        });
                      }}
                      className={`p-1.5 rounded transition-colors ${
                        (settings.elementInteractions?.[boxId] || 'apply') === 'apply'
                          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          : (settings.elementInteractions?.[boxId] || 'apply') === 'not-apply'
                          ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {(settings.elementInteractions?.[boxId] || 'apply') === 'apply' ? (
                        <Filter className="w-4 h-4" />
                      ) : (settings.elementInteractions?.[boxId] || 'apply') === 'not-apply' ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Minus className="w-4 h-4" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      {(settings.elementInteractions?.[boxId] || 'apply') === 'apply'
                        ? 'Filters apply (click to change)'
                        : (settings.elementInteractions?.[boxId] || 'apply') === 'not-apply'
                        ? 'Filters don\'t apply (click to change)'
                        : 'Filters ignored (click to change)'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {/* Metric Card */}
          <div 
            ref={metricCardRef}
            className={`w-full h-full rounded-xl bg-white border-2 border-yellow-200 shadow-lg p-6 flex flex-col justify-between relative ${showVariableDialog ? 'overflow-visible' : 'overflow-hidden'}`} 
            style={{ 
              minWidth: 0, 
              minHeight: 0,
              zIndex: showVariableDialog ? 9998 : 'auto'
            }}
            onMouseEnter={(e) => {
              // Only set hover if we're actually entering the card (not bubbling from children)
              if (e.currentTarget === e.target || e.currentTarget.contains(e.target as Node)) {
                setIsMetricCardHovered(true);
              }
            }}
            onMouseLeave={(e) => {
              // Only clear hover if we're actually leaving the card (not moving to a child)
              const relatedTarget = e.relatedTarget as Node | null;
              if (!metricCardRef.current?.contains(relatedTarget)) {
                setIsMetricCardHovered(false);
              }
            }}
          >
            {/* Variable Selection - Positioned beside the box within canvas */}
            {showVariableDialog && (
              <div 
                className={`absolute top-0 bg-white rounded-xl p-4 flex flex-col shadow-2xl border-2 border-gray-300 ${variableDialogPosition.side === 'right' ? 'left-full ml-2' : 'right-full mr-2'}`}
                style={{ 
                  width: `${variableDialogPosition.width}px`, 
                  height: '100%', 
                  minHeight: '300px', 
                  maxHeight: '600px',
                  top: `${variableDialogPosition.top}px`,
                  zIndex: 9999
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">Select Variable</h3>
                  <button
                    onClick={() => setShowVariableDialog(false)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Search variables..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                      autoFocus
                    />
                  </div>

                  {/* Variables List */}
                  <div className="flex-1 overflow-y-auto space-y-2">
                    {filteredVariables.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        {searchQuery ? 'No variables found matching your search' : 'No variables available'}
                      </div>
                    ) : (
                      filteredVariables.map((variable) => (
                        <div
                          key={variable.id}
                          onClick={() => handleSelectVariable(variable)}
                          className="p-4 bg-gray-50 hover:bg-yellow-50 border border-gray-200 rounded-lg cursor-pointer transition-colors"
                        >
                          <div className="font-semibold text-sm text-gray-800 break-words">
                            {variable.variableName}
                          </div>
                          {variable.value && (
                            <div className="text-xs text-gray-600 mt-1">
                              Value: {variable.value}
                            </div>
                          )}
                          {variable.description && (
                            <div className="text-xs text-gray-500 mt-1 break-words">
                              {variable.description}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Header - Editable */}
            <div className="mb-4">
              {hasVariable ? (
                <>
                  <input
                    type="text"
                    value={metricLabel}
                    onChange={(e) => handleLabelChange(e.target.value)}
                    className="w-full outline-none bg-transparent border-none text-yellow-600 font-bold text-lg mb-1"
                    style={{ fontSize: '18px', fontWeight: 'bold', minWidth: 0, width: '100%' }}
                    placeholder="BRAND VALUE"
                  />
                  {/* Description and Project Name fields */}
                  {/* Placeholder text that should never be saved */}
                  {(() => {
                    const PLACEHOLDER_TEXT = 'Additional information…';
                    
                    // Helper to check if a value is empty or placeholder
                    const isEmptyOrPlaceholder = (value: string | undefined | null): boolean => {
                      if (!value) return true;
                      const trimmed = value.trim();
                      return trimmed === '' || trimmed === PLACEHOLDER_TEXT;
                    };
                    
                    // Check if fields have real user-entered content (not placeholder)
                    const hasDescription = box.description && !isEmptyOrPlaceholder(box.description);
                    const hasProjectName = box.projectName && !isEmptyOrPlaceholder(box.projectName);
                    
                    // Show fields container if: hovering, editing, OR if any field has content
                    const shouldShowFieldsContainer = isMetricCardHovered || isEditingDescription || isEditingProjectName || hasDescription || hasProjectName;
                    
                    if (shouldShowFieldsContainer) {
                      return (
                        <>
                          {/* Description field - Show if hovering, editing, OR has content */}
                          {(isMetricCardHovered || isEditingDescription || hasDescription) && (
                            <input
                              type="text"
                              value={isEmptyOrPlaceholder(box.description) ? '' : (box.description || '')}
                              onChange={(e) => {
                                let newValue = e.target.value;
                                // If user types exactly the placeholder, treat as empty
                                if (newValue.trim() === PLACEHOLDER_TEXT) {
                                  newValue = '';
                                }
                                onTextBoxUpdate(layoutId, boxId, { description: newValue });
                                // If content is entered, keep editing state active
                                if (newValue.trim() && newValue.trim() !== PLACEHOLDER_TEXT) {
                                  setIsEditingDescription(true);
                                }
                              }}
                              onFocus={() => setIsEditingDescription(true)}
                              onBlur={(e) => {
                                let value = e.target.value.trim();
                                // Clear if empty or placeholder text
                                if (!value || value === PLACEHOLDER_TEXT) {
                                  value = '';
                                  onTextBoxUpdate(layoutId, boxId, { description: '' });
                                  // Clear editing state if not hovering (field will be hidden)
                                  if (!isMetricCardHovered) {
                                    setIsEditingDescription(false);
                                  }
                                } else {
                                  // Keep editing state active so field remains visible
                                  setIsEditingDescription(true);
                                }
                              }}
                              onMouseEnter={() => setIsMetricCardHovered(true)}
                              className="w-full outline-none bg-transparent border-none text-xs text-gray-500"
                              style={{ minWidth: 0, width: '100%' }}
                              placeholder={PLACEHOLDER_TEXT}
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          {/* Project Name field - Show if hovering, editing, OR has content */}
                          {(isMetricCardHovered || isEditingProjectName || hasProjectName) && (
                            <input
                              type="text"
                              value={isEmptyOrPlaceholder(box.projectName) ? '' : (box.projectName || '')}
                              onChange={(e) => {
                                let newValue = e.target.value;
                                // If user types exactly the placeholder, treat as empty
                                if (newValue.trim() === PLACEHOLDER_TEXT) {
                                  newValue = '';
                                }
                                onTextBoxUpdate(layoutId, boxId, { projectName: newValue });
                                // If content is entered, keep editing state active
                                if (newValue.trim() && newValue.trim() !== PLACEHOLDER_TEXT) {
                                  setIsEditingProjectName(true);
                                }
                              }}
                              onFocus={() => setIsEditingProjectName(true)}
                              onBlur={(e) => {
                                let value = e.target.value.trim();
                                // Clear if empty or placeholder text
                                if (!value || value === PLACEHOLDER_TEXT) {
                                  value = '';
                                  onTextBoxUpdate(layoutId, boxId, { projectName: '' });
                                  // Clear editing state if not hovering (field will be hidden)
                                  if (!isMetricCardHovered) {
                                    setIsEditingProjectName(false);
                                  }
                                } else {
                                  // Keep editing state active so field remains visible
                                  setIsEditingProjectName(true);
                                }
                              }}
                              onMouseEnter={() => setIsMetricCardHovered(true)}
                              className="w-full outline-none bg-transparent border-none text-xs text-gray-400 mt-1"
                              style={{ minWidth: 0, width: '100%' }}
                              placeholder={PLACEHOLDER_TEXT}
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                        </>
                      );
                    } else {
                      // Completely hidden when not hovering and both fields are empty
                      // No placeholder text shown at all
                      return null;
                    }
                  })()}
                  {/* Additional Line - Show if exists */}
                  {box.additionalLine !== undefined && box.additionalLine !== null && (
                    <input
                      type="text"
                      value={box.additionalLine || ''}
                      onChange={(e) => onTextBoxUpdate(layoutId, boxId, { additionalLine: e.target.value })}
                      className="w-full outline-none bg-transparent border-none text-xs text-gray-500 mt-1"
                      placeholder="Additional information..."
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </>
              ) : (
                <div className="text-gray-400 italic text-base">
                  Please select a variable to show its metric value..
                </div>
              )}
            </div>

            {/* Value */}
            {hasVariable && (
              <div className="mb-4">
                <div className="text-4xl font-bold text-gray-900">
                  {displayValue}
                </div>
              </div>
            )}

            {/* Growth Rate / Absolute Difference indicator */}
            {showGrowthRate && ((comparisonDisplayType === 'growthRate' && growthRatePercentage !== null) || 
                                (comparisonDisplayType === 'absoluteDifference' && absoluteDifference !== null)) && (
              <div className={`inline-flex items-center gap-1 px-1 py-0.5 rounded-lg w-fit ${
                comparisonDisplayType === 'growthRate' 
                  ? (isGrowthPositive ? 'bg-green-100' : 'bg-red-100')
                  : (isDifferencePositive ? 'bg-green-100' : 'bg-red-100')
              }`} style={{ width: 'fit-content' }}>
                {comparisonDisplayType === 'growthRate' ? (
                  <>
                    <TrendingUp 
                      className={`w-4 h-4 ${isGrowthPositive ? 'text-green-600' : 'text-red-600 rotate-180'}`} 
                    />
                    <span className={`text-sm font-semibold ${
                      isGrowthPositive ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {isGrowthPositive ? '+' : ''}{growthRatePercentage!.toFixed(growthRateDecimalPlaces)}%
                    </span>
                  </>
                ) : (
                  <>
                    {isDifferencePositive ? (
                      <ArrowUp className="w-4 h-4 text-green-600" />
                    ) : (
                      <ArrowDown className="w-4 h-4 text-red-600" />
                    )}
                    <span className={`text-sm font-semibold ${
                      isDifferencePositive ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {isDifferencePositive ? '+' : ''}{absoluteDifference!.toFixed(growthRateDecimalPlaces)}
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Trend indicator */}
            {showTrend && changeValue !== 0 && !showGrowthRate && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                isPositive ? 'bg-green-100' : 'bg-red-100'
              }`}>
                <TrendingUp 
                  className={`w-4 h-4 ${isPositive ? 'text-green-600' : 'text-red-600 rotate-180'}`} 
                />
                <span className={`text-sm font-semibold ${
                  isPositive ? 'text-green-700' : 'text-red-700'
                }`}>
                  {changePercentage}
                </span>
              </div>
            )}

          </div>

        </div>
      );
    }

    // Special handling for image element
    if (box.elementType === 'image') {
      // Get the image URL - should already be in the correct format from upload
      let imageUrl = box.imageUrl || '';
      
      console.log('🖼️ Image element - raw imageUrl:', imageUrl);
      
      // If imageUrl is empty or doesn't look like a URL, don't render image
      if (!imageUrl || imageUrl.trim() === '') {
        imageUrl = '';
      } else if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/') && !imageUrl.startsWith('data:') && !imageUrl.includes('?')) {
        // If it's just a filename or object_name (no query params), construct the proper URL
        const encoded = encodeURIComponent(imageUrl);
        imageUrl = `${IMAGES_API}/content?object_name=${encoded}`;
        console.log('🖼️ Constructed image URL from object_name:', imageUrl);
      }
      
      const imageAlt = box.imageAlt || 'Image';
      const imageWidth = box.imageWidth || '100%';
      const imageHeight = box.imageHeight || 'auto';
      const imageObjectFit = box.imageObjectFit || 'contain';
      const imageBorderRadius = box.imageBorderRadius || '8px';
      
      const isSelected = settings.selectedBoxId === boxId;
      
      const handleImageClick = (e: React.MouseEvent) => {
        // Only select if clicking on the image container, not on resize handles
        if ((e.target as HTMLElement).closest('.resize-handle')) {
          return;
        }
        // Use the common multi-selection handler
        handleBoxClick(e);
      };

      const handleImageResizeStart = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (imageRef.current) {
          const rect = imageRef.current.getBoundingClientRect();
          setIsResizing(true);
          setResizeStart({
            x: e.clientX,
            y: e.clientY,
            width: rect.width,
            height: rect.height,
          });
        }
      };

      const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
          setImageUploadError('Please select a valid image file');
          return;
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          setImageUploadError('Image size must be less than 10MB');
          return;
        }

        setUploadingImage(true);
        setImageUploadError(null);

        try {
          const projectContext = getActiveProjectContext();
          if (!projectContext) {
            throw new Error('Project context not available');
          }

          const formData = new FormData();
          formData.append('file', file);
          formData.append('client_name', projectContext.client_name);
          formData.append('app_name', projectContext.app_name);
          formData.append('project_name', projectContext.project_name);

          const response = await fetch(`${IMAGES_API}/upload`, {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });

          if (!response.ok) {
            let errorMessage = 'Failed to upload image';
            try {
              const errorData = await response.json();
              errorMessage = errorData.detail || errorMessage;
            } catch {
              // Ignore JSON parse errors
            }
            throw new Error(errorMessage);
          }

          const result = await response.json();
          console.log('📸 Image upload response:', result);
          
          // Always use object_name to construct the content URL (consistent with Exhibition mode)
          const objectName = result.image?.object_name;
          
          if (!objectName) {
            throw new Error('Upload response did not include object_name');
          }
          
          // Construct the display URL using the content endpoint
          const encoded = encodeURIComponent(objectName);
          const imageUrl = `${IMAGES_API}/content?object_name=${encoded}`;
          
          console.log('📸 Object name:', objectName);
          console.log('📸 Final image URL:', imageUrl);

          // Update the image box with the uploaded image URL
          const updatedLayouts = settings.layouts?.map(layout => ({
            ...layout,
            boxes: layout.boxes.map(b =>
              b.id === boxId
                ? {
                    ...b,
                    imageUrl: imageUrl,
                    imageAlt: file.name || 'Uploaded image',
                    imageWidth: '100%',
                    imageHeight: 'auto',
                    imageObjectFit: 'contain',
                    imageBorderRadius: '8px',
                  }
                : b
            )
          }));

          onSettingsChange({ layouts: updatedLayouts });
        } catch (error: any) {
          console.error('Image upload error:', error);
          setImageUploadError(error.message || 'Failed to upload image');
        } finally {
          setUploadingImage(false);
          // Reset file input
          if (imageFileInputRef.current) {
            imageFileInputRef.current.value = '';
          }
        }
      };

      const handleUploadButtonClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent box selection when clicking upload button
        imageFileInputRef.current?.click();
      };

      return (
        <div 
          className={`relative group/box ${selectionClass}`}
          style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}
          onClick={handleImageClick}
        >
          {/* Three-dots menu - visible on hover */}
          <ElementMenuDropdown
            elementTypes={elementTypes}
            onElementChange={handleElementChange}
            boxId={boxId}
            layoutId={layoutId}
            onDeleteBox={onDeleteBox}
            onAddElement={onAddElement}
            selectedBoxIds={settings.selectedBoxIds}
            boxesInRow={boxesInRow}
            box={box}
            settings={settings}
            onSettingsChange={onSettingsChange}
          />

          <div className="relative w-full h-full rounded-xl overflow-hidden border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100/50 shadow-md hover:shadow-lg transition-all">
            {/* Hidden file input for image upload */}
            <input
              ref={imageFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            
            {imageUrl && imageUrl.trim() !== '' ? (
              <div 
                className="relative w-full h-full flex items-center justify-center p-4"
                onMouseEnter={() => setIsImageHovered(true)}
                onMouseLeave={() => setIsImageHovered(false)}
              >
                <div className="relative inline-block">
                  <img
                    ref={imageRef}
                    src={imageUrl}
                    alt={imageAlt}
                    style={{
                      width: imageWidth === '100%' ? '100%' : imageWidth,
                      height: imageHeight === 'auto' ? 'auto' : imageHeight,
                      objectFit: imageObjectFit,
                      borderRadius: imageBorderRadius,
                      maxWidth: '100%',
                      maxHeight: '100%',
                      cursor: isResizing ? 'nwse-resize' : (isImageHovered ? 'move' : 'default'),
                      display: 'block',
                    }}
                    className="select-none"
                    draggable={false}
                    onError={(e) => {
                      console.error('❌ Image failed to load:', imageUrl);
                      console.error('❌ Error details:', e);
                      console.error('❌ Image element:', e.target);
                      // Don't hide the image, let the browser show the broken image icon or alt text
                    }}
                    onLoad={() => {
                      console.log('✅ Image loaded successfully:', imageUrl);
                    }}
                  />
                  {/* Hover-based resize handles - only visible on hover, positioned relative to image */}
                  {isImageHovered && imageRef.current && (
                    <>
                      {/* Corner handles */}
                      {/* Top-left */}
                      <div
                        className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize resize-handle border-2 border-purple-500 bg-purple-500/30 hover:bg-purple-500/60 transition-colors z-10 rounded-sm"
                        style={{ transform: 'translate(-50%, -50%)' }}
                        onMouseDown={handleImageResizeStart}
                        title="Resize"
                      />
                      {/* Top-right */}
                      <div
                        className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize resize-handle border-2 border-purple-500 bg-purple-500/30 hover:bg-purple-500/60 transition-colors z-10 rounded-sm"
                        style={{ transform: 'translate(50%, -50%)' }}
                        onMouseDown={handleImageResizeStart}
                        title="Resize"
                      />
                      {/* Bottom-left */}
                      <div
                        className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize resize-handle border-2 border-purple-500 bg-purple-500/30 hover:bg-purple-500/60 transition-colors z-10 rounded-sm"
                        style={{ transform: 'translate(-50%, 50%)' }}
                        onMouseDown={handleImageResizeStart}
                        title="Resize"
                      />
                      {/* Bottom-right */}
                      <div
                        className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize resize-handle border-2 border-purple-500 bg-purple-500/30 hover:bg-purple-500/60 transition-colors z-10 rounded-sm"
                        style={{ transform: 'translate(50%, 50%)' }}
                        onMouseDown={handleImageResizeStart}
                        title="Resize"
                      />
                      {/* Edge handles */}
                      {/* Top */}
                      <div
                        className="absolute top-0 left-1/2 w-3 h-3 cursor-ns-resize resize-handle border-2 border-purple-500 bg-purple-500/30 hover:bg-purple-500/60 transition-colors z-10 rounded-sm"
                        style={{ transform: 'translate(-50%, -50%)' }}
                        onMouseDown={handleImageResizeStart}
                        title="Resize"
                      />
                      {/* Right */}
                      <div
                        className="absolute right-0 top-1/2 w-3 h-3 cursor-ew-resize resize-handle border-2 border-purple-500 bg-purple-500/30 hover:bg-purple-500/60 transition-colors z-10 rounded-sm"
                        style={{ transform: 'translate(50%, -50%)' }}
                        onMouseDown={handleImageResizeStart}
                        title="Resize"
                      />
                      {/* Bottom */}
                      <div
                        className="absolute bottom-0 left-1/2 w-3 h-3 cursor-ns-resize resize-handle border-2 border-purple-500 bg-purple-500/30 hover:bg-purple-500/60 transition-colors z-10 rounded-sm"
                        style={{ transform: 'translate(-50%, 50%)' }}
                        onMouseDown={handleImageResizeStart}
                        title="Resize"
                      />
                      {/* Left */}
                      <div
                        className="absolute left-0 top-1/2 w-3 h-3 cursor-ew-resize resize-handle border-2 border-purple-500 bg-purple-500/30 hover:bg-purple-500/60 transition-colors z-10 rounded-sm"
                        style={{ transform: 'translate(-50%, -50%)' }}
                        onMouseDown={handleImageResizeStart}
                        title="Resize"
                      />
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-4 space-y-4">
                <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-purple-100 to-purple-50 flex items-center justify-center border-2 border-purple-200">
                  <ImageIcon className="w-8 h-8 text-purple-500" />
                </div>
                <p className="text-sm font-medium text-foreground">Image</p>
                <Button
                  type="button"
                  onClick={handleUploadButtonClick}
                  disabled={uploadingImage}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <Upload className="w-4 h-4" />
                  {uploadingImage ? 'Uploading...' : 'Choose Image'}
                </Button>
                {imageUploadError && (
                  <p className="text-xs text-red-600 text-center px-4">
                    {imageUploadError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground text-center px-4">
                  Supported formats: JPG, PNG, GIF. Max size: 10MB
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Special handling for chart element
    if (box.elementType === 'chart') {
      const isSelected = settings.selectedBoxId === boxId;
      
      const handleChartClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button')) {
          return;
        }
        e.stopPropagation();
        onSettingsChange({ selectedBoxId: boxId });
      };

      // Parse chartConfig if it's a string (from MongoDB)
      let chartConfig: any = undefined;
      if (box.chartConfig) {
        if (typeof box.chartConfig === 'string') {
          try {
            chartConfig = JSON.parse(box.chartConfig);
          } catch (e) {
            console.error('Failed to parse chartConfig:', e);
          }
        } else {
          chartConfig = box.chartConfig;
        }
      }

      // Calculate height based on box dimensions - use layout height minus padding
      // Calculate box height: layout height minus padding (about 20px total)
      const boxHeight = Math.max(150, layoutHeight - 20);

      // Handle chart config changes (for series settings, theme, etc.)
      const handleChartConfigChange = (updatedConfig: any) => {
        const updatedLayouts = settings.layouts?.map(layout => ({
          ...layout,
          boxes: layout.boxes.map(box =>
            box.id === boxId
              ? { ...box, chartConfig: updatedConfig }
              : box
          )
        }));
        onSettingsChange({ layouts: updatedLayouts });
      };

      // Handle note changes for the chart - store notes per filter combination
      const handleNoteChange = (note: string, noteHtml?: string, noteFormatting?: any, filterKey?: string) => {
        // Initialize notesByFilter if it doesn't exist
        const currentNotesByFilter = (chartConfig as any).notesByFilter || {};
        
        // If filterKey is provided, save note per filter combination
        if (filterKey) {
          const updatedNotesByFilter = {
            ...currentNotesByFilter,
            [filterKey]: {
              note,
              ...(noteHtml !== undefined && { noteHtml }),
              ...(noteFormatting !== undefined && { noteFormatting })
            }
          };
          
          const updatedChartConfig = {
            ...chartConfig,
            notesByFilter: updatedNotesByFilter,
            // Also keep legacy note fields for backward compatibility (use current filter's note)
            note: note,
            ...(noteHtml !== undefined && { noteHtml }),
            ...(noteFormatting !== undefined && { noteFormatting })
          };
          
          const updatedLayouts = settings.layouts?.map(layout => ({
            ...layout,
            boxes: layout.boxes.map(box =>
              box.id === boxId
                ? { ...box, chartConfig: updatedChartConfig }
                : box
            )
          }));
          onSettingsChange({ layouts: updatedLayouts });
        } else {
          // Fallback for backward compatibility (no filter key provided)
          const updatedChartConfig = {
            ...chartConfig,
            note,
            ...(noteHtml !== undefined && { noteHtml }),
            ...(noteFormatting !== undefined && { noteFormatting })
          };
          const updatedLayouts = settings.layouts?.map(layout => ({
            ...layout,
            boxes: layout.boxes.map(box =>
              box.id === boxId
                ? { ...box, chartConfig: updatedChartConfig }
                : box
            )
          }));
          onSettingsChange({ layouts: updatedLayouts });
        }
      };

      // Extract filters from chart config
      const chartFilters = chartConfig?.filters || {};
      const hasFilters = Object.keys(chartFilters).length > 0;

      // Handle filter change
      const handleFilterChange = async (column: string, values: string[]) => {
        const newTempFilters = { ...tempFilters, [column]: values };
        setTempFilters(newTempFilters);

        // Update chart config immediately
        const updatedChartConfig = {
          ...chartConfig,
          filters: newTempFilters
        };

        // Re-render chart if it's already rendered
        if (chartConfig?.chartRendered && data) {
          try {
            const dataSource = (settings as any).selectedFile || (settings as any).dataSource;
            let objectName = dataSource || data.fileName;
            
            if (!objectName) return;

            if (!objectName.endsWith('.arrow')) {
              objectName += '.arrow';
            }

            const uploadResponse = await chartMakerApi.loadSavedDataframe(objectName);
            const fileId = uploadResponse.file_id;

            const migratedChart = migrateLegacyChart(updatedChartConfig);
            if (!validateChart(migratedChart)) return;

            const traces = buildTracesForAPI(migratedChart);
            const chartRequest = {
              file_id: fileId,
              chart_type: migratedChart.type === 'stacked_bar' ? 'bar' : migratedChart.type,
              traces: traces,
              title: migratedChart.title,
              filters: Object.keys(newTempFilters).length > 0 ? newTempFilters : undefined,
            };

            const chartResponse = await chartMakerApi.generateChart(chartRequest);
            
            const finalChartConfig = {
              ...updatedChartConfig,
              chartConfig: chartResponse.chart_config,
              filteredData: chartResponse.chart_config.data,
              chartRendered: true,
            };

            const updatedLayouts = settings.layouts?.map(layout => ({
              ...layout,
              boxes: layout.boxes.map(box =>
                box.id === boxId
                  ? { ...box, chartConfig: finalChartConfig }
                  : box
              )
            }));
            onSettingsChange({ layouts: updatedLayouts });
          } catch (error) {
            console.error('Error updating chart with new filters:', error);
          }
        } else {
          // Just update the config without re-rendering
          const updatedLayouts = settings.layouts?.map(layout => ({
            ...layout,
            boxes: layout.boxes.map(box =>
              box.id === boxId
                ? { ...box, chartConfig: updatedChartConfig }
                : box
            )
          }));
          onSettingsChange({ layouts: updatedLayouts });
        }
      };

      // Get available columns for filtering (exclude x and y axes)
      const getFilterableColumns = (): string[] => {
        if (!data || !data.headers) return [];
        const xAxis = chartConfig?.xAxis;
        const yAxis = chartConfig?.yAxis;
        return (data.headers as string[]).filter((col: string) => col !== xAxis && col !== yAxis);
      };

      return (
        <div 
          className={`relative group/box ${selectionClass}`}
          style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}
          onClick={handleChartClick}
        >
          {/* Three-dots menu - visible on hover */}
          <ElementMenuDropdown
            elementTypes={elementTypes}
            onElementChange={handleElementChange}
            boxId={boxId}
            layoutId={layoutId}
            onDeleteBox={onDeleteBox}
            onAddElement={onAddElement}
            selectedBoxIds={settings.selectedBoxIds}
            boxesInRow={boxesInRow}
          />

          {/* Edit Interactions Controls - visible when Edit Interactions mode is enabled */}
          {settings.editInteractionsMode && (
            <div 
              className="absolute top-2 left-2 z-30 flex items-center gap-1 bg-white rounded-lg shadow-lg border border-gray-300 p-1"
              onClick={(e) => e.stopPropagation()}
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const currentInteraction = settings.elementInteractions?.[boxId] || 'apply';
                        const newInteraction = currentInteraction === 'apply' ? 'not-apply' : currentInteraction === 'not-apply' ? 'ignore' : 'apply';
                        onSettingsChange({
                          elementInteractions: {
                            ...(settings.elementInteractions || {}),
                            [boxId]: newInteraction
                          }
                        });
                      }}
                      className={`p-1.5 rounded transition-colors ${
                        (settings.elementInteractions?.[boxId] || 'apply') === 'apply'
                          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          : (settings.elementInteractions?.[boxId] || 'apply') === 'not-apply'
                          ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {(settings.elementInteractions?.[boxId] || 'apply') === 'apply' ? (
                        <Filter className="w-4 h-4" />
                      ) : (settings.elementInteractions?.[boxId] || 'apply') === 'not-apply' ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Minus className="w-4 h-4" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      {(settings.elementInteractions?.[boxId] || 'apply') === 'apply'
                        ? 'Filters apply (click to change)'
                        : (settings.elementInteractions?.[boxId] || 'apply') === 'not-apply'
                        ? 'Filters don\'t apply (click to change)'
                        : 'Filters ignored (click to change)'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {/* Chart Container */}
          <div className="w-full h-full rounded-xl overflow-hidden bg-white border-2 border-blue-200 shadow-lg relative" style={{ maxHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
            <ChartElement 
              chartConfig={chartConfig}
              width={undefined}
              height={boxHeight}
              onNoteChange={handleNoteChange}
              onChartConfigChange={handleChartConfigChange}
              // fileId is optional - ChartElement will handle chart type changes without it if needed
            />
            
            {/* Filter Display - positioned between title and chart, on the left */}
            {(hasFilters || filterEditorOpen) && (
              <div className="absolute left-2 z-10 opacity-0 group-hover/box:opacity-100 transition-opacity duration-200 pointer-events-none" style={{ top: chartConfig?.title ? '52px' : '8px' }}>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {Object.entries(tempFilters.length > 0 ? tempFilters : chartFilters).map(([key, values]) => {
                    const filterValues = Array.isArray(values) ? values : [values];
                    return filterValues.length > 0 ? filterValues.map((value, idx) => (
                      <div
                        key={`${key}-${idx}`}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded-md text-xs font-medium text-blue-700"
                      >
                        <Filter className="w-3 h-3 text-blue-600" />
                        <span className="text-blue-600 font-semibold capitalize">{key}:</span>
                        <span className="text-blue-800">{String(value).replace(/_/g, ' ')}</span>
                      </div>
                    )) : null;
                  })}
                </div>
              </div>
            )}

            {/* Filter Editor Button - visible on hover, positioned top-right, left of three-dots */}
            <Popover open={filterEditorOpen} onOpenChange={setFilterEditorOpen}>
              <PopoverTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilterEditorOpen(true);
                  }}
                  className="absolute top-2 right-10 z-20 p-1.5 bg-white rounded-full shadow-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-opacity opacity-0 group-hover/box:opacity-100 flex items-center justify-center pointer-events-auto"
                  title="Edit Filters"
                >
                  <Filter className="w-4 h-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent 
                className="w-80 max-h-[550px] p-0 flex flex-col" 
                align="end"
                onClick={(e) => e.stopPropagation()}
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <div className="p-3 border-b flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm">Chart Filters</h4>
                    <button
                      onClick={() => setFilterEditorOpen(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <ScrollArea className="h-[450px]">
                  <div className="p-3 space-y-2">
                    {loadingUniqueValues ? (
                      <div className="text-center py-4 text-sm text-gray-500">
                        Loading filter options...
                      </div>
                    ) : (
                      (getFilterableColumns() || []).map((column: string) => {
                        const columnValues = uniqueValues[column] || [];
                        const selectedValues = tempFilters[column] || [];
                        const allSelected = columnValues.length > 0 && selectedValues.length === columnValues.length;
                        const isExpanded = expandedIdentifiers[column] ?? false;
                        const searchTerm = searchTerms[column] || '';
                        
                        // Filter values based on search term
                        const filteredValues = searchTerm
                          ? columnValues.filter(value => 
                              String(value).toLowerCase().includes(searchTerm.toLowerCase())
                            )
                          : columnValues;

                        return (
                          <div key={column} className="border border-gray-200 rounded-lg overflow-hidden">
                            {/* Header - Clickable to expand/collapse */}
                            <button
                              onClick={() => {
                                setExpandedIdentifiers(prev => ({
                                  ...prev,
                                  [column]: !prev[column]
                                }));
                              }}
                              className="w-full flex items-center justify-between p-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <ChevronDown 
                                  className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${
                                    isExpanded ? 'transform rotate-180' : ''
                                  }`}
                                />
                                <Label className="text-sm font-medium capitalize text-left truncate">
                                  {column.replace(/_/g, ' ')}
                                </Label>
                                {selectedValues.length > 0 && (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                    {selectedValues.length}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Checkbox
                                  checked={allSelected}
                                  onCheckedChange={(checked) => {
                                    handleFilterChange(column, checked ? columnValues : []);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <span className="text-xs text-gray-500">
                                  All
                                </span>
                              </div>
                            </button>
                            
                            {/* Collapsible Content */}
                            {isExpanded && (
                              <div className="p-2.5 space-y-2 bg-white">
                                {/* Search Input */}
                                {columnValues.length > 5 && (
                                  <div className="relative">
                                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                    <Input
                                      type="text"
                                      placeholder="Search values..."
                                      value={searchTerm}
                                      onChange={(e) => {
                                        setSearchTerms(prev => ({
                                          ...prev,
                                          [column]: e.target.value
                                        }));
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="pl-8 h-8 text-xs"
                                    />
                                  </div>
                                )}
                                
                                {/* Values List */}
                                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                                  {filteredValues.length === 0 ? (
                                    <p className="text-xs text-gray-400 text-center py-2">
                                      {searchTerm ? 'No matching values' : 'No values available'}
                                    </p>
                                  ) : (
                                    filteredValues.map((value) => (
                                      <div key={value} className="flex items-center space-x-2 py-0.5">
                                        <Checkbox
                                          checked={selectedValues.includes(value)}
                                          onCheckedChange={(checked) => {
                                            const newValues = checked
                                              ? [...selectedValues, value]
                                              : selectedValues.filter((v) => v !== value);
                                            handleFilterChange(column, newValues);
                                          }}
                                        />
                                        <span className="text-xs text-gray-700">{String(value).replace(/_/g, ' ')}</span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                    {getFilterableColumns().length === 0 && !loadingUniqueValues && (
                      <div className="text-center py-4 text-sm text-gray-500">
                        No filterable columns available
                      </div>
                    )}
                  </div>
                </ScrollArea>
                {hasFilters && (
                  <div className="p-3 border-t bg-gray-50 flex-shrink-0">
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(tempFilters).map(([key, values]) => {
                        const filterValues = Array.isArray(values) ? values : [];
                        if (filterValues.length === 0) return null;
                        return filterValues.map((value, idx) => (
                          <div
                            key={`${key}-${idx}`}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded-md text-xs font-medium text-blue-700"
                          >
                            <span className="text-blue-600 font-semibold capitalize">{key}:</span>
                            <span className="text-blue-800">{String(value).replace(/_/g, ' ')}</span>
                          </div>
                        ));
                      })}
                    </div>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      );
    }

    // Special handling for table element
    if (box.elementType === 'table') {
      const isSelected = settings.selectedBoxId === boxId;
      
      const handleTableClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button')) {
          return;
        }
        // Use the common multi-selection handler
        handleBoxClick(e);
      };

      // Parse tableSettings if it's a string (from MongoDB)
      let tableSettings: any = undefined;
      if (box.tableSettings) {
        if (typeof box.tableSettings === 'string') {
          try {
            tableSettings = JSON.parse(box.tableSettings);
          } catch (e) {
            console.error('Failed to parse tableSettings:', e);
          }
        } else {
          tableSettings = box.tableSettings;
        }
      }

      // Calculate height based on box dimensions
      const boxHeight = Math.max(150, layoutHeight - 20);

      // Handle table settings change (for pagination)
      const handleTableSettingsChange = (newSettings: Partial<typeof tableSettings>) => {
        const currentLayouts = settings.layouts || [];
        const updatedLayouts = currentLayouts.map(l => ({
          ...l,
          boxes: l.boxes.map(b =>
            b.id === boxId
              ? {
                  ...b,
                  tableSettings: {
                    ...tableSettings,
                    ...newSettings,
                  }
                }
              : b
          )
        }));
        onSettingsChange({ layouts: updatedLayouts });
      };

      return (
        <div 
          className={`relative group/box ${selectionClass}`}
          style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}
          onClick={handleTableClick}
        >
          {/* Edit Interactions Controls - visible when Edit Interactions mode is enabled */}
          {settings.editInteractionsMode && (
            <div 
              className="absolute top-2 left-2 z-30 flex items-center gap-1 bg-white rounded-lg shadow-lg border border-gray-300 p-1"
              onClick={(e) => e.stopPropagation()}
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const currentInteraction = settings.elementInteractions?.[boxId] || 'apply';
                        const newInteraction = currentInteraction === 'apply' ? 'not-apply' : currentInteraction === 'not-apply' ? 'ignore' : 'apply';
                        onSettingsChange({
                          elementInteractions: {
                            ...(settings.elementInteractions || {}),
                            [boxId]: newInteraction
                          }
                        });
                      }}
                      className={`p-1.5 rounded transition-colors ${
                        (settings.elementInteractions?.[boxId] || 'apply') === 'apply'
                          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          : (settings.elementInteractions?.[boxId] || 'apply') === 'not-apply'
                          ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {(settings.elementInteractions?.[boxId] || 'apply') === 'apply' ? (
                        <Filter className="w-4 h-4" />
                      ) : (settings.elementInteractions?.[boxId] || 'apply') === 'not-apply' ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Minus className="w-4 h-4" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      {(settings.elementInteractions?.[boxId] || 'apply') === 'apply'
                        ? 'Filters apply (click to change)'
                        : (settings.elementInteractions?.[boxId] || 'apply') === 'not-apply'
                        ? 'Filters don\'t apply (click to change)'
                        : 'Filters ignored (click to change)'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {/* Table Container */}
          <div className="relative w-full h-full rounded-xl overflow-hidden bg-white border-2 border-teal-200 shadow-lg group/tablecontainer" style={{ maxHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
            {/* Three-dots menu - positioned relative to Table Container, visible on hover */}
            <ElementMenuDropdown
              elementTypes={elementTypes}
              onElementChange={handleElementChange}
              boxId={boxId}
              layoutId={layoutId}
              onDeleteBox={onDeleteBox}
              onAddElement={onAddElement}
              selectedBoxIds={settings.selectedBoxIds}
              boxesInRow={boxesInRow}
              containerClassName="group-hover/tablecontainer:opacity-100"
            />
            <TableElement 
              tableSettings={tableSettings}
              width={undefined}
              height={boxHeight}
              onSettingsChange={handleTableSettingsChange}
              atomId={atomId}
              boxId={boxId}
            />
          </div>
        </div>
      );
    }

    // For other element types, show the standard renderer
    return (
      <div 
        className={`relative group/box cursor-pointer ${selectionClass}`}
        onClick={handleBoxClick} 
        style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}
        onDoubleClick={handleDoubleClick}
        title="Double-click to change element"
      >
        {/* Ambient glow */}
        <div className="absolute -inset-1 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl blur-lg opacity-0 group-hover/box:opacity-100 transition-opacity duration-300" />
        
        {/* Full Element Display */}
        <div className="relative w-full h-full border-2 border-primary/40 rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 bg-white">
          <ElementRenderer type={box.elementType} />
          
          {/* Hover overlay with hint */}
          <div className="absolute inset-0 bg-black/0 group-hover/box:bg-black/5 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover/box:opacity-100">
            <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg">
              <p className="text-xs font-medium text-gray-700">Double-click to change</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Otherwise, show the dropdown (either no element or in edit mode)
  return (
    <div 
      className={`relative group/box ${selectionClass}`} 
      style={{ gridColumn: `span ${width}`, minHeight: 0, height: '100%' }}
      onClick={handleBoxClick}
    >
      {/* Ambient glow for selected elements */}
      {box.elementType && (
        <div className="absolute -inset-1 bg-gradient-to-br from-yellow-100/50 to-yellow-50/30 rounded-xl blur-lg opacity-0 group-hover/box:opacity-100 transition-opacity duration-300" />
      )}
      
      <Select
        value={box.elementType || ''}
        onValueChange={handleElementChange}
        open={isEditMode ? true : undefined}
        onOpenChange={(open) => !open && setIsEditMode(false)}
      >
        <SelectTrigger 
          className={`
            relative w-full h-full flex flex-col items-start justify-start p-0 overflow-hidden
            border-2 rounded-xl transition-all duration-300
            ${box.elementType 
              ? 'border-yellow-200 bg-gradient-to-br from-yellow-50 to-amber-50 hover:border-yellow-300 shadow-[0_4px_16px_-4px_rgba(251,191,36,0.15)] hover:shadow-[0_8px_24px_-8px_rgba(251,191,36,0.25)]' 
              : 'border-dashed border-border/60 hover:border-yellow-300 bg-gradient-to-br from-card to-muted/20 hover:from-yellow-50/50 hover:to-amber-50/50 shadow-[0_2px_8px_-2px_hsl(var(--foreground)/0.05)] hover:shadow-[0_8px_20px_-8px_rgba(251,191,36,0.15)]'
            }
          `}
        >
          {/* Header bar */}
          <div className={`
            w-full flex items-center justify-between px-3 py-2.5 
            border-b transition-colors duration-300
            ${box.elementType 
              ? 'bg-yellow-100/50 border-yellow-200' 
              : 'bg-muted/30 border-border/40'
            }
          `}>
            {selectedElement ? (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-yellow-100 flex items-center justify-center">
                  <selectedElement.icon className="w-3.5 h-3.5 text-yellow-600" />
                </div>
                <span className="text-xs font-semibold text-gray-800">
                  {selectedElement.label}
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground font-medium">Select element type...</span>
            )}
            <ChevronDown className={`w-4 h-4 transition-colors ${box.elementType ? 'text-yellow-600' : 'text-muted-foreground/60'}`} />
          </div>
          
          {/* Content area */}
          <div className="flex-1 w-full flex items-center justify-center p-4 min-h-0">
            {selectedElement ? (
              <div className="text-center">
                <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center mx-auto mb-2 shadow-inner">
                  <selectedElement.icon className="w-5 h-5 text-yellow-600" />
                </div>
                <p className="text-[11px] text-gray-600 font-medium">{selectedElement.description}</p>
              </div>
            ) : (
              <div className="w-full h-full border border-dashed border-border/40 rounded-lg flex items-center justify-center bg-muted/10 min-h-0">
                <div className="w-8 h-8 rounded-full bg-muted/40 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-muted-foreground/50" />
                </div>
              </div>
            )}
          </div>
        </SelectTrigger>

        <SelectContent className="w-[260px] shadow-[0_16px_48px_-12px_hsl(var(--foreground)/0.25)] border-border/60 rounded-xl p-1">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/40 mb-1">
            Select Element Type
          </div>
          {elementTypes.map(element => (
            <SelectItem key={element.value} value={element.value!} className="cursor-pointer rounded-lg my-0.5 py-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-100 to-yellow-50 flex items-center justify-center shadow-inner">
                  <element.icon className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{element.label}</p>
                  <p className="text-xs text-gray-600">{element.description}</p>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default KPIDashboardCanvas; 
