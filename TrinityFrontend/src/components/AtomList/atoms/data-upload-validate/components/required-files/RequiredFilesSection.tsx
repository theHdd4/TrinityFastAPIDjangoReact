import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Info, Pencil, FileText } from 'lucide-react';

export interface FileInfo {
  name: string;
  status: string;
  required: boolean;
  validations: any;
}

interface RequiredFilesSectionProps {
  files: FileInfo[];
  columnConfig: Record<string, Record<string, string>>;
  renameTarget: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  startRename: (name: string) => void;
  commitRename: (oldName: string) => void;
  openFile: string | null;
  setOpenFile: (n: string | null) => void;
  getStatusIcon: (status: string, required: boolean) => React.ReactNode;
}

const RequiredFilesSection: React.FC<RequiredFilesSectionProps> = ({
  files,
  columnConfig,
  renameTarget,
  renameValue,
  setRenameValue,
  startRename,
  commitRename,
  openFile,
  setOpenFile,
  getStatusIcon
}) => (
  <Card className="h-full shadow-sm border-0 bg-white">
    <div className="p-4 border-b border-gray-100">
      <h4 className="font-semibold text-gray-900 flex items-center space-x-2">
        <FileText className="w-4 h-4 text-blue-500" />
        <span>Master Files</span>
      </h4>
      <p className="text-xs text-gray-600 mt-1">Upload these files for complete data validation</p>
    </div>
    <div className="p-4 space-y-3 overflow-y-auto h-[calc(100%-80px)]">
      {files.length === 0 && (
        <p className="text-sm text-gray-500 text-center">
          Upload a Master File in Properties section to begin upload.
        </p>
      )}
      {files.map((file, index) => {
        const types = columnConfig[file.name] || {};
        return (
          <div key={index} className="border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between p-3 hover:border-gray-300 hover:bg-gray-50 w-full min-w-0">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className="flex-shrink-0">{getStatusIcon(file.status, file.required)}</div>
                <div className="flex-1 min-w-0">
                  {renameTarget === file.name ? (
                    <Input
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => commitRename(file.name)}
                      className="h-6 text-xs"
                    />
                  ) : (
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  )}
                  {file.required && (
                    <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200 mt-1">
                      Required
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Pencil className="w-4 h-4 text-gray-400 cursor-pointer" onClick={() => startRename(file.name)} />
                <Info className="w-4 h-4 text-gray-400 cursor-pointer" onClick={() => setOpenFile(openFile === file.name ? null : file.name)} />
              </div>
            </div>
            {openFile === file.name && (
              <div className="p-3 border-t border-gray-200">
                <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300">
                  <div className="flex space-x-2 w-max">
                    {Object.entries(types).map(([col, dt]) => (
                      <Badge key={col} variant="outline" className="text-xs">
                        {col}: {dt}
                      </Badge>
                    ))}
                    {file.validations.ranges.map((r: any, i: number) => (
                      <Badge key={`r-${i}`} variant="outline" className="text-xs">
                        {r.column}: {r.min}-{r.max}
                      </Badge>
                    ))}
                    {file.validations.periodicities.map((p: any, i: number) => (
                      <Badge key={`p-${i}`} variant="outline" className="text-xs">
                        {p.column}: {p.periodicity}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  </Card>
);

export default RequiredFilesSection;
