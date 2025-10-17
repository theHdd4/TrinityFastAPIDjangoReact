import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  ChevronDown, 
  ChevronRight, 
  BarChart3, 
  TrendingUp, 
  AlertTriangle, 
  Calculator, 
  Minimize2, 
  Maximize2, 
  Clock, 
  Calendar, 
  Save, 
  ChevronsUpDown,
  X,
  Settings2,
  Target,
  Play,
  Grid,
  Check
} from 'lucide-react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { AUTO_REGRESSIVE_API, calculateFiscalGrowth, calculateHalfYearlyGrowth, calculateQuarterlyGrowth } from '@/lib/api';
import './AutoRegressiveModelsCanvas.css';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, ReferenceLine, ReferenceArea, LabelList } from 'recharts';
import { AutoRegressiveModelsData } from '../AutoRegressiveModelsAtom';

interface AutoRegressiveModelsCanvasProps {
  data: AutoRegressiveModelsData;
  onClose?: () => void;
  atomId: string; // Required for Laboratory Mode
  onDataChange?: (newData: Partial<AutoRegressiveModelsData>) => void;
}

const AutoRegressiveModelsCanvas: React.FC<AutoRegressiveModelsCanvasProps> = ({
  data,
  onClose,
  atomId,
  onDataChange
}) => {
  
  
  const { toast } = useToast();
  
  const [scopeSectionExpanded, setScopeSectionExpanded] = useState(true);
  const [configSectionExpanded, setConfigSectionExpanded] = useState(true);
  const [selectedYVariables, setSelectedYVariables] = useState<string[]>([]);
  const [forecastHorizon, setForecastHorizon] = useState<string>('');
  const [fiscalYearMonth, setFiscalYearMonth] = useState<string>('');
  const [numericalColumns, setNumericalColumns] = useState<string[]>([]);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [selectedFrequency, setSelectedFrequency] = useState<string>('monthly'); // New state for frequency
  const [autoDetectedFrequency, setAutoDetectedFrequency] = useState<string | null>(null);
  const [frequencyConfidence, setFrequencyConfidence] = useState<string>('low');
  const [showFrequencyDropdown, setShowFrequencyDropdown] = useState(true);
  const [selectedDateColumn, setSelectedDateColumn] = useState<string>(''); // New state for date column
  
  // State for model training
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState<string>('');
  const [trainingProgressPercentage, setTrainingProgressPercentage] = useState<number>(0);
  const [trainingProgressDetails, setTrainingProgressDetails] = useState<{
    current: number;
    total: number;
    currentCombination: string;
    status: string;
  } | null>(null);
  
  // State for expanding/collapsing combination results - use Set like Build Model Feature Based atom
  const [minimizedCombinations, setMinimizedCombinations] = useState<Set<number>>(new Set());
  
  // Local state for storing model results
  const [localModelResults, setLocalModelResults] = useState<any>(null);
  
  // State for storing the current training run_id
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);

  // State for combination save status (like Mahek select 1 sept)
  const [combinationSaveStatus, setCombinationSaveStatus] = useState<any>(null);
  const [isLoadingCombinationSaveStatus, setIsLoadingCombinationSaveStatus] = useState(false);
  const [isFetchingCombinationStatus, setIsFetchingCombinationStatus] = useState(false);
  const [combinationSaveStatusMinimized, setCombinationSaveStatusMinimized] = useState(false);
  const [hasFreshCombinationSaveStatus, setHasFreshCombinationSaveStatus] = useState(false);

  // Interactive Legend State - single selection model
  // null = default state (all visible), otherwise one active legend
  const [selectedLegend, setSelectedLegend] = useState<{
    [combinationIndex: number]: string | null;
  }>({});


  // Growth Rates state
  const [selectedGrowthPeriod, setSelectedGrowthPeriod] = useState<'quarterly' | 'halfyearly' | 'yearly'>('quarterly');
  const [growthRatesData, setGrowthRatesData] = useState<any>(null);
  const [isLoadingGrowthRates, setIsLoadingGrowthRates] = useState(false);
  
  // Growth Rates Legend State - for bar chart legend filtering
  const [selectedGrowthLegend, setSelectedGrowthLegend] = useState<{
    [combinationId: string]: string | null;
  }>({});
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedGrowthModels, setSelectedGrowthModels] = useState<string[]>([]);
  const [combinationGrowthModels, setCombinationGrowthModels] = useState<{[combination: string]: string[]}>({});

  // Context Menu State for Growth Rates Chart
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showColorSubmenu, setShowColorSubmenu] = useState(false);
  const [colorSubmenuPos, setColorSubmenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showSortSubmenu, setShowSortSubmenu] = useState(false);
  const [sortSubmenuPos, setSortSubmenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // Chart display options state
  const [showGrid, setShowGrid] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showAxisLabels, setShowAxisLabels] = useState(true);
  const [showDataLabels, setShowDataLabels] = useState(true);
  const [selectedTheme, setSelectedTheme] = useState('default');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);

  // Color themes for the chart
  const COLOR_THEMES = {
    default: { name: 'Default', primary: '#6366f1', secondary: '#4338ca', tertiary: '#3730a3' },
    blue: { name: 'Blue', primary: '#3b82f6', secondary: '#1d4ed8', tertiary: '#1e40af' },
    green: { name: 'Green', primary: '#10b981', secondary: '#059669', tertiary: '#047857' },
    purple: { name: 'Purple', primary: '#8b5cf6', secondary: '#7c3aed', tertiary: '#6d28d9' },
    orange: { name: 'Orange', primary: '#f59e0b', secondary: '#d97706', tertiary: '#b45309' },
    red: { name: 'Red', primary: '#ef4444', secondary: '#dc2626', tertiary: '#b91c1c' },
    pink: { name: 'Pink', primary: '#ec4899', secondary: '#db2777', tertiary: '#be185d' },
    indigo: { name: 'Indigo', primary: '#6366f1', secondary: '#4f46e5', tertiary: '#4338ca' },
    teal: { name: 'Teal', primary: '#14b8a6', secondary: '#0d9488', tertiary: '#0f766e' },
    yellow: { name: 'Yellow', primary: '#eab308', secondary: '#ca8a04', tertiary: '#a16207' },
    lime: { name: 'Lime', primary: '#84cc16', secondary: '#65a30d', tertiary: '#4d7c0f' },
    cyan: { name: 'Cyan', primary: '#06b6d4', secondary: '#0891b2', tertiary: '#0e7490' }
  };

  // Interactive Legend Functions - Single Selection Model
  const handleLegendClick = (entry: any, combinationIndex: number) => {
    const { dataKey } = entry;
    
    
    setSelectedLegend(prev => {
      const currentSelected = prev[combinationIndex];
      
      // If clicking the same legend item, deselect it (show all lines)
      if (currentSelected === dataKey) {
        
        const newState = { ...prev };
        delete newState[combinationIndex];
        return newState;
      }
      
      // Otherwise, select this legend item (hide all other lines)
      
      return {
        ...prev,
        [combinationIndex]: dataKey
      };
    });
  };

  // Growth Rates Legend Click Handler
  const handleGrowthLegendClick = (entry: any, combinationId: string) => {
    const { dataKey } = entry;
    
    
    setSelectedGrowthLegend(prev => {
      const currentSelected = prev[combinationId];
      
      // If clicking the same legend item, deselect it (show all bars)
      if (currentSelected === dataKey) {
        
        const newState = { ...prev };
        delete newState[combinationId];
        return newState;
      }
      
      // Otherwise, select this legend item (hide all other bars)
      
      return {
        ...prev,
        [combinationId]: dataKey
      };
    });
  };

  // Check if a bar is visible for growth rates
  const isGrowthBarVisible = (dataKey: string, combinationId: string) => {
    const selected = selectedGrowthLegend[combinationId];
    
    // If no legend is selected (null), show all bars
    if (selected === null || selected === undefined) {
      return true;
    }
    
    // If a legend is selected, only show that specific bar
    return selected === dataKey;
  };

  const isLineVisible = (dataKey: string, combinationIndex: number) => {
    const selected = selectedLegend[combinationIndex];
    
    // If no legend is selected (null), show all lines
    if (selected === null || selected === undefined) {
      return true;
    }
    
    // If a legend is selected, only show that line
    return selected === dataKey;
  };

  const getLegendStyle = (dataKey: string, combinationIndex: number) => {
    const selected = selectedLegend[combinationIndex];
    
    // If no legend is selected (null), all legends should be highlighted
    if (selected === null || selected === undefined) {
      return {
        opacity: 1,
        cursor: 'pointer',
        transition: 'all 0.2s ease-in-out',
        fontWeight: 'bold',
        color: '#1f2937',
        transform: 'scale(1)',
        textShadow: 'none'
      };
    }
    
    // If a legend is selected, show selected as highlighted, others as faded
    const isSelected = selected === dataKey;
    return {
      opacity: isSelected ? 1 : 0.3,
      cursor: 'pointer',
      transition: 'all 0.2s ease-in-out',
      fontWeight: isSelected ? 'bold' : 'normal',
      color: isSelected ? '#1f2937' : '#9ca3af',
      transform: isSelected ? 'scale(1.05)' : 'scale(1)',
      textShadow: isSelected ? '0 0 8px rgba(59, 130, 246, 0.3)' : 'none'
    };
  };

  // Context Menu Functions
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
    setShowColorSubmenu(false);
    setShowSortSubmenu(false);
  };

  const handleThemeChange = (themeName: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setSelectedTheme(themeName);
    // Don't close context menu immediately in fullscreen mode to prevent modal closure
    if (!isFullscreenMode) {
      setShowContextMenu(false);
    } else {
      // In fullscreen mode, close context menu after a short delay to show the change
      setTimeout(() => {
        setShowContextMenu(false);
      }, 500);
    }
    setShowColorSubmenu(false);
  };

  const handleColorThemeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setColorSubmenuPos({ x: rect.right + 4, y: rect.top });
    setShowColorSubmenu(prevState => !prevState);
    setShowSortSubmenu(false);
  };

  const handleSortClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setSortSubmenuPos({ x: rect.right + 4, y: rect.top });
    setShowSortSubmenu(prev => !prev);
    setShowColorSubmenu(false);
  };

  const handleSortChange = (order: 'asc' | 'desc' | null) => {
    setSortOrder(order);
    setShowContextMenu(false);
    setShowSortSubmenu(false);
  };

  const handleGridToggle = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowGrid(!showGrid);
    // Don't close context menu immediately in fullscreen mode to prevent modal closure
    if (!isFullscreenMode) {
      setShowContextMenu(false);
    } else {
      // In fullscreen mode, close context menu after a short delay to show the change
      setTimeout(() => {
        setShowContextMenu(false);
      }, 500);
    }
  };

  const handleLegendToggle = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowLegend(!showLegend);
    // Don't close context menu immediately in fullscreen mode to prevent modal closure
    if (!isFullscreenMode) {
      setShowContextMenu(false);
    } else {
      // In fullscreen mode, close context menu after a short delay to show the change
      setTimeout(() => {
        setShowContextMenu(false);
      }, 500);
    }
  };

  const handleAxisLabelsToggle = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowAxisLabels(!showAxisLabels);
    // Don't close context menu immediately in fullscreen mode to prevent modal closure
    if (!isFullscreenMode) {
      setShowContextMenu(false);
    } else {
      // In fullscreen mode, close context menu after a short delay to show the change
      setTimeout(() => {
        setShowContextMenu(false);
      }, 500);
    }
  };

  const handleDataLabelsToggle = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowDataLabels(!showDataLabels);
    // Don't close context menu immediately in fullscreen mode to prevent modal closure
    if (!isFullscreenMode) {
      setShowContextMenu(false);
    } else {
      // In fullscreen mode, close context menu after a short delay to show the change
      setTimeout(() => {
        setShowContextMenu(false);
      }, 500);
    }
  };

  const handleSave = () => {
    // Implement save functionality
    toast({
      title: "Chart Saved",
      description: "Growth rates chart has been saved successfully.",
    });
    setShowContextMenu(false);
  };

  // Update legend styling based on selection state
  useEffect(() => {
    // Apply CSS classes to legend items based on selection
    const updateLegendStyling = () => {
      Object.keys(selectedLegend).forEach(combinationIndex => {
        const selected = selectedLegend[combinationIndex];
        if (selected !== null && selected !== undefined) {
          // Find legend items for this combination
          const legendItems = document.querySelectorAll(`[data-chart-area="true"] .recharts-legend-item`);
          legendItems.forEach((item, index) => {
            const textElement = item.querySelector('.recharts-legend-item-text');
            if (textElement) {
              const legendText = textElement.textContent;
              const dataKey = getDataKeyFromLegendText(legendText);
              
              if (dataKey === selected) {
                item.classList.add('selected');
                item.classList.remove('faded');
              } else {
                item.classList.add('faded');
                item.classList.remove('selected');
              }
            }
          });
        } else {
          // No selection - remove all classes
          const legendItems = document.querySelectorAll(`[data-chart-area="true"] .recharts-legend-item`);
          legendItems.forEach(item => {
            item.classList.remove('selected', 'faded');
          });
        }
      });
    };

    // Helper function to get dataKey from legend text
    const getDataKeyFromLegendText = (text: string) => {
      if (text === 'Actual Values') return 'actual';
      if (text === 'ARIMA') return 'arima';
      if (text === 'SARIMA') return 'sarima';
      if (text === 'Holt-Winters') return 'holt-winters';
      if (text === 'ETS') return 'ets';
      if (text === 'Prophet') return 'prophet';
      return text.toLowerCase();
    };

    // Update styling after a short delay to ensure DOM is ready
    const timeoutId = setTimeout(updateLegendStyling, 100);
    
    return () => clearTimeout(timeoutId);
  }, [selectedLegend]);

  // Global right-click handler for charts
  useEffect(() => {
    const handleGlobalContextMenu = (e: MouseEvent) => {
      // Check if the right-click is on a chart area
      const target = e.target as Element;
      
      // Only show context menu on bar chart areas, not line charts
      // Check if we're specifically in a bar chart container
      const isBarChartArea = target.closest('[data-chart-type="bar"]');
      
      // Don't show context menu on general page elements
      if (target.closest('button') || 
          target.closest('input') || 
          target.closest('select') ||
          target.closest('.dropdown-container') ||
          target.closest('.navigation') ||
          target.closest('header') ||
          target.closest('nav')) {
        return;
      }
      
      if (isBarChartArea && e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        
        setContextMenuPosition({ x: e.clientX, y: e.clientY });
        setShowContextMenu(true);
        setShowColorSubmenu(false);
        setShowSortSubmenu(false);
        return false;
      }
    };

    // Close context menus when clicking anywhere (including within chart area)
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      
      // Don't close context menu if clicking inside the fullscreen modal
      if (isFullscreenMode && target.closest('[role="dialog"]')) {
        
        return;
      }
      
      // Check if click is on context menu itself
      if (target.closest('.context-menu') || target.closest('.color-submenu')) {
        
        return;
      }
      
      // Close context menu when clicking anywhere else, including within chart area
      
      setShowContextMenu(false);
      setShowColorSubmenu(false);
      setShowSortSubmenu(false);
    };

    // Close context menus when scrolling
    const handleScroll = () => {
      
      setShowContextMenu(false);
      setShowColorSubmenu(false);
      setShowSortSubmenu(false);
    };

    // Add global right-click handler
    document.addEventListener('contextmenu', handleGlobalContextMenu, true);
    document.addEventListener('mousedown', handleGlobalContextMenu, true);
    
    // Always add click outside handler to ensure context menu closes properly
    document.addEventListener('click', handleClickOutside);
    
    // Add scroll listeners only when context menu is active
    if (showContextMenu || showColorSubmenu || showSortSubmenu) {
      document.addEventListener('scroll', handleScroll, true);
      window.addEventListener('scroll', handleScroll, true);
    }

    return () => {
      document.removeEventListener('contextmenu', handleGlobalContextMenu, true);
      document.removeEventListener('mousedown', handleGlobalContextMenu, true);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [showContextMenu, showColorSubmenu, showSortSubmenu]);

  // Fullscreen chart state
  const [fullscreenChart, setFullscreenChart] = useState<{
    type: 'forecast' | 'growth';
    combinationId: string;
    title: string;
    result: any; // Store the actual result data
  } | null>(null);

    // Track if we're in fullscreen mode to prevent unwanted closures
  const isFullscreenMode = !!fullscreenChart;

  // Separate useEffect for click outside handling - always active
  useEffect(() => {
    const handleGlobalClickOutside = (e: MouseEvent) => {
      // Only handle if context menu is actually open
      if (!showContextMenu && !showColorSubmenu && !showSortSubmenu) {
        return;
      }

      const target = e.target as Element;
      
      // Don't close context menu if clicking inside the fullscreen modal
      if (isFullscreenMode && target.closest('[role="dialog"]')) {
        
        return;
      }
      
      // Check if click is on context menu itself
      if (target.closest('.context-menu') || target.closest('.color-submenu')) {
        
        return;
      }
      
      // Check if click is on bar chart area (don't close if clicking on bar chart)
      if (target.closest('[data-chart-type="bar"]')) {
        
        return;
      }
      
      // If we get here, it's a click outside - close context menus
      
      
      
      
      
      // Force close all context menus
      setShowContextMenu(false);
      setShowColorSubmenu(false);
      setShowSortSubmenu(false);
    };

    const handleGlobalMouseDown = (e: MouseEvent) => {
      // Only handle if context menu is actually open
      if (!showContextMenu && !showColorSubmenu && !showSortSubmenu) {
        return;
      }

      const target = e.target as Element;
      
      // Don't close context menu if clicking inside the fullscreen modal
      if (isFullscreenMode && target.closest('[role="dialog"]')) {
        
        return;
      }
      
      // Check if click is on context menu itself
      if (target.closest('.context-menu') || target.closest('.color-submenu')) {
        
        return;
      }
      
      // Check if click is on bar chart area (don't close if clicking on bar chart)
      if (target.closest('[data-chart-type="bar"]')) {
        
        return;
      }
      
      // If we get here, it's a click outside - close context menus
      
      
      
      
      
      // Force close all context menus
      setShowContextMenu(false);
      setShowColorSubmenu(false);
      setShowSortSubmenu(false);
    };

    // Always add global listeners with capture phase
    document.addEventListener('click', handleGlobalClickOutside, true);
    document.addEventListener('mousedown', handleGlobalMouseDown, true);
    
    // Also add a direct body click listener as backup
    const handleBodyClick = (e: Event) => {
      if (showContextMenu || showColorSubmenu || showSortSubmenu) {
        
        setShowContextMenu(false);
        setShowColorSubmenu(false);
        setShowSortSubmenu(false);
      }
    };
    
    document.body.addEventListener('click', handleBodyClick);
    
    return () => {
      document.removeEventListener('click', handleGlobalClickOutside, true);
      document.removeEventListener('mousedown', handleGlobalMouseDown, true);
      document.body.removeEventListener('click', handleBodyClick);
    };
  }, [showContextMenu, showColorSubmenu, showSortSubmenu, isFullscreenMode]);

  // Dropdown state
  const [openDropdowns, setOpenDropdowns] = useState<{[key: string]: boolean}>({});

  // Get latest data from store if in Laboratory Mode
  const storeAtom = useLaboratoryStore(state => (atomId ? state.getAtom(atomId) : undefined));
  const storeData = (storeAtom?.settings as any)?.data as AutoRegressiveModelsData;
  
  // Use store data if available, otherwise use prop data
  const currentData = storeData || data;

  // Check if we have results in the store data and sync them to local state
  useEffect(() => {
    if (storeData && !localModelResults) {
      // Check multiple possible locations for results in store data
      const hasResults = (storeData as any).results || 
                        (storeData as any).combination_results || 
                        Array.isArray(storeData);
      
      if (hasResults) {
        
        console.log('🔧 AutoRegressiveModelsCanvas: Store data structure:', {
          hasResultsProperty: !!(storeData as any).results,
          hasCombinationResultsProperty: !!(storeData as any).combination_results,
          isArray: Array.isArray(storeData),
          storeDataKeys: Object.keys(storeData || {})
        });
        setLocalModelResults(storeData);
        
        // Minimize all combinations by default when loading from store
        if ((storeData as any)?.results && Array.isArray((storeData as any).results)) {
          const allCombinationIndices = Array.from({ length: (storeData as any).results.length }, (_, i) => i);
          setMinimizedCombinations(new Set(allCombinationIndices));
        }
      }
    }
  }, [storeData, localModelResults]);

  // Restore complete state from store data when component loads
  useEffect(() => {
    if (storeData) {
      
      
      // Restore model results
      if ((storeData as any).modelResults) {
        setLocalModelResults((storeData as any).modelResults);
      }
      
      // Restore combination save status only if we don't have fresh data
      // This prevents overwriting freshly fetched combination save status
      if ((storeData as any).combinationSaveStatus && !hasFreshCombinationSaveStatus) {
        setCombinationSaveStatus((storeData as any).combinationSaveStatus);
      }
      
      // Restore UI state
      if ((storeData as any).minimizedCombinations) {
        setMinimizedCombinations(new Set((storeData as any).minimizedCombinations));
      }
      
      if ((storeData as any).selectedGrowthPeriod) {
        setSelectedGrowthPeriod((storeData as any).selectedGrowthPeriod);
      }
      
      if ((storeData as any).growthRatesData) {
        setGrowthRatesData((storeData as any).growthRatesData);
      }
      
      if ((storeData as any).selectedModels) {
        setSelectedModels((storeData as any).selectedModels);
      }
      
      if ((storeData as any).selectedGrowthModels) {
        setSelectedGrowthModels((storeData as any).selectedGrowthModels);
      }
      
      if ((storeData as any).combinationGrowthModels) {
        setCombinationGrowthModels((storeData as any).combinationGrowthModels);
      }
      
      if ((storeData as any).selectedLegend) {
        setSelectedLegend((storeData as any).selectedLegend);
      }
      
      if ((storeData as any).trainingProgress) {
        setTrainingProgress((storeData as any).trainingProgress);
      }
      
      if ((storeData as any).trainingProgressPercentage) {
        setTrainingProgressPercentage((storeData as any).trainingProgressPercentage);
      }
      
      if ((storeData as any).trainingProgressDetails) {
        setTrainingProgressDetails((storeData as any).trainingProgressDetails);
      }
      
      if ((storeData as any).currentRunId) {
        setCurrentRunId((storeData as any).currentRunId);
      }
      
      if ((storeData as any).combinationSaveStatusMinimized !== undefined) {
        setCombinationSaveStatusMinimized((storeData as any).combinationSaveStatusMinimized);
      }
      
      if ((storeData as any).hasFreshCombinationSaveStatus !== undefined) {
        setHasFreshCombinationSaveStatus((storeData as any).hasFreshCombinationSaveStatus);
      }
      
      
    }
  }, [storeData]);

  // Debug logging for localModelResults and auto-expand functionality
  useEffect(() => {
    
    if (localModelResults) {
      const resultsArray = getResultsArray();
      console.log('🔧 AutoRegressiveModelsCanvas: Results structure:', {
        hasResults: !!localModelResults.results,
        resultsLength: localModelResults.results?.length,
        resultsType: typeof localModelResults.results,
        status: localModelResults.status,
        message: localModelResults.message,
        resolvedResultsArray: resultsArray,
        resolvedResultsLength: resultsArray?.length
      });
      
      // Auto-expand the first result when results are loaded
      if (resultsArray && resultsArray.length > 0 && minimizedCombinations.size === 0) {
        
        // Don't minimize the first result
      }
    }
  }, [localModelResults, minimizedCombinations]);

  // Handle clicking outside dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.dropdown-container')) {
        setOpenDropdowns({});
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Subscribe to store changes more directly
  const storeSubscription = useLaboratoryStore(state => 
    atomId ? state.getAtom(atomId)?.settings?.data : null
  );
  
  // Use store subscription data if available
  const finalData = storeSubscription || currentData;
  
  // Force re-render when store data changes
  useEffect(() => {
    // Store data changed - component will re-render
  }, [storeData, storeSubscription]);

  // Initialize selected growth models when component loads
  useEffect(() => {
    // Don't auto-populate growth models from settings
    // They should only be selected after running models and seeing results
    setSelectedGrowthModels([]);
    
  }, []);

  // Don't auto-populate combinationGrowthModels - let users select models manually
  // This ensures growth rates are only calculated when users explicitly select models

  // Fetch combination save status when results are available (like select models feature)
  useEffect(() => {
    console.log('🔧 DEBUG: useEffect triggered for fetchCombinationSaveStatus with:', {
      hasLocalModelResults: !!localModelResults,
      atomId: atomId,
      isFetchingCombinationStatus: isFetchingCombinationStatus,
      hasCombinationSaveStatus: !!combinationSaveStatus
    });
    if (localModelResults && atomId && !isFetchingCombinationStatus) {
      // Only fetch if we don't already have combination save status
      if (!combinationSaveStatus) {
        fetchCombinationSaveStatus();
      }
    }
  }, [localModelResults, atomId]);

  // Function to save a single combination
  const handleSaveSingleCombination = async (result: any) => {
    if (!result || result.status !== 'success') {
      toast({
        title: "Cannot Save Combination",
        description: "This combination has no successful results to save.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      const envStr = localStorage.getItem('env');
      let envParams: any = {};
      
      if (envStr) {
        try {
          envParams = JSON.parse(envStr);
        } catch {
          /* ignore */
        }
      }

      const baseUrl = `${AUTO_REGRESSIVE_API}/models/save-single-combination`;
      
      const saveRequest = {
        scope: finalData?.selectedScope,
        combination_id: result.combination_id,
        result: result.result,
        status: result.status,
        tags: [`auto-regressive-models-${atomId}`, 'saved-autoregressive-model'],
        description: `Auto-regressive model saved from Auto-Regressive Models atom - ${result.combination_id}`,
        client_name: envParams.CLIENT_NAME || '',
        app_name: envParams.APP_NAME || '',
        project_name: envParams.PROJECT_NAME || '',
        client_id: envParams.CLIENT_ID || '',
        app_id: envParams.APP_ID || '',
        project_id: envParams.PROJECT_ID || ''
      };

      

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(saveRequest)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save combination');
      }

      const saveResult = await response.json();
      
      
      // Show success message
      toast({
        title: "Combination Saved Successfully",
        description: `Combination "${result.combination_id}" has been saved.`,
        variant: "default"
      });
      
      // Refresh combination status after saving
      
      await fetchCombinationSaveStatus();
      
      
      // Save complete state after saving a combination
      setTimeout(() => {
        saveCompleteAtomState();
      }, 100);
      
    } catch (error) {
      console.error('Error saving combination:', error);
      // Show error message
      toast({
        title: "Error Saving Combination",
        description: error instanceof Error ? error.message : "Failed to save combination",
        variant: "destructive"
      });
    } finally {
      // Cleanup if needed
    }
  };



  // Function to fetch combination save status (works like select models feature)
  const fetchCombinationSaveStatus = async () => {
    
    
    // Prevent multiple simultaneous calls
    if (isFetchingCombinationStatus) {
      
      return;
    }

    // Get the file_key from the results (like the original implementation)
    const resultsArray = getResultsArray();
    
    
    if (!resultsArray || resultsArray.length === 0) {
      
      return;
    }

    const fileKey = resultsArray[0]?.file_key;
    
    
    if (!fileKey) {
      
      return;
    }

    console.log('🔧 DEBUG: fetchCombinationSaveStatus called with:', {
      fileKey: fileKey,
      atomId: atomId
    });
    
    if (!atomId) {
      
      return;
    }

    setIsFetchingCombinationStatus(true);
    setIsLoadingCombinationSaveStatus(true);
    
    try {
      const envStr = localStorage.getItem('env');
      let envParams: any = {};
      
      if (envStr) {
        try {
          envParams = JSON.parse(envStr);
        } catch {
          /* ignore */
        }
      }

      const baseUrl = `${AUTO_REGRESSIVE_API}/models/saved-combinations-status`;
      const params = new URLSearchParams({
        scope: '1', // Auto regressive always uses scope 1
        atom_id: atomId,
        client_id: envParams.CLIENT_ID || '',
        app_id: envParams.APP_ID || '',
        project_id: envParams.PROJECT_ID || '',
        client_name: envParams.CLIENT_NAME || '',
        app_name: envParams.APP_NAME || '',
        project_name: envParams.PROJECT_NAME || ''
      });
      const url = `${baseUrl}?${params.toString()}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch combination save status: ${response.statusText}`);
      }

      const result = await response.json();
      
      
      setCombinationSaveStatus(result);
      setHasFreshCombinationSaveStatus(true); // Mark that we have fresh data
      
      
      // Save complete state after fetching combination save status
      setTimeout(() => {
        saveCompleteAtomState();
      }, 100);
      
    } catch (error) {
      console.error('Error fetching combination save status:', error);
      setCombinationSaveStatus(null);
    } finally {
      setIsFetchingCombinationStatus(false);
      setIsLoadingCombinationSaveStatus(false);
    }
  };

  // Function to calculate growth rates
  const calculateGrowthRates = async (period: 'quarterly' | 'halfyearly' | 'yearly', specificCombination?: string) => {
    
    
    
    
    
    
    // Try to get scope and combinations from multiple sources
    let scope = finalData?.selectedScope || data?.selectedScope || storeData?.selectedScope;
    let combinations = finalData?.selectedCombinations || data?.selectedCombinations || storeData?.selectedCombinations;
    
    
    
    
    if (!scope || !combinations || combinations.length === 0) {
      
      toast({
        title: "Missing Data",
        description: "Please select scope and combinations first.",
        variant: "destructive",
      });
      return;
    }

    // If a specific combination is provided, only process that combination
    if (specificCombination) {
      combinations = [specificCombination];
      console.log(`🔧 Processing specific combination: ${specificCombination}`);
    }

    setIsLoadingGrowthRates(true);
    try {
      // Calculate growth rates for combinations
      const allResults = [];
      
      for (const combination of combinations) {
        console.log(`🔧 Processing combination: ${combination}`);
        
        const params = {
          scope: scope,
          combination: combination,
          forecast_horizon: parseInt(forecastHorizon) || 12,
          fiscal_start_month: parseInt(fiscalYearMonth) || 1,
          frequency: period === 'quarterly' ? 'M' : period === 'halfyearly' ? 'M' : 'Y',  // Fix: Use 'M' for both quarterly and halfyearly to get all periods
          run_id: currentRunId  // Add the run_id parameter
        };

        
        
        

        let result;
        try {
          switch (period) {
            case 'quarterly':
              
              result = await calculateQuarterlyGrowth(params);
              break;
            case 'halfyearly':
              
              result = await calculateHalfYearlyGrowth(params);
              break;
            case 'yearly':
              
              result = await calculateFiscalGrowth(params);
              break;
          }
          
          if (result && result.status === 'success') {
            allResults.push({
              combination: combination,
              data: result.data
            });
            console.log(`🔧 Successfully processed combination: ${combination}`);
          } else {
            console.log(`🔧 Failed to process combination: ${combination} - Invalid result`);
          }
        } catch (error) {
          console.error(`🔧 Error processing combination ${combination}:`, error);
          // Continue with other combinations even if one fails
        }
      }
      
      // Store results - either aggregated or per-combination
      if (allResults.length > 0) {
        if (specificCombination) {
          // Store data for specific combination - structure it properly for the frontend
          // Backend returns data directly, not nested in period-specific arrays
          const combinationData = allResults[0];
          const structuredData = {
            status: 'success',
            data: {
              fiscal_growth: period === 'yearly' ? combinationData.data : [],
              halfyearly_growth: period === 'halfyearly' ? combinationData.data : [],
              quarterly_growth: period === 'quarterly' ? combinationData.data : []
            }
          };
          
          setGrowthRatesData(prev => ({
            ...prev,
            [specificCombination]: structuredData
          }));
          console.log(`🔧 Stored growth rate data for combination: ${specificCombination}`, structuredData);
        } else {
          // Store data for each combination separately
          const newData = {};
          for (const result of allResults) {
            const structuredData = {
              status: 'success',
              data: {
                fiscal_growth: period === 'yearly' ? result.data : [],
                halfyearly_growth: period === 'halfyearly' ? result.data : [],
                quarterly_growth: period === 'quarterly' ? result.data : []
              }
            };
            newData[result.combination] = structuredData;
          }
          setGrowthRatesData(prev => ({ ...prev, ...newData }));
          
        }
        
        toast({
          title: "Success",
          description: `${period.charAt(0).toUpperCase() + period.slice(1)} growth rates calculated for ${allResults.length} combination${allResults.length > 1 ? 's' : ''}.`,
        });
      } else {
        throw new Error('No valid results from any combination');
      }
      
    } catch (error) {
      console.error('🔧 Error calculating growth rates:', error);
      toast({
        title: "Error",
        description: "Failed to calculate growth rates. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingGrowthRates(false);
    }
  };

  // Helper function to aggregate growth rate results from multiple combinations
  const aggregateGrowthRateResults = (results: any[], period: string) => {
    const aggregated = {
      fiscal_growth: [],
      halfyearly_growth: [],
      quarterly_growth: []
    };
    
    // Collect all growth data from all combinations
    const allGrowthData = [];
    
    for (const result of results) {
      // Backend returns data directly, not nested in period-specific arrays
      if (result.data) {
        allGrowthData.push(...result.data);
      }
    }
    
    // Group by model and period, then calculate averages
    const groupedData = {};
    
    for (const item of allGrowthData) {
      // Create a unique key that includes the period (H1/H2 for half-yearly, Q1/Q2/Q3/Q4 for quarterly)
      let periodIdentifier = '';
      if (period === 'quarterly') {
        periodIdentifier = item.fiscal_quarter || '';
      } else if (period === 'halfyearly') {
        periodIdentifier = item.fiscal_half || '';
      }
      
      const key = `${item.model}_${item.fiscal_year || item.fiscal_period || ''}_${periodIdentifier}`;
      
      if (!groupedData[key]) {
        groupedData[key] = {
          model: item.model,
          fiscal_year: item.fiscal_year,
          fiscal_period: item.fiscal_period,
          fiscal_half: item.fiscal_half,
          fiscal_quarter: item.fiscal_quarter,
          fiscal_total: 0,
          growth_rate: 0,
          count: 0
        };
      }
      
      if (item.fiscal_total !== null && !isNaN(item.fiscal_total)) {
        groupedData[key].fiscal_total += item.fiscal_total;
      }
      
      if (item.growth_rate !== null && !isNaN(item.growth_rate)) {
        groupedData[key].growth_rate += item.growth_rate;
      }
      
      groupedData[key].count += 1;
    }
    
    // Calculate averages
    for (const key in groupedData) {
      const item = groupedData[key];
      if (item.count > 0) {
        item.fiscal_total = item.fiscal_total / item.count;
        item.growth_rate = item.growth_rate / item.count;
        
        // Remove count field and add to appropriate array
        delete item.count;
        
        if (period === 'quarterly') {
          aggregated.quarterly_growth.push(item);
        } else if (period === 'halfyearly') {
          aggregated.halfyearly_growth.push(item);
        } else {
          aggregated.fiscal_growth.push(item);
        }
      }
    }
    
    return aggregated;
  };

  

  // Fetch numerical columns when scope and combinations are selected
  useEffect(() => {
    const fetchNumericalColumns = async () => {
      if (finalData?.selectedScope && finalData?.selectedCombinations && finalData.selectedCombinations.length > 0) {
        setIsLoadingColumns(true);
        try {
          // Use the first selected combination to get column info
          const firstCombination = finalData.selectedCombinations[0];
          
          // Create URLSearchParams for form data
          const formData = new URLSearchParams();
          formData.append('scope', finalData.selectedScope);
          formData.append('combination', firstCombination);
          
          
          
          
          
          // Fetching columns from auto-regressive API using GET method
          const params = new URLSearchParams({
            scope: finalData.selectedScope,
            combination: firstCombination
          });
          const url = `${AUTO_REGRESSIVE_API}/get_columns?${params.toString()}`;
          
          const response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          
          
          
          
          if (response.ok) {
            const data = await response.json();
            
            
            // Use the numerical_columns directly from the backend response
            const numericalCols = data.numerical_columns || [];
            
            if (numericalCols.length > 0) {
              setNumericalColumns(numericalCols);
            } else {
              // Fallback to default columns if no numerical columns found
              setNumericalColumns(['Sales', 'Revenue', 'Demand', 'Volume', 'Quantity']);
            }
          } else {
            const errorText = await response.text();
            console.error('🔧 AutoRegressiveModelsCanvas: API Error Response:', errorText);
            console.error('🔧 AutoRegressiveModelsCanvas: API Error Status:', response.status);
            
            // Fallback to default columns if API fails
            setNumericalColumns(['Sales', 'Revenue', 'Demand', 'Volume', 'Quantity']);
          }
        } catch (error) {
          console.error('Error fetching columns:', error);
          // Fallback to default columns if API fails
          setNumericalColumns(['Sales', 'Revenue', 'Demand', 'Volume', 'Quantity']);
        } finally {
          setIsLoadingColumns(false);
        }
      }
    };

    fetchNumericalColumns();
  }, [finalData?.selectedScope, finalData?.selectedCombinations]);

  // Fetch frequency detection when scope and combinations are selected
  useEffect(() => {
    const detectFrequency = async () => {
      if (finalData?.selectedScope && finalData?.selectedCombinations && finalData.selectedCombinations.length > 0) {
        try {
          // Use the first selected combination for frequency detection
          const firstCombination = finalData.selectedCombinations[0];
          
          // Create URLSearchParams for form data
          const formData = new URLSearchParams();
          formData.append('scope', finalData.selectedScope);
          formData.append('combination', firstCombination);
          
          // Try to detect frequency with common date column names
          const commonDateColumns = ['PrepDate', 'Date', 'date', 'prep_date', 'timestamp', 'time'];
          let frequencyDetected = false;
          
          for (const dateCol of commonDateColumns) {
            try {
              const testFormData = new URLSearchParams();
              testFormData.append('scope', finalData.selectedScope);
              testFormData.append('combination', firstCombination);
              testFormData.append('date_column', dateCol);
              
              
              
              const response = await fetch(`${AUTO_REGRESSIVE_API}/detect_frequency`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: testFormData
              });
              
              if (response.ok) {
                const data = await response.json();
                
                
                if (data.frequency && data.frequency !== "Unknown") {
                  // Check if it's a custom frequency - if so, show dropdown for manual selection
                  if (data.frequency.startsWith('Custom')) {
                    // Custom frequency means user needs to manually specify what it is
                    setAutoDetectedFrequency(data.frequency);
                    setFrequencyConfidence('low'); // Custom frequency has low confidence
                    setShowFrequencyDropdown(true); // Show dropdown for manual selection
                    setSelectedFrequency('custom'); // Set to custom as default
                    
                  } else {
                    // Standard frequency was successfully detected
                    setAutoDetectedFrequency(data.frequency);
                    setFrequencyConfidence('high');
                    setShowFrequencyDropdown(false);
                    
                    // Map backend frequency to frontend frequency value
                    const frequencyMapping: { [key: string]: string } = {
                      'Daily': 'daily',
                      'Weekly': 'weekly', 
                      'Monthly': 'monthly',
                      'Quarterly': 'quarterly',
                      'Yearly': 'yearly'
                    };
                    
                    if (frequencyMapping[data.frequency]) {
                      setSelectedFrequency(frequencyMapping[data.frequency]);
                    }
                    
                    
                  }
                  frequencyDetected = true;
                  break; // Exit the loop since we found a working column
                }
              }
            } catch (error) {
              
              continue; // Try next column
            }
          }
          
          if (!frequencyDetected) {
            // Frequency could not be detected with any common columns, show dropdown for manual selection
            setAutoDetectedFrequency(null);
            setFrequencyConfidence('low');
            setShowFrequencyDropdown(true);
            
          }
          
        } catch (error) {
          console.error('Error detecting frequency:', error);
          // If frequency detection fails, show dropdown for manual selection
          setAutoDetectedFrequency(null);
          setFrequencyConfidence('low');
          setShowFrequencyDropdown(true);
          
        }
      }
    };

    detectFrequency();
  }, [finalData?.selectedScope, finalData?.selectedCombinations]);

  // Handle manual frequency change
  const handleFrequencyChange = (newFrequency: string) => {
    setSelectedFrequency(newFrequency);
    // If user manually changes frequency, we should show the dropdown
    setShowFrequencyDropdown(true);
    setAutoDetectedFrequency(null);
  };


  // Function to get Forecast Horizon placeholder based on frequency
  const getForecastHorizonPlaceholder = (frequency: string): string => {
    switch (frequency) {
      case 'daily':
        return 'Enter days';
      case 'weekly':
        return 'Enter weeks';
      case 'monthly':
        return 'Enter months';
      case 'quarterly':
        return 'Enter quarters';
      case 'yearly':
        return 'Enter years';
      case 'custom':
        // For custom frequency, show a generic placeholder since user needs to specify
        return 'Enter forecast period';
      default:
        return 'Enter months';
    }
  };

  // Data modification functions for Laboratory Mode
  const handleDataChange = (newData: Partial<AutoRegressiveModelsData>) => {
    
    
    
    
    if (onDataChange) {
      
      onDataChange(newData);
      
    } else {
      
    }
  };

  // Function to save complete atom state including all API responses
  const saveCompleteAtomState = () => {
    
    
    const completeState = {
      // Basic configuration data
      ...finalData,
      
      // Model training results and status
      modelResults: localModelResults,
      trainingStatus: isTraining ? 'training' : (localModelResults ? 'completed' : 'idle'),
      trainingProgress,
      trainingProgressPercentage,
      trainingProgressDetails,
      currentRunId,
      
      // Combination save status
      combinationSaveStatus,
      combinationSaveStatusMinimized,
      hasFreshCombinationSaveStatus,
      
      // UI state
      minimizedCombinations: Array.from(minimizedCombinations),
      selectedLegend,
      selectedGrowthPeriod,
      growthRatesData,
      selectedModels,
      selectedGrowthModels,
      combinationGrowthModels,
      
      // Timestamps
      lastRunTimestamp: localModelResults?.timestamp || new Date().toISOString(),
      lastError: localModelResults?.error || null
    };
    
    
    
    if (onDataChange) {
      onDataChange(completeState);
      
    } else {
      
    }
  };


  // Handle combination deselection from canvas
  const removeCombination = (combinationToRemove: string) => {
    
    
    
    const updatedCombinations = (finalData?.selectedCombinations || []).filter(
      combination => combination !== combinationToRemove
    );
    
    
    handleDataChange({ selectedCombinations: updatedCombinations });
  };

  const handleRunModels = async () => {
    if (!allSelectionsMade) {
      
      return;
    }

    setIsTraining(true);
    setTrainingProgress('Starting model training...');
    setCurrentRunId(null); // Clear previous run_id when starting new training
    setTrainingProgressPercentage(0);
    setTrainingProgressDetails(null);

    try {
      console.log('🔧 AutoRegressiveModelsCanvas: Starting model training with:', {
        selectedYVariables,
        forecastHorizon,
        fiscalYearMonth,
        selectedFrequency,
        selectedScope: finalData?.selectedScope,
        selectedCombinations: finalData?.selectedCombinations,
        selectedModels: finalData?.selectedModels
      });

      // Validate required data
      if (!finalData?.selectedScope || !finalData?.selectedCombinations || !finalData?.selectedModels) {
        console.error('Missing required data for model training');
        setTrainingProgress('Error: Missing required data');
        return;
      }

      setTrainingProgress('Preparing data and models...');

      // Map frequency from frontend to backend format
      const frequencyMapping: { [key: string]: string } = {
        'daily': 'D',
        'weekly': 'W',
        'monthly': 'M',
        'quarterly': 'Q',
        'yearly': 'Y',
        'custom': 'M' // Default to monthly for custom
      };

      // Map fiscal year month from frontend to backend format (1-12)
      const fiscalMonthMapping: { [key: string]: number } = {
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
        'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
      };

      // Process combinations one at a time for better reliability
      const allResults = [];
      const totalCombinations = finalData.selectedCombinations.length;
      
      for (let i = 0; i < totalCombinations; i++) {
        const currentCombination = finalData.selectedCombinations[i];
        setTrainingProgress(`🚀 Processing combination ${i + 1}/${totalCombinations}: ${currentCombination}`);
        
        // Prepare request payload for single combination
      const requestPayload = {
        scope_number: finalData.selectedScope,
          combinations: [currentCombination], // Send only the current combination
        y_variable: selectedYVariables[0], // Take first selected Y variable
        forecast_horizon: parseInt(forecastHorizon),
        fiscal_start_month: fiscalMonthMapping[fiscalYearMonth],
        frequency: frequencyMapping[selectedFrequency],
          models_to_run: finalData.selectedModels
        };

        console.log(`🔧 AutoRegressiveModelsCanvas: Processing combination ${i + 1}/${totalCombinations}:`, requestPayload);
        
        

        // Validate request for this combination
      try {
        const validationResponse = await fetch(`${AUTO_REGRESSIVE_API}/validate-request`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestPayload),
        });
        
        if (validationResponse.ok) {
          const validationResult = await validationResponse.json();
            console.log(`🔧 Validation result for combination ${i + 1}:`, validationResult);
        }
      } catch (validationError) {
          console.warn(`🔧 Validation failed for combination ${i + 1}, proceeding anyway:`, validationError);
      }

        // Process this combination with retry logic
        let combinationResult = null;
        let retryCount = 0;
        const maxRetries = 2;
      
        while (retryCount <= maxRetries && !combinationResult) {
          try {
            setTrainingProgress(`📡 Sending request for combination ${i + 1}/${totalCombinations}... (Attempt ${retryCount + 1}/${maxRetries + 1})`);
            
      const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutes timeout per combination
      
            const response = await fetch(`${AUTO_REGRESSIVE_API}/train-autoregressive-models-direct`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        });
        
            clearTimeout(timeoutId);

        if (!response.ok) {
          let errorMessage = `API Error: ${response.status}`;
          try {
            const errorData = await response.json();
            errorMessage += ` - ${errorData.detail || 'Unknown error'}`;
          } catch (parseError) {
            try {
              const errorText = await response.text();
              errorMessage += ` - ${errorText.substring(0, 200)}...`;
            } catch (textError) {
              errorMessage += ' - Unable to parse error response';
            }
          }
          throw new Error(errorMessage);
        }

            const result = await response.json();
            console.log(`🔧 AutoRegressiveModelsCanvas: Combination ${i + 1} completed:`, result);
            
            if (result.results) {
              Object.keys(result.results).forEach(modelKey => {
                console.log(`🔧 AutoRegressiveModelsCanvas: Model ${modelKey} data:`, result.results[modelKey]);
              });
            }
            
            if (result.run_id) {
              combinationResult = result;
              allResults.push(result);
              setTrainingProgress(`✅ Combination ${i + 1}/${totalCombinations} completed successfully!`);
            } else {
              throw new Error('No run_id received from server');
            }
            
      } catch (error) {
            retryCount++;
            if (retryCount > maxRetries) {
        if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Request timeout for combination ${currentCombination} - the server is taking too long to respond.`);
              }
              throw new Error(`Failed to process combination ${currentCombination}: ${error.message}`);
            }
            
            // Wait before retry with exponential backoff
            setTrainingProgress(`⚠️ Request failed for combination ${i + 1}, retrying in ${retryCount * 2} seconds... (${retryCount}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
          }
        }
        
        // Update progress
        const progressPercentage = Math.round(((i + 1) / totalCombinations) * 100);
        setTrainingProgressPercentage(progressPercentage);
      }

      // All combinations processed successfully
      setTrainingProgress(`🎉 All ${totalCombinations} combinations processed successfully!`);
      setTrainingProgressPercentage(100);
      
      // Process the results
      if (allResults.length > 0) {
        
        
        // Use the last result's run_id as the main run_id
        const mainRunId = allResults[allResults.length - 1].run_id;
        setCurrentRunId(mainRunId);
        
        // Process all results
        const combinedResults = {
          run_id: mainRunId,
          status: 'completed',
          processed_combinations: allResults.length,
          total_combinations: totalCombinations,
          results: allResults.flatMap(result => result.results || [])
        };
        
        
          
          // Store results for growth rate calculations
        setLocalModelResults(combinedResults);
        
        // Minimize all combinations by default when new results are loaded
        const allCombinationIndices = Array.from({ length: allResults.length }, (_, i) => i);
        setMinimizedCombinations(new Set(allCombinationIndices));
        
        // Save complete state after training completes
        setTimeout(() => {
          saveCompleteAtomState();
        }, 100);
          
          // Update training progress details
          setTrainingProgressDetails({
          current: allResults.length,
          total: totalCombinations,
          currentCombination: 'All Completed',
            status: 'completed'
          });
          
          // Set training as completed
          setIsTraining(false);
          setTrainingProgressPercentage(100);
          
          // Show success message
        setTrainingProgress(`🎉 All ${totalCombinations} combinations processed successfully!`);
          
        return; // Exit early since all processing is complete
      } else {
        // No results received - this shouldn't happen with sequential processing
        throw new Error('No results received from any combination processing');
      }

    } catch (error) {
      console.error('❌ Failed to run auto-regressive models:', error);
      setTrainingProgress(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsTraining(false);
      setTrainingProgressPercentage(0);
      setTrainingProgressDetails(null);
    }
  };

  // Check if all required selections have been made
  const allSelectionsMade = selectedYVariables.length > 0 && forecastHorizon && fiscalYearMonth && selectedFrequency;

  // Debug log for frequency detection state
  useEffect(() => {
    console.log('🔧 AutoRegressiveModelsCanvas: Frequency detection state:', {
      showFrequencyDropdown,
      autoDetectedFrequency,
      selectedFrequency,
      frequencyConfidence
    });
    
    // Also log the grid layout decision
    console.log('🔧 AutoRegressiveModelsCanvas: Grid layout decision:', {
      gridCols: showFrequencyDropdown ? 'grid-cols-4' : 'grid-cols-3',
      reason: showFrequencyDropdown ? 'Frequency dropdown visible' : 'Frequency auto-detected'
    });
  }, [showFrequencyDropdown, autoDetectedFrequency, selectedFrequency, frequencyConfidence]);

  // Determine button styling based on selections
  const buttonClassName = allSelectionsMade 
    ? "bg-orange-500 hover:bg-orange-600 text-white font-medium px-6 py-2" // Bright orange when all selected
    : "bg-orange-50 hover:bg-orange-100 text-orange-600 font-medium px-6 py-2 cursor-not-allowed"; // Very light orange when not all selected

  // Helper function to format combination name
  const formatCombinationName = (name: string) => {
    if (!name) return '';
    
    // The combination string contains actual identifiers separated by underscores
    // We need to identify the real identifiers, not split every underscore
    // Examples: "modern_trade_Brand1" -> "modern_trade × Brand1"
    //          "Market_Market1_Region_allregion" -> "Market × Market1 × Region × allregion"
    
    // Split by underscore but be smarter about grouping
    const parts = name.split('_');
    if (parts.length <= 1) return name;
    
    // Group related parts that form single identifiers
    const identifiers: string[] = [];
    let currentIdentifier = '';
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      // If this part starts with uppercase, it's likely a new identifier
      if (part.charAt(0) === part.charAt(0).toUpperCase() && part.charAt(0) !== part.charAt(0).toLowerCase()) {
        // Save previous identifier if exists
        if (currentIdentifier) {
          identifiers.push(currentIdentifier);
        }
        currentIdentifier = part;
      } else {
        // This is part of the current identifier
        if (currentIdentifier) {
          currentIdentifier += '_' + part;
        } else {
          currentIdentifier = part;
        }
      }
    }
    
    // Add the last identifier
    if (currentIdentifier) {
      identifiers.push(currentIdentifier);
    }
    
    // Format with cross signs between actual identifiers
    const formattedName = identifiers.join(' × ');
    
    // Truncate if too long
    if (formattedName.length > 70) {
      return formattedName.substring(0, 70) + '...';
    }
    
    return formattedName;
  };

  // Generate real forecast data from backend results for the line chart
  const generateRealForecastData = (result: any, forecastHorizon: number) => {
    
    
    // Debug: Log the full result structure
    
    
    
    
    if (!result?.result?.forecast_df) {
      
        return [];
      }

    const forecast_df = result.result.forecast_df;
    
      
      const data = [];
    
    // Get the actual models that were run from backend
    const modelsRun = result.result.models_run || [];
    
    
    
    // For forecast data, we can only show models that were actually run by the backend
    // because the forecast_df only contains data for those models
    const modelsToShow = modelsRun;
    
    
    // Check which models actually have data
    const modelsWithData = new Set();
    forecast_df.forEach((row: any) => {
      modelsToShow.forEach((model: string) => {
        if (row[model] !== null && row[model] !== undefined) {
          modelsWithData.add(model);
        }
      });
    });
    
    
    // Process each row in the forecast dataframe
    forecast_df.forEach((row: any, index: number) => {
        const dataPoint: any = {
        date: row.date,
        actual: row.Actual || null,
      };
      
      // Add data for each model that should be shown
      modelsToShow.forEach((model: string) => {
        if (row[model] !== null && row[model] !== undefined) {
          dataPoint[model.toLowerCase()] = row[model];
        } else {
          // Add null for models without data so they still appear in the chart
          dataPoint[model.toLowerCase()] = null;
        }
      });
        
        data.push(dataPoint);
      });
      
      
    
      return data;
  };

  // Generate real performance data for the bar chart
  const generateRealPerformanceData = (result: any) => {
    
    
    if (!result?.result?.metrics) {
      
        return [];
      }

    const metrics = result.result.metrics;
    
      
      const data = [];
    
    Object.keys(metrics).forEach((modelName) => {
      const modelMetrics = metrics[modelName];
      if (modelMetrics) {
          const modelData = {
            model: modelName,
          MAE: modelMetrics.MAE || 0,
          MSE: modelMetrics.MSE || 0,
          RMSE: modelMetrics.RMSE || 0,
          MAPE: modelMetrics.MAPE || 0,
          };
          data.push(modelData);
        }
      });
      
      
      return data;
  };

  // Generate real matrix data for performance comparison
  const generateRealMatrixData = (result: any) => {
    
    
    // Debug: Log the full result structure for matrix
    
    
    
    
    // Check for metrics in the result
    const metrics = result?.result?.metrics || {};
    const modelsRun = result?.result?.models_run || [];
    const metricNames = ['MAE', 'MSE', 'RMSE', 'MAPE', 'SMAPE'];
    
    
    
    
    
    
    // Use models_run to ensure all selected models are shown, even if they don't have metrics
    const modelNames = modelsRun.length > 0 ? modelsRun : Object.keys(metrics);
    
    if (modelNames.length === 0) {
      
      return { matrix: [], metrics: [], bestModel: null };
    }
    
    const matrix = modelNames.map((modelName) => {
      const row: any = { model: modelName };
      metricNames.forEach((metric) => {
        // Use metrics if available, otherwise show N/A
        const value = metrics[modelName]?.[metric];
        row[metric] = value !== null && value !== undefined ? value : null;
      });
      
      return row;
    });
    
    // Identify the best model based on lowest MAPE (only consider models with valid MAPE)
    let bestModel = null;
    let bestMape = Infinity;
    
    matrix.forEach((row) => {
      
      if (row.MAPE && row.MAPE < bestMape && row.MAPE > 0) {
        bestMape = row.MAPE;
        bestModel = row.model;
        
      }
    });
    
    
    
    return { matrix, metrics: metricNames, bestModel };
  };

  // Context Menu Components
  const ContextMenu = () => {
    
    if (!showContextMenu) return null;

    

    return (
      <div 
        className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-28 context-menu"
        style={{ 
          left: contextMenuPosition?.x || 0, 
          top: contextMenuPosition?.y || 0,
          transform: 'translate(-50%, -100%)',
          pointerEvents: 'auto',
          backgroundColor: 'rgba(255, 255, 255, 0.98)',
          borderRadius: '8px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(0, 0, 0, 0.1)'
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      >
        {/* Color Theme Option */}
        <button
          className="w-full px-2 py-1 text-xs text-left hover:bg-gray-50 flex items-center gap-1 text-gray-600 relative font-medium"
          onClick={handleColorThemeClick}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
          </svg>
          <span>Color Theme</span>
          <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>



        {/* Grid Toggle */}
        <button
          className="w-full px-2 py-1 text-xs text-left hover:bg-gray-50 flex items-center gap-1 text-gray-600 font-medium"
          onClick={(e) => handleGridToggle(e)}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          <span>Grid</span>
          <div className="ml-auto">
            <div className={`w-4 h-3 rounded border ${showGrid ? 'bg-blue-500 border-blue-500' : 'bg-gray-200 border-gray-300'}`}>
              {showGrid && (
                <svg className="w-4 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </div>
        </button>

        {/* Axis Labels Toggle */}
        <button
          className="w-full px-2 py-1 text-xs text-left hover:bg-gray-50 flex items-center gap-1 text-gray-600 font-medium"
          onClick={(e) => handleAxisLabelsToggle(e)}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          <span>Axis Labels</span>
          <div className="ml-auto">
            <div className={`w-4 h-3 rounded border ${showAxisLabels ? 'bg-blue-500 border-blue-500' : 'bg-gray-200 border-gray-300'}`}>
              {showAxisLabels && (
                <svg className="w-4 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </div>
        </button>

        {/* Data Labels Toggle */}
        <button
          className="w-full px-2 py-1 text-xs text-left hover:bg-gray-50 flex items-center gap-1 text-gray-600 font-medium"
          onClick={(e) => handleDataLabelsToggle(e)}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Data Labels</span>
          <div className="ml-auto">
            <div className={`w-4 h-3 rounded border ${showDataLabels ? 'bg-blue-500 border-blue-500' : 'bg-gray-200 border-gray-300'}`}>
              {showDataLabels && (
                <svg className="w-4 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </div>
        </button>

        {/* Legend Toggle */}
        <button
          className="w-full px-2 py-1 text-xs text-left hover:bg-gray-50 flex items-center gap-1 text-gray-600 font-medium"
          onClick={(e) => handleLegendToggle(e)}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <span>Legend</span>
          <div className="ml-auto">
            <div className={`w-4 h-3 rounded border ${showLegend ? 'bg-blue-500 border-blue-500' : 'bg-gray-200 border-gray-300'}`}>
              {showLegend && (
                <svg className="w-4 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </div>
        </button>


      </div>
    );
  };

  // Color theme submenu component
  const ColorThemeSubmenu = () => {
    if (!showColorSubmenu) return null;

    return (
      <div
        className="fixed z-[9999] bg-white border border-gray-300 rounded-lg shadow-xl p-2 color-submenu"
        style={{
          left: colorSubmenuPos.x,
          top: colorSubmenuPos.y,
          minWidth: '200px',
          maxHeight: '280px',
          overflowY: 'auto',
          backgroundColor: 'rgba(255, 255, 255, 0.98)',
          borderRadius: '8px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          backdropFilter: 'blur(8px)'
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="px-2 py-1 text-xs font-medium text-gray-600 border-b border-gray-200 mb-2">
          Color Theme
        </div>
        
        <div className="grid grid-cols-6 gap-2">
          {Object.entries(COLOR_THEMES).map(([themeKey, theme]) => (
            <button
              key={themeKey}
              className={`w-8 h-8 rounded-lg border-2 transition-all duration-200 hover:scale-110 hover:shadow-lg ${
                selectedTheme === themeKey 
                  ? 'border-blue-500 shadow-lg ring-2 ring-blue-200 ring-opacity-50' 
                  : 'border-gray-300 hover:border-gray-400 hover:shadow-md'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleThemeChange(themeKey, e);
              }}
              title={theme.name}
              style={{
                background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 50%, ${theme.tertiary} 100%)`,
                cursor: 'pointer'
              }}
            >
              {selectedTheme === themeKey && (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
        <div className="mt-2 pt-1 border-t border-gray-200">
          <div className="text-xs text-gray-500 px-2">
            Click any color to apply the theme to your chart
          </div>
        </div>
      </div>
    );
  };

  // Toggle combination minimize/expand like Build Model Feature Based atom
  const toggleCombinationMinimize = (index: number) => {
    setMinimizedCombinations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

    // Helper function to get the correct results array from localModelResults
  const getResultsArray = () => {
    if (!localModelResults) return null;
    
    console.log('🔧 getResultsArray: Processing localModelResults:', {
      hasLocalModelResults: !!localModelResults,
      localModelResultsType: typeof localModelResults,
      localModelResultsKeys: localModelResults && typeof localModelResults === 'object' ? Object.keys(localModelResults) : 'N/A',
      hasResultsProperty: !!(localModelResults as any)?.results,
      resultsType: typeof (localModelResults as any)?.results,
      isResultsArray: Array.isArray((localModelResults as any)?.results),
      hasCombinationResultsProperty: !!(localModelResults as any)?.results?.combination_results,
      isCombinationResultsArray: Array.isArray((localModelResults as any)?.results?.combination_results),
      isLocalModelResultsArray: Array.isArray(localModelResults),
      resultsKeys: (localModelResults as any)?.results && typeof (localModelResults as any).results === 'object' ? Object.keys((localModelResults as any).results) : 'N/A',
      // Log the entire results structure for debugging
      rawResults: (localModelResults as any)?.results
    });
    
    // Check multiple possible locations for results - prioritize combination_results
    let allResults = null;
    
    // The backend now returns data directly in this structure (like Auto regressive 19 Aug):
    // {
    //   "run_id": "...",
    //   "status": "completed",
    //   "results": [  // Direct array of combination results
    //     {
    //       "combination_id": "convenience_heinz_large",
    //       "file_key": "...",
    //       "status": "success",
    //       "result": { /* forecast data */ }
    //     },
    //     {
    //       "combination_id": "convenience_heinz_medium",
    //       "file_key": "...",
    //       "status": "success",
    //       "result": { /* forecast data */ }
    //     }
    //   ],
    //   "total_combinations": 2,
    //   "processed_combinations": 2
    // }
    
    if (Array.isArray((localModelResults as any)?.results)) {
      // Direct results array (the working approach from Auto regressive 19 Aug)
      
      allResults = (localModelResults as any).results;
    } else if ((localModelResults as any)?.results?.combination_results && Array.isArray((localModelResults as any).results.combination_results)) {
      // Fallback: nested structure (old approach)
      
      allResults = (localModelResults as any).results.combination_results;
    } else if (Array.isArray((localModelResults as any)?.combination_results)) {
      // Fallback: direct combination_results
      
      allResults = (localModelResults as any).combination_results;
    } else if (Array.isArray(localModelResults)) {
      // If the entire response is an array
      
      allResults = localModelResults;
    }
    
    if (!allResults) {
      
      return null;
    }
    
    // Debug: Log the actual structure of the first few results
    console.log('🔧 getResultsArray: Sample results structure:', {
      firstResult: allResults[0],
      firstResultType: typeof allResults[0],
      firstResultKeys: allResults[0] && typeof allResults[0] === 'object' ? Object.keys(allResults[0]) : 'N/A',
      allResultsTypes: allResults.slice(0, 3).map((r: any) => typeof r)
    });
    
    // Filter results to only show selected combinations from settings
    if (finalData?.selectedCombinations && finalData.selectedCombinations.length > 0) {
      const selectedCombinationIds = finalData.selectedCombinations
        .map((combo: any) => {
          if (typeof combo === 'string') return combo;
          if (combo && typeof combo === 'object') return combo.combination_id || combo.id || combo;
          return null;
        })
        .filter((id: any) => id !== null && id !== undefined); // Remove any null/undefined values
      
      console.log('🔧 getResultsArray: Filtering results for selected combinations:', {
        selectedCombinationIds,
        allResultsLength: allResults.length,
        allResultsCombinationIds: allResults.map((r: any) => {
          if (typeof r === 'object' && r !== null) {
            return r.combination_id || r.combination || r.id;
          }
          return r; // Return the value as-is if it's a primitive
        })
      });
      
      const filteredResults = allResults.filter((result: any) => {
        let resultId = null;
        
        // Handle different result structures
        if (typeof result === 'object' && result !== null) {
          // If result is an object, look for combination_id, combination, or id
          resultId = result.combination_id || result.combination || result.id;
        } else if (typeof result === 'string') {
          // If result is a string, use it directly
          resultId = result;
        }
        
        // Skip if resultId is undefined/null
        if (!resultId) {
          console.log(`🔧 Filtering result with no ID: EXCLUDED`, { result, resultType: typeof result });
          return false;
        }
        
        const isSelected = selectedCombinationIds.some(selectedId => {
          // Skip if selectedId is undefined/null
          if (!selectedId) return false;
          
          // Direct match
          if (selectedId === resultId) return true;
          
          // String comparison (only if both are strings)
          if (typeof selectedId === 'string' && typeof resultId === 'string') {
            return selectedId.toLowerCase().includes(resultId.toLowerCase()) || 
                   resultId.toLowerCase().includes(selectedId.toLowerCase());
          }
          
          return false;
        });
        
        console.log(`🔧 Filtering result ${resultId}: ${isSelected ? 'INCLUDED' : 'EXCLUDED'}`);
        return isSelected;
      });
      
      console.log('🔧 getResultsArray: Filtered results:', {
        originalCount: allResults.length,
        filteredCount: filteredResults.length,
        filteredIds: filteredResults.map((r: any) => {
          if (typeof r === 'object' && r !== null) {
            return r.combination_id || r.combination || r.id;
          }
          return r;
        })
      });
      
      return filteredResults;
    }
    
    
    return allResults;
  };



  return (
    <div className="w-full h-full bg-background p-6 overflow-y-auto">


      {/* Scope Selected */}
      <Card className="mb-6">
        <div className="py-2 px-4 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              Scope Selected
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
            <div className="grid grid-cols-3 gap-6">
              {/* Selected Scope */}
              <div className="col-span-1">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Selected Scope:</h4>
                {finalData?.selectedScope ? (
                  <Badge variant="default" className="px-3 py-1">
                    Scope {finalData.selectedScope}
                  </Badge>
                ) : (
                  <p className="text-sm text-muted-foreground">No scope selected</p>
                )}
              </div>

              {/* Selected Combinations */}
              <div className="col-span-2">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Selected Combinations:</h4>
                {finalData?.selectedCombinations && finalData.selectedCombinations.length > 0 ? (
                  <div className="max-h-32 max-w-full overflow-y-auto overflow-x-auto border rounded p-2">
                    <div className="flex flex-col gap-2">
                    {finalData.selectedCombinations.map((combination, index) => (
                        <Badge key={index} variant="secondary" className="px-3 py-1 flex items-center gap-1 whitespace-nowrap relative">
                        {combination}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            
                            removeCombination(combination);
                          }}
                          className="h-5 w-5 p-0 ml-1 hover:bg-red-50 hover:text-red-600 transition-colors z-10"
                          title="Remove combination"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </Badge>
                    ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No combinations selected</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Auto-Regressive Configuration */}
      <Card className="mb-6">
        <div className="py-2 px-4 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Auto-Regressive Configuration
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfigSectionExpanded(!configSectionExpanded)}
              className="h-6 w-6 p-0"
            >
              {configSectionExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
        
        {configSectionExpanded && (
          <div className="p-4">
            <div className={`grid ${showFrequencyDropdown ? 'grid-cols-4' : 'grid-cols-3'} gap-3`}>
              {/* Select Y-Variables */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Select Y-Variables</label>
                <Select 
                  value={selectedYVariables.length > 0 ? selectedYVariables[0] : ""} 
                  onValueChange={(value) => setSelectedYVariables(value ? [value] : [])}
                  disabled={isLoadingColumns || numericalColumns.length === 0}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={isLoadingColumns ? "Loading..." : "Select Y-Variables"} />
                  </SelectTrigger>
                  <SelectContent>
                    {numericalColumns.map((column) => (
                      <SelectItem key={column} value={column}>
                        {column}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Frequency Dropdown - Only show when frequency couldn't be auto-detected */}
              {showFrequencyDropdown && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">Frequency</label>
                  <Select 
                    value={selectedFrequency} 
                    onValueChange={handleFrequencyChange}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select Frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Forecast Horizon */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Forecast Horizon</label>
                <input
                  type="number"
                  value={forecastHorizon}
                  onChange={(e) => {
                    // Only allow numerical input
                    const value = e.target.value;
                    if (value === '' || /^\d+$/.test(value)) {
                      setForecastHorizon(value);
                    }
                  }}
                  placeholder={getForecastHorizonPlaceholder(selectedFrequency)}
                  className="w-full h-9 px-3 py-2 border border-input bg-background text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  min="1"
                  step="1"
                />
              </div>

              {/* Fiscal Year Month */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Fiscal Year Month</label>
                <Select 
                  value={fiscalYearMonth} 
                  onValueChange={setFiscalYearMonth}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select Month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jan">January</SelectItem>
                    <SelectItem value="feb">February</SelectItem>
                    <SelectItem value="mar">March</SelectItem>
                    <SelectItem value="apr">April</SelectItem>
                    <SelectItem value="may">May</SelectItem>
                    <SelectItem value="jun">June</SelectItem>
                    <SelectItem value="jul">July</SelectItem>
                    <SelectItem value="aug">August</SelectItem>
                    <SelectItem value="sep">September</SelectItem>
                    <SelectItem value="oct">October</SelectItem>
                    <SelectItem value="nov">November</SelectItem>
                    <SelectItem value="dec">December</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Auto-detected Frequency Info - Show below the grid when frequency was detected */}
            {!showFrequencyDropdown && autoDetectedFrequency && (
              <div className="mt-4 p-3 bg-muted/20 rounded-lg border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Detected Frequency:</span>
                    <span className="text-sm font-medium text-primary">
                      {autoDetectedFrequency}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      (Auto-detected)
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowFrequencyDropdown(true);
                      setAutoDetectedFrequency(null);
                    }}
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Change manually
                  </Button>
                </div>
              </div>
            )}



            {/* Run the Models Button - Left Aligned and Orange */}
            <div className="flex justify-start pt-4">
              <Button 
                onClick={handleRunModels}
                disabled={!allSelectionsMade || isTraining}
                className={buttonClassName}
              >
                {isTraining ? (
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Run the Models
              </Button>
            </div>

            {/* Progress Bar - Green Progress Bar like in the screenshot */}
            {isTraining && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Training models...</span>
                  <span className="text-muted-foreground">{trainingProgressPercentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${trainingProgressPercentage}%` }}
                  ></div>
                </div>
                {trainingProgressDetails?.currentCombination && (
                  <div className="text-xs text-muted-foreground">
                    Currently processing: {trainingProgressDetails.currentCombination}
                  </div>
                )}
                {trainingProgressDetails ? (
                  <div className="text-xs text-muted-foreground">
                    Completed {trainingProgressDetails.current} of {trainingProgressDetails.total} combinations
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Connecting to training service...
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Model Training Results - Compact Card Design */}
      {localModelResults && (
        <Card className="mb-6 shadow-lg border-0 bg-gradient-to-br from-white to-gray-50/30">
          <div className="p-6 border-b bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <BarChart3 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-800">Model Training Results</h3>
                  <p className="text-sm text-blue-600 font-medium">
                    Successfully processed {getResultsArray()?.length || localModelResults.total_combinations || 0} combinations
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="p-6">
            {(() => {
              // Use the helper function to get the correct results array
              const resultsArray = getResultsArray();
              const hasResults = resultsArray && resultsArray.length > 0;
              
              console.log('🔧 AutoRegressiveModelsCanvas: Rendering results section:', {
                hasLocalModelResults: !!localModelResults,
                hasResultsProperty: !!localModelResults?.results,
                isResultsArray: Array.isArray(localModelResults?.results),
                resultsLength: localModelResults?.results?.length,
                resultsArrayLength: resultsArray?.length,
                hasResults,
                resultsArrayType: typeof resultsArray,
                resultsArrayKeys: resultsArray ? Object.keys(resultsArray[0] || {}) : null
              });
              
              return hasResults;
            })() ? (
              <div className="space-y-4">
                {getResultsArray()?.map((result: any, index: number) => {
                  // Debug the result structure
                  console.log(`🔧 Rendering result ${index}:`, {
                    result,
                    resultKeys: Object.keys(result || {}),
                    hasCombinationId: !!result?.combination_id,
                    hasCombination: !!result?.combination,
                    hasId: !!result?.id,
                    status: result?.status,
                    resultData: result?.result,
                    minimizedCombinations: Array.from(minimizedCombinations),
                    isMinimized: minimizedCombinations.has(index)
                  });
                  
                  // Try to get the combination name from multiple possible fields
                  const combinationName = result?.combination_id || 
                                        result?.combination || 
                                        result?.id || 
                                        `Combination ${index + 1}`;
                  
                  // Debug the combination name processing
                  console.log(`🔧 Combination name for result ${index}:`, {
                    resultKeys: Object.keys(result || {}),
                    originalCombinationId: result?.combination_id,
                    originalCombination: result?.combination,
                    originalId: result?.id,
                    finalCombinationName: combinationName,
                    formattedName: formatCombinationName(combinationName),
                    resultStatus: result?.status,
                    hasResult: !!result?.result
                  });
                  
                  return (
                    <div key={index} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-green-100 rounded-lg">
                            <Target className="w-4 h-4 text-green-600" />
                          </div>
                          <h4 className="font-medium text-sm text-gray-800">
                            Combination: <span className="text-green-600 font-semibold">
                              {formatCombinationName(combinationName)}
                            </span>
                          </h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSaveSingleCombination(result)}
                            disabled={result.status !== 'success' && result.status !== 'completed'}
                            className="text-sm bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed h-8 px-3"
                          >
                            <Save className="w-4 h-4 mr-1.5" />
                            Save Result
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleCombinationMinimize(index)}
                            className="h-8 w-8 p-0 hover:bg-gray-100"
                          >
                            {minimizedCombinations.has(index) ? (
                              <Maximize2 className="w-4 h-4 text-gray-600" />
                            ) : (
                              <Minimize2 className="w-4 h-4 text-gray-600" />
                            )}
                          </Button>
                        </div>
                      </div>

                    {!minimizedCombinations.has(index) && (() => {
                      const hasSuccessStatus = result.status === 'success' || result.status === 'completed';
                      
                      console.log(`🔧 Expandable content for result ${index}:`, {
                        isMinimized: minimizedCombinations.has(index),
                        hasSuccessStatus,
                        resultStatus: result.status,
                        minimizedCombinations: Array.from(minimizedCombinations)
                      });
                      
                      return hasSuccessStatus;
                    })() && (
                      <>
                        {/* Forecast Chart and Matrix Grid */}
                        <div className="grid grid-cols-12 gap-4 mt-4">
                          {/* Forecast Chart - Takes 60% space */}
                          <div className="col-span-7 p-4 border border-muted/30 rounded-lg bg-gradient-to-br from-white to-muted/5 shadow-sm chart-card">
                            <div className="flex items-center justify-between mb-3">
                              <h6 className="font-bold text-base text-gray-900 flex items-center gap-2">
                                <div className="p-1.5 bg-blue-100 rounded-lg">
                                  <BarChart3 className="w-4 h-4 text-blue-600" />
                                </div>
                                Forecast for Y-Variable
                              </h6>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                                onClick={() => {
                                  console.log('🔧 Setting fullscreen forecast chart:', {
                                    combinationId: result.combination_id,
                                    result: result
                                  });
                                  setFullscreenChart({
                                    type: 'forecast',
                                    combinationId: result.combination_id,
                                    title: `Forecast for Y-Variable - ${result.combination_id}`,
                                    result: result
                                  });
                                }}
                                title="Expand chart"
                              >
                                <Maximize2 className="w-3 h-3" />
                              </Button>
                            </div>
                            <div className="w-full h-64">
                              {(() => {
                                // Check if this result has a failure status
                                if (result.result?.status === 'FAILURE') {
                                  return (
                                    <div className="w-full h-full flex items-center justify-center text-red-600">
                                      <div className="text-center">
                                        <AlertTriangle className="w-16 h-16 mx-auto mb-3 opacity-60" />
                                        <p className="text-base font-semibold">Model Training Failed</p>
                                        <p className="text-sm text-red-500 mt-2">
                                          {result.result.error}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                }
                                
                                const chartData = generateRealForecastData(result, parseInt(forecastHorizon));
                                
                                
                                
                                if (chartData.length === 0) {
                                  return (
                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                      <div className="text-center">
                                        <BarChart3 className="w-16 h-16 mx-auto mb-3 opacity-40" />
                                        <p className="text-base font-medium">No chart data available</p>
                                        <p className="text-sm">Check console for debug info</p>
                                      </div>
                                    </div>
                                  );
                                }
                                
                                // Get the models that were run
                                const models = result.result?.models_run || [];
                                const bestModel = models.length > 0 ? models[0] : null;
                                
                                // Check if we have any model data
                                const hasModelData = chartData.some(point => {
                                  return models.some(model => point[model.toLowerCase()] !== null && point[model.toLowerCase()] !== undefined);
                                });
                                
                                if (!hasModelData) {
                                  return (
                                    <div className="w-full h-full flex items-center justify-center text-amber-600">
                                      <div className="text-center">
                                        <AlertTriangle className="w-16 h-16 mx-auto mb-3 opacity-60" />
                                        <p className="text-base font-medium">Models Failed to Train</p>
                                        <p className="text-sm mt-2">Only actual values are available</p>
                                        <p className="text-xs mt-1 text-gray-500">This may be due to insufficient data or model constraints</p>
                                      </div>
                                    </div>
                                  );
                                }
                                
                                return (
                                  <ResponsiveContainer width="100%" height="100%" >
                                    <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                                      <defs>
                                        <linearGradient id={`lineGradient-actual-${index}`} x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.8}/>
                                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0.1}/>
                                        </linearGradient>
                                        <linearGradient id={`lineGradient-forecast-${index}`} x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.8}/>
                                          <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.1}/>
                                        </linearGradient>
                                        <filter id={`lineShadow-${index}`} x="-50%" y="-50%" width="200%" height="200%">
                                          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" floodColor="#6366f1"/>
                                        </filter>
                                      </defs>
                                      
                                      {/* Dark grey background for forecasted data region - positioned before grid */}
                                      {(() => {
                                        // Find the last point where actual values exist
                                        const lastActualIndex = chartData.findIndex((point: any, idx: number) => {
                                          // Check if this point has actual value and the next point doesn't
                                          const hasActual = point.actual !== null && point.actual !== undefined;
                                          const nextPoint = chartData[idx + 1];
                                          const nextHasActual = nextPoint && (nextPoint.actual !== null && nextPoint.actual !== undefined);
                                          
                                          return hasActual && !nextHasActual;
                                        });
                                        
                                        if (lastActualIndex !== -1 && lastActualIndex < chartData.length - 1) {
                                          const separationPoint = chartData[lastActualIndex];
                                          const lastPoint = chartData[chartData.length - 1];
                                          
                                          return (
                                            <ReferenceArea
                                              x1={separationPoint.date}
                                              x2={lastPoint.date}
                                              fill="#6b7280"
                                              fillOpacity={0.2}
                                            />
                                          );
                                        }
                                        return null;
                                      })()}
                                      
                                      <CartesianGrid 
                                        strokeDasharray="3 3" 
                                        stroke="#94a3b8" 
                                        strokeOpacity={0.8}
                                        vertical={false}
                                      />
                                      
                                      {/* Vertical line to separate historical and forecasted data - positioned after grid */}
                                      {(() => {
                                        // Find the last point where actual values exist
                                        const lastActualIndex = chartData.findIndex((point: any, idx: number) => {
                                          // Check if this point has actual value and the next point doesn't
                                          const hasActual = point.actual !== null && point.actual !== undefined;
                                          const nextPoint = chartData[idx + 1];
                                          const nextHasActual = nextPoint && (nextPoint.actual !== null && nextPoint.actual !== undefined);
                                          
                                          return hasActual && !nextHasActual;
                                        });
                                        
                                        if (lastActualIndex !== -1 && lastActualIndex < chartData.length - 1) {
                                          const separationPoint = chartData[lastActualIndex];
                                          
                                          return (
                                            <ReferenceLine
                                              x={separationPoint.date}
                                              stroke="#ef4444"
                                              strokeWidth={2}
                                              strokeDasharray="5 5"
                                              label={{
                                                value: "Forecast",
                                                position: "top",
                                                fill: "#ef4444",
                                                fontSize: 10,
                                                fontWeight: 600
                                              }}
                                            />
                                          );
                                        }
                                        return null;
                                      })()}
                                      <XAxis 
                                        dataKey="date" 
                                        stroke="#64748b"
                                        fontSize={11}
                                        fontWeight={500}
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        tickFormatter={(value) => {
                                          if (typeof value === 'string') {
                                            const date = new Date(value);
                                            return date.toLocaleDateString('en-US', { 
                                              month: 'short', 
                                              day: 'numeric',
                                              year: '2-digit'
                                            });
                                          }
                                          return value;
                                        }}
                                      />
                                      <YAxis 
                                        stroke="#64748b"
                                        fontSize={11}
                                        fontWeight={500}
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        width={60}
                                        tickFormatter={(value) => {
                                          if (typeof value === 'number') {
                                            return value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value.toString();
                                          }
                                          return value;
                                        }}
                                      />
                                      <Tooltip 
                                        contentStyle={{ 
                                          backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                                          border: 'none', 
                                          borderRadius: '12px', 
                                          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                                          backdropFilter: 'blur(10px)',
                                          fontSize: '12px',
                                          fontWeight: 500
                                        }}
                                        cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeOpacity: 0.4 }}
                                        labelFormatter={(value) => {
                                          if (typeof value === 'string') {
                                            const date = new Date(value);
                                            return date.toLocaleDateString('en-US', { 
                                              weekday: 'long',
                                              year: 'numeric', 
                                              month: 'long', 
                                              day: 'numeric'
                                            });
                                          }
                                          return value;
                                        }}
                                        formatter={(value: any, name: string) => [
                                          typeof value === 'number' ? value.toLocaleString() : value,
                                          name
                                        ]}
                                      />
                                                                             <Legend 
                                         wrapperStyle={{ 
                                           fontSize: '12px',
                                           fontWeight: '600',
                                           paddingTop: '20px',
                                           opacity: 0.8
                                         }}
                                         iconType="line"
                                         onClick={(entry) => {
                                           
                                           
                                           handleLegendClick(entry, index);
                                         }}
                                         className="interactive-legend"
                                       />
                                      
                                      {/* Actual Values - Solid Line */}
                                      {isLineVisible('actual', index) && (
                                        <Line 
                                          type="monotone" 
                                          dataKey="actual" 
                                          stroke="#dc2626" 
                                          strokeWidth={3}
                                          fill={`url(#lineGradient-actual-${index})`}
                                          dot={{ 
                                            fill: '#dc2626', 
                                            strokeWidth: 0, 
                                            r: 0
                                          }}
                                          activeDot={{ 
                                            r: 8, 
                                            fill: '#dc2626', 
                                            stroke: 'white', 
                                            strokeWidth: 3,
                                            filter: `url(#lineShadow-${index})`,
                                            style: { cursor: 'pointer' }
                                          }}
                                          filter={`url(#lineShadow-${index})`}
                                          name="Actual Values"
                                        />
                                      )}
                                      
                                      {/* Model Forecasts - Dotted Lines */}
                                      {models.map((model: string, modelIndex: number) => {
                                        const modelKey = model.toLowerCase();
                                        // Unique colors for each model: Red, Orange, Blue, Purple, Green, Orange-Red
                                        const modelColors = ['#dc2626', '#f59e0b', '#2563eb', '#7c3aed', '#059669', '#ea580c'];
                                        const modelColor = modelColors[modelIndex % modelColors.length];
                                        
                                        if (!isLineVisible(modelKey, index)) {
                                          return null;
                                        }
                                        
                                        // Check if this model has any data points
                                        const hasData = chartData.some(point => point[modelKey] !== null && point[modelKey] !== undefined);
                                        
                                        if (!hasData) {
                                          console.log(`🔧 Model ${model} has no data, skipping line rendering`);
                                          return null;
                                        }
                                        
                                        return (
                                          <Line 
                                            key={modelKey}
                                            type="monotone" 
                                            dataKey={modelKey} 
                                            stroke={modelColor} 
                                            strokeWidth={3}
                                            strokeDasharray="5 5"
                                            dot={{ 
                                              fill: modelColor, 
                                              strokeWidth: 0, 
                                              r: 0
                                            }}
                                            activeDot={{ 
                                              r: 8, 
                                              fill: modelColor, 
                                              stroke: 'white', 
                                              strokeWidth: 3,
                                              style: { cursor: 'pointer' }
                                            }}
                                            name={model}
                                          />
                                        );
                                      })}
                                    </LineChart>
                                  </ResponsiveContainer>
                                                                  );
                              })()}
                            </div>
                            

                          </div>

                          {/* Matrix Table - Takes 40% space */}
                          <div className="col-span-5 pt-8 pb-6 px-6 border border-gray-200 rounded-xl bg-gradient-to-br from-white via-gray-50/30 to-white">
                            <div className="mb-3">
                              <h6 className="text-base font-medium text-gray-700 mb-2">
                                Performance Matrix
                              </h6>
                            </div>
                            <div className="h-72 overflow-y-auto overflow-x-auto border border-gray-200 rounded-lg bg-white shadow-sm">
                              {(() => {
                                const { matrix, metrics, bestModel } = generateRealMatrixData(result);
                                const models = result.result?.models_run || [];
                                
                                if (matrix.length === 0) {
                                  return (
                                    <div className="flex items-center justify-center h-64">
                                      <div className="text-center">
                                        <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-60" />
                                        <p className="text-sm font-medium">No Model Metrics Available</p>
                                        <p className="text-xs mt-1 text-gray-500">Models may have failed to train due to insufficient data</p>
                                      </div>
                                    </div>
                                  );
                                }
                                
                                // Reorder metrics to put MAPE first
                                const reorderedMetrics = ['MAPE', ...metrics.filter(m => m !== 'MAPE')];
                                
                                return (
                                  <table className="w-full text-sm border-collapse">
                                    <thead className="sticky top-0 z-10">
                                      <tr className="border-b-2 border-gray-300">
                                        <th className="text-left py-3 px-4 font-semibold text-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 rounded-tl-lg w-48 border-r border-gray-200">
                                          <span>Model</span>
                                        </th>
                                        {reorderedMetrics.map((metric: string) => (
                                          <th key={metric} className="text-center py-3 px-3 font-semibold text-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 border-r border-gray-200 last:border-r-0">
                                            <span>{metric}</span>
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {matrix.map((row: any, rowIndex: number) => {
                                        const isBestModel = row.model === bestModel;
                                        
                                        return (
                                          <tr 
                                            key={row.model} 
                                            className={`border-b border-gray-100 ${
                                              isBestModel 
                                                ? 'bg-green-50 border-green-200' 
                                                : 'hover:bg-gray-50 transition-colors duration-150'
                                            }`}
                                          >
                                            <td className={`py-3 px-4 font-semibold text-gray-800 bg-gradient-to-r from-gray-50 to-gray-100 w-48 border-r border-gray-200 ${
                                              isBestModel ? 'text-green-900 bg-green-100' : ''
                                            }`}>
                                              <div className="flex items-center gap-3">
                                                {isBestModel && (
                                                  <div className="w-3 h-3 bg-green-500 rounded-full flex-shrink-0"></div>
                                                )}
                                                <span className={`whitespace-nowrap ${isBestModel ? 'text-green-900 font-bold' : ''}`}>
                                                  {row.model}
                                                </span>
                                              </div>
                                            </td>
                                            {reorderedMetrics.map((metric: string) => (
                                              <td key={metric} className={`text-center py-3 px-3 text-sm font-medium border-r border-gray-200 last:border-r-0 ${
                                                isBestModel 
                                                  ? 'text-green-800 bg-green-50 font-semibold' 
                                                  : 'text-gray-700 bg-white'
                                              }`}>
                                                {row[metric] !== null && row[metric] !== undefined ? (
                                                  <span className={isBestModel ? 'text-green-900 font-bold' : 'text-gray-700'}>
                                                    {row[metric].toFixed(4)}
                                                  </span>
                                                ) : (
                                                  <span className="text-gray-400">N/A</span>
                                                )}
                                              </td>
                                            ))}
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* Growth Rates Section */}
                        <div className="mt-4">
                          {/* Growth Rates Configuration */}
                          <div className="p-4 border border-muted/30 rounded-lg bg-gradient-to-br from-white to-muted/5 shadow-sm mb-4">
                            {/* Growth Rates Heading */}
                            <div className="mb-4">
                              <h6 className="font-bold text-base text-gray-900 flex items-center gap-2">
                                <div className="p-1.5 bg-green-100 rounded-lg">
                                  <TrendingUp className="w-4 h-4 text-green-600" />
                                </div>
                                Growth Rates :
                              </h6>
                            </div>
                            
                            {/* Model Selection and Time Period Buttons */}
                            <div className="flex items-center justify-between">
                              {/* Model Selection - Multi-select dropdown with checkboxes */}
                              <div className="w-64 relative dropdown-container">
                                <label className="text-sm font-medium text-muted-foreground mb-2 block">Select models for category</label>
                                <div className="relative">
                                  <Button 
                                    variant="outline" 
                                    className="w-full justify-between h-9"
                                    disabled={!result.result?.models_run || result.result.models_run.length === 0}
                                    onClick={() => {
                                      setOpenDropdowns(prev => ({
                                        ...prev,
                                        [result.combination_id]: !prev[result.combination_id]
                                      }));
                                    }}
                                  >
                                    {!result.result?.models_run || result.result.models_run.length === 0
                                      ? "Run models first" 
                                      : (combinationGrowthModels[result.combination_id] || []).length === 0 
                                        ? "Select Models" 
                                        : (combinationGrowthModels[result.combination_id] || []).length === 1 
                                          ? (combinationGrowthModels[result.combination_id] || [])[0] 
                                          : `${(combinationGrowthModels[result.combination_id] || []).length} models selected`
                                    }
                                    <ChevronDown className="h-4 w-4 opacity-50" />
                                  </Button>
                                  
                                  {/* Custom Dropdown Content */}
                                  <div 
                                    className={`absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 ${
                                      openDropdowns[result.combination_id] ? 'block' : 'hidden'
                                    }`}
                                  >
                                    {!result.result?.models_run || result.result.models_run.length === 0 ? (
                                      <div className="px-3 py-2 text-sm text-gray-500 text-center">
                                        Run models first to see available options
                                      </div>
                                    ) : (
                                      <div className="py-1">
                                        {result.result.models_run.map((model: string) => {
                                          const isChecked = (combinationGrowthModels[result.combination_id] || []).includes(model);
                                          return (
                                            <div
                                              key={model}
                                              className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const currentModels = combinationGrowthModels[result.combination_id] || [];
                                                const updatedModels = isChecked
                                                  ? currentModels.filter(m => m !== model)
                                                  : [...currentModels, model];
                                                
                                                setCombinationGrowthModels(prev => ({
                                                  ...prev,
                                                  [result.combination_id]: updatedModels
                                                }));
                                                
                                                // Trigger growth rate calculation when models change
                                                if (updatedModels.length > 0) {
                                                  setTimeout(() => {
                                                    calculateGrowthRates(selectedGrowthPeriod, result.combination_id);
                                                  }, 100);
                                                }
                                              }}
                                            >
                                              <div className={`w-4 h-4 border-2 rounded flex items-center justify-center mr-3 ${
                                                isChecked 
                                                  ? 'bg-blue-600 border-blue-600' 
                                                  : 'border-gray-300'
                                              }`}>
                                                {isChecked && <Check className="w-3 h-3 text-white" />}
                                              </div>
                                              <span className="text-sm">{model}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Time Period Selection - Extreme right with increased gaps */}
                              <div className="flex items-center bg-gray-100 rounded-lg p-1 space-x-8">
                                <button
                                  onClick={() => {
                                    
                                    setSelectedGrowthPeriod('quarterly');
                                    // Check if we have models selected for this combination
                                    const currentModels = combinationGrowthModels[result.combination_id] || [];
                                    if (currentModels.length > 0) {
                                      calculateGrowthRates('quarterly', result.combination_id);
                                    }
                                  }}
                                  className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
                                    selectedGrowthPeriod === 'quarterly'
                                      ? 'bg-white text-blue-700 shadow-sm'
                                      : 'text-gray-600 hover:text-gray-900'
                                  }`}
                                  disabled={isLoadingGrowthRates || (combinationGrowthModels[result.combination_id] || []).length === 0}
                                >
                                  Quarterly
                                </button>
                                <button
                                  onClick={() => {
                                    
                                    setSelectedGrowthPeriod('halfyearly');
                                    // Check if we have models selected for this combination
                                    const currentModels = combinationGrowthModels[result.combination_id] || [];
                                    if (currentModels.length > 0) {
                                      calculateGrowthRates('halfyearly', result.combination_id);
                                    }
                                  }}
                                  className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
                                    selectedGrowthPeriod === 'halfyearly'
                                      ? 'bg-white text-blue-700 shadow-sm'
                                      : 'text-gray-600 hover:text-gray-900'
                                  }`}
                                  disabled={isLoadingGrowthRates || (combinationGrowthModels[result.combination_id] || []).length === 0}
                                >
                                  Half-Yearly
                                </button>
                                <button
                                  onClick={() => {
                                    
                                    setSelectedGrowthPeriod('yearly');
                                    // Check if we have models selected for this combination
                                    const currentModels = combinationGrowthModels[result.combination_id] || [];
                                    if (currentModels.length > 0) {
                                      calculateGrowthRates('yearly', result.combination_id);
                                    }
                                  }}
                                  className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
                                    selectedGrowthPeriod === 'yearly'
                                      ? 'bg-white text-blue-700 shadow-sm'
                                      : 'text-gray-600 hover:text-gray-900'
                                  }`}
                                  disabled={isLoadingGrowthRates || (combinationGrowthModels[result.combination_id] || []).length === 0}
                                >
                                  Yearly
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Growth Rates Chart and Matrix - Only show when models are selected */}
                          {(combinationGrowthModels[result.combination_id] || []).length > 0 && (
                            <div className="grid grid-cols-12 gap-4">
                              {/* Growth Rates Chart - Takes 60% space (aligned with forecast chart) */}
                              <div className="col-span-7 p-4 border border-muted/30 rounded-lg bg-gradient-to-br from-white to-muted/5 shadow-sm chart-card" data-chart-area="true" data-chart-type="bar">
                                <div className="flex items-center justify-between mb-3">
                                  <h6 className="font-medium text-sm text-gray-700">Results :</h6>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                                    onClick={() => {
                                      console.log('🔧 Setting fullscreen growth chart:', {
                                        combinationId: result.combination_id,
                                        result: result
                                      });
                                      setFullscreenChart({
                                        type: 'growth',
                                        combinationId: result.combination_id,
                                        title: `Growth Rates - ${result.combination_id}`,
                                        result: result
                                      });
                                    }}
                                    title="Expand chart"
                                  >
                                    <Maximize2 className="w-3 h-3" />
                                  </Button>
                                </div>
                                <div className="w-full h-64">
                                  {isLoadingGrowthRates ? (
                                    <div className="flex items-center justify-center h-full">
                                      <div className="text-center">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
                                        <p className="text-sm text-gray-500">Calculating growth rates...</p>
                                      </div>
                                    </div>
                                  ) : growthRatesData && growthRatesData[result.combination_id] ? (
                                    <div className="w-full h-full" >
                                      {(() => {
                                        // Get the current models for this combination
                                        const currentModels = combinationGrowthModels[result.combination_id] || [];
                                        
                                        const chartData = (() => {
                                          // Fix: Get the correct data based on the selected period for this specific combination
                                          let rawData = [];
                                          const combinationData = growthRatesData[result.combination_id];
                                          
                                          // Try to get data with fallback options - handle nested structure
                                          if (selectedGrowthPeriod === 'quarterly') {
                                            // Handle nested structure: {quarterly_growth: Array(30)}
                                            const quarterlyData = combinationData.data?.quarterly_growth;
                                            if (quarterlyData && typeof quarterlyData === 'object' && quarterlyData.quarterly_growth) {
                                              rawData = quarterlyData.quarterly_growth;
                                            } else if (Array.isArray(quarterlyData)) {
                                              rawData = quarterlyData;
                                            } else {
                                              rawData = [];
                                            }
                                          } else if (selectedGrowthPeriod === 'halfyearly') {
                                            rawData = combinationData.data?.halfyearly_growth || [];
                                          } else {
                                            rawData = combinationData.data?.fiscal_growth || [];
                                          }
                                          
                                          // If still no data, try to get it from the root level
                                          if (rawData.length === 0 && combinationData.data) {
                                            
                                            if (selectedGrowthPeriod === 'quarterly') {
                                              rawData = combinationData.quarterly_growth || [];
                                            } else if (selectedGrowthPeriod === 'halfyearly') {
                                              rawData = combinationData.halfyearly_growth || [];
                                            } else {
                                              rawData = combinationData.fiscal_growth || [];
                                            }
                                          }
                                          
                                          
                                          
                                          
                                          
                                          
                                          
                                          // Debug the nested structure
                                          if (combinationData.data?.quarterly_growth) {
                                            
                                            
                                            
                                            if (combinationData.data.quarterly_growth.quarterly_growth) {
                                              
                                              
                                            }
                                          }
                                          
                                          // Debug: Check if rawData has the expected structure
                                          if (rawData.length > 0) {
                                            
                                            
                                          } else {
                                            
                                            
                                            if (combinationData.data) {
                                              
                                              
                                              
                                            }
                                          }
                                          
                                          // Add detailed debugging for raw data
                                          if (Array.isArray(rawData) && rawData.length > 0) {
                                            
                                            const safeRawData = Array.isArray(rawData) ? rawData : [];
                                            safeRawData.slice(0, 5).forEach((item, index) => {
                                              console.log(`🔧 Raw item ${index}:`, {
                                                model: item.model,
                                                fiscal_year: item.fiscal_year,
                                                fiscal_half: item.fiscal_half,
                                                fiscal_quarter: item.fiscal_quarter,
                                                fiscal_period: item.fiscal_period,
                                                growth_rate: item.growth_rate
                                              });
                                            });
                                            
                                            
                                          }
                                          
                                          // Transform data for grouped bar chart - group by model (x-axis) with fiscal years as legends
                                          // Ensure rawData is an array before filtering
                                          let arrayData = Array.isArray(rawData) ? rawData : [];
                                          
                                          // If no data found, try to extract from the matrix data structure
                                          if (arrayData.length === 0) {
                                            
                                            let matrixData = [];
                                            
                                            if (selectedGrowthPeriod === 'quarterly') {
                                              matrixData = combinationData.data?.quarterly_growth?.quarterly_growth || 
                                                         combinationData.data?.quarterly_growth || 
                                                         combinationData.quarterly_growth || [];
                                            } else if (selectedGrowthPeriod === 'halfyearly') {
                                              matrixData = combinationData.data?.halfyearly_growth?.halfyearly_growth || 
                                                         combinationData.data?.halfyearly_growth || 
                                                         combinationData.halfyearly_growth || [];
                                            } else {
                                              matrixData = combinationData.data?.fiscal_growth?.fiscal_growth || 
                                                         combinationData.data?.fiscal_growth || 
                                                         combinationData.fiscal_growth || [];
                                            }
                                            
                                            if (Array.isArray(matrixData) && matrixData.length > 0) {
                                              
                                              arrayData = matrixData;
                                            }
                                          }
                                          
                                          
                                          
                                          
                                          // Transform data for grouped bar chart - group by model (x-axis) with fiscal years as legends
                                          const filteredData = arrayData.filter((row: any) => {
                                            return currentModels.length === 0 || currentModels.includes(row.model);
                                          });

                                          
                                          
                                          // Add debugging for filtered data
                                          if (filteredData.length > 0) {
                                            
                                            filteredData.slice(0, 5).forEach((item, index) => {
                                              console.log(`🔧 Filtered item ${index}:`, {
                                                model: item.model,
                                                fiscal_year: item.fiscal_year,
                                                fiscal_half: item.fiscal_half,
                                                fiscal_quarter: item.fiscal_quarter,
                                                fiscal_period: item.fiscal_period,
                                                growth_rate: item.growth_rate
                                              });
                                            });
                                            
                                          }
                                          
                                          // Group by model and create chart data with fiscal years as legends
                                          let groupedData: { [key: string]: any } = {};
                                          
                                          // First, collect all unique fiscal year identifiers to ensure we have all periods
                                          const allFiscalYears = new Set<string>();
                                          filteredData.forEach((row: any) => {
                                            let fiscalYearId;
                                            if (selectedGrowthPeriod === 'quarterly') {
                                              fiscalYearId = row.fiscal_period || `${row.fiscal_year} Q${row.fiscal_quarter}`;
                                            } else if (selectedGrowthPeriod === 'halfyearly') {
                                              fiscalYearId = `${row.fiscal_year} ${row.fiscal_half}`;
                                            } else {
                                              fiscalYearId = row.fiscal_year;
                                            }
                                            allFiscalYears.add(fiscalYearId);
                                          });
                                          
                                          // Sort fiscal years chronologically
                                          const sortedFiscalYears = Array.from(allFiscalYears).sort((a, b) => {
                                            // Extract year and quarter/half for sorting
                                            const yearA = parseInt(a.match(/FY(\d+)/)?.[1] || '0');
                                            const yearB = parseInt(b.match(/FY(\d+)/)?.[1] || '0');
                                            if (yearA !== yearB) return yearA - yearB;
                                            
                                            // For quarters, sort Q1, Q2, Q3, Q4
                                            const quarterA = a.match(/Q(\d+)/)?.[1] || '0';
                                            const quarterB = b.match(/Q(\d+)/)?.[1] || '0';
                                            if (quarterA && quarterB) return parseInt(quarterA) - parseInt(quarterB);
                                            
                                            // For half-years, sort H1, H2
                                            const halfA = a.match(/H(\d+)/)?.[1] || '0';
                                            const halfB = b.match(/H(\d+)/)?.[1] || '0';
                                            if (halfA && halfB) return parseInt(halfA) - parseInt(halfB);
                                            
                                            return 0;
                                          });
                                          
                                          
                                          
                                          
                                          
                                          filteredData.forEach((row: any) => {
                                            const model = row.model;
                                            
                                            if (!groupedData[model]) {
                                              groupedData[model] = { model };
                                              // Initialize all fiscal year keys with 0
                                              sortedFiscalYears.forEach(fiscalYear => {
                                                const dataKey = `${fiscalYear.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}_growth_rate`;
                                                groupedData[model][dataKey] = 0;
                                              });
                                              console.log(`🔧 Created new model group: ${model}`);
                                            }
                                            
                                            // Handle null values - use 0 instead of null for chart rendering
                                            const growthRate = row.growth_rate === null || row.growth_rate === undefined ? 0 : row.growth_rate;
                                            
                                            // Create fiscal year identifier for legend
                                            let fiscalYearId;
                                            if (selectedGrowthPeriod === 'quarterly') {
                                              fiscalYearId = row.fiscal_period || `${row.fiscal_year} Q${row.fiscal_quarter}`;
                                            } else if (selectedGrowthPeriod === 'halfyearly') {
                                              fiscalYearId = `${row.fiscal_year} ${row.fiscal_half}`;
                                            } else {
                                              fiscalYearId = row.fiscal_year;
                                            }
                                            
                                            // Store decimal growth rate (percentage divided by 100) for bar height
                                            const dataKey = `${fiscalYearId.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}_growth_rate`;
                                            
                                            groupedData[model][dataKey] = growthRate; // Data is already in decimal format
                                            console.log(`🔧 Added ${dataKey} = ${growthRate} (${(growthRate * 100).toFixed(2)}%) to model ${model}`);
                                            console.log(`🔧 Original fiscalYearId: ${fiscalYearId}`);
                                            console.log(`🔧 Generated dataKey: ${dataKey}`);
                                          });
                                          
                                          // Calculate ensemble (weighted average) for each model
                                          const ensembleData: { [key: string]: any } = { model: 'Ensemble' };
          
                                          // Initialize ensemble with all fiscal year keys set to 0
                                          
                                          sortedFiscalYears.forEach(fiscalYear => {
                                            const dataKey = `${fiscalYear.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}_growth_rate`;
                                            ensembleData[dataKey] = 0;
                                            console.log(`🔧 Added ensemble key: ${dataKey}`);
                                          });
                                          
                                          
                                          Object.keys(groupedData).forEach(model => {
                                            const modelData = groupedData[model];
                                            const fiscalYearValues: number[] = [];
                                            const weights: number[] = [];
                                            
                                            sortedFiscalYears.forEach(fiscalYear => {
                                              const dataKey = `${fiscalYear.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}_growth_rate`;
                                              const value = modelData[dataKey];
                                              
                                              if (value !== 0 && value !== null && value !== undefined) {
                                                fiscalYearValues.push(value);
                                                
                                                // Calculate weight based on fiscal year (more recent years get higher weight)
                                                const year = parseInt(fiscalYear.match(/FY(\d+)/)?.[1] || '0');
                                                const weight = Math.pow(1.1, year - 22); // Exponential weighting: FY22=1, FY23=1.1, FY24=1.21, etc.
                                                weights.push(weight);
                                              }
                                            });
                                            
                                            if (fiscalYearValues.length > 0) {
                                              // Calculate weighted average
                                              const weightedSum = fiscalYearValues.reduce((sum, value, index) => sum + (value * weights[index]), 0);
                                              const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
                                              const ensembleValue = weightedSum / totalWeight;
                                              
                                              // Add this model's contribution to ensemble
                                              sortedFiscalYears.forEach(fiscalYear => {
                                                const dataKey = `${fiscalYear.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}_growth_rate`;
                                                ensembleData[dataKey] += modelData[dataKey];
                                              });
                                              
                                              console.log(`🔧 Calculated ensemble contribution for ${model}: ${ensembleValue} (${(ensembleValue * 100).toFixed(2)}%)`);
                                            } else {
                                              console.log(`🔧 No valid data for ensemble calculation for ${model}`);
                                            }
                                          });
                                          
                                          // Calculate final ensemble values (average across all models for each fiscal year)
                                          const modelCount = Object.keys(groupedData).length;
                                          if (modelCount > 0) {
                                            sortedFiscalYears.forEach(fiscalYear => {
                                              const dataKey = `${fiscalYear.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}_growth_rate`;
                                              ensembleData[dataKey] = ensembleData[dataKey] / modelCount;
                                            });
                                            console.log(`🔧 Final ensemble data calculated for ${modelCount} models`);
                                          }
                                          
                                          // Add ensemble as a separate model at the front
                                          const finalGroupedData: { [key: string]: any } = {};
                                          finalGroupedData['Ensemble'] = ensembleData;
                                          
                                          // Add all other models after ensemble
                                          Object.keys(groupedData).forEach(model => {
                                            if (model !== 'Ensemble') {
                                                finalGroupedData[model] = groupedData[model];
                                            }
                                          });
                                          
                                          // Replace the original groupedData with the reordered and filtered version
                                          groupedData = finalGroupedData;

                                          
                                          
                                          
                                          // Debug: Check the structure of each model's data
                                          Object.keys(groupedData).forEach(model => {
                                            console.log(`🔧 Data structure for ${model}:`, groupedData[model]);
                                            console.log(`🔧 Keys for ${model}:`, Object.keys(groupedData[model]));
                                          });
                                          
                                          const transformedData = Object.values(groupedData);
                                          
                                          // Ensure transformedData is always an array
                                          const safeTransformedData = Array.isArray(transformedData) ? transformedData : [];
                                          
                                          // Filter out periods that have no meaningful data (all values are 0 or null)
                                          const filteredTransformedData = safeTransformedData.filter((periodData: any) => {
                                            // Check if any fiscal year has a non-zero growth rate for this model
                                            const hasValidData = Object.keys(periodData).some((key: string) => {
                                              if (key === 'model') return false; // Skip the model name key
                                              const value = periodData[key];
                                              return value !== null && value !== undefined && value !== 0;
                                            });
                                            return hasValidData;
                                          });
                                          
                                          
                                          
                                          
                                          
                                          
                                          
                                          
                                          
                                          
                                          // No fallback data - only show real data
                                          if (filteredTransformedData.length === 0) {
                                            
                                            return [];
                                          }
                                          
                                          return filteredTransformedData;
                                        })();
                                        
                                        
                                        
                                        
                                        
                                        // Test if chart data is valid
                                        if (!chartData || !Array.isArray(chartData) || chartData.length === 0) {
                                          
                                          return (
                                            <div className="flex items-center justify-center h-full">
                                              <div className="text-center">
                                                <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                                                <p className="text-gray-600">No Growth Rate Data Available</p>
                                                <p className="text-sm text-gray-500 mt-2">
                                                  Please run models and calculate growth rates to see data
                                                </p>
                                              </div>
                                            </div>
                                          );
                                        }
                                        
                                        // Additional validation: Check if the data has the expected structure
                                        const firstItem = chartData[0];
                                        if (!firstItem || !firstItem.model) {
                                          
                                          return (
                                            <div className="flex items-center justify-center h-full">
                                              <div className="text-center">
                                                <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                                                <p className="text-gray-600">Invalid Data Structure</p>
                                                <p className="text-sm text-gray-500 mt-2">
                                                  Data format is not compatible with chart rendering
                                                </p>
                                              </div>
                                            </div>
                                          );
                                        }
                                        
                                        // Debug: Log the actual chart data structure
                                        
                                        
                                        
                                        
                                        // Add error boundary for chart rendering
                                        try {
                                          
                                          return (
                                            <ResponsiveContainer width="100%" height="100%">
                                              <BarChart 
                                                data={chartData}
                                                margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                                              >
                                                <defs>
                                                  <linearGradient id={`barGradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#6366f1" stopOpacity={1}/>
                                                    <stop offset="100%" stopColor="#4338ca" stopOpacity={0.8}/>
                                                  </linearGradient>
                                                  <filter id={`barShadow-${index}`} x="-50%" y="-50%" width="200%" height="200%">
                                                    <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.2" floodColor="#6366f1"/>
                                                  </filter>
                                                </defs>
                                                {showGrid && (
                                                  <CartesianGrid 
                                                    strokeDasharray="3 3" 
                                                    stroke="#94a3b8" 
                                                    strokeOpacity={0.8}
                                                    vertical={false}
                                                  />
                                                )}
                                                {showAxisLabels && (
                                                  <>
                                                    <XAxis 
                                                      dataKey="model" 
                                                      stroke="#64748b"
                                                      fontSize={11}
                                                      fontWeight={500}
                                                      tickLine={false}
                                                      axisLine={false}
                                                      tickMargin={8}
                                                    />
                                                    <YAxis 
                                                      stroke="#64748b"
                                                      fontSize={11}
                                                      fontWeight={500}
                                                      tickLine={false}
                                                      axisLine={false}
                                                      tickMargin={8}
                                                      width={60}
                                                      tickFormatter={(value) => value.toFixed(3)}
                                                      domain={['dataMin - 0.001', 'dataMax + 0.001']}
                                                    />
                                                  </>
                                                )}
                                                <Tooltip 
                                                  contentStyle={{ 
                                                    backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                                                    border: 'none', 
                                                    borderRadius: '12px', 
                                                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                                                    backdropFilter: 'blur(10px)',
                                                    fontSize: '12px',
                                                    fontWeight: 500
                                                  }}
                                                  cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }}
                                                  formatter={(value: any, name: string) => {
                                                    try {
                                                      // Filter out any fiscal year entries with 0 growth rates from tooltip
                                                      if (name && (value === 0 || value === null || value === undefined)) {
                                                        return null; // Don't show in tooltip
                                                      }
                                                      
                                                      // Display value as percentage (value is already in percentage format)
                                                      const percentageValue = value.toFixed(2);
                                                        return [
                                                        `${percentageValue}%`,
                                                          name
                                                        ];
                                                    } catch (error) {
                                                      console.error('🔧 Error in tooltip formatter:', error);
                                                      return [
                                                        `${value.toFixed(2)}%`,
                                                        name
                                                      ];
                                                    }
                                                  }}
                                                  labelFormatter={(label) => `Model: ${label}`}
                                                />
                                                {showLegend && (
                                                  <Legend 
                                                    wrapperStyle={{ 
                                                      fontSize: '12px',
                                                      fontWeight: '600',
                                                      paddingTop: '20px',
                                                      opacity: 0.8
                                                    }}
                                                    iconType="rect"
                                                    onClick={(entry: any) => {
                                                      
                                                      handleGrowthLegendClick(entry, result.combination_id);
                                                    }}
                                                  />
                                                )}
                                                                                                {/* Render bars for each fiscal year as legend */}
                                                {(() => {
                                                  // Get all unique fiscal year identifiers from the data
                                                  const fiscalYearKeys = new Set<string>();
                                                  if (Array.isArray(chartData)) {
                                                    chartData.forEach((item: any) => {
                                                      Object.keys(item).forEach(key => {
                                                        if (key !== 'model' && key.includes('_growth_rate')) {
                                                          fiscalYearKeys.add(key.replace('_growth_rate', ''));
                                                        }
                                                      });
                                                    });
                                                  }
                                                  
                                                  // Sort fiscal years chronologically (same logic as in data transformation)
                                                  const fiscalYears = Array.isArray(Array.from(fiscalYearKeys)) ? Array.from(fiscalYearKeys).sort((a, b) => {
                                                    const yearA = parseInt(a.match(/FY(\d+)/)?.[1] || '0');
                                                    const yearB = parseInt(b.match(/FY(\d+)/)?.[1] || '0');
                                                    if (yearA !== yearB) return yearA - yearB;
                                                    
                                                    const quarterA = a.match(/Q(\d+)/)?.[1] || '0';
                                                    const quarterB = b.match(/Q(\d+)/)?.[1] || '0';
                                                    if (quarterA && quarterB) return parseInt(quarterA) - parseInt(quarterB);
                                                    
                                                    const halfA = a.match(/H(\d+)/)?.[1] || '0';
                                                    const halfB = b.match(/H(\d+)/)?.[1] || '0';
                                                    if (halfA && halfB) return parseInt(halfA) - parseInt(halfB);
                                                    
                                                    return 0;
                                                  }) : [];
                                                  
                                                  
                                                  
                                                  
                                                  // If no fiscal years found, show a message
                                                  if (fiscalYears.length === 0) {
                                                    
                                                    return (
                                                      <div className="flex items-center justify-center h-full">
                                                        <div className="text-center">
                                                          <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                                                          <p className="text-gray-600">No Fiscal Year Data Found</p>
                                                          <p className="text-sm text-gray-500 mt-2">
                                                            Chart data structure is incomplete
                                                          </p>
                                                        </div>
                                                      </div>
                                                    );
                                                  }
                                                  
                                                  // Ensure fiscalYears is an array before mapping
                                                  if (!Array.isArray(fiscalYears)) {
                                                    
                                                    return null;
                                                  }
                                                  
                                                  return fiscalYears.map((fiscalYear, fiscalIndex) => {
                                                    const dataKey = `${fiscalYear}_growth_rate`;
                                                    console.log(`🔧 Looking for dataKey: ${dataKey}`);
                                                    console.log(`🔧 Available keys in first chart item:`, chartData[0] ? Object.keys(chartData[0]) : 'No data');
                                                    
                                                    // Filter out any fiscal year entries with all 0 growth rates from legend
                                                    // Check if all models have 0 growth rate for this fiscal year
                                                    const hasNonZeroLegendValue = chartData.some((item: any) => {
                                                      const value = item[dataKey];
                                                      return value !== 0 && value !== null && value !== undefined;
                                                    });
                                                    if (!hasNonZeroLegendValue) {
                                                      console.log(`🔧 Filtering out fiscal year entry with all 0 growth rates: ${fiscalYear}`);
                                                      return null; // Don't render this legend item
                                                    }
                                                    
                                                    // Use theme colors for fiscal years
                                                    const theme = COLOR_THEMES[selectedTheme as keyof typeof COLOR_THEMES] || COLOR_THEMES.default;
                                                    const fiscalColors = [theme.primary, theme.secondary, theme.tertiary, '#dc2626', '#f59e0b', '#2563eb', '#7c3aed', '#059669', '#ea580c', '#be185d', '#0891b2'];
                                                    const fiscalColor = fiscalColors[fiscalIndex % fiscalColors.length];
                                                    
                                                    // Format fiscal year for display
                                                    let displayName = fiscalYear;
                                                    if (fiscalYear.includes('_')) {
                                                      displayName = fiscalYear.replace(/_/g, ' ');
                                                    }
                                                    
                                                    console.log(`🔧 Rendering bar for fiscal year ${fiscalYear} with dataKey: ${dataKey}`);
                                                    
                                                    // Check if this bar should be visible based on legend selection
                                                    const isVisible = isGrowthBarVisible(dataKey, result.combination_id);
                                                    console.log(`🔧 Bar visibility for ${dataKey}:`, isVisible);
                                                    
                                                    if (!isVisible) {
                                                      return null; // Don't render this bar
                                                    }
                                                    
                                                    // Additional check: Don't render bars for fiscal years with all 0 growth rates
                                                    const hasNonZeroBarValue = chartData.some((item: any) => {
                                                      const value = item[dataKey];
                                                      return value !== 0 && value !== null && value !== undefined;
                                                    });
                                                    if (!hasNonZeroBarValue) {
                                                      console.log(`🔧 Not rendering bar with all 0 growth rates: ${fiscalYear}`);
                                                      return null; // Don't render this bar
                                                    }
                                                    
                                                    return (
                                                      <Bar 
                                                        key={fiscalYear}
                                                        dataKey={dataKey}
                                                        fill={fiscalColor}
                                                        name={displayName}
                                                    radius={[6, 6, 0, 0]}
                                                    filter={`url(#barShadow-${index})`}
                                                    style={{ cursor: 'pointer' }}
                                                                                                                                >
                                                    {showDataLabels && (
                                                      <LabelList
                                                        dataKey={dataKey}
                                                        position="top"
                                                        formatter={(value) => {
                                                          if (value && value !== 0) {
                                                            return `${value.toFixed(2)}%`;
                                                          }
                                                          return '';
                                                        }}
                                                        style={{ fontSize: '10px', fontWeight: '500', fill: '#374151' }}
                                                      />
                                                    )}
                                                  </Bar>
                                                    );
                                                  });
                                                })()}
                                              </BarChart>
                                            </ResponsiveContainer>
                                          );
                                        } catch (error) {
                                          console.error('🔧 Error rendering chart:', error);
                                          return (
                                            <div className="flex items-center justify-center h-full">
                                              <div className="text-center">
                                                <AlertTriangle className="w-12 h-12 mx-auto mb-2 text-red-400" />
                                                <p className="text-sm text-red-500">Chart rendering error</p>
                                                <p className="text-xs text-gray-400">Check console for details</p>
                                              </div>
                                            </div>
                                          );
                                        }
                                      })()}
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-center h-full">
                                      <div className="text-center">
                                        <BarChart3 className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                                        <p className="text-sm text-gray-500">Growth Rates Chart</p>
                                        <p className="text-xs text-gray-400">Select a time period to view data</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Growth Rates Matrix - Takes 40% space (aligned with forecast matrix) */}
                              <div className="col-span-5 pt-8 pb-6 px-6 border border-gray-200 rounded-xl bg-gradient-to-br from-white via-gray-50/30 to-white">
                                <div className="mb-3">
                                  <h6 className="text-base font-medium text-gray-700 mb-2">
                                    Growth Rates Matrix
                                  </h6>
                                </div>
                                <div className="h-72 overflow-y-auto overflow-x-auto border border-gray-200 rounded-lg bg-white shadow-sm">
                                  {isLoadingGrowthRates ? (
                                    <div className="flex items-center justify-center h-64">
                                      <div className="text-center">
                                        <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-60" />
                                        <p className="text-sm font-medium">Loading Matrix Data</p>
                                        <p className="text-xs mt-1 text-gray-500">Please wait while data is being processed</p>
                                      </div>
                                    </div>
                                  ) : growthRatesData && growthRatesData[result.combination_id] ? (
                                    <table className="w-full text-sm border-collapse">
                                      <thead className="sticky top-0 z-10">
                                        <tr className="border-b-2 border-gray-300">
                                          <th className="text-left py-3 px-3 font-semibold text-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 rounded-tl-lg w-auto border-r border-gray-200">
                                            <span>Period</span>
                                          </th>
                                          <th className="text-left py-3 px-3 font-semibold text-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 w-auto border-r border-gray-200">
                                            <span>Model</span>
                                          </th>
                                          <th className="text-center py-3 px-4 font-semibold text-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 border-r border-gray-200 last:border-r-0">
                                            <span>Growth Rate</span>
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(() => {
                                          // Fix: Get the correct data based on the selected period for this specific combination
                                          let matrixData = [];
                                          const combinationData = growthRatesData[result.combination_id];
                                          const currentModels = combinationGrowthModels[result.combination_id] || [];
                                          
                                          if (selectedGrowthPeriod === 'quarterly') {
                                            const quarterlyData = combinationData.data?.quarterly_growth;
                                            matrixData = Array.isArray(quarterlyData) ? quarterlyData : (quarterlyData?.quarterly_growth || []);
                                          } else if (selectedGrowthPeriod === 'halfyearly') {
                                            const halfyearlyData = combinationData.data?.halfyearly_growth;
                                            matrixData = Array.isArray(halfyearlyData) ? halfyearlyData : (halfyearlyData?.halfyearly_growth || []);
                                          } else {
                                            const fiscalData = combinationData.data?.fiscal_growth;
                                            matrixData = Array.isArray(fiscalData) ? fiscalData : (fiscalData?.fiscal_growth || []);
                                          }
                                          
                                          
                                          
                                          
                                          // Ensure matrixData is an array
                                          if (!Array.isArray(matrixData)) {
                                            
                                            matrixData = [];
                                          }
                                          
                                          const filteredMatrixData = matrixData.filter((row: any) => {
                                            
                                            // Filter by model selection
                                            const modelMatches = currentModels.length === 0 || currentModels.includes(row.model);
                                            // Don't filter out rows with 0 growth rates - they are valid (first year has no previous year to compare)
                                            const hasValidGrowthRate = row.growth_rate !== null && row.growth_rate !== undefined;
                                            return modelMatches && hasValidGrowthRate;
                                          });
                                          
                                          // If no data found for selected models, show helpful message
                                          if (filteredMatrixData.length === 0 && currentModels.length > 0) {
                                            const availableModels = [...new Set(matrixData.map((row: any) => row.model))];
                                            return (
                                              <tr>
                                                <td colSpan={3} className="text-center py-8 text-gray-500">
                                                  <div className="flex flex-col items-center">
                                                    <AlertTriangle className="w-8 h-8 mb-2 text-gray-400" />
                                                    <p className="font-medium">No data found for selected model(s)</p>
                                                    <p className="text-sm mt-1">
                                                      Selected: {currentModels.join(', ')}
                                                    </p>
                                                    <p className="text-sm">
                                                      Available: {availableModels.join(', ')}
                                                    </p>
                                                  </div>
                                                </td>
                                              </tr>
                                            );
                                          }
                                          
                                          return filteredMatrixData.map((row: any, index: number) => {
                                              // Define colors for different model types
                                              const getModelColor = (modelName: string) => {
                                                if (modelName.toLowerCase().includes('arima')) return '#3b82f6'; // Blue
                                                if (modelName.toLowerCase().includes('sarima')) return '#8b5cf6'; // Purple
                                                if (modelName.toLowerCase().includes('holt')) return '#10b981'; // Green
                                                if (modelName.toLowerCase().includes('ets')) return '#f59e0b'; // Orange
                                                if (modelName.toLowerCase().includes('prophet')) return '#ef4444'; // Red
                                                return '#6b7280'; // Gray (default)
                                              };
                                              
                                              const modelColor = getModelColor(row.model);
                                              const growthRate = row.growth_rate;
                                              
                                              // Color coding for growth rates
                                              const getGrowthRateColor = (rate: number) => {
                                                if (rate > 0) return 'text-green-600 font-semibold'; // Positive growth
                                                if (rate < 0) return 'text-red-600 font-semibold'; // Negative growth
                                                return 'text-gray-600'; // No change
                                              };
                                              
                                              return (
                                                <tr key={index} className={`border-b border-gray-100 ${
                                                  'hover:bg-gray-50 transition-colors duration-150'
                                                }`}>
                                                  <td className={`py-3 px-3 font-semibold text-gray-800 bg-white w-auto border-r border-gray-200`}>
                                                    <span className="whitespace-nowrap">
                                                      {selectedGrowthPeriod === 'quarterly' ? (row.fiscal_period || `${row.fiscal_year} Q${row.fiscal_quarter}`) : 
                                                       selectedGrowthPeriod === 'halfyearly' ? `${row.fiscal_year} ${row.fiscal_half}` : 
                                                       row.fiscal_year}
                                                    </span>
                                                  </td>
                                                  <td className={`py-3 px-3 font-semibold text-gray-800 bg-white w-auto border-r border-gray-200`}>
                                                    <span className="whitespace-nowrap">
                                                      {row.model}
                                                    </span>
                                                  </td>
                                                  <td className={`text-center py-3 px-3 text-sm font-medium border-r border-gray-200 last:border-r-0 text-gray-700 bg-white`}>
                                                    {growthRate !== null && growthRate !== undefined ? (
                                                      <span className={`${getGrowthRateColor(growthRate)}`}>
                                                        {growthRate > 0 ? '+' : ''}{growthRate.toFixed(2)}%
                                                      </span>
                                                    ) : (
                                                      <span className="text-gray-400">N/A</span>
                                                    )}
                                                  </td>
                                                </tr>
                                              );
                                            });
                                        })()}
                                      </tbody>
                                    </table>
                                  ) : (
                                    <div className="flex items-center justify-center h-64">
                                      <div className="text-center">
                                        <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-60" />
                                        <p className="text-sm font-medium">No Growth Rate Data Available</p>
                                        <p className="text-xs mt-1 text-gray-500">Please run models and calculate growth rates to see data</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* Error Display for Failed Combinations */}
                    {result.status === 'error' && (
                      <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <span className="font-medium text-red-800">Error:</span> 
                        <span className="ml-2 text-red-700">{result.error || 'Unknown error occurred'}</span>
                      </div>
                    )}
                  </div>
                )})}
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                <div className="p-3 bg-gray-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                  <BarChart3 className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500 font-medium text-lg">
                  {localModelResults ? (
                    <>
                      {localModelResults.status === 'completed' ? (
                        <>
                          Training completed successfully!<br/>
                          <span className="text-sm text-gray-400 mt-2 block">
                            Results: {localModelResults.results ? 
                              (Array.isArray(localModelResults.results) ? 
                                `${localModelResults.results.length} combination(s)` : 
                                'Invalid results format'
                              ) : 
                              'No results array found'
                            }
                          </span>
                          <span className="text-xs text-gray-400 mt-1 block">
                            Message: {localModelResults.message || 'No message'}
                          </span>
                        </>
                      ) : (
                        `Training status: ${localModelResults.status || 'Unknown'}`
                      )}
                    </>
                  ) : (
                    'No combination results available'
                  )}
                </p>
                {localModelResults && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-left">
                    <p className="text-xs font-medium text-blue-800 mb-2">Debug Info:</p>
                    <pre className="text-xs text-blue-700 overflow-auto max-h-32">
                      {JSON.stringify(localModelResults, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Combination Save Status Section - Compact Design */}
      {localModelResults && (
        <Card className="mb-4">
          <div className="py-1.5 px-3 border-b bg-orange-50/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-orange-800 flex items-center gap-1.5">
                  <Save className="w-3.5 h-3.5 text-orange-600" />
                  Combination Save Status
                </h3>
                {combinationSaveStatus && !combinationSaveStatusMinimized && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-green-600 font-medium">
                      {combinationSaveStatus.saved_count} saved
                    </span>
                    <span className="text-orange-600 font-medium">
                      {combinationSaveStatus.pending_count} pending
                    </span>
                  </div>
                )}
                {(() => {  return null; })()}
                {combinationSaveStatus && combinationSaveStatusMinimized && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Badge variant="secondary" className="bg-green-200 text-green-800 text-xs px-1.5 py-0.5">
                      {combinationSaveStatus.saved_count} saved
                    </Badge>
                    <Badge variant="secondary" className="bg-orange-200 text-orange-800 text-xs px-1.5 py-0.5">
                      {combinationSaveStatus.pending_count} pending
                    </Badge>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchCombinationSaveStatus}
                  disabled={isLoadingCombinationSaveStatus}
                  className="text-xs h-6 px-2"
                >
                  {isLoadingCombinationSaveStatus ? 'Loading...' : 'Refresh'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCombinationSaveStatusMinimized(!combinationSaveStatusMinimized)}
                  className="text-xs p-0.5 h-5 w-5"
                >
                  {combinationSaveStatusMinimized ? (
                    <ChevronDown className="h-2.5 w-2.5" />
                  ) : (
                    <ChevronDown className="h-2.5 w-2.5 rotate-180" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          
          {!combinationSaveStatusMinimized && (
            <div className="p-3">
              {isLoadingCombinationSaveStatus ? (
                <div className="text-center py-2">
                  <p className="text-xs text-orange-600">Loading combination save status...</p>
                </div>
              ) : combinationSaveStatus ? (
                <div className="space-y-2.5">
                  {/* Progress Bar */}
                  <div className="w-full bg-orange-100 rounded-full h-1.5">
                    <div 
                      className="bg-orange-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${combinationSaveStatus.completion_percentage}%` }}
                    ></div>
                  </div>
                  
                  {/* Combination Count Summary */}
                  <div className="text-center">
                    <div className="text-sm font-medium text-orange-600">
                      {combinationSaveStatus.saved_count} of {combinationSaveStatus.total_combinations} combinations saved
                    </div>
                  </div>
                  
                  {/* Detailed Lists */}
                  {combinationSaveStatus.saved_combinations && combinationSaveStatus.saved_combinations.length > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-md p-2.5">
                      <div className="text-xs font-medium text-green-800 mb-1.5">Saved Combinations:</div>
                      <div className="flex flex-wrap gap-1">
                        {combinationSaveStatus.saved_combinations.slice(0, 8).map((combo: string, index: number) => (
                          <Badge key={index} variant="secondary" className="text-xs bg-green-200 text-green-800 px-1.5 py-0.5">
                            {combo}
                          </Badge>
                        ))}
                        {combinationSaveStatus.saved_combinations.length > 8 && (
                          <Badge variant="secondary" className="text-xs bg-green-200 text-green-800 px-1.5 py-0.5">
                            +{combinationSaveStatus.saved_combinations.length - 8} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {combinationSaveStatus.pending_combinations && combinationSaveStatus.pending_combinations.length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-md p-2.5">
                      <div className="text-xs font-medium text-orange-800 mb-1.5">Pending Combinations:</div>
                      <div className="flex flex-wrap gap-1">
                        {combinationSaveStatus.pending_combinations.slice(0, 8).map((combo: string, index: number) => (
                          <Badge key={index} variant="secondary" className="text-xs bg-orange-200 text-orange-800 px-1.5 py-0.5">
                            {combo}
                          </Badge>
                        ))}
                        {combinationSaveStatus.pending_combinations.length > 8 && (
                          <Badge variant="secondary" className="text-xs bg-orange-200 text-orange-800 px-1.5 py-0.5">
                            +{combinationSaveStatus.pending_combinations.length - 8} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {combinationSaveStatus.note && (
                    <div className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-md p-1.5">
                      Note: {combinationSaveStatus.note}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-2">
                  <p className="text-xs text-orange-600">
                    No combination save status available. Run models and save results to see progress.
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Error Display */}
      {finalData?.trainingStatus === 'error' && finalData?.lastError && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h4 className="text-lg font-semibold text-red-800 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Training Error
          </h4>
          <p className="text-red-700">{finalData.lastError}</p>
        </div>
      )}

      {/* Fullscreen Chart Modal */}
      <Dialog open={!!fullscreenChart} onOpenChange={(open) => {
        
        // Only close the modal if it's explicitly being closed (not when context menu is open)
        if (!open && !showContextMenu && !showColorSubmenu) {
          
          setFullscreenChart(null);
        } else if (!open) {
          
        }
      }}>
        <DialogContent 
          className="max-w-6xl h-[80vh] p-6 [&>button]:hidden"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {fullscreenChart?.type === 'forecast' ? (
                  <TrendingUp className="w-5 h-5" />
                ) : (
                  <BarChart3 className="w-5 h-5" />
                )}
                {fullscreenChart?.title}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFullscreenChart(null)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {fullscreenChart && (() => {
              // Use the stored result data directly (like Chart Maker does)
              const result = fullscreenChart.result;
              
              console.log('🔧 Fullscreen chart debug:', {
                fullscreenChart,
                hasResult: !!result,
                resultCombinationId: result?.combination_id,
                searchCombinationId: fullscreenChart.combinationId
              });
              
              if (!result) {
                return (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                      <p className="text-gray-600">Chart data not found</p>
                      <p className="text-sm text-gray-500 mt-2">
                        No result data available for this chart
                      </p>
                    </div>
                  </div>
                );
              }

              if (fullscreenChart.type === 'forecast') {
                // Render fullscreen forecast chart
                try {
                  // Validate that we have the necessary data
                  if (!result.result?.models_run || result.result.models_run.length === 0) {
                    return (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                          <p className="text-gray-600">No models available</p>
                          <p className="text-sm text-gray-500 mt-2">
                            Please ensure models have been trained successfully
                          </p>
                        </div>
                      </div>
                    );
                  }

                  const chartData = generateRealForecastData(result, parseInt(forecastHorizon));
                  const models = result.result?.models_run || [];
                  
                  console.log('🔧 Fullscreen forecast chart data:', {
                    chartDataLength: chartData?.length,
                    models: models,
                    result: result
                  });
                  
                  if (!chartData || chartData.length === 0) {
                    return (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                          <p className="text-gray-600">No forecast data available</p>
                          <p className="text-sm text-gray-500 mt-2">
                            Please ensure models have been trained successfully
                          </p>
                        </div>
                      </div>
                    );
                  }
                
                return (
                  <div className="h-full">
                    <ResponsiveContainer width="100%" height="100%" >
                      <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <defs>
                          <linearGradient id="lineGradient-actual-fullscreen" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.8}/>
                            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.1}/>
                          </linearGradient>
                          <filter id="lineShadow-fullscreen" x="-50%" y="-50%" width="200%" height="200%">
                            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" floodColor="#6366f1"/>
                          </filter>
                        </defs>
                        
                        {/* Dark grey background for forecasted data region - positioned before grid */}
                        {(() => {
                          // Find the last point where actual values exist
                          const lastActualIndex = chartData.findIndex((point: any, idx: number) => {
                            // Check if this point has actual value and the next point doesn't
                            const hasActual = point.actual !== null && point.actual !== undefined;
                            const nextPoint = chartData[idx + 1];
                            const nextHasActual = nextPoint && (nextPoint.actual !== null && nextPoint.actual !== undefined);
                            
                            return hasActual && !nextHasActual;
                          });
                          
                          if (lastActualIndex !== -1 && lastActualIndex < chartData.length - 1) {
                            const separationPoint = chartData[lastActualIndex];
                            const lastPoint = chartData[chartData.length - 1];
                            
                            return (
                              <ReferenceArea
                                x1={separationPoint.date}
                                x2={lastPoint.date}
                                fill="#6b7280"
                                fillOpacity={0.2}
                              />
                            );
                          }
                          return null;
                        })()}
                        
                        <CartesianGrid 
                          strokeDasharray="3 3" 
                          stroke="#94a3b8" 
                          strokeOpacity={0.8}
                          vertical={false}
                        />
                        
                        {/* Vertical line to separate historical and forecasted data - positioned after grid */}
                        {(() => {
                          // Find the last point where actual values exist
                          const lastActualIndex = chartData.findIndex((point: any, idx: number) => {
                            // Check if this point has actual value and the next point doesn't
                            const hasActual = point.actual !== null && point.actual !== undefined;
                            const nextPoint = chartData[idx + 1];
                            const nextHasActual = nextPoint && (nextPoint.actual !== null && nextPoint.actual !== undefined);
                            
                            return hasActual && !nextHasActual;
                          });
                          
                          if (lastActualIndex !== -1 && lastActualIndex < chartData.length - 1) {
                            const separationPoint = chartData[lastActualIndex];
                            
                            return (
                              <ReferenceLine
                                x={separationPoint.date}
                                stroke="#ef4444"
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                label={{
                                  value: "Forecast",
                                  position: "top",
                                  fill: "#ef4444",
                                  fontSize: 10,
                                  fontWeight: 600
                                }}
                              />
                            );
                          }
                          return null;
                        })()}
                        <XAxis 
                          dataKey="date" 
                          stroke="#64748b"
                          fontSize={11}
                          fontWeight={500}
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                          tickFormatter={(value) => {
                            if (typeof value === 'string') {
                              const date = new Date(value);
                              return date.toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric',
                                year: '2-digit'
                              });
                            }
                            return value;
                          }}
                        />
                        <YAxis 
                          stroke="#64748b"
                          fontSize={11}
                          fontWeight={500}
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                          width={60}
                          tickFormatter={(value) => {
                            if (typeof value === 'number') {
                              return value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value.toString();
                            }
                            return value;
                          }}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                            border: 'none', 
                            borderRadius: '12px', 
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                            backdropFilter: 'blur(10px)',
                            fontSize: '12px',
                            fontWeight: 500
                          }}
                          cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeOpacity: 0.4 }}
                          labelFormatter={(value) => {
                            if (typeof value === 'string') {
                              const date = new Date(value);
                              return date.toLocaleDateString('en-US', { 
                                weekday: 'long',
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric'
                              });
                            }
                            return value;
                          }}
                          formatter={(value: any, name: string) => [
                            typeof value === 'number' ? value.toLocaleString() : value,
                            name
                          ]}
                        />
                                                 <Legend 
                           wrapperStyle={{ 
                             fontSize: '12px',
                             fontWeight: '600',
                             paddingTop: '20px',
                             opacity: 0.8
                           }}
                           iconType="line"
                           onClick={(entry) => {
                             
                             
                             // For fullscreen charts, we'll use a default index since we don't have the combination index
                             handleLegendClick(entry, 0);
                           }}
                           className="interactive-legend"
                         />
                        
                        {/* Actual Values - Solid Line */}
                        {isLineVisible('actual', 0) && (
                          <Line 
                            type="monotone" 
                            dataKey="actual" 
                            stroke="#dc2626" 
                            strokeWidth={3}
                            fill={`url(#lineGradient-actual-fullscreen)`}
                            dot={{ 
                              fill: '#dc2626', 
                              strokeWidth: 0, 
                              r: 0
                            }}
                            activeDot={{ 
                              r: 8, 
                              fill: '#dc2626', 
                              stroke: 'white', 
                              strokeWidth: 3,
                              filter: `url(#lineShadow-fullscreen)`,
                              style: { cursor: 'pointer' }
                            }}
                            filter={`url(#lineShadow-fullscreen)`}
                            name="Actual Values"
                          />
                        )}
                        
                        {/* Model Forecasts - Dotted Lines */}
                        {models.map((model: string, modelIndex: number) => {
                          const modelKey = model.toLowerCase();
                          // Unique colors for each model: Red, Orange, Blue, Purple, Green, Orange-Red
                          const modelColors = ['#dc2626', '#f59e0b', '#2563eb', '#7c3aed', '#059669', '#ea580c'];
                          const modelColor = modelColors[modelIndex % modelColors.length];
                          
                          if (!isLineVisible(modelKey, 0)) {
                            return null;
                          }
                          
                          return (
                            <Line 
                              key={modelKey}
                              type="monotone" 
                              dataKey={modelKey} 
                              stroke={modelColor} 
                              strokeWidth={3}
                              strokeDasharray="5 5"
                              dot={{ 
                                fill: modelColor, 
                                strokeWidth: 0, 
                                r: 0
                              }}
                              activeDot={{ 
                                r: 8, 
                                fill: modelColor, 
                                stroke: 'white', 
                                strokeWidth: 3,
                                style: { cursor: 'pointer' }
                              }}
                              name={model}
                            />
                          );
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                );
                } catch (error) {
                  console.error('🔧 Error rendering fullscreen forecast chart:', error);
                  return (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-red-400" />
                        <p className="text-red-600">Error rendering forecast chart</p>
                        <p className="text-sm text-red-500 mt-2">
                          {error instanceof Error ? error.message : 'Unknown error occurred'}
                        </p>
                      </div>
                    </div>
                  );
                }
              } else {
                // Render fullscreen growth rates chart
                const combinationData = growthRatesData[fullscreenChart.combinationId];
                const currentModels = combinationGrowthModels[fullscreenChart.combinationId] || [];
                
                if (!combinationData) {
                  return (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <p className="text-gray-600">Growth rates data not available</p>
                      </div>
                    </div>
                  );
                }

                const chartData = (() => {
                  let rawData = [];
                  
                  if (selectedGrowthPeriod === 'quarterly') {
                    // Handle nested structure: {quarterly_growth: Array(30)}
                    const quarterlyData = combinationData.data?.quarterly_growth;
                    if (quarterlyData && typeof quarterlyData === 'object' && quarterlyData.quarterly_growth) {
                      rawData = quarterlyData.quarterly_growth;
                    } else if (Array.isArray(quarterlyData)) {
                      rawData = quarterlyData;
                    } else {
                      rawData = [];
                    }
                  } else if (selectedGrowthPeriod === 'halfyearly') {
                    rawData = combinationData.data?.halfyearly_growth || [];
                  } else {
                    rawData = combinationData.data?.fiscal_growth || [];
                  }
                  
                  const filteredData = rawData.filter((row: any) => {
                    return currentModels.length === 0 || currentModels.includes(row.model);
                  });
                  
                  // First, collect all unique fiscal year identifiers to ensure we have all periods
                  const allFiscalYears = new Set<string>();
                  filteredData.forEach((row: any) => {
                    let fiscalYearId;
                    if (selectedGrowthPeriod === 'quarterly') {
                      fiscalYearId = row.fiscal_period || `${row.fiscal_year} Q${row.fiscal_quarter}`;
                    } else if (selectedGrowthPeriod === 'halfyearly') {
                      fiscalYearId = `${row.fiscal_year} ${row.fiscal_half}`;
                    } else {
                      fiscalYearId = row.fiscal_year;
                    }
                    allFiscalYears.add(fiscalYearId);
                  });
                  
                  // Sort fiscal years chronologically
                  const sortedFiscalYears = Array.from(allFiscalYears).sort((a, b) => {
                    const yearA = parseInt(a.match(/FY(\d+)/)?.[1] || '0');
                    const yearB = parseInt(b.match(/FY(\d+)/)?.[1] || '0');
                    if (yearA !== yearB) return yearA - yearB;
                    
                    const quarterA = a.match(/Q(\d+)/)?.[1] || '0';
                    const quarterB = b.match(/Q(\d+)/)?.[1] || '0';
                    if (quarterA && quarterB) return parseInt(quarterA) - parseInt(quarterB);
                    
                    const halfA = a.match(/H(\d+)/)?.[1] || '0';
                    const halfB = b.match(/H(\d+)/)?.[1] || '0';
                    if (halfA && halfB) return parseInt(halfA) - parseInt(halfB);
                    
                    return 0;
                  });
                  
                  
                  
                  // Group by model and create chart data with fiscal years as legends
                  let groupedData: { [key: string]: any } = {};
                  
                  filteredData.forEach((row: any) => {
                    const model = row.model;
                    
                    if (!groupedData[model]) {
                      groupedData[model] = { model };
                      // Initialize all fiscal year keys with 0
                      sortedFiscalYears.forEach(fiscalYear => {
                        const dataKey = `${fiscalYear.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}_growth_rate`;
                        groupedData[model][dataKey] = 0;
                      });
                    }
                    
                    // Handle null values - use 0 instead of null for chart rendering
                    const growthRate = row.growth_rate === null || row.growth_rate === undefined ? 0 : row.growth_rate;
                    
                    // Create fiscal year identifier for legend
                    let fiscalYearId;
                    if (selectedGrowthPeriod === 'quarterly') {
                      fiscalYearId = row.fiscal_period || `${row.fiscal_year} Q${row.fiscal_quarter}`;
                    } else if (selectedGrowthPeriod === 'halfyearly') {
                      fiscalYearId = `${row.fiscal_year} ${row.fiscal_half}`;
                    } else {
                      fiscalYearId = row.fiscal_year;
                    }
                    
                    // Store decimal growth rate (percentage divided by 100) for bar height
                    const dataKey = `${fiscalYearId.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}_growth_rate`;
                    
                    groupedData[model][dataKey] = growthRate / 100; // Convert to decimal
                  });
                  
                  // Calculate ensemble (weighted average) for the fullscreen chart
                  const ensembleData: { [key: string]: any } = { model: 'Ensemble' };
                  
                  // Initialize ensemble with all fiscal year keys set to 0
                  sortedFiscalYears.forEach(fiscalYear => {
                    const dataKey = `${fiscalYear.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}_growth_rate`;
                    ensembleData[dataKey] = 0;
                  });
                  
                  // Calculate ensemble values (average across all models for each fiscal year)
                  Object.keys(groupedData).forEach(model => {
                    sortedFiscalYears.forEach(fiscalYear => {
                      const dataKey = `${fiscalYear.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}_growth_rate`;
                      ensembleData[dataKey] += groupedData[model][dataKey];
                    });
                  });
                  
                  // Calculate final ensemble values
                  const modelCount = Object.keys(groupedData).length;
                  if (modelCount > 0) {
                    sortedFiscalYears.forEach(fiscalYear => {
                      const dataKey = `${fiscalYear.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}_growth_rate`;
                      ensembleData[dataKey] = ensembleData[dataKey] / modelCount;
                    });
                    console.log(`🔧 Fullscreen chart - Ensemble data calculated for ${modelCount} models`);
                  }
                  
                  // Add ensemble as a separate model at the front
                  const finalGroupedData: { [key: string]: any } = {};
                  finalGroupedData['Ensemble'] = ensembleData;
                  
                  // Add all other models after ensemble
                  Object.keys(groupedData).forEach(model => {
                    if (model !== 'Ensemble') {
                      finalGroupedData[model] = groupedData[model];
                    }
                  });
                  
                  // Replace the original groupedData with the reordered version
                  groupedData = finalGroupedData;
                  
                  return Object.values(groupedData);
                })();

                return (
                  <div className="h-full" data-chart-area="true" data-chart-type="bar">
                    <ResponsiveContainer width="100%" height="100%" >
                      <BarChart 
                        data={chartData}
                        margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                      >
                        <defs>
                          <linearGradient id="barGradient-fullscreen" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity={1}/>
                            <stop offset="100%" stopColor="#4338ca" stopOpacity={0.8}/>
                          </linearGradient>
                          <filter id="barShadow-fullscreen" x="-50%" y="-50%" width="200%" height="200%">
                            <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.2" floodColor="#6366f1"/>
                          </filter>
                        </defs>
                        {showGrid && (
                          <CartesianGrid 
                            strokeDasharray="3 3" 
                            stroke="#94a3b8" 
                            strokeOpacity={0.8}
                            vertical={false}
                          />
                        )}
                        {showAxisLabels && (
                          <>
                            <XAxis 
                              dataKey="model" 
                              stroke="#64748b"
                              fontSize={11}
                              fontWeight={500}
                              tickLine={false}
                              axisLine={false}
                              tickMargin={8}
                            />
                            <YAxis 
                              stroke="#64748b"
                              fontSize={11}
                              fontWeight={500}
                              tickLine={false}
                              axisLine={false}
                              tickMargin={8}
                              width={60}
                              tickFormatter={(value) => value.toFixed(3)}
                              domain={['dataMin - 0.001', 'dataMax + 0.001']}
                            />
                          </>
                        )}
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                            border: 'none', 
                            borderRadius: '12px', 
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                            backdropFilter: 'blur(10px)',
                            fontSize: '12px',
                            fontWeight: 500
                          }}
                          cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }}
                          formatter={(value: any, name: string) => {
                            try {
                              // Filter out any fiscal year entries with 0 growth rates from tooltip
                              if (name && (value === 0 || value === null || value === undefined)) {
                                return null; // Don't show in tooltip
                              }
                              
                              // Display value as percentage (value is already in percentage format)
                              const percentageValue = value.toFixed(2);
                              return [
                                `${percentageValue}%`,
                                name
                              ];
                            } catch (error) {
                              console.error('🔧 Error in fullscreen tooltip formatter:', error);
                              return [
                            `${value.toFixed(2)}%`,
                            name
                              ];
                            }
                          }}
                          labelFormatter={(label) => `Model: ${label}`}
                        />
                        {showLegend && (
                          <Legend 
                            wrapperStyle={{ 
                              fontSize: '12px',
                              fontWeight: '600',
                              paddingTop: '20px',
                              opacity: 0.8
                            }}
                            iconType="rect"
                            onClick={(entry: any) => {
                              
                              if (fullscreenChart?.combinationId) {
                                handleGrowthLegendClick(entry, fullscreenChart.combinationId);
                              }
                            }}
                          />
                        )}
                        {/* Render Ensemble bar first (weighted average) */}
                        <Bar 
                          dataKey="ensemble_growth_rate"
                          fill={COLOR_THEMES[selectedTheme as keyof typeof COLOR_THEMES]?.primary || "#1f2937"}
                          name="Ensemble"
                                radius={[6, 6, 0, 0]}
                                filter={`url(#barShadow-fullscreen)`}
                                style={{ cursor: 'pointer' }}
                                                    >
                            {showDataLabels && (
                              <LabelList
                                dataKey="ensemble_growth_rate"
                                position="top"
                                formatter={(value) => {
                                  if (value && value !== 0) {
                                    return `${value.toFixed(2)}%`;
                                  }
                                  return '';
                                }}
                                style={{ fontSize: '10px', fontWeight: '600', fill: '#1f2937' }}
                              />
                            )}
                          </Bar>
                        
                        {/* Render bars for each fiscal year as legend */}
                        {(() => {
                          // Get all unique fiscal year identifiers from the data
                          const fiscalYearKeys = new Set<string>();
                          chartData.forEach((item: any) => {
                            Object.keys(item).forEach(key => {
                              if (key !== 'model' && key !== 'ensemble_growth_rate' && key.includes('_growth_rate')) {
                                fiscalYearKeys.add(key.replace('_growth_rate', ''));
                              }
                            });
                          });
                          
                          // Sort fiscal years chronologically (same logic as in data transformation)
                          const fiscalYears = Array.from(fiscalYearKeys).sort((a, b) => {
                            const yearA = parseInt(a.match(/FY(\d+)/)?.[1] || '0');
                            const yearB = parseInt(b.match(/FY(\d+)/)?.[1] || '0');
                            if (yearA !== yearB) return yearA - yearB;
                            
                            const quarterA = a.match(/Q(\d+)/)?.[1] || '0';
                            const quarterB = b.match(/Q(\d+)/)?.[1] || '0';
                            if (quarterA && quarterB) return parseInt(quarterA) - parseInt(quarterB);
                            
                            const halfA = a.match(/H(\d+)/)?.[1] || '0';
                            const halfB = b.match(/H(\d+)/)?.[1] || '0';
                            if (halfA && halfB) return parseInt(halfA) - parseInt(halfB);
                            
                            return 0;
                          });
                          
                          
                          
                          return fiscalYears.map((fiscalYear, fiscalIndex) => {
                            const dataKey = `${fiscalYear}_growth_rate`;
                            
                            // Filter out any fiscal year entries with all 0 growth rates from legend
                            // Check if all models have 0 growth rate for this fiscal year
                            const hasNonZeroFullscreenValue = chartData.some((item: any) => {
                              const value = item[dataKey];
                              return value !== 0 && value !== null && value !== undefined;
                            });
                            if (!hasNonZeroFullscreenValue) {
                              console.log(`🔧 Fullscreen chart - Filtering out fiscal year entry with all 0 growth rates: ${fiscalYear}`);
                              return null; // Don't render this legend item
                            }
                            
                            // Use theme colors for fiscal years
                            const theme = COLOR_THEMES[selectedTheme as keyof typeof COLOR_THEMES] || COLOR_THEMES.default;
                            const fiscalColors = [theme.primary, theme.secondary, theme.tertiary, '#dc2626', '#f59e0b', '#2563eb', '#7c3aed', '#059669', '#ea580c', '#be185d', '#0891b2'];
                            const fiscalColor = fiscalColors[fiscalIndex % fiscalColors.length];
                            
                            // Format fiscal year for display
                            let displayName = fiscalYear;
                            if (fiscalYear.includes('_')) {
                              displayName = fiscalYear.replace(/_/g, ' ');
                            }
                            
                            console.log(`🔧 Fullscreen chart - Rendering bar for fiscal year ${fiscalYear} with dataKey: ${dataKey}`);
                            
                            // Check if this bar should be visible based on legend selection
                            const isVisible = isGrowthBarVisible(dataKey, fullscreenChart.combinationId);
                            console.log(`🔧 Fullscreen bar visibility for ${dataKey}:`, isVisible);
                            
                            if (!isVisible) {
                              return null; // Don't render this bar
                            }
                            
                            return (
                              <Bar 
                                key={fiscalYear}
                                dataKey={dataKey}
                                fill={fiscalColor}
                                name={displayName}
                            radius={[6, 6, 0, 0]}
                            filter={`url(#barShadow-fullscreen)`}
                            style={{ cursor: 'pointer' }}
                                                    >
                            {showDataLabels && (
                              <LabelList
                                dataKey={dataKey}
                                position="top"
                                formatter={(value) => {
                                  if (value && value !== 0) {
                                    return `${value.toFixed(2)}%`;
                                  }
                                  return '';
                                }}
                                style={{ fontSize: '10px', fontWeight: '500', fill: '#374151' }}
                              />
                            )}
                          </Bar>
                            );
                          });
                        })()}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              }
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Context Menu Components */}
      <ContextMenu />
      <ColorThemeSubmenu />
    </div>
  );
};

export default AutoRegressiveModelsCanvas;
