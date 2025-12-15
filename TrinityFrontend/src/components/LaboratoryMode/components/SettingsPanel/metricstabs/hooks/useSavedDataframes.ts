// Shared hook to fetch saved Arrow dataframes for Metrics flows
import { useEffect, useState } from 'react';
import { VALIDATE_API } from '@/lib/api';

export interface SavedFrame {
  object_name: string;
  csv_name: string;
}

interface SavedFramesResponse {
  files?: SavedFrame[];
}

export const useSavedDataframes = () => {
  const [frames, setFrames] = useState<SavedFrame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchFrames = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${VALIDATE_API}/list_saved_dataframes`);
        const data: SavedFramesResponse = await res.json();
        const allFiles = Array.isArray(data?.files) ? data.files : [];
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/e979234e-e916-47e0-b99c-a81b0259c39c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useSavedDataframes.ts:29',message:'Fetching dataframes - raw response',data:{allFiles_count:allFiles.length,allFiles:allFiles.map(f=>({object_name:f.object_name,csv_name:f.csv_name}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        const arrowFiles = allFiles.filter(f => f.object_name && f.object_name.endsWith('.arrow'));
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/e979234e-e916-47e0-b99c-a81b0259c39c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useSavedDataframes.ts:32',message:'Filtered arrow files',data:{arrowFiles_count:arrowFiles.length,arrowFiles:arrowFiles.map(f=>({object_name:f.object_name,csv_name:f.csv_name}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        if (!cancelled) {
          setFrames(arrowFiles);
        }
      } catch (err) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/e979234e-e916-47e0-b99c-a81b0259c39c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useSavedDataframes.ts:39',message:'Error fetching dataframes',data:{error:err instanceof Error ? err.message : String(err)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        if (!cancelled) {
          setFrames([]);
          setError(err instanceof Error ? err.message : 'Failed to load dataframes');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchFrames();
    return () => {
      cancelled = true;
    };
  }, []);
  console.log('[Para Debug]frames', frames);
  console.log('[Para Debug]loading', loading);
  console.log('[Para Debug] error', error);  
  return { frames, loading, error };
};

