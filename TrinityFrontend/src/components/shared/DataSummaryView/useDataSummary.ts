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
      
      // Try to extract project context from objectName path if it's a full path
      let extractedContext: { client_name?: string; app_name?: string; project_name?: string } | null = null;
      if (objectName && objectName.includes('/')) {
        const pathParts = objectName.split('/').filter(p => p);
        if (pathParts.length >= 3) {
          extractedContext = {
            client_name: pathParts[0],
            app_name: pathParts[1],
            project_name: pathParts[2]
          };
        }
      }
      
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
      // Priority: projectContext > extractedContext
      // Only add if all three values are non-empty (required for backend metadata lookup)
      const finalContext = projectContext || extractedContext;
      if (finalContext) {
        const { client_name, app_name, project_name } = finalContext;
        if (client_name && app_name && project_name) {
          params.append('client_name', client_name);
          params.append('app_name', app_name);
          params.append('project_name', project_name);
        }
      }
      
      // Use CARDINALITY_VIEW_API (unified API for all atoms)
      const url = `${CARDINALITY_VIEW_API}/cardinality?${params.toString()}`;
      console.log('🔍 [DATA-SUMMARY] Fetching metadata:', {
        objectName,
        fullDataSource,
        hasProjectContext: !!projectContext,
        hasExtractedContext: !!extractedContext,
        projectContextValues: projectContext ? {
          client_name: projectContext.client_name,
          app_name: projectContext.app_name,
          project_name: projectContext.project_name
        } : null,
        extractedContextValues: extractedContext,
        finalContextUsed: finalContext ? {
          client_name: finalContext.client_name,
          app_name: finalContext.app_name,
          project_name: finalContext.project_name
        } : null,
        urlParams: params.toString()
      });
      
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
        // Keep this log for debugging rename issue
        // console.log('✅ [DATA-SUMMARY] Received data with metadata:', result.cardinality.length, 'columns');
        
        // Enhanced logging for metadata debugging (keep for debugging rename issue)
        const columnsWithMetadata = result.cardinality.filter((col: ColumnInfo) => col.metadata?.is_created || col.metadata?.is_transformed);
        console.log('🔍 [DATA-SUMMARY] Metadata analysis:', {
          totalColumns: result.cardinality.length,
          columnsWithMetadata: columnsWithMetadata.length,
          metadataDetails: columnsWithMetadata.map((col: ColumnInfo) => ({
            column: col.column,
            is_created: col.metadata?.is_created,
            is_transformed: col.metadata?.is_transformed,
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