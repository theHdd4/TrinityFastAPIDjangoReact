import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, MoreHorizontal, Trash2, Pencil, Layers, Upload } from 'lucide-react';
import { useLaboratoryStore, CardVariable, LayoutCard } from '../../../store/laboratoryStore';
import ConfirmationDialog from '@/templates/DialogueBox/ConfirmationDialog';
import { LABORATORY_API } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { getActiveProjectContext } from '@/utils/projectEnv';
import MetricsInputFiles from './MetricsInputFiles';
import MetricsColOps from './MetricsColOps';
import VariableTab from './VariableTab';

interface CardSettingsTabsProps {
  card: LayoutCard;
  tab: string;
  setTab: (value: string) => void;
  onUpdateCard: (cardId: string, updates: Partial<LayoutCard>) => void;
  onAddVariable: (cardId: string, variable: CardVariable) => void;
  onUpdateVariable: (
    cardId: string,
    variableId: string,
    update: Partial<Omit<CardVariable, 'id' | 'originCardId'>>
  ) => void;
  onDeleteVariable: (cardId: string, variableId: string) => void;
  onToggleVariable: (cardId: string, variableId: string, appended: boolean) => void;
}

interface AvailableVariable extends CardVariable {
  cardId: string;
  cardTitle: string;
  atomTitle?: string;
}

interface PersistedVariableResponse {
  id: string;
  variableName: string;
  formula?: string;
  value?: string;
  description?: string;
  usageSummary?: string;
  cardId?: string;
  atomId?: string;
  originCardId?: string;
  originVariableId?: string;
  clientId?: string;
  appId?: string;
  projectId?: string;
  projectName?: string;
  createdAt?: string;
  updatedAt?: string;
  status: string;
  operation: 'inserted' | 'updated';
}

interface VariableListResponse {
  variables?: PersistedVariableResponse[];
}

interface PersistVariableError extends Error {
  status?: number;
  detail?: string;
}

const isDuplicateNameError = (error: unknown): error is PersistVariableError => {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'status' in error &&
      (error as PersistVariableError).status === 409
  );
};

const extractErrorDetail = (error: unknown): string | undefined => {
  if (error && typeof error === 'object' && 'detail' in error) {
    const detail = (error as PersistVariableError).detail;
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }
  }
  if (error instanceof Error && typeof error.message === 'string') {
    return error.message;
  }
  return undefined;
};

