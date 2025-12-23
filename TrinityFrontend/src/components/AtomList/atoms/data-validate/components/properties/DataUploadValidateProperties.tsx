import React, { useState, useEffect, useRef } from "react";
import { Settings, Upload, Table, BarChart3, Minus, Plus, Pencil, Trash2, Wrench, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { VALIDATE_API, FEATURE_OVERVIEW_API } from "@/lib/api";
import { resolveTaskResponse } from "@/lib/taskQueue";
import { useToast } from "@/hooks/use-toast";
import {
  useLaboratoryStore,
  DataUploadSettings,
  createDefaultDataUploadSettings,
} from "@/components/LaboratoryMode/store/laboratoryStore";

interface Props {
  atomId: string;
}
const DataUploadValidateProperties: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore((state) => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(
    (state) => state.updateAtomSettings,
  );
  const { toast } = useToast();
  const settings: DataUploadSettings =
    (atom?.settings as DataUploadSettings) ||
    createDefaultDataUploadSettings();
  const [allAvailableFiles, setAllAvailableFiles] = useState<
    { name: string; source: string; original: string }[]
  >(
    settings.requiredFiles?.map((name) => ({
      name,
      source: "upload",
      original: settings.fileKeyMap?.[name] || name,
    })) || []
  );
  const [selectedMasterFile, setSelectedMasterFile] = useState<string>(
    settings.selectedMasterFile || ""
  );
  const [uploadedMasterFiles, setUploadedMasterFiles] = useState<File[]>([]);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");
  const [renameMap, setRenameMap] = useState<Record<string, string>>({});
  const [skipFetch, setSkipFetch] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [bypassMasterUpload, setBypassMasterUpload] = useState<boolean>(settings.bypassMasterUpload || false);
  const [enableColumnClassifier, setEnableColumnClassifier] = useState<boolean>(settings.enableColumnClassifier || false);
  const [validatorId, setValidatorId] = useState<string>(
    settings.validatorId || "",
  );
  
  // Column Classifier Dimension Management State
  const [showInput, setShowInput] = useState(false);
  const [newDim, setNewDim] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [columnDataTypes, setColumnDataTypes] = useState<
    Record<string, string>
  >({});
  const dataTypeOptions = [
    { value: "not_defined", label: "Not defined" },
    { value: "number", label: "Number" },
    { value: "string", label: "String" },
    { value: "date", label: "Date" },
  ];

  const mapBackendType = (typ: string): string => {
    const t = typ.toLowerCase();
    if (t === "integer" || t === "numeric" || t === "number") return "number";
    if (t.includes("date")) return "date";
    if (t === "string") return "string";
    return "not_defined";
  };

  interface RangeValidation {
    id: number;
    column: string;
    min: string;
    max: string;
  }

  const [rangeValidations, setRangeValidations] = useState<RangeValidation[]>([]);

  interface PeriodicityValidation {
    id: number;
    column: string;
    periodicity: string;
  }

  const [periodicityValidations, setPeriodicityValidations] = useState<
    PeriodicityValidation[]
  >([]);

  interface RegexValidation {
    id: number;
    column: string;
    pattern: string;
    sample: string;
  }

  const [regexValidations, setRegexValidations] = useState<RegexValidation[]>([]);

  interface NullValidation {
    id: number;
    column: string;
    threshold: string;
  }

  const [nullValidations, setNullValidations] = useState<NullValidation[]>([]);

  interface ReferentialValidation {
    id: number;
    column: string;
    values: string[];
  }

  const [referentialValidations, setReferentialValidations] = useState<
    ReferentialValidation[]
  >([]);

  const [numericalColumns, setNumericalColumns] = useState<string[]>([]);
  const [dateColumns, setDateColumns] = useState<string[]>([]);
  const [categoricalColumns, setCategoricalColumns] = useState<string[]>([]);
  const [continuousColumns, setContinuousColumns] = useState<string[]>([]);
  const [schemaSamples, setSchemaSamples] = useState<Record<string, any>>({});

  useEffect(() => {
    setBypassMasterUpload(settings.bypassMasterUpload || false);
  }, [settings.bypassMasterUpload]);

  useEffect(() => {
    setEnableColumnClassifier(settings.enableColumnClassifier || false);
  }, [settings.enableColumnClassifier]);

  // Load existing configuration if validator id already present
  useEffect(() => {
    if (!validatorId) {
      // If no validatorId but we have files in settings, use them
      if (settings.requiredFiles && settings.requiredFiles.length > 0) {
        setAllAvailableFiles(
          settings.requiredFiles.map((name) => ({
            name,
            source: "upload",
            original: settings.fileKeyMap?.[name] || name,
          }))
        );
      }
      return;
    }
    fetch(`${VALIDATE_API}/get_validator_config/${validatorId}`)
      .then((res) => res.json())
      .then((cfg) => {
        const files = cfg.file_keys || [];
        // Always preserve settings.requiredFiles (saved master files) even if backend returns different files
        const settingsFiles = settings.requiredFiles && settings.requiredFiles.length > 0
          ? settings.requiredFiles.map((name) => ({
              name,
              source: "upload",
              original: settings.fileKeyMap?.[name] || name,
            }))
          : [];
        
        if (files.length > 0 || settingsFiles.length > 0) {
          // Preserve existing allAvailableFiles and merge with fetched files
          // This ensures we don't lose data if the component re-renders
          setAllAvailableFiles((prev) => {
            // Create maps for quick lookup
            const prevMap = new Map(prev.map(f => [f.name, f]));
            
            // Start with all files from settings (saved master files) - these are the source of truth
            const resultMap = new Map<string, { name: string; source: string; original: string }>();
            
            // First, add all settings files (saved master files)
            settingsFiles.forEach(file => {
              resultMap.set(file.name, file);
            });
            
            // Then, add files from backend that aren't in settings
            files.forEach((f: string) => {
              if (!resultMap.has(f)) {
                // Prefer existing prev data if available
                const fromPrev = prevMap.get(f);
                if (fromPrev) {
                  resultMap.set(f, fromPrev as { name: string; source: string; original: string });
                } else {
                  resultMap.set(f, {
                    name: f,
                    source: "upload",
                    original: settings.fileKeyMap?.[f] || f,
                  });
                }
              }
            });
            
            // Convert map to array
            return Array.from(resultMap.values());
          });
          // Restore selectedMasterFile from settings, or use first file if not set
          const savedMasterFile = settings.selectedMasterFile;
          if (savedMasterFile && files.includes(savedMasterFile)) {
            setSelectedMasterFile(savedMasterFile);
          } else if (!selectedMasterFile || !files.includes(selectedMasterFile)) {
            setSelectedMasterFile(files[0]);
            // Save to settings
            updateSettings(atomId, { selectedMasterFile: files[0] });
          }
        } else {
          // If no files from backend but we have files in settings, keep them
          if (settings.requiredFiles && settings.requiredFiles.length > 0) {
            setAllAvailableFiles(
              settings.requiredFiles.map((name) => ({
                name,
                source: "upload",
                original: settings.fileKeyMap?.[name] || name,
              }))
            );
          }
        }

        setSchemaSamples(cfg.schemas || {});

        const parsedValidations: Record<string, any> = {};
        if (cfg.validations) {
          Object.entries(cfg.validations).forEach(([k, list]: any) => {
            const ranges = (list as any[])
              .filter((v) => v.validation_type === "range")
              .map((v) => ({
                id: Date.now() + Math.random(),
                column: v.column,
                min: v.min || "",
                max: v.max || "",
              }));
            const periodicities = (list as any[])
              .filter((v) => v.validation_type === "periodicity")
              .map((v) => ({
                id: Date.now() + Math.random(),
                column: v.column,
                periodicity: v.periodicity || "",
              }));
            parsedValidations[k] = {
              ranges,
              periodicities,
              regex: [],
              nulls: [],
              referentials: [],
            };
          });
        }

        updateSettings(atomId, {
          validatorId,
          requiredFiles: files,
          validations: parsedValidations,
          columnConfig: {
            ...(cfg.column_types || {}),
            ...(settings.columnConfig || {}),
          },
        });

        if (files.length > 0) {
          const firstKey = files[0];
          const schemaCols = cfg.schemas?.[firstKey]?.columns || [];
          const savedBackend = cfg.column_types?.[firstKey] || {};
          const savedLocal = (settings.columnConfig || {})[firstKey] || {};
          const merged: Record<string, string> = {};
          schemaCols.forEach((c: any) => {
            merged[c.column] = savedLocal[c.column]
              ? savedLocal[c.column]
              : savedBackend[c.column]
              ? mapBackendType(savedBackend[c.column])
              : "not_defined";
          });
          setColumnDataTypes(merged);
        }
      })
      .catch(() => {});
  }, [validatorId]); // Run when validatorId changes, not just once

  const periodicityOptions = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ];

  const handleMasterFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = "";

    const allFiles = [...uploadedMasterFiles, ...newFiles];
    setUploadedMasterFiles(allFiles);

    const id = `validator-${Date.now()}`;
    const form = new FormData();
    form.append("validator_atom_id", id);
    allFiles.forEach((f) => {
      const prefixed = `Master_${f.name}`;
      const fileForUpload = new File([f], prefixed, { type: f.type });
      form.append("files", fileForUpload);
    });
    const displayNames = allFiles.map((f) => f.name);
    const backendNames = allFiles.map((f) => `Master_${f.name}`);
    form.append("file_keys", JSON.stringify(backendNames));

    const res = await fetch(`${VALIDATE_API}/create_new`, {
      method: "POST",
      body: form,
    });
    if (res.ok) {
      setValidatorId(id);
      setAllAvailableFiles(
        backendNames.map((n) => ({ name: n, source: "upload", original: n }))
      );
      setSelectedMasterFile(backendNames[0]);
      // Save selectedMasterFile to settings
      updateSettings(atomId, { selectedMasterFile: backendNames[0] });
      const cfg = await fetch(
        `${VALIDATE_API}/get_validator_config/${id}`,
      ).then((r) => r.json());
      const defaultTypes: Record<string, string> = {};
      const firstKey = backendNames[0];
      if (cfg.schemas && cfg.schemas[firstKey]) {
        cfg.schemas[firstKey].columns.forEach((c: any) => {
          defaultTypes[c.column] = "not_defined";
        });
      }
      if (cfg.column_types && cfg.column_types[firstKey]) {
        Object.entries(cfg.column_types[firstKey]).forEach(([col, typ]) => {
          defaultTypes[col] = mapBackendType(typ as string);
        });
      }
      setColumnDataTypes(defaultTypes);
      updateSettings(atomId, {
        validatorId: id,
        columnConfig: {
          ...(settings.columnConfig || {}),
          [firstKey]: defaultTypes,
        },
        fileKeyMap: {
          ...(settings.fileKeyMap || {}),
          ...backendNames.reduce((acc, n) => ({ ...acc, [n]: n }), {}),
        },
      });
    }
  };

  const startRename = (name: string) => {
    setRenameTarget(name);
    setRenameValue(name);
  };

  const commitRename = (oldName: string) => {
    if (!renameValue.trim()) {
      setRenameTarget(null);
      return;
    }
    const newName = renameValue.trim();
    setAllAvailableFiles(prev =>
      prev.map(f => (f.name === oldName ? { ...f, name: newName } : f)),
    );
    const newFileKeyMap = { ...(settings.fileKeyMap || {}) } as Record<string, string>;
    const original = newFileKeyMap[oldName] || oldName;
    newFileKeyMap[newName] = original;
    delete newFileKeyMap[oldName];
    if (selectedMasterFile === oldName) {
      setSelectedMasterFile(newName);
      // Save updated selectedMasterFile to settings
      updateSettings(atomId, { selectedMasterFile: newName });
      setSkipFetch(true);
    }

    // immediately mirror rename in stored settings so selecting the file
    // still shows its configuration without requiring a refetch
    const newColumnCfg = { ...(settings.columnConfig || {}) } as Record<string, Record<string, string>>;
    if (newColumnCfg[oldName]) {
      newColumnCfg[newName] = newColumnCfg[oldName];
      delete newColumnCfg[oldName];
    }
    const newValidations = { ...(settings.validations || {}) } as Record<string, any>;
    if (newValidations[oldName]) {
      newValidations[newName] = newValidations[oldName];
      delete newValidations[oldName];
    }
    updateSettings(atomId, {
      columnConfig: newColumnCfg,
      validations: newValidations,
      fileKeyMap: newFileKeyMap,
    });

    setRenameMap(prev => ({ ...prev, [oldName]: newName }));
    setRenameTarget(null);
  };

  const deleteMasterFile = (name: string) => {
    setAllAvailableFiles(prev => prev.filter(f => f.name !== name));
    setUploadedMasterFiles(prev => prev.filter(f => f.name !== name));
    if (selectedMasterFile === name) {
      setSelectedMasterFile('');
      // Clear selectedMasterFile from settings when file is deleted
      updateSettings(atomId, { selectedMasterFile: '' });
    }
    const newMap = { ...(settings.fileKeyMap || {}) } as Record<string, string>;
    delete newMap[name];
    updateSettings(atomId, { fileKeyMap: newMap });
  };

  const handleBypassToggle = (val: boolean) => {
    setBypassMasterUpload(val);
    updateSettings(atomId, { bypassMasterUpload: val });
  };

  const handleColumnClassifierToggle = (val: boolean) => {
    setEnableColumnClassifier(val);
    updateSettings(atomId, { enableColumnClassifier: val });
  };

  const addDimension = () => {
    const dim = newDim.trim().toLowerCase();
    const currentDims = settings.classifierDimensions || [];
    const allCustomDims = settings.classifierCustomDimensionsList || [];
    
    // Allow up to 5 custom dimensions (in addition to unattributed, market, product)
    const maxCustomDimensions = 5;
    
    // Add to both selected dimensions and custom dimensions list
    if (dim && !allCustomDims.includes(dim) && allCustomDims.length < maxCustomDimensions) {
      updateSettings(atomId, {
        classifierDimensions: [...currentDims, dim],
        classifierCustomDimensionsList: [...allCustomDims, dim]
      });
    }
    setNewDim('');
    setShowInput(false);
  };

  const saveDimensions = async () => {
    const classifierData = settings.classifierData;
    if (!classifierData || classifierData.files.length === 0) {
      setError('Classify a dataframe first');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const dims = ['unattributed', ...(settings.classifierDimensions || []).filter(d => d !== 'unattributed')];
      updateSettings(atomId, {
        classifierEnableDimensionMapping: true,
        classifierDimensions: dims
      });
      
      if (classifierData.files.length) {
        const updatedFiles = classifierData.files.map(file => {
          const identifiers = file.columns
            .filter(c => c.category === 'identifiers')
            .map(c => c.name);
          const custom = dims.reduce((acc, d) => {
            acc[d] = d === 'unattributed' ? identifiers : [];
            return acc;
          }, {} as { [key: string]: string[] });
          return { ...file, customDimensions: custom };
        });
        updateSettings(atomId, {
          classifierData: { ...classifierData, files: updatedFiles }
        });
      }
      toast({ title: 'Dimensions Saved Successfully' });
    } catch (e: any) {
      setError(e.message);
      toast({ title: 'Unable to Save Dimensions', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDataTypeChange = (column: string, value: string) => {
    const updatedColumnDataTypes = { ...columnDataTypes, [column]: value };
    setColumnDataTypes(updatedColumnDataTypes);
    // Immediately save to settings so changes persist when switching master files
    if (selectedMasterFile) {
      updateSettings(atomId, {
        columnConfig: {
          ...(settings.columnConfig || {}),
          [selectedMasterFile]: updatedColumnDataTypes,
        },
      });
    }
  };

  useEffect(() => {
    if (!validatorId || !selectedMasterFile) return;
    if (skipFetch) { setSkipFetch(false); return; }
    fetch(`${VALIDATE_API}/get_validator_config/${validatorId}`)
      .then((res) => res.json())
      .then((cfg) => {
        const savedLocal =
          (settings.columnConfig || {})[selectedMasterFile] || {};
        const savedBackend = cfg.column_types?.[selectedMasterFile] || {};
        const schemaCols = cfg.schemas?.[selectedMasterFile]?.columns || [];

        if (schemaCols.length === 0 && Object.keys(savedLocal).length > 0) {
          setColumnDataTypes(savedLocal);
          updateSettings(atomId, {
            columnConfig: {
              ...(settings.columnConfig || {}),
              [selectedMasterFile]: savedLocal,
            },
          });
        } else {
          const merged: Record<string, string> = {};
          schemaCols.forEach((c: any) => {
            merged[c.column] = savedLocal[c.column]
              ? savedLocal[c.column]
              : savedBackend[c.column]
              ? mapBackendType(savedBackend[c.column])
              : "not_defined";
          });
          setColumnDataTypes(merged);
          updateSettings(atomId, {
            columnConfig: {
              ...(settings.columnConfig || {}),
              [selectedMasterFile]: merged,
            },
          });
        }

        if (cfg.validations?.[selectedMasterFile]) {
          const list = cfg.validations[selectedMasterFile] as any[];
          const ranges = list
            .filter((v) => v.validation_type === "range")
            .map((v) => ({
              id: Date.now() + Math.random(),
              column: v.column,
              min: v.min || "",
              max: v.max || "",
            }));
          const periodicities = list
            .filter((v) => v.validation_type === "periodicity")
            .map((v) => ({
              id: Date.now() + Math.random(),
              column: v.column,
              periodicity: v.periodicity || "",
            }));
          updateSettings(atomId, {
            validations: {
              ...(settings.validations || {}),
              [selectedMasterFile]: {
                ranges,
                periodicities,
                regex: [],
                nulls: [],
                referentials: [],
              },
            },
          });
        }
        setSchemaSamples((prev) => ({ ...prev, [selectedMasterFile]: cfg.schemas?.[selectedMasterFile] || {} }));
      })
      .catch(() => {
        const savedLocal =
          (settings.columnConfig || {})[selectedMasterFile] || {};
        setColumnDataTypes(savedLocal);
      });
  }, [validatorId, selectedMasterFile]);

  useEffect(() => {
    const nums = Object.entries(columnDataTypes)
      .filter(([, t]) => t === "number")
      .map(([c]) => c);
    const dates = Object.entries(columnDataTypes)
      .filter(([, t]) => t === "date")
      .map(([c]) => c);
    const cats = Object.entries(columnDataTypes)
      .filter(([, t]) => !["number", "date"].includes(t))
      .map(([c]) => c);
    setNumericalColumns(nums);
    setDateColumns(dates);
    setContinuousColumns(nums);
    setCategoricalColumns(cats);
  }, [columnDataTypes]);

  useEffect(() => {
    if (selectedMasterFile && settings.columnConfig?.[selectedMasterFile]) {
      setColumnDataTypes(settings.columnConfig[selectedMasterFile]);
    } else {
      setColumnDataTypes({});
    }

    if (selectedMasterFile && settings.validations?.[selectedMasterFile]) {
      const val = settings.validations[selectedMasterFile];
      setRangeValidations(val.ranges?.length ? val.ranges : []);
      setPeriodicityValidations(
        val.periodicities?.length ? val.periodicities : [],
      );
      setRegexValidations(val.regex?.length ? val.regex : []);
      setNullValidations(val.nulls?.length ? val.nulls : []);
      setReferentialValidations(
        val.referentials?.length ? val.referentials : [],
      );
    } else {
      setRangeValidations([]);
      setPeriodicityValidations([]);
      setRegexValidations([]);
      setNullValidations([]);
      setReferentialValidations([]);
    }

  }, [selectedMasterFile, settings.columnConfig, settings.validations]);

  const addRangeValidation = () => {
    setRangeValidations((prev) => [
      ...prev,
      { id: Date.now(), column: "", min: "", max: "" },
    ]);
  };

  const removeRangeValidation = (id: number) => {
    setRangeValidations((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRangeValidation = (
    id: number,
    key: "column" | "min" | "max",
    value: string,
  ) => {
    setRangeValidations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)),
    );
  };

  const addPeriodicityValidation = () => {
    setPeriodicityValidations((prev) => [
      ...prev,
      { id: Date.now(), column: "", periodicity: "" },
    ]);
  };

  const removePeriodicityValidation = (id: number) => {
    setPeriodicityValidations((prev) => prev.filter((p) => p.id !== id));
  };

  const updatePeriodicityValidation = (
    id: number,
    key: "column" | "periodicity",
    value: string,
  ) => {
    setPeriodicityValidations((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [key]: value } : p)),
    );
  };

  const addRegexValidation = () => {
    setRegexValidations((prev) => [
      ...prev,
      { id: Date.now(), column: "", pattern: "", sample: "" },
    ]);
  };

  const removeRegexValidation = (id: number) => {
    setRegexValidations((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRegexValidation = (
    id: number,
    key: "column" | "pattern" | "sample",
    value: string,
  ) => {
    setRegexValidations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)),
    );
  };

  const addNullValidation = () => {
    setNullValidations((prev) => [
      ...prev,
      { id: Date.now(), column: "", threshold: "" },
    ]);
  };

  const removeNullValidation = (id: number) => {
    setNullValidations((prev) => prev.filter((n) => n.id !== id));
  };

  const updateNullValidation = (
    id: number,
    key: "column" | "threshold",
    value: string,
  ) => {
    setNullValidations((prev) =>
      prev.map((n) => (n.id === id ? { ...n, [key]: value } : n)),
    );
  };

  const addReferentialValidation = () => {
    setReferentialValidations((prev) => [
      ...prev,
      { id: Date.now(), column: "", values: [] },
    ]);
  };

  const removeReferentialValidation = (id: number) => {
    setReferentialValidations((prev) => prev.filter((r) => r.id !== id));
  };

  const fetchColumnUniqueValues = async (column: string): Promise<string[]> => {
    if (!validatorId || !selectedMasterFile) return [];
    const backendKey = settings.fileKeyMap?.[selectedMasterFile] || selectedMasterFile;
    try {
      const ticketRes = await fetch(`${VALIDATE_API}/latest_ticket/${backendKey}`);
      if (!ticketRes.ok) return [];
      const ticket = await ticketRes.json();
      const arrow = ticket.arrow_name;
      if (!arrow) return [];
      const sumRes = await fetch(
        `${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(arrow)}`,
      );
      if (!sumRes.ok) return [];
      const raw = await sumRes.json();
      const data = await resolveTaskResponse<{ summary?: any[] }>(raw);
      const info = (data.summary || []).find((c: any) => c.column === column);
      return Array.isArray(info?.unique_values)
        ? info.unique_values.map((v: any) => String(v))
        : [];
    } catch {
      return [];
    }
  };

  const updateReferentialValidation = async (
    id: number,
    key: "column" | "values",
    value: any,
  ) => {
    if (key === "column") {
      const uniq = await fetchColumnUniqueValues(value);
      setReferentialValidations((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, column: value, values: uniq.length ? uniq : [""] }
            : r,
        ),
      );
    } else {
      setReferentialValidations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)),
      );
    }
  };

  const addRefValue = (id: number) => {
    setReferentialValidations((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, values: [...r.values, ""] } : r,
      ),
    );
  };

  const updateRefValue = (id: number, idx: number, value: string) => {
    setReferentialValidations((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, values: r.values.map((v, i) => (i === idx ? value : v)) }
          : r,
      ),
    );
  };

  const removeRefValue = (id: number, idx: number) => {
    setReferentialValidations((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, values: r.values.filter((_, i) => i !== idx) }
          : r,
      ),
    );
  };

  const handleSaveConfiguration = async () => {
    if (!validatorId || !selectedMasterFile) return;

    const definedTypes: Record<string, string> = {};
    Object.entries(columnDataTypes).forEach(([col, typ]) => {
      if (typ && typ !== "not_defined") definedTypes[col] = typ;
    });
    const typeForm = new FormData();
    typeForm.append("validator_atom_id", validatorId);
    const backendKey = settings.fileKeyMap?.[selectedMasterFile] || selectedMasterFile;
    typeForm.append("file_key", backendKey);
    typeForm.append("column_types", JSON.stringify(definedTypes));
    try {
      const res1 = await fetch(`${VALIDATE_API}/update_column_types`, {
        method: "POST",
        body: typeForm,
      });

    const columnConditions: Record<string, any[]> = {};
    rangeValidations.forEach((r) => {
      if (!r.column) return;
      const conds: any[] = columnConditions[r.column] || [];
      if (r.min !== "") {
        conds.push({
          operator: "greater_than_or_equal",
          value: r.min,
          error_message: "min check",
        });
      }
      if (r.max !== "") {
        conds.push({
          operator: "less_than_or_equal",
          value: r.max,
          error_message: "max check",
        });
      }
      if (conds.length > 0) columnConditions[r.column] = conds;
    });

    const columnFrequencies: Record<string, string> = {};
    periodicityValidations.forEach((p) => {
      if (p.column && p.periodicity)
        columnFrequencies[p.column] = p.periodicity;
    });

    regexValidations.forEach((r) => {
      if (!r.column || !r.pattern) return;
      const conds: any[] = columnConditions[r.column] || [];
      conds.push({
        operator: "regex_match",
        value: r.pattern,
        error_message: "regex check",
      });
      columnConditions[r.column] = conds;
    });

    nullValidations.forEach((n) => {
      if (!n.column || !n.threshold) return;
      const conds: any[] = columnConditions[n.column] || [];
      conds.push({
        operator: "null_percentage",
        value: n.threshold,
        error_message: "null threshold",
      });
      columnConditions[n.column] = conds;
    });

    referentialValidations.forEach((r) => {
      if (!r.column || r.values.length === 0) return;
      const allowed = r.values.filter((v) => v !== "");
      if (allowed.length === 0) return;
      const conds: any[] = columnConditions[r.column] || [];
      conds.push({
        operator: "in_list",
        value: allowed,
        error_message: "referential check",
      });
      columnConditions[r.column] = conds;
    });

      const res2 = await fetch(`${VALIDATE_API}/configure_validation_config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          validator_atom_id: validatorId,
          file_key: backendKey,
          column_conditions: columnConditions,
          column_frequencies: columnFrequencies,
        }),
      });

    const res3 = { ok: true };

    const savedRanges = rangeValidations.filter(
      (r) => r.column && (r.min !== "" || r.max !== ""),
    );
    const savedPeriods = periodicityValidations.filter(
      (p) => p.column && p.periodicity,
    );
    const savedRegex = regexValidations.filter(
      (r) => r.column && r.pattern,
    );
    const savedNulls = nullValidations.filter(
      (n) => n.column && n.threshold !== "",
    );
    const savedRefs = referentialValidations.filter(
      (r) => r.column && r.values.some((v) => v !== ""),
    );
    let renamedValidations = { ...(settings.validations || {}) } as Record<string, any>;
    let renamedColumns = { ...(settings.columnConfig || {}) } as Record<string, Record<string,string>>;
    Object.entries(renameMap).forEach(([oldName, newName]) => {
      if (renamedValidations[oldName]) {
        renamedValidations[newName] = renamedValidations[oldName];
        delete renamedValidations[oldName];
      }
      if (renamedColumns[oldName]) {
        renamedColumns[newName] = renamedColumns[oldName];
        delete renamedColumns[oldName];
      }
    });
    // Only update the currently selected master file's configuration
    // Preserve all other master files' configurations
    renamedValidations = {
      ...renamedValidations,
      [selectedMasterFile]: {
        ranges: savedRanges,
        periodicities: savedPeriods,
        regex: savedRegex,
        nulls: savedNulls,
        referentials: savedRefs,
      },
    };
    renamedColumns = {
      ...renamedColumns,
      [selectedMasterFile]: columnDataTypes,
    };
    
    // Only clean up entries for files that no longer exist in allAvailableFiles
    // This ensures we don't accidentally remove other master files' data
    const finalFiles = allAvailableFiles.map(f => f.name);
    Object.keys(renamedValidations).forEach(k => { 
      if (!finalFiles.includes(k) && k !== selectedMasterFile) {
        delete renamedValidations[k];
      }
    });
    Object.keys(renamedColumns).forEach(k => { 
      if (!finalFiles.includes(k) && k !== selectedMasterFile) {
        delete renamedColumns[k];
      }
    });

    // Only include master files that have saved configurations
    // This ensures only configured master files appear in the canvas
    const savedMasterFiles = Object.keys(renamedValidations).filter(
      (fileName) => renamedValidations[fileName] && 
      (renamedValidations[fileName].ranges?.length > 0 ||
       renamedValidations[fileName].periodicities?.length > 0 ||
       renamedValidations[fileName].regex?.length > 0 ||
       renamedValidations[fileName].nulls?.length > 0 ||
       renamedValidations[fileName].referentials?.length > 0 ||
       (renamedColumns[fileName] && Object.keys(renamedColumns[fileName]).length > 0))
    );
    
    // Also include the currently selected master file if it has column types defined
    if (selectedMasterFile && columnDataTypes && Object.keys(columnDataTypes).length > 0) {
      if (!savedMasterFiles.includes(selectedMasterFile)) {
        savedMasterFiles.push(selectedMasterFile);
      }
    }
    
    // Build fileKeyMap only for saved master files
    const newKeyMap = savedMasterFiles.reduce<Record<string, string>>(
      (acc, fileName) => {
        const fileInfo = allAvailableFiles.find(f => f.name === fileName);
        if (fileInfo) {
          acc[fileName] = fileInfo.original;
        }
        return acc;
      },
      {}
    );
    
    updateSettings(atomId, {
      validatorId,
      requiredFiles: savedMasterFiles, // Only include master files with saved configurations
      validations: renamedValidations,
      columnConfig: renamedColumns,
      fileKeyMap: newKeyMap,
    });
    setRenameMap({});

      if (res1.ok && res2.ok && res3.ok) {
        toast({ title: "Validation Configuration Saved Successfully" });
      } else {
        toast({
          title: "Unable to Save Validation Configuration",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Unable to Save Validation Configuration",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="w-80 h-full bg-white border-l border-gray-200 flex flex-col">
      <div className="p-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
          <Settings className="w-4 h-4" />
          <span>Data Upload and Validate</span>
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between hidden">
          <span className="text-sm font-medium text-gray-700">Enable validation steps</span>
          <Switch
            checked={bypassMasterUpload}
            onCheckedChange={handleBypassToggle}
            className="data-[state=checked]:bg-[#458EE2]"
          />
        </div>
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between hidden">
          <span className="text-sm font-medium text-gray-700">Enable column classifier</span>
          <Switch
            checked={enableColumnClassifier}
            onCheckedChange={handleColumnClassifierToggle}
            className="data-[state=checked]:bg-[#458EE2]"
          />
        </div>

        {/* Column Classifier Dimension Settings - Only show when classifier is enabled */}
        {enableColumnClassifier && settings.classifierData && settings.classifierData.files.length > 0 && (
          <div className="p-4 border-b border-gray-200 bg-blue-50">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Business Dimensions
                </label>
                <div className="space-y-2">
                  <div className="mb-1">
                    <div className="flex items-center space-x-2">
                      <Checkbox checked={true} disabled={true} />
                      <label className="text-sm text-gray-700">Unattributed</label>
                    </div>
                  </div>
                  
                  {/* Market option */}
                  <div className="mb-1">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        checked={(settings.classifierDimensions || []).includes('market')}
                        onCheckedChange={(checked) => {
                          const currentDims = settings.classifierDimensions || [];
                          if (checked) {
                            updateSettings(atomId, { classifierDimensions: [...currentDims, 'market'] });
                          } else {
                            updateSettings(atomId, { classifierDimensions: currentDims.filter(d => d !== 'market') });
                          }
                        }}
                      />
                      <label className="text-sm text-gray-700">Market</label>
                    </div>
                  </div>
                  
                  {/* Product option */}
                  <div className="mb-1">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        checked={(settings.classifierDimensions || []).includes('product')}
                        onCheckedChange={(checked) => {
                          const currentDims = settings.classifierDimensions || [];
                          if (checked) {
                            updateSettings(atomId, { classifierDimensions: [...currentDims, 'product'] });
                          } else {
                            updateSettings(atomId, { classifierDimensions: currentDims.filter(d => d !== 'product') });
                          }
                        }}
                      />
                      <label className="text-sm text-gray-700">Product</label>
                    </div>
                  </div>
                  
                  {/* Custom dimensions */}
                  {(settings.classifierCustomDimensionsList || []).map(dim => (
                    <div key={dim} className="mb-1">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          checked={(settings.classifierDimensions || []).includes(dim)}
                          onCheckedChange={(checked) => {
                            const currentDims = settings.classifierDimensions || [];
                            if (checked) {
                              updateSettings(atomId, { classifierDimensions: [...currentDims, dim] });
                            } else {
                              updateSettings(atomId, { classifierDimensions: currentDims.filter(d => d !== dim) });
                            }
                          }}
                        />
                        <label className="text-sm text-gray-700">{dim}</label>
                      </div>
                    </div>
                  ))}
                  {(settings.classifierCustomDimensionsList?.length || 0) < 5 && !showInput && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowInput(true)}
                      className="flex items-center mt-2"
                    >
                      <Plus className="w-4 h-4 mr-1" /> Add Dimension
                    </Button>
                  )}
                  {showInput && (
                    <div className="flex items-center space-x-2 mt-2">
                      <Input
                        value={newDim}
                        onChange={e => setNewDim(e.target.value)}
                        placeholder="Dimension name"
                        className="h-8 text-xs"
                      />
                      <Button size="sm" onClick={addDimension}>
                        Add
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              {error && <p className="text-red-500 text-xs">{error}</p>}
              <Button
                onClick={saveDimensions}
                disabled={loading || (settings.classifierDimensions?.filter(d => d !== 'unattributed').length || 0) === 0}
                className="w-full h-8 text-xs"
              >
                {loading ? 'Saving...' : 'Save Dimensions'}
              </Button>
            </div>
          </div>
        )}

        {/* Master File Upload Section - Only show when toggle is enabled */}
        {bypassMasterUpload && (
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Upload Master File
                </label>
                <input
                  type="file"
                  multiple
                  accept=".csv,.xls,.xlsx"
                  onChange={handleMasterFileSelect}
                  className="hidden"
                  id="master-file-upload"
                  ref={fileInputRef}
                />
                <label htmlFor="master-file-upload">
                  <Button
                    asChild
                    variant="outline"
                    className="w-full cursor-pointer border-gray-300"
                  >
                    <span className="flex items-center justify-center space-x-2">
                      <Upload className="w-4 h-4" />
                      <span>Choose Files</span>
                    </span>
                  </Button>
                </label>
              </div>

              {allAvailableFiles.length > 0 && (
                <div className="space-y-2">
                  {allAvailableFiles.map(file => (
                    <div key={file.name} className="flex items-center justify-between">
                      {renameTarget === file.name ? (
                        <Input
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={() => commitRename(file.name)}
                          className="h-7 text-xs flex-1 mr-2"
                        />
                      ) : (
                        <span className="text-sm truncate flex-1 max-w-[140px]" title={file.name}>{file.name}</span>
                      )}
                      <div className="flex items-center space-x-1 ml-2">
                        <Pencil className="w-4 h-4 text-gray-400 cursor-pointer" onClick={() => startRename(file.name)} />
                        <Trash2 className="w-4 h-4 text-gray-400 cursor-pointer" onClick={() => deleteMasterFile(file.name)} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Select Master File
                </label>
                <Select
                  value={selectedMasterFile}
                  onValueChange={(value) => {
                    // Save current master file's column data types before switching
                    if (selectedMasterFile && Object.keys(columnDataTypes).length > 0) {
                      updateSettings(atomId, {
                        columnConfig: {
                          ...(settings.columnConfig || {}),
                          [selectedMasterFile]: columnDataTypes,
                        },
                        selectedMasterFile: value,
                      });
                    } else {
                      updateSettings(atomId, { selectedMasterFile: value });
                    }
                    setSelectedMasterFile(value);

                    // Record the current dataframe selection for this atom in the laboratory store.
                    // Map the logical master file name to its underlying object_name using allAvailableFiles.
                    try {
                      const { setAtomCurrentDataframe } = useLaboratoryStore.getState();
                      const meta = allAvailableFiles.find(f => f.name === value);
                      const objectName = meta?.original || value;
                      const normalized = objectName.endsWith('.arrow') ? objectName : `${objectName}.arrow`;
                      setAtomCurrentDataframe(atomId, normalized);
                    } catch {
                      // best-effort; do not block data-validate on metrics sync
                    }
                  }}
                >
                  <SelectTrigger className="bg-white border-gray-300">
                    <SelectValue placeholder="Select a master file..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allAvailableFiles.length === 0 ? (
                      <SelectItem value="no-files" disabled>
                        No files available
                      </SelectItem>
                    ) : (
                      allAvailableFiles.map((file, index) => (
                        <SelectItem
                          key={`${file.source}-${index}`}
                          value={file.name}
                        >
                          {file.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* Tabs Section - Only active when master file is selected and use master file is enabled */}
        {bypassMasterUpload && selectedMasterFile && selectedMasterFile !== "no-files" && (
          <Tabs defaultValue="datatype" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mx-4 my-4">
              <TabsTrigger value="datatype" className="text-xs">
                <Table className="w-3 h-3 mr-1" />
                DataType
              </TabsTrigger>
              <TabsTrigger value="value" className="text-xs">
                <BarChart3 className="w-3 h-3 mr-1" />
                Value
              </TabsTrigger>
              <TabsTrigger value="advanced" className="text-xs">
                <Wrench className="w-3 h-3 mr-1" />
                Advanced
              </TabsTrigger>
            </TabsList>

            <div className="px-4">
              <TabsContent value="datatype" className="space-y-4">
                <div className="pt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">
                    Column Data Types
                  </h4>
                  <div className="space-y-3">
                    {Object.entries(columnDataTypes).map(
                      ([columnName, dataType]) => (
                        <div
                          key={columnName}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">
                              {columnName}
                            </p>
                            <p className="text-xs text-gray-600">Data Type</p>
                          </div>
                          <Select
                            value={dataType}
                            onValueChange={(value) =>
                              handleDataTypeChange(columnName, value)
                            }
                          >
                            <SelectTrigger className="w-20 h-8 text-xs bg-white border-gray-300">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {dataTypeOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="value" className="space-y-4">
                <div className="pt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-4">
                    Value Settings
                  </h4>

                  {/* Range Validation Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-medium text-gray-700">
                        Range Validation
                      </h5>
                      <Button
                        onClick={addRangeValidation}
                        size="sm"
                        variant="outline"
                        className="h-7 px-2"
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>

                    {rangeValidations.map((range) => (
                      <div
                        key={range.id}
                        className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-gray-700">
                            Column
                          </label>
                          <Button
                            onClick={() => removeRangeValidation(range.id)}
                            size="sm"
                            variant="outline"
                            className="h-6 px-2"
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                        </div>
                        <Select
                          value={range.column}
                          onValueChange={(value) =>
                            updateRangeValidation(range.id, "column", value)
                          }
                        >
                          <SelectTrigger className="bg-white border-gray-300 h-8 text-xs">
                            <SelectValue placeholder="Select numerical column..." />
                          </SelectTrigger>
                          <SelectContent>
                            {numericalColumns.map((column) => (
                              <SelectItem key={column} value={column}>
                                {column}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs font-medium text-gray-700 block mb-1">
                              Min
                            </label>
                            <Input
                              placeholder="Min value"
                              value={range.min}
                              onChange={(e) =>
                                updateRangeValidation(
                                  range.id,
                                  "min",
                                  e.target.value,
                                )
                              }
                              className="bg-white border-gray-300 h-8 text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-700 block mb-1">
                              Max
                            </label>
                            <Input
                              placeholder="Max value"
                              value={range.max}
                              onChange={(e) =>
                                updateRangeValidation(
                                  range.id,
                                  "max",
                                  e.target.value,
                                )
                              }
                              className="bg-white border-gray-300 h-8 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Periodicity Validation Section */}
                  <div className="space-y-4 mt-6">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-medium text-gray-700">
                        Periodicity Validation
                      </h5>
                      <Button
                        onClick={addPeriodicityValidation}
                        size="sm"
                        variant="outline"
                        className="h-7 px-2"
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>

                    {periodicityValidations.map((periodicity) => (
                      <div
                        key={periodicity.id}
                        className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-gray-700">
                            Date Column
                          </label>
                          <Button
                            onClick={() =>
                              removePeriodicityValidation(periodicity.id)
                            }
                            size="sm"
                            variant="outline"
                            className="h-6 px-2"
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                        </div>
                        <Select
                          value={periodicity.column}
                          onValueChange={(value) =>
                            updatePeriodicityValidation(
                              periodicity.id,
                              "column",
                              value,
                            )
                          }
                        >
                          <SelectTrigger className="bg-white border-gray-300 h-8 text-xs">
                            <SelectValue placeholder="Select date column..." />
                          </SelectTrigger>
                          <SelectContent>
                            {dateColumns.map((column) => (
                              <SelectItem key={column} value={column}>
                                {column}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div>
                          <label className="text-xs font-medium text-gray-700 block mb-1">
                            Periodicity
                          </label>
                          <Select
                            value={periodicity.periodicity}
                            onValueChange={(value) =>
                              updatePeriodicityValidation(
                                periodicity.id,
                                "periodicity",
                                value,
                              )
                            }
                          >
                            <SelectTrigger className="bg-white border-gray-300 h-8 text-xs">
                              <SelectValue placeholder="Select periodicity..." />
                            </SelectTrigger>
                            <SelectContent>
                              {periodicityOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-4">
                <div className="pt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-4">
                    Advanced Checks
                  </h4>

                  {/* Regex Validation */}
                  <div className="space-y-4">
                  <div className="flex items-center justify-between">
                      <h5 className="text-sm font-medium text-gray-700">
                        Regex Check
                      </h5>
                      <Button onClick={addRegexValidation} size="sm" variant="outline" className="h-7 px-2">
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <p className="text-[10px] text-gray-500">
                      Quick Examples:<br />Email: ^[\w\.-]+@[\w\.-]+\.\w{2,5}$<br />Phone (US): ^\d{3}[-.]?\d{3}[-.]?\d{4}$<br />Product Code: ^[A-Z]{3}-\d{4}$<br />Date YYYY-MM-DD: ^\d{4}-\d{2}-\d{2}$
                    </p>
                    {regexValidations.map((rv) => {
                      const match = (() => {
                        try {
                          return new RegExp(rv.pattern).test(rv.sample);
                        } catch {
                          return false;
                        }
                      })();
                      const sampleVals = ["ABC-1234", "XYZ-0000", "foo"];
                      const matches = sampleVals.filter((v) => {
                        try {
                          return new RegExp(rv.pattern).test(v);
                        } catch {
                          return false;
                        }
                      });
                      const fails = sampleVals.filter((v) => {
                        try {
                          return !new RegExp(rv.pattern).test(v);
                        } catch {
                          return false;
                        }
                      });
                      return (
                        <div key={rv.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-gray-700">Column</label>
                            <Button onClick={() => removeRegexValidation(rv.id)} size="sm" variant="outline" className="h-6 px-2">
                              <Minus className="w-3 h-3" />
                            </Button>
                          </div>
                          <Select value={rv.column} onValueChange={(v) => updateRegexValidation(rv.id, 'column', v)}>
                            <SelectTrigger className="bg-white border-gray-300 h-8 text-xs">
                              <SelectValue placeholder="Select column..." />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.keys(columnDataTypes).map((c) => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="relative">
                            <Input
                              value={rv.pattern}
                              onChange={(e) => updateRegexValidation(rv.id, 'pattern', e.target.value)}
                              placeholder="^ABC-\\d{4}$"
                              className="bg-white border-gray-300 h-8 text-xs pr-8"
                            />
                            <Tooltip>
                              <TooltipTrigger type="button" className="absolute right-2 top-1">
                                <Info className="w-3 h-3 text-gray-500" />
                              </TooltipTrigger>
                              <TooltipContent className="text-xs max-w-xs">
                                Enter a full-match regex (use ^...$ anchors).
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <Input value={rv.sample} onChange={(e) => updateRegexValidation(rv.id, 'sample', e.target.value)} placeholder="Sample value" className="bg-white border-gray-300 h-8 text-xs" />
                          <div className="text-[10px] text-gray-500">
                            Matches: {matches.join(', ') || 'none'} | Fails: {fails.join(', ') || 'none'}
                          </div>
                          {rv.sample && rv.pattern && (
                            <Badge variant={match ? 'default' : 'secondary'} className="w-fit text-xs">
                              {match ? 'Match' : 'No Match'}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Null Percentage */}
                  <div className="space-y-4 mt-6">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-medium text-gray-700">
                        Percentage of Null Values
                      </h5>
                      <Button onClick={addNullValidation} size="sm" variant="outline" className="h-7 px-2">
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    {nullValidations.map((nv) => (
                      <div key={nv.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-gray-700">Column</label>
                          <Button onClick={() => removeNullValidation(nv.id)} size="sm" variant="outline" className="h-6 px-2">
                            <Minus className="w-3 h-3" />
                          </Button>
                        </div>
                        <Select value={nv.column} onValueChange={(v) => updateNullValidation(nv.id, 'column', v)}>
                          <SelectTrigger className="bg-white border-gray-300 h-8 text-xs">
                            <SelectValue placeholder="Select column..." />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.keys(columnDataTypes).map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input type="number" min="0" max="100" value={nv.threshold} onChange={(e) => updateNullValidation(nv.id, 'threshold', e.target.value)} placeholder="Threshold %" className="bg-white border-gray-300 h-8 text-xs" />
                      </div>
                    ))}
                  </div>

                  {/* Referential Integrity */}
                  <div className="space-y-4 mt-6">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-medium text-gray-700">Referential Integrity</h5>
                      <Button onClick={addReferentialValidation} size="sm" variant="outline" className="h-7 px-2">
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    {referentialValidations.map((rv) => (
                      <div key={rv.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-gray-700">Column</label>
                          <Button onClick={() => removeReferentialValidation(rv.id)} size="sm" variant="outline" className="h-6 px-2">
                            <Minus className="w-3 h-3" />
                          </Button>
                        </div>
                        <Select value={rv.column} onValueChange={(v) => updateReferentialValidation(rv.id, 'column', v)}>
                          <SelectTrigger className="bg-white border-gray-300 h-8 text-xs">
                            <SelectValue placeholder="Select column..." />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.keys(columnDataTypes).map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {rv.values.map((val, idx) => (
                          <div key={idx} className="flex items-center space-x-2">
                            <Input value={val} onChange={(e) => updateRefValue(rv.id, idx, e.target.value)} placeholder="Allowed value" className="bg-white border-gray-300 h-8 text-xs" />
                            <Button onClick={() => removeRefValue(rv.id, idx)} size="sm" variant="outline" className="h-6 px-2">
                              <Minus className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                        <Button onClick={() => addRefValue(rv.id)} size="sm" variant="outline" className="h-6 px-2">
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            </div>

            <div className="p-4 border-t border-gray-200 mt-4">
              <Button
                onClick={handleSaveConfiguration}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg"
              >
                Save Configuration
              </Button>
            </div>
          </Tabs>
        )}

        {/* Message when no master file is selected or master file mode is disabled */}
        {(!bypassMasterUpload || !selectedMasterFile || selectedMasterFile === "no-files") && (
          <div className="p-8 text-center text-gray-500">
            <Table className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-sm">
              {!bypassMasterUpload 
                ? "Enable 'Validation' to configure data types and settings"
                : "Select a master file to configure data types and settings"
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataUploadValidateProperties;
