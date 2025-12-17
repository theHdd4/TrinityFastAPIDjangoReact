import React, { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight, BarChart3 } from 'lucide-react';
import {
  useLaboratoryStore,
  type CardVariable,
  type LayoutCard,
} from '../store/laboratoryStore';
import CardSettingsTabs from './SettingsPanel/metricstabs/CardSettingsTabs';

interface MetricsPanelProps {
  selectedAtomId?: string;
  selectedCardId?: string;
  cardExhibited?: boolean;
  onClose: () => void;
}

const MetricsPanel: React.FC<MetricsPanelProps> = ({
  selectedAtomId,
  selectedCardId,
  cardExhibited,
  onClose,
}) => {
  const metricsInputs = useLaboratoryStore(state => state.metricsInputs);
  const updateMetricsInputs = useLaboratoryStore(state => state.updateMetricsInputs);
  const tab = metricsInputs.currentTab;
  const setTab = (value: 'input' | 'variables' | 'column-operations' | 'exhibition') => {
    updateMetricsInputs({ currentTab: value });
  };

  const cards = useLaboratoryStore(state => state.cards);
  const updateCard = useLaboratoryStore(state => state.updateCard);
  const addCardVariable = useLaboratoryStore(state => state.addCardVariable);
  const updateCardVariable = useLaboratoryStore(state => state.updateCardVariable);
  const deleteCardVariable = useLaboratoryStore(state => state.deleteCardVariable);
  const toggleCardVariableAppend = useLaboratoryStore(state => state.toggleCardVariableAppend);

  const selectedCard = useMemo<LayoutCard | undefined>(
    () => {
      if (selectedCardId) {
        return cards.find(card => card.id === selectedCardId);
      }
      if (selectedAtomId && !selectedCardId) {
        return cards.find(card =>
          Array.isArray(card.atoms) && card.atoms.some(atom => atom.id === selectedAtomId),
        );
      }
      return undefined;
    },
    [cards, selectedCardId, selectedAtomId],
  );

  const globalCard = useMemo<LayoutCard>(
    () => ({
      id: 'global-metrics',
      atoms: [],
      isExhibited: false,
      variables: [] as CardVariable[],
    }),
    [],
  );

  const cardForMetrics = selectedCard || globalCard;

  useEffect(() => {
    if (!cardExhibited && tab === 'exhibition') {
      setTab('input');
    }
  }, [cardExhibited, tab]);

  useEffect(() => {
    const contextAtomId =
      selectedAtomId ||
      (selectedCard?.atoms && selectedCard.atoms.length > 0
        ? selectedCard.atoms[0].id
        : undefined);

    const contextCardId =
      selectedCardId ||
      (selectedAtomId && selectedCard
        ? selectedCard.id
        : undefined);

    const currentContextCardId = metricsInputs.contextCardId;
    const currentContextAtomId = metricsInputs.contextAtomId;

    if (contextCardId && contextAtomId) {
      const willChange =
        currentContextCardId !== (contextCardId || undefined) ||
        currentContextAtomId !== (contextAtomId || undefined);

      if (willChange) {
        updateMetricsInputs({
          contextCardId: contextCardId || undefined,
          contextAtomId: contextAtomId || undefined,
        });
      }
    }
    // We intentionally omit metricsInputs from dependencies to avoid loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCardId, selectedAtomId, selectedCard, updateMetricsInputs]);

  return (
    <div className="bg-white border-l border-gray-200 transition-all duration-300 flex flex-col h-full w-80">
      {/* Header */}
      <div className="p-2 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900 flex items-center space-x-2">
          <BarChart3 className="w-3.5 h-3.5" />
          <span>Metrics</span>
        </h3>
        <Button variant="ghost" size="sm" onClick={onClose} className="p-1 h-8 w-8">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 flex flex-col text-sm">
        <div className="flex-1 p-3">
          <CardSettingsTabs
            card={cardForMetrics}
            tab={tab}
            setTab={setTab}
            onUpdateCard={updateCard}
            onAddVariable={addCardVariable}
            onUpdateVariable={updateCardVariable}
            onDeleteVariable={deleteCardVariable}
            onToggleVariable={toggleCardVariableAppend}
          />
        </div>
      </div>
    </div>
  );
};

export default MetricsPanel;

