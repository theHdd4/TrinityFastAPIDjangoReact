import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { VALIDATE_API } from '@/lib/api';
import { useLaboratoryStore } from '../../../store/laboratoryStore';

interface Frame {
  object_name: string;
  csv_name: string;
}
interface MetricsInputFilesProps {
  cardId?: string;
}

const MetricsInputFiles: React.FC<MetricsInputFilesProps> = ({ cardId }) => {
  const [frames, setFrames] = useState<Frame[]>([]);

  const metricsInputs = useLaboratoryStore(state => state.metricsInputs);
  const updateMetricsInputs = useLaboratoryStore(state => state.updateMetricsInputs);
  const openMetricGuidedFlow = useLaboratoryStore(state => state.openMetricGuidedFlow);
  const closeMetricGuidedFlow = useLaboratoryStore(state => state.closeMetricGuidedFlow);
  const isMetricGuidedFlowOpen = useLaboratoryStore(state => state.isMetricGuidedFlowOpen);
  const getAtom = useLaboratoryStore(state => state.getAtom);
  const selectedDataSource = metricsInputs.dataSource;

  // Direct API fetch for saved dataframes
  useEffect(() => {
    fetch(`${VALIDATE_API}/list_saved_dataframes`)
      .then(r => r.json())
      .then(d => {
        const allFiles = Array.isArray(d.files) ? d.files : [];
        const arrowFiles = allFiles.filter(
          (f: Frame) => f.object_name && f.object_name.endsWith('.arrow'),
        );
        setFrames(arrowFiles);
        console.log('[MetricsInputFiles] Fetched frames', frames);
        console.log('[MetricsInputFiles] Fetched frames', arrowFiles);
      })
      .catch(() => setFrames([]));
  }, []);

  // When a context atom exists and has a dataframe, preselect that dataframe in the dropdown
  useEffect(() => {
    const contextAtomId = metricsInputs.contextAtomId;

    // Only proceed when we actually have a context atom
    if (!contextAtomId) {
      return;
    }

    if (!Array.isArray(frames) || frames.length === 0) {
      return;
    }

    // Prefer the per-atom current dataframe map if available
    const atomDataframes = metricsInputs.atomDataframes || {};
    let rawSource: string | undefined = atomDataframes[contextAtomId];

    const atomForLog = getAtom(contextAtomId);

    if (rawSource) {
      console.log('[MetricsInputFiles] Using dataframe from atomDataframes map', {
        contextAtomId,
        rawSource,
      });
    } else {
      const atom = atomForLog;
      if (!atom) {
        console.log('[MetricsInputFiles] Context atom not found for preselect', {
          contextAtomId,
        });
        return;
      }

      const settings: any = (atom as any).settings || {};
      rawSource =
        settings.sourceFile ||
        settings.file_key ||
        settings.dataSource ||
        settings.selectedDataSource ||
        '';

      if (!rawSource) {
        console.log('[MetricsInputFiles] Context atom has no recognizable dataframe source', {
          contextAtomId,
          atomType: (atom as any).atomId,
        });
        return;
      } else {
        console.log('[MetricsInputFiles] Derived dataframe from atom.settings', {
          contextAtomId,
          atomType: (atom as any).atomId,
          rawSource,
        });
      }
    }

    const findMatchingObjectName = (value: string): string | undefined => {
      // 1) Exact match on object_name
      const exact = frames.find(f => f.object_name === value);
      if (exact) return exact.object_name;

      // 2) Match by basename without .arrow and without path
      const base = value.split('/').pop()?.replace(/\.arrow$/, '');
      if (!base) return undefined;

      const byBase = frames.find(f => {
        const fBase = f.object_name.split('/').pop()?.replace(/\.arrow$/, '');
        return fBase === base;
      });
      return byBase?.object_name;
    };

    const matchedObjectName = rawSource ? findMatchingObjectName(rawSource) : undefined;

    console.log('[MetricsInputFiles] Resolved dataframe from context atom', {
      contextAtomId,
      atomType: (atomForLog as any)?.atomId,
      rawSource: rawSource || null,
      matchedObjectName: matchedObjectName || null,
    });

    if (matchedObjectName && matchedObjectName !== metricsInputs.dataSource) {
      updateMetricsInputs({ dataSource: matchedObjectName });
    }
  }, [
    metricsInputs.contextAtomId,
    metricsInputs.dataSource,
    frames,
    getAtom,
    updateMetricsInputs,
  ]);

  const handleFrameChange = (val: string) => {
    if (!val.endsWith('.arrow')) {
      val += '.arrow';
    }
    updateMetricsInputs({ dataSource: val });
  };

  const handleGuidedModeToggle = (checked: boolean) => {
    const { contextCardId, contextAtomId } = metricsInputs;
    const currentAtom = contextAtomId ? getAtom(contextAtomId) : undefined;

    console.log('[MetricGuidedFlow] Guided mode toggle changed in MetricsInputFiles', {
      checked,
      contextCardId: contextCardId || null,
      contextAtomId: contextAtomId || null,
      currentAtom: currentAtom
        ? {
            id: currentAtom.id,
            atomId: (currentAtom as any).atomId,
            title: (currentAtom as any).title,
          }
        : null,
    });

    if (checked) {
      openMetricGuidedFlow();
    } else {
      closeMetricGuidedFlow();
    }
  };

  return (
    <div className="space-y-4 px-2 pb-2">
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #a0aec0;
        }
      `}</style>
      <Card className="p-4 space-y-4">
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-700 block">Data Source</label>
          <Select value={selectedDataSource} onValueChange={handleFrameChange}>
            <SelectTrigger className="bg-white border-gray-300">
              <SelectValue placeholder="Choose a saved dataframe..." />
            </SelectTrigger>
            <SelectContent>
              {(Array.isArray(frames) ? frames : []).map(f => (
                <SelectItem key={f.object_name} value={f.object_name}>
                  {f.csv_name.split('/').pop()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-700">Guided mode</span>
          <Switch
            id="metrics-guidedmode-toggle"
            aria-label="guidedmode"
            checked={isMetricGuidedFlowOpen}
            onCheckedChange={handleGuidedModeToggle}
          />
        </div>
      </Card>
    </div>
  );
};

export default MetricsInputFiles;