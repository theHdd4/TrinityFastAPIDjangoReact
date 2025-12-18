/**
 * Hook for fetching data summary with metadata support
 * Uses CARDINALITY_VIEW_API (unified API for all atoms)
 */
import { useState, useEffect, useCallback } from 'react';
import { CARDINALITY_VIEW_API } from '@/lib/api';
import { getProjectContext } from '@/utils/projectContext';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { ColumnInfo } from './types';

interface UseDataSummaryOptions {
  includeMetadata?: boolean;
}

interface UseDataSummaryResult {
  data: ColumnInfo[];
  loading: boolean;
  error: string | null;
  metadataAvailable: boolean;
  refetch: () => void;
}

export const useDataSummary = (
  objectName: string,
  options: UseDataSummaryOptions = {}
): UseDataSummaryResult => {
  const {
    includeMetadata = true,
  } = options;

  const [data, setData] = useState<ColumnInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadataAvailable, setMetadataAvailable] = useState(false);

  const fetchData = useCallback(async () => {
    if (!objectName) return;

    setLoading(true);
    setError(null);

    try {
      // Get project context for metadata retrieval (same as table atom)
      const projectContext = getProjectContext();
      
      // Construct full path if needed (same as table atom)
      let fullDataSource = objectName;
      
      // If we have project context and objectName is just a filename, construct full path
      if (projectContext && objectName && !objectName.includes('/')) {
        const { client_name, app_name, project_name } = projectContext;
        if (client_name && app_name && project_name) {
          fullDataSource = `${client_name}/${app_name}/${project_name}/${objectName}`;
        }
      }
      
      // Build URL parameters (same as table atom)
      const params = new URLSearchParams({
        object_name: fullDataSource
      });
      
      // Add project context parameters for metadata retrieval (same as table atom)
      if (projectContext) {
        const { client_name, app_name, project_name } = projectContext;
        if (client_name) params.append('client_name', client_name);
        if (app_name) params.append('app_name', app_name);
        if (project_name) params.append('project_name', project_name);
      }
      
      // Use CARDINALITY_VIEW_API (unified API for all atoms)
      const url = `${CARDINALITY_VIEW_API}/cardinality?${params.toString()}`;
      console.log('🔍 [DATA-SUMMARY] Fetching from:', url);
      
      const res = await fetch(url);
      let payload: any = {};
      try {
        payload = await res.json();
      } catch {}
      
      if (!res.ok) {
        const detail = typeof payload?.detail === 'string' ? payload.detail : res.statusText;
        throw new Error(detail || 'Failed to fetch cardinality data');
      }
      
      // Use resolveTaskResponse (same as table atom)
      const result = (await resolveTaskResponse(payload)) || {};
      
      if (result.status === 'SUCCESS' && result.cardinality) {
        console.log('✅ [DATA-SUMMARY] Received data with metadata:', result.cardinality.length, 'columns');
        
        // Enhanced logging for metadata debugging
        const columnsWithMetadata = result.cardinality.filter((col: ColumnInfo) => col.metadata?.is_created);
        console.log('🔍 [DATA-SUMMARY] Metadata analysis:', {
          totalColumns: result.cardinality.length,
          columnsWithMetadata: columnsWithMetadata.length,
          metadataDetails: columnsWithMetadata.map((col: ColumnInfo) => ({
            column: col.column,
            is_created: col.metadata?.is_created,
            has_formula: !!col.metadata?.formula,
            formula: col.metadata?.formula
          }))
        });
        
        setData(result.cardinality);
        setMetadataAvailable(result.metadata_available || false);
      } else {
        throw new Error(result.error || 'Failed to fetch cardinality data');
      }
    } catch (e: any) {
      console.error('❌ [DATA-SUMMARY] Error:', e);
      setError(e.message || 'Error fetching cardinality data');
      setData([]);
      setMetadataAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [objectName, includeMetadata]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    metadataAvailable,
    refetch: fetchData,
  };
};