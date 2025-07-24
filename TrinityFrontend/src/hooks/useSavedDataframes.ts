import { useState, useEffect } from 'react';
import { VALIDATE_API } from '@/lib/api';

interface SavedDataframe {
  object_name: string;
  csv_name: string;
}

export const useSavedDataframes = () => {
  const [dataframes, setDataframes] = useState<SavedDataframe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDataframes = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${VALIDATE_API}/list_saved_dataframes`);
      if (!response.ok) {
        throw new Error('Failed to fetch saved dataframes');
      }
      const data = await response.json();
      setDataframes(Array.isArray(data.files) ? data.files : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dataframes');
      setDataframes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDataframes();
  }, []);

  return {
    dataframes,
    loading,
    error,
    refetch: fetchDataframes
  };
};