const CardSettingsTabs: React.FC<CardSettingsTabsProps> = ({
  card,
  tab,
  setTab,
  onUpdateCard,
  onAddVariable,
  onUpdateVariable,
  onDeleteVariable,
  onToggleVariable,
}) => {
  const cards = useLaboratoryStore(state => state.cards);
  const currentVariables = card.variables ?? [];
  const { toast } = useToast();
  const projectContext = useMemo(() => getActiveProjectContext(), []);

  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingVariables, setIsLoadingVariables] = useState(false);
  const [availableVariables, setAvailableVariables] = useState<AvailableVariable[]>([]);
  const [addForm, setAddForm] = useState({ name: '', formula: '', value: '', description: '', usageSummary: '' });
  const [editingVariableId, setEditingVariableId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', formula: '', value: '', description: '', usageSummary: '' });
  const [addNameError, setAddNameError] = useState<string | null>(null);
  const [editNameError, setEditNameError] = useState<string | null>(null);
  const [appendDialogOpen, setAppendDialogOpen] = useState(false);
  const [pendingAppendVariable, setPendingAppendVariable] = useState<AvailableVariable | null>(null);

  const generateVariableId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `variable-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };

  const resolveCardTitle = useCallback(
    (layoutCard: LayoutCard | undefined, fallbackAtomTitle?: string) => {
      if (!layoutCard) {
        return fallbackAtomTitle ?? 'Variable';
      }
      if (layoutCard.moleculeTitle) {
        return (Array.isArray(layoutCard.atoms) && layoutCard.atoms.length > 0)
          ? `${layoutCard.moleculeTitle} - ${layoutCard.atoms[0].title}`
          : layoutCard.moleculeTitle;
      }
      return (Array.isArray(layoutCard.atoms) && layoutCard.atoms.length > 0) ? layoutCard.atoms[0].title : fallbackAtomTitle ?? 'Variable';
    },
    [],
  );

  const mapPersistedToAvailable = useCallback(
    (record: PersistedVariableResponse): AvailableVariable => {
      const sourceCard = cards.find(c => c.id === record.cardId);
      const atoms = sourceCard?.atoms;
      const fallbackTitle = (Array.isArray(atoms) && atoms.length > 0) ? atoms[0]?.title : undefined;
      const cardTitle = resolveCardTitle(sourceCard, fallbackTitle ?? record.cardId ?? 'Variable');

      return {
        id: record.id ?? generateVariableId(),
        name: record.variableName ?? 'Variable',
        formula: record.formula ?? undefined,
        value: record.value ?? undefined,
        description: record.description ?? undefined,
        usageSummary: record.usageSummary ?? undefined,
        appended: false,
        originCardId: record.originCardId ?? record.cardId ?? card.id,
        originVariableId: record.originVariableId ?? record.id,
        originAtomId: record.atomId ?? undefined,
        clientId: record.clientId,
        appId: record.appId,
        projectId: record.projectId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        cardId: record.cardId ?? card.id,
        cardTitle,
        atomTitle: (Array.isArray(atoms) && atoms.length > 0) ? atoms[0]?.title : undefined,
      } satisfies AvailableVariable;
    },
    [card.id, cards, resolveCardTitle],
  );

  const loadAvailableVariables = useCallback(async () => {
    if (!projectContext) {
      setAvailableVariables([]);
      return;
    }

    setIsLoadingVariables(true);
    try {
      const params = new URLSearchParams({
        clientId: projectContext.client_name,
        appId: projectContext.app_name,
        projectId: projectContext.project_name,
      });
      const response = await fetch(`${LABORATORY_API}/variables?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to load variables');
      }
      const payload: VariableListResponse = await response.json();
      const mapped = (payload.variables ?? []).map(mapPersistedToAvailable);
      setAvailableVariables(mapped);
    } catch (error) {
      console.error('Failed to fetch available variables', error);
      toast({
        title: 'Unable to fetch variables',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
      setAvailableVariables([]);
    } finally {
      setIsLoadingVariables(false);
    }
  }, [mapPersistedToAvailable, projectContext, toast]);

  useEffect(() => {
    void loadAvailableVariables();
  }, [loadAvailableVariables]);

  const persistVariableDefinition = async (input: {
    id?: string;
    name: string;
    formula?: string;
    value?: string;
    description?: string;
    usageSummary?: string;
    originCardId?: string;
    originVariableId?: string;
  }): Promise<PersistedVariableResponse> => {
    if (!projectContext) {
      throw new Error('Active project context is required to persist variables.');
    }

    const payload = {
      ...(input.id ? { id: input.id } : {}),
      variableName: input.name,
      formula: input.formula?.trim() || undefined,
      value: input.value?.trim() || undefined,
      description: input.description?.trim() || undefined,
      usageSummary: input.usageSummary?.trim() || undefined,
      cardId: card.id,
      atomId: (Array.isArray(card.atoms) && card.atoms.length > 0) ? card.atoms[0]?.id : undefined,
      originCardId: input.originCardId ?? card.id,
      originVariableId: input.originVariableId,
      clientId: projectContext.client_name,
      appId: projectContext.app_name,
      projectId: projectContext.project_name,
      projectName: projectContext.project_name,
    };

    const response = await fetch(`${LABORATORY_API}/variables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let detail: string | undefined;

      try {
        const errorPayload = await response.json();
        detail =
          (typeof errorPayload?.detail === 'string' && errorPayload.detail.trim()) ||
          (typeof errorPayload?.error === 'string' && errorPayload.error.trim());
      } catch {
        // Fallback to text if JSON parsing fails
        const errorText = await response.text();
        detail = errorText || undefined;
      }

      const error: PersistVariableError = new Error(
        detail || 'Failed to persist variable'
      );
      error.status = response.status;
      error.detail = detail;
      throw error;
    }

    const data: PersistedVariableResponse = await response.json();
    return data;
  };

  const handleAddVariable = async () => {
    const trimmedName = addForm.name.trim();
    if (!trimmedName) {
      toast({
        title: 'Variable name required',
        description: 'Please provide a name for the variable before saving.',
        variant: 'destructive',
      });
      return;
    }

    const duplicate = currentVariables.some(
      variable => variable.name.toLowerCase() === trimmedName.toLowerCase(),
    );
    if (duplicate) {
      setAddNameError('This variable name already exists on this card.');
      return;
    }
    setAddNameError(null);

    if (!projectContext) {
      toast({
        title: 'Missing project context',
        description: 'Unable to determine the active project. Please reload the page.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSaving(true);
      const persisted = await persistVariableDefinition({
        name: trimmedName,
        formula: addForm.formula,
        value: addForm.value,
        description: addForm.description,
        usageSummary: addForm.usageSummary,
      });

      const resolvedFormula = persisted.formula ?? (addForm.formula.trim() || undefined);
      const resolvedValue = persisted.value ?? (addForm.value.trim() || undefined);
      const resolvedDescription = persisted.description ?? (addForm.description.trim() || undefined);
      const resolvedUsage = persisted.usageSummary ?? (addForm.usageSummary.trim() || undefined);

      const variable: CardVariable = {
        id: persisted.id ?? generateVariableId(),
        name: persisted.variableName ?? trimmedName,
        formula: resolvedFormula,
        value: resolvedValue,
        description: resolvedDescription,
        usageSummary: resolvedUsage,
        appended: false,
        originCardId: persisted.originCardId ?? card.id,
        originVariableId: persisted.originVariableId ?? undefined,
        originAtomId: persisted.atomId ?? ((Array.isArray(card.atoms) && card.atoms.length > 0) ? card.atoms[0]?.id : undefined),
        clientId: persisted.clientId ?? projectContext.client_name,
        appId: persisted.appId ?? projectContext.app_name,
        projectId: persisted.projectId ?? projectContext.project_name,
        createdAt: persisted.createdAt ?? new Date().toISOString(),
        updatedAt: persisted.updatedAt ?? new Date().toISOString(),
      };

      onAddVariable(card.id, variable);
      setAddForm({ name: '', formula: '', value: '', description: '', usageSummary: '' });
      setIsAdding(false);
      toast({ title: 'Variable saved', description: `“${variable.name}” is now available for this card.` });
      void loadAvailableVariables();
    } catch (error) {
      if (isDuplicateNameError(error)) {
        const detail = extractErrorDetail(error);
        setAddNameError(detail ?? 'This variable name already exists in this project.');
      } else {
        toast({
          title: 'Failed to save variable',
          description: extractErrorDetail(error) ?? 'Unknown error',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditStart = (variable: CardVariable) => {
    setEditingVariableId(variable.id);
    setEditForm({
      name: variable.name,
      formula: variable.formula ?? '',
      value: variable.value ?? '',
      description: variable.description ?? '',
      usageSummary: variable.usageSummary ?? '',
    });
  };

  const handleEditSave = async () => {
    if (!editingVariableId || !editForm.name.trim()) {
      toast({
        title: 'Variable name required',
        description: 'Please provide a name before saving changes.',
        variant: 'destructive',
      });
      return;
    }

    const existing = currentVariables.find(variable => variable.id === editingVariableId);
    if (!existing) {
      toast({ title: 'Variable not found', description: 'Please try again.', variant: 'destructive' });
      setEditingVariableId(null);
      return;
    }

    const trimmedNewName = editForm.name.trim();
    const duplicateName = currentVariables.some(variable => {
      if (variable.id === existing.id) {
        return false;
      }
      return variable.name.toLowerCase() === trimmedNewName.toLowerCase();
    });
    if (duplicateName) {
      setEditNameError('This variable name already exists on this card.');
      return;
    }
    setEditNameError(null);

    if (!projectContext) {
      toast({
        title: 'Missing project context',
        description: 'Unable to determine the active project. Please reload the page.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSaving(true);
      const persisted = await persistVariableDefinition({
        id: existing.id,
        name: editForm.name.trim(),
        formula: editForm.formula,
        value: editForm.value,
        description: editForm.description,
        usageSummary: editForm.usageSummary,
        originCardId: existing.originCardId,
        originVariableId: existing.originVariableId,
      });

      const resolvedFormula = persisted.formula ?? (editForm.formula.trim() || undefined);
      const resolvedValue = persisted.value ?? (editForm.value.trim() || undefined);
      const resolvedDescription = persisted.description ?? (editForm.description.trim() || undefined);
      const resolvedUsage = persisted.usageSummary ?? (editForm.usageSummary.trim() || undefined);

      onUpdateVariable(card.id, existing.id, {
        name: persisted.variableName ?? editForm.name.trim(),
        formula: resolvedFormula,
        value: resolvedValue,
        description: resolvedDescription,
        usageSummary: resolvedUsage,
        clientId: persisted.clientId ?? existing.clientId ?? projectContext.client_name,
        appId: persisted.appId ?? existing.appId ?? projectContext.app_name,
        projectId: persisted.projectId ?? existing.projectId ?? projectContext.project_name,
        updatedAt: persisted.updatedAt ?? new Date().toISOString(),
      });
      setEditingVariableId(null);
      toast({ title: 'Variable updated', description: `“${existing.name}” has been updated.` });
      void loadAvailableVariables();
    } catch (error) {
      if (isDuplicateNameError(error)) {
        const detail = extractErrorDetail(error);
        setEditNameError(detail ?? 'This variable name already exists in this project.');
      } else {
        toast({
          title: 'Failed to update variable',
          description: extractErrorDetail(error) ?? 'Unknown error',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleCurrent = (variable: CardVariable, appended: boolean) => {
    if (isSaving) return;
    onToggleVariable(card.id, variable.id, appended);
  };

  const handleToggleAvailable = (variable: AvailableVariable, appended: boolean) => {
    if (isSaving) return;
    const existing = currentVariables.find(current => {
      if (current.id === variable.id) return true;
      if (variable.originVariableId && current.originVariableId === variable.originVariableId) return true;
      return false;
    });

    if (existing) {
      onToggleVariable(card.id, existing.id, appended);
      return;
    }

    if (!appended) {
      return;
    }

    setPendingAppendVariable(variable);
    setAppendDialogOpen(true);
  };

  const confirmAppendVariable = async () => {
    if (!pendingAppendVariable) return;

    try {
      setIsSaving(true);
      const persisted = await persistVariableDefinition({
        name: pendingAppendVariable.name,
        formula: pendingAppendVariable.formula,
        value: pendingAppendVariable.value,
        description: pendingAppendVariable.description,
        usageSummary: pendingAppendVariable.usageSummary,
        originCardId: pendingAppendVariable.originCardId ?? pendingAppendVariable.cardId,
        originVariableId: pendingAppendVariable.originVariableId ?? pendingAppendVariable.id,
      });

      const resolvedFormula = persisted.formula ?? pendingAppendVariable.formula;
      const resolvedValue = persisted.value ?? pendingAppendVariable.value;
      const resolvedDescription = persisted.description ?? pendingAppendVariable.description;
      const resolvedUsage = persisted.usageSummary ?? pendingAppendVariable.usageSummary;

      const newVariable: CardVariable = {
        id: persisted.id ?? generateVariableId(),
        name: persisted.variableName ?? pendingAppendVariable.name,
        formula: resolvedFormula ?? undefined,
        value: resolvedValue ?? undefined,
        description: resolvedDescription ?? undefined,
        usageSummary: resolvedUsage ?? undefined,
        appended: true,
        originCardId: persisted.originCardId ?? pendingAppendVariable.originCardId ?? pendingAppendVariable.cardId,
        originVariableId: persisted.originVariableId ?? pendingAppendVariable.originVariableId ?? pendingAppendVariable.id,
        originAtomId: persisted.atomId ?? pendingAppendVariable.originAtomId,
        clientId: persisted.clientId ?? pendingAppendVariable.clientId,
        appId: persisted.appId ?? pendingAppendVariable.appId,
        projectId: persisted.projectId ?? pendingAppendVariable.projectId,
        createdAt: persisted.createdAt ?? new Date().toISOString(),
        updatedAt: persisted.updatedAt ?? new Date().toISOString(),
      };

      onAddVariable(card.id, newVariable);
      toast({ title: 'Variable appended', description: `“${newVariable.name}” is now available on this card.` });
      void loadAvailableVariables();
    } catch (error) {
      if (isDuplicateNameError(error) && pendingAppendVariable) {
        const fallbackVariable: CardVariable = {
          id: pendingAppendVariable.id ?? generateVariableId(),
          name: pendingAppendVariable.name,
          formula: pendingAppendVariable.formula ?? undefined,
          value: pendingAppendVariable.value ?? undefined,
          description: pendingAppendVariable.description ?? undefined,
          usageSummary: pendingAppendVariable.usageSummary ?? undefined,
          appended: true,
          originCardId: pendingAppendVariable.originCardId ?? pendingAppendVariable.cardId,
          originVariableId: pendingAppendVariable.originVariableId ?? pendingAppendVariable.id,
          originAtomId: pendingAppendVariable.originAtomId,
          clientId: pendingAppendVariable.clientId,
          appId: pendingAppendVariable.appId,
          projectId: pendingAppendVariable.projectId,
          createdAt: pendingAppendVariable.createdAt ?? new Date().toISOString(),
          updatedAt: pendingAppendVariable.updatedAt ?? new Date().toISOString(),
        };

        onAddVariable(card.id, fallbackVariable);
        toast({
          title: 'Variable appended',
          description: `“${fallbackVariable.name}” is now available on this card.`,
        });
      } else {
        toast({
          title: 'Failed to append variable',
          description: extractErrorDetail(error) ?? 'Unknown error',
          variant: 'destructive',
        });
      }
    } finally {
      setPendingAppendVariable(null);
      setAppendDialogOpen(false);
      setIsSaving(false);
    }
  };

  const cancelAppendVariable = () => {
    setPendingAppendVariable(null);
    setAppendDialogOpen(false);
  };

  const renderVariableRow = (variable: CardVariable) => {
    const isEditing = editingVariableId === variable.id;

    return (
      <div
        key={variable.id}
        className="border border-gray-200 rounded-lg px-3 py-2 flex flex-col gap-2 bg-white shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-1">
            {isEditing ? (
              <>
                <Input
                  value={editForm.name}
                  onChange={e => {
                    setEditNameError(null);
                    setEditForm(prev => ({ ...prev, name: e.target.value }));
                  }}
                  placeholder="Variable name"
                  className="text-sm"
                  autoFocus
                />
                {editNameError && <p className="text-xs text-red-500">{editNameError}</p>}
                <Input
                  value={editForm.formula}
                  onChange={e => setEditForm(prev => ({ ...prev, formula: e.target.value }))}
                  placeholder="Formula (optional)"
                  className="text-sm"
                />
                <Input
                  value={editForm.value}
                  onChange={e => setEditForm(prev => ({ ...prev, value: e.target.value }))}
                  placeholder="Value (optional)"
                  className="text-sm"
                />
                <Textarea
                  value={editForm.description}
                  onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Description (optional)"
                  className="text-xs"
                  rows={2}
                />
                <Textarea
                  value={editForm.usageSummary}
                  onChange={e => setEditForm(prev => ({ ...prev, usageSummary: e.target.value }))}
                  placeholder="Usage summary (optional)"
                  className="text-xs"
                  rows={2}
                />
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-900">{variable.name}</span>
                </div>
                {variable.formula && (
                  <div className="text-xs text-gray-600">Formula: {variable.formula}</div>
                )}
                <div className="text-xs text-gray-600">
                  Value: {variable.value ? variable.value : '—'}
                </div>
                {variable.description && (
                  <div className="text-xs text-gray-500">{variable.description}</div>
                )}
                {variable.usageSummary && (
                  <div className="text-xs text-gray-500">Usage: {variable.usageSummary}</div>
                )}
              </>
            )}
          </div>

          <div className="flex items-start gap-2">
            <Switch
              checked={variable.appended}
              onCheckedChange={checked => handleToggleCurrent(variable, checked)}
              disabled={isSaving}
            />
            {isEditing ? (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="secondary" onClick={handleEditSave} className="text-xs" disabled={isSaving}>
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingVariableId(null)}
                  className="text-xs"
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isSaving}>
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onSelect={() => handleEditStart(variable)} disabled={isSaving}>
                    <Pencil className="w-3 h-3 mr-2" /> Edit variable
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onDeleteVariable(card.id, variable.id)} disabled={isSaving}>
                    <Trash2 className="w-3 h-3 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderAvailableVariableRow = (variable: AvailableVariable) => {
    const current = currentVariables.find(existing => {
      if (existing.id === variable.id) return true;
      if (variable.originVariableId && existing.originVariableId === variable.originVariableId) return true;
      return false;
    });

    const isAppended = Boolean(current?.appended);

    return (
      <div
        key={`${variable.cardId}-${variable.id}`}
        className="border border-gray-200 rounded-lg px-3 py-2 flex flex-col gap-2 bg-white shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-gray-900">{variable.name}</span>
            </div>
            {variable.formula && <div className="text-xs text-gray-600">Formula: {variable.formula}</div>}
            <div className="text-xs text-gray-600">
              Value: {variable.value ? variable.value : '—'}
            </div>
            {variable.description && <div className="text-xs text-gray-500">{variable.description}</div>}
            {variable.usageSummary && <div className="text-xs text-gray-500">Usage: {variable.usageSummary}</div>}
          </div>

          <div className="flex items-start gap-2">
            <Switch
              checked={isAppended}
              onCheckedChange={checked => handleToggleAvailable(variable, checked)}
              disabled={isSaving || isLoadingVariables}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isSaving || isLoadingVariables}>
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => handleToggleAvailable(variable, true)} disabled={isSaving || isLoadingVariables}>
                  <Plus className="w-3 h-3 mr-2" /> Append to card
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (projectContext && !projectContext.project_name) {
      toast({
        title: 'Missing project context',
        description: 'Project information is incomplete. Some variable features may not work.',
        variant: 'destructive',
      });
    }
  }, [projectContext, toast]);

  useEffect(() => {
    setIsAdding(false);
    setEditingVariableId(null);
  }, [card.id]);

  useEffect(() => {
    if (card && tab === 'variables') {
      void loadAvailableVariables();
    }
  }, [card, tab, loadAvailableVariables]);

  return (
    <>
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="input" className="text-xs font-medium">
            <Upload className="w-3 h-3 mr-1" />
            Input
          </TabsTrigger>
          <TabsTrigger value="variables" className="text-xs">
            Variables
          </TabsTrigger>
          <TabsTrigger value="column-operations" className="text-xs">
            Column Ops
          </TabsTrigger>
        </TabsList>

        <div>
          <TabsContent value="input" className="space-y-4">
            <MetricsInputFiles cardId={card.id} />
          </TabsContent>

          <TabsContent value="variables" className="space-y-4">
            <VariableTab
              card={card}
              onAddVariable={onAddVariable}
              onUpdateVariable={onUpdateVariable}
              onDeleteVariable={onDeleteVariable}
              onToggleVariable={onToggleVariable}
            />
          </TabsContent>

          <TabsContent value="column-operations" className="flex flex-col h-full">
            <MetricsColOps />
          </TabsContent>
        </div>
      </Tabs>

      <ConfirmationDialog
        open={appendDialogOpen}
        onOpenChange={setAppendDialogOpen}
        onConfirm={confirmAppendVariable}
        onCancel={cancelAppendVariable}
        title="Append variable to this card?"
        description={
          pendingAppendVariable
            ? `“${pendingAppendVariable.name}” was created in ${pendingAppendVariable.cardTitle}. Turning on append will display it beneath this card.`
            : ''
        }
        icon={<Layers className="w-6 h-6 text-white" />}
        iconBgClass="bg-blue-500"
        confirmLabel="Append variable"
        cancelLabel="Cancel"
        confirmButtonClass="bg-blue-500 hover:bg-blue-600"
      />
    </>
  );
};

export default CardSettingsTabs;

