import React from 'react';
import { Database, FolderOpen, Loader2, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface CurrentDataframeInfo {
  name: string;
  source: 'saved' | 'uploaded';
  lastModifiedLabel?: string;
}

interface UploadLandingLeftProps {
  savedDataframes: {
    object_name: string;
    csv_name: string;
    arrow_name?: string;
    last_modified?: string;
  }[];
  isLoading: boolean;
  fetchError: string | null;
  onRetry: () => void;
  onSelectSavedDataframe: (df: {
    object_name: string;
    csv_name: string;
    arrow_name?: string;
    last_modified?: string;
  }) => void;
  primedFiles: string[];
  currentDataframeInfo: CurrentDataframeInfo | null;
}

const UploadLandingLeft: React.FC<UploadLandingLeftProps> = ({
  savedDataframes,
  isLoading,
  fetchError,
  onRetry,
  onSelectSavedDataframe,
  primedFiles,
  currentDataframeInfo,
}) => {
  const hasSelection = !!currentDataframeInfo;

  return (
    <div className="w-full h-full flex flex-col gap-3">
      {/* Top row: Saved dataframes list */}
      <Card className="flex-1 min-h-[160px] flex flex-col shadow-sm border border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-blue-600" />
            <span>Select from Saved Dataframes</span>
          </h3>
          {savedDataframes.length > 0 && (
            <span className="text-xs text-gray-500">
              {savedDataframes.length} available
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : fetchError ? (
            <div className="text-center py-4">
              <p className="text-xs text-gray-500 mb-2">{fetchError}</p>
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw className="w-3 h-3 mr-1" />
                Retry
              </Button>
            </div>
          ) : savedDataframes.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <Database className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-xs">No saved dataframes available yet</p>
              <p className="text-[11px] text-gray-400 mt-1">
                Upload a file on the right to create your first dataframe.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {savedDataframes.map((df, idx) => (
                <button
                  key={`${df.object_name}-${idx}`}
                  type="button"
                  onClick={() => onSelectSavedDataframe(df)}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                    <span className="text-sm font-medium text-gray-700 truncate group-hover:text-blue-700">
                      {df.csv_name || df.object_name.split('/').pop()}
                    </span>
                  </div>
                  {df.last_modified && (
                    <p className="text-xs text-gray-400 mt-1 ml-6">
                      Modified:{' '}
                      {new Date(df.last_modified).toLocaleDateString()}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Bottom row: three landing idea cards */}
      <div className="grid grid-cols-3 gap-3">
        {/* Idea 1: Current selection overview */}
        <Card className="p-3 flex flex-col justify-between shadow-sm border border-blue-100 bg-blue-50/60">
          <div>
            <p className="text-xs font-semibold text-blue-900 mb-1">
              {hasSelection ? 'Current Dataframe' : 'Waiting for a dataframe'}
            </p>
            {hasSelection ? (
              <>
                <p className="text-xs text-blue-800 font-medium truncate">
                  {currentDataframeInfo?.name}
                </p>
                {currentDataframeInfo?.lastModifiedLabel && (
                  <p className="text-[11px] text-blue-700 mt-1">
                    Last updated {currentDataframeInfo.lastModifiedLabel}
                  </p>
                )}
                <p className="text-[11px] text-blue-700 mt-2">
                  This dataframe is ready to be explored in downstream steps.
                </p>
              </>
            ) : (
              <p className="text-[11px] text-blue-800">
                Select a saved dataframe above or upload a new file to see
                smart suggestions here.
              </p>
            )}
          </div>
        </Card>

        {/* Idea 2: Suggested next actions */}
        <Card className="p-3 flex flex-col justify-between shadow-sm border border-indigo-100 bg-indigo-50/60">
          <div>
            <p className="text-xs font-semibold text-indigo-900 mb-1">
              Suggested Next Steps
            </p>
            {hasSelection ? (
              <ul className="space-y-1.5">
                <li className="text-[11px] text-indigo-800">
                  • Run a structural scan to validate headers and data types.
                </li>
                <li className="text-[11px] text-indigo-800">
                  • Explore summary statistics and missing values.
                </li>
                <li className="text-[11px] text-indigo-800">
                  • Send this dataframe into a laboratory scenario.
                </li>
              </ul>
            ) : (
              <p className="text-[11px] text-indigo-800">
                Once a dataframe is selected, we will recommend the best
                next actions for it.
              </p>
            )}
          </div>
        </Card>

        {/* Idea 3: Primed / recent files */}
        <Card className="p-3 flex flex-col justify-between shadow-sm border border-emerald-100 bg-emerald-50/60">
          <div>
            <p className="text-xs font-semibold text-emerald-900 mb-1">
              Recently Primed Files
            </p>
            {primedFiles.length > 0 ? (
              <div className="space-y-1">
                {primedFiles.slice(0, 3).map((file, idx) => (
                  <div
                    key={`${file}-${idx}`}
                    className="flex items-center gap-1.5 text-[11px] text-emerald-800"
                  >
                    <Database className="w-3 h-3" />
                    <span className="truncate">{file}</span>
                  </div>
                ))}
                {primedFiles.length > 3 && (
                  <p className="text-[11px] text-emerald-700 italic">
                    +{primedFiles.length - 3} more files
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-emerald-800">
                As you upload and prepare datasets, they will appear here for
                quick reuse.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default UploadLandingLeft;


