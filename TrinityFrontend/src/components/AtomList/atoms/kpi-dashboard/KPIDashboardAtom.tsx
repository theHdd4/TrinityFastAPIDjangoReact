import React, { useEffect } from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import KPIDashboardCanvas from './components/KPIDashboardCanvas';
import KPIDashboardProperties from './components/KPIDashboardProperties';
import { KPI_DASHBOARD_API } from '@/lib/api';
import { getActiveProjectContext } from '@/utils/projectEnv';

export interface KPIMetric {
  id: string;
  label: string;
  value: string | number;
  change?: number;
  unit?: string;
  subtitle?: string;
}

export interface KPIDashboardData {
  headers: string[];
  rows: any[];
  fileName: string;
  metrics: KPIMetric[];
}

export interface LayoutBox {
  id: string;
  elementType?: 'text-box' | 'metric-card' | 'insight-panel' | 'qa' | 'caption' | 'interactive-blocks' | 'chart' | 'table' | 'image';
  width?: number;
}

export interface Layout {
  id: string;
  type: '4-box' | '3-box' | '2-box' | '1-box';
  boxes: LayoutBox[];
  height?: number;
}

export interface KPIDashboardSettings {
  title: string;
  metricColumns: string[];
  changeColumns: string[];
  insights: string;
  layouts?: Layout[]; // Store layouts in settings
  selectedBoxId?: string; // ID of the currently selected box for per-element settings
  selectedBoxIds?: string[]; // IDs of multiple selected boxes for multi-selection
  globalFilters?: Record<string, {
    values: string[];
  }>; // Global filters automatically apply to all elements
  previousLocalFilters?: Record<string, Record<string, any>>; // Store previous local filters for restoration
  enabledGlobalFilterIdentifiers?: string[]; // User-selected identifiers to show in Global Filters section
  editInteractionsMode?: boolean; // Toggle for Edit Interactions mode
  elementInteractions?: Record<string, 'apply' | 'not-apply' | 'ignore'>; // Interaction settings per element (boxId -> interaction type)
}

interface KPIDashboardAtomProps {
  atomId: string;
}

const KPIDashboardAtom: React.FC<KPIDashboardAtomProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  
  // Get settings with proper fallback
  const settings: KPIDashboardSettings = React.useMemo(() => {
    return (atom?.settings as KPIDashboardSettings) || {
      title: 'KPI Dashboard',
      metricColumns: [],
      changeColumns: [],
      insights: '',
      layouts: [],
      globalFilters: {} as Record<string, { values: string[] }>,
      previousLocalFilters: {} as Record<string, Record<string, any>>,
      editInteractionsMode: false,
      elementInteractions: {} as Record<string, 'apply' | 'not-apply' | 'ignore'>
    };
  }, [atom?.settings]);
  
  // Load saved layouts from MongoDB on mount with priority loading
  useEffect(() => {
    let isMounted = true; // Prevent state updates after unmount
    
    const loadWithPriority = async () => {
      try {
        const projectContext = getActiveProjectContext();
        if (!projectContext || !isMounted) {
          return;
        }
        
        console.log('🔍 Loading KPI Dashboard configuration from MongoDB...', { atomId });
        
        // PRIORITY 1: Try atom_list_configuration (most recent auto-saves) with atom_id
        const response = await fetch(
          `${KPI_DASHBOARD_API}/get-config?` +
          `client_name=${encodeURIComponent(projectContext.client_name)}&` +
          `app_name=${encodeURIComponent(projectContext.app_name)}&` +
          `project_name=${encodeURIComponent(projectContext.project_name)}&` +
          `atom_id=${encodeURIComponent(atomId)}`,
          { credentials: 'include' }
        );
        
        if (response.ok) {
          const result = await response.json();
          
          if (result.success && result.data) {
            const hasLayouts = result.data.layouts && result.data.layouts.length > 0;
            
            if (hasLayouts) {
              console.log('✅ Loaded from atom_list_configuration (auto-saved data):', result.data.layouts.length, 'layouts');
              
              if (isMounted) {
                // ✅ FIX: Build fresh settings object without spreading stale closure
                updateSettings(atomId, {
                  layouts: result.data.layouts,
                  title: result.data.title || 'KPI Dashboard',
                  metricColumns: result.data.metricColumns || [],
                  changeColumns: result.data.changeColumns || [],
                  insights: result.data.insights || '',
                  editInteractionsMode: result.data.editInteractionsMode || false,
                  elementInteractions: result.data.elementInteractions || {},
                });
              }
              return; // Done - use this data
            } else {
              console.log('ℹ️ No layouts in atom_list_configuration, using laboratory store data');
            }
          } else {
            console.log('ℹ️ No data in atom_list_configuration, using laboratory store data');
          }
        }
        
        // PRIORITY 2: Fallback to laboratory store (manual saves)
        // Laboratory store data is already loaded into settings via parent component
        console.log('ℹ️ Using laboratory store settings (if any)');
        
      } catch (error) {
        console.error('❌ Error loading KPI Dashboard configuration:', error);
      }
    };
    
    loadWithPriority();
    
    return () => {
      isMounted = false; // Cleanup to prevent state updates after unmount
    };
  }, [atomId]); // Only re-run if atomId changes

  // Get data from atom metadata or settings
  // If no data, KPIDashboardCanvas will use its built-in mockData
  const data: KPIDashboardData | null = React.useMemo(() => {
    // First check settings.data (where we store uploaded data)
    if ((atom?.settings as any)?.data) {
      return (atom.settings as any).data as KPIDashboardData;
    }
    // Then check metadata
    if (atom?.metadata && typeof atom.metadata === 'object') {
      const metadata = atom.metadata as any;
      if (metadata.data) {
        return metadata.data as KPIDashboardData;
      }
    }
    // Return null - KPIDashboardCanvas will use mockData by default
    return null;
  }, [atom?.metadata, atom?.settings]);

  const handleDataUpload = (uploadedData: KPIDashboardData) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c16dc138-1b27-4dba-8d9b-764693f664f3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'KPIDashboardAtom.tsx:156',message:'handleDataUpload entry',data:{atomId,updateSettingsType:typeof updateSettings,updateSettingsIsFunc:typeof updateSettings==='function',uploadedDataType:typeof uploadedData,hasHeaders:!!uploadedData.headers,headersIsArray:Array.isArray(uploadedData.headers),hasRows:!!uploadedData.rows,rowsIsArray:Array.isArray(uploadedData.rows),fileName:uploadedData.fileName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c16dc138-1b27-4dba-8d9b-764693f664f3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'KPIDashboardAtom.tsx:160',message:'Before updateSettings call',data:{settingsKeys:Object.keys(settings)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    updateSettings(atomId, {
      ...settings,
      data: uploadedData
    });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c16dc138-1b27-4dba-8d9b-764693f664f3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'KPIDashboardAtom.tsx:164',message:'After updateSettings call',data:{success:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
  };

  const handleSettingsChange = (newSettings: Partial<KPIDashboardSettings>) => {
    updateSettings(atomId, {
      ...settings,
      ...newSettings
    });
  };

  // Always render the canvas - it will use mockData when data is null
  // Ensure it has proper dimensions and can render even if atom is not found yet
  return (
    <div className="w-full h-full min-h-[600px] bg-background relative">
      <KPIDashboardCanvas
        atomId={atomId}
        data={data}
        settings={settings}
        onDataUpload={handleDataUpload}
        onSettingsChange={handleSettingsChange}
      />
    </div>
  );
};

export default KPIDashboardAtom;
export { KPIDashboardProperties };

