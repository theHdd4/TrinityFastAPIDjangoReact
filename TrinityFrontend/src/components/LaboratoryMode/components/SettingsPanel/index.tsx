
import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronRight, Sliders, Eye, BarChart2 } from 'lucide-react';
import {
  useLaboratoryStore,
  TextBoxSettings,
  DEFAULT_TEXTBOX_SETTINGS,
  DataUploadSettings,
  DEFAULT_DATAUPLOAD_SETTINGS,
  FeatureOverviewSettings,
  DEFAULT_FEATURE_OVERVIEW_SETTINGS,
} from '../../store/laboratoryStore';
import DataUploadValidateProperties from '@/components/AtomList/atoms/data-upload-validate/components/properties/DataUploadValidateProperties';
import FeatureOverviewProperties from '@/components/AtomList/atoms/feature-overview/components/properties/FeatureOverviewProperties';
import ConcatProperties from '@/components/AtomList/atoms/concat/components/properties/ConcatProperties';
import MergeProperties from '@/components/AtomList/atoms/merge/components/properties/MergeProperties';
import ColumnClassifierProperties from '@/components/AtomList/atoms/column-classifier/components/properties/ColumnClassifierProperties';
import AtomSettingsTabs from "./AtomSettingsTabs";

interface SettingsPanelProps {
  isCollapsed: boolean;
  onToggle: () => void;
  selectedAtomId?: string;
  selectedCardId?: string;
  cardExhibited?: boolean;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isCollapsed,
  onToggle,
  selectedAtomId,
  selectedCardId,
  cardExhibited,
}) => {
  const [tab, setTab] = useState('settings');
  const atom = useLaboratoryStore(state =>
    selectedAtomId ? state.getAtom(selectedAtomId) : undefined
  );
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: TextBoxSettings | DataUploadSettings | FeatureOverviewSettings =
    atom?.settings ||
    (atom?.atomId === 'data-upload-validate'
      ? { ...DEFAULT_DATAUPLOAD_SETTINGS }
      : atom?.atomId === 'feature-overview'
      ? { ...DEFAULT_FEATURE_OVERVIEW_SETTINGS }
      : { ...DEFAULT_TEXTBOX_SETTINGS });

  useEffect(() => {
    if (!cardExhibited && tab === 'exhibition') {
      setTab('settings');
    }
  }, [cardExhibited]);

  useEffect(() => {
    setTab('settings');
  }, [selectedAtomId, selectedCardId]);
  return (
    <div
      className={`bg-white border-l border-gray-200 transition-all duration-300 flex flex-col h-full ${
        isCollapsed ? 'w-12' : 'w-80'
      }`}
    >
      {/* Toggle Button */}
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        {!isCollapsed && (
          <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
            <Sliders className="w-4 h-4" />
            <span>Properties</span>
          </h3>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="p-1 h-8 w-8"
        >
          {isCollapsed ? (
            <Sliders className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </Button>
      </div>

      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300">
          {!selectedAtomId && !selectedCardId ? (
            <div className="p-4 text-gray-600 text-sm">Please select a Card/Atom</div>
          ) : selectedAtomId && atom?.atomId === 'data-upload-validate' ? (
            <DataUploadValidateProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'feature-overview' ? (
            <FeatureOverviewProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'concat' ? (
            <ConcatProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'merge' ? (
            <MergeProperties atomId={selectedAtomId} />
          ) : selectedAtomId && atom?.atomId === 'column-classifier' ? (
            <ColumnClassifierProperties atomId={selectedAtomId} />
          ) : (
          <AtomSettingsTabs tab={tab} setTab={setTab} selectedAtomId={selectedAtomId!} cardExhibited={cardExhibited} settings={settings as TextBoxSettings} updateSettings={updateSettings} />
        )}
        </div>
      )}
    </div>
  );
  };

export default SettingsPanel;
