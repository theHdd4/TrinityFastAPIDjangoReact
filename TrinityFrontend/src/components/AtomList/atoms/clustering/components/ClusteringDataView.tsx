import React, { useEffect, useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';

interface Props {
  objectName: string;
  apiBase: string;
}

const ClusteringDataView: React.FC<Props> = ({ objectName, apiBase }) => {
  const [summary, setSummary] = useState<any[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [filterUnique, setFilterUnique] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Use ref to prevent duplicate API calls
  const lastFetchRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!objectName) {
      setSummary([]);
      return;
    }
    
    // Prevent duplicate API calls for the same objectName
    if (lastFetchRef.current === objectName) {
      return;
    }
    
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    lastFetchRef.current = objectName;
    
    const fetchSummary = async () => {
      if (isLoading) return; // Prevent multiple simultaneous requests
      
      setIsLoading(true);
      try {
        const res = await fetch(
          `${apiBase}/column_summary?object_name=${encodeURIComponent(objectName)}`,
          { signal: abortControllerRef.current?.signal }
        );
        
        if (res.ok) {
          const data = await res.json();
          const summaryData = Array.isArray(data.summary) ? data.summary.filter(Boolean) : [];
          setSummary(summaryData);
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          // Request was cancelled, do nothing
          return;
        }
        console.error('Failed to fetch column summary:', err);
        setSummary([]);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSummary();
    
    // Cleanup function
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [objectName]); // Remove apiBase from dependencies since it's constant

  // Filter columns based on filterUnique state
  const displayedSummary = filterUnique 
    ? summary.filter(col => col.unique_count > 1)
    : summary;

  // Don't render anything if no objectName is provided
  if (!objectName) {
    return null;
  }

  return (
    <div className="mb-6">
      <Card className="border border-gray-200 bg-white p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center">
            <div className="w-1 h-6 bg-gradient-to-b from-primary to-primary/80 rounded-full mr-4" />
            <h3 className="text-xl font-bold text-foreground">Column Overview</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Fetch columns with more than one unique value</span>
            <Switch
              checked={filterUnique}
              onCheckedChange={setFilterUnique}
              className="data-[state=checked]:bg-[#458EE2]"
            />
            <button
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              onClick={() => setMinimized(m => !m)}
              aria-label={minimized ? "Expand overview" : "Minimize overview"}
            >
              {minimized ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </Card>

      {!minimized && (
        <>

          {/* Column Summary Table */}
          {displayedSummary.length > 0 && (
            <Card className="border border-gray-200 bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <div className="min-w-max">
                  <div className="grid grid-rows-4 gap-0">
                    {/* Column Names Row */}
                    <div className="flex bg-white border-b border-gray-200">
                      <div className="w-40 font-bold text-black bg-gray-100 border-r border-gray-300 flex items-center justify-center sticky left-0 z-10">
                        Columns
                      </div>
                      {displayedSummary.slice(0, 20).map((col, index) => (
                        <div
                          key={index}
                          className="w-32 text-sm font-semibold text-black border-r border-gray-200 flex items-center justify-center"
                        >
                          {col.column}
                        </div>
                      ))}
                    </div>
                    
                    {/* Data Types Row */}
                    <div className="flex bg-white border-b border-gray-200">
                      <div className="w-40 font-bold text-black bg-gray-100 border-r border-gray-300 flex items-center justify-center sticky left-0 z-10">
                        Data Type
                      </div>
                      {displayedSummary.slice(0, 20).map((col, index) => (
                        <div
                          key={index}
                          className="w-32 text-sm border-r border-gray-200 flex items-center justify-center"
                        >
                          <span className="px-2 py-1 text-xs font-medium bg-gray-50 text-black rounded">
                            {col.data_type}
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    {/* Unique Counts Row */}
                    <div className="flex bg-gray-50 border-b border-gray-200">
                      <div className="w-40 font-bold text-black bg-gray-100 border-r border-gray-300 flex items-center justify-center sticky left-0 z-10">
                        Unique Counts
                      </div>
                      {displayedSummary.slice(0, 20).map((col, index) => (
                        <div
                          key={index}
                          className="w-32 text-sm text-black border-r border-gray-200 flex items-center justify-center font-medium"
                        >
                          {col.unique_count}
                        </div>
                      ))}
                    </div>
                    
                    {/* Unique Values Row */}
                    <div className="flex bg-white">
                      <div className="w-40 font-bold text-black bg-gray-100 border-r border-gray-300 flex items-center justify-center sticky left-0 z-10 py-1">
                        Unique Values
                      </div>
                      {displayedSummary.slice(0, 20).map((col, index) => (
                        <div
                          key={index}
                          className="w-32 text-sm border-r border-gray-200 flex items-center justify-center py-1"
                        >
                          <div className="flex flex-col gap-px items-center">
                            {col.unique_values?.slice(0, 2).map((val, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 text-xs bg-gray-50 text-black rounded"
                              >
                                {String(val)}
                              </span>
                            ))}
                            {col.unique_values?.length > 2 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-0.5 text-xs text-gray-600 font-medium cursor-pointer">
                                    <Plus className="w-3 h-3" />
                                    {col.unique_values.length - 2}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs max-w-xs whitespace-pre-wrap">
                                  {col.unique_values
                                    .slice(2)
                                    .map(val => String(val))
                                    .join(', ')}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* No columns message when filtered */}
          {filterUnique && displayedSummary.length === 0 && !isLoading && (
            <Card className="border border-gray-200 bg-gray-50 p-8 text-center">
              <p className="text-gray-500 text-sm">
                No columns found with more than one unique value.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default ClusteringDataView;
