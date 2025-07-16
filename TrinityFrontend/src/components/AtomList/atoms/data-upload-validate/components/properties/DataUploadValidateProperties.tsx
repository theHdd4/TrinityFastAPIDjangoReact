import React, { useState, useEffect } from "react";
import { Settings, Upload, Table, BarChart3, Minus, Plus, Pencil, Trash2 } from "lucide-react";
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
import { VALIDATE_API } from "@/lib/api";
import {
  useLaboratoryStore,
  DataUploadSettings,
  DEFAULT_DATAUPLOAD_SETTINGS,
} from "@/components/LaboratoryMode/store/laboratoryStore";

interface Props {
  atomId: string;
}
const DataUploadValidateProperties: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore((state) => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(
    (state) => state.updateAtomSettings,
  );
  const settings: DataUploadSettings =
    (atom?.settings as DataUploadSettings) || {
      ...DEFAULT_DATAUPLOAD_SETTINGS,
    };
  const [allAvailableFiles, setAllAvailableFiles] = useState<
    { name: string; source: string }[]
  >(settings.requiredFiles?.map((name) => ({ name, source: "upload" })) || []);
  const [selectedMasterFile, setSelectedMasterFile] = useState<string>("");
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");
  const [renameMap, setRenameMap] = useState<Record<string, string>>({});
  const [skipFetch, setSkipFetch] = useState(false);
  const [validatorId, setValidatorId] = useState<string>(
    settings.validatorId || "",
  );
  const [columnDataTypes, setColumnDataTypes] = useState<
    Record<string, string>
  >({});
  const dataTypeOptions = [
    { value: "not_defined", label: "Not defined" },
    { value: "number", label: "Number" },
    { value: "string", label: "String" },
    { value: "date", label: "Date" },
  ];

  interface RangeValidation {
    id: number;
    column: string;
    min: string;
    max: string;
  }

  const [rangeValidations, setRangeValidations] = useState<RangeValidation[]>([
    { id: 1, column: "", min: "", max: "" },
  ]);

  interface PeriodicityValidation {
    id: number;
    column: string;
    periodicity: string;
  }

  const [periodicityValidations, setPeriodicityValidations] = useState<
    PeriodicityValidation[]
  >([{ id: 1, column: "", periodicity: "" }]);

  const [numericalColumns, setNumericalColumns] = useState<string[]>([]);
  const [dateColumns, setDateColumns] = useState<string[]>([]);
  const [categoricalColumns, setCategoricalColumns] = useState<string[]>([]);
  const [continuousColumns, setContinuousColumns] = useState<string[]>([]);
  const [selectedIdentifiers, setSelectedIdentifiers] = useState<string[]>([]);
  const [selectedMeasures, setSelectedMeasures] = useState<string[]>([]);

  // Load existing configuration if validator id already present
  useEffect(() => {
    if (!validatorId) return;
    fetch(`${VALIDATE_API}/get_validator_config/${validatorId}`)
      .then((res) => res.json())
      .then((cfg) => {
        const files = cfg.file_keys || [];
        if (files.length > 0) {
          setAllAvailableFiles(
            files.map((f: string) => ({ name: f, source: "upload" })),
          );
          if (!selectedMasterFile) setSelectedMasterFile(files[0]);
        }

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
            parsedValidations[k] = { ranges, periodicities };
          });
        }

        updateSettings(atomId, {
          validatorId,
          requiredFiles: files,
          validations: parsedValidations,
          classification: cfg.classification || {},
          columnConfig: cfg.column_types || {},
        });

        if (files.length > 0) {
          const firstKey = files[0];
          const schemaCols = cfg.schemas?.[firstKey]?.columns || [];
          const saved = cfg.column_types?.[firstKey] || {};
          const merged: Record<string, string> = {};
          schemaCols.forEach((c: any) => {
            merged[c.column] = saved[c.column] || "not_defined";
          });
          setColumnDataTypes(merged);
        }
      })
      .catch(() => {});
  }, []);

  const periodicityOptions = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ];

  const handleMasterFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const id = `validator-${Date.now()}`;
    const form = new FormData();
    form.append("validator_atom_id", id);
    files.forEach((f) => form.append("files", f));
    const keys = files.map((f) => f.name);
    form.append("file_keys", JSON.stringify(keys));

    const res = await fetch(`${VALIDATE_API}/create_new`, {
      method: "POST",
      body: form,
    });
    if (res.ok) {
      setValidatorId(id);
      setAllAvailableFiles(keys.map((k) => ({ name: k, source: "upload" })));
      setSelectedMasterFile(keys[0]);
      const cfg = await fetch(
        `${VALIDATE_API}/get_validator_config/${id}`,
      ).then((r) => r.json());
      const defaultTypes: Record<string, string> = {};
      const firstKey = keys[0];
      if (cfg.schemas && cfg.schemas[firstKey]) {
        cfg.schemas[firstKey].columns.forEach((c: any) => {
          defaultTypes[c.column] = "not_defined";
        });
      }
      if (cfg.column_types && cfg.column_types[firstKey]) {
        Object.entries(cfg.column_types[firstKey]).forEach(([col, typ]) => {
          defaultTypes[col] = typ as string;
        });
      }
      setColumnDataTypes(defaultTypes);
      updateSettings(atomId, { validatorId: id, columnConfig: { [firstKey]: defaultTypes } });
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
    setAllAvailableFiles(prev => prev.map(f => f.name === oldName ? { ...f, name: newName } : f));
    if (selectedMasterFile === oldName) {
      setSelectedMasterFile(newName);
      setSkipFetch(true);
    }
    setRenameMap(prev => ({ ...prev, [oldName]: newName }));
    setRenameTarget(null);
  };

  const deleteMasterFile = (name: string) => {
    setAllAvailableFiles(prev => prev.filter(f => f.name !== name));
    if (selectedMasterFile === name) setSelectedMasterFile('');
  };

  const handleDataTypeChange = (column: string, value: string) => {
    setColumnDataTypes((prev) => ({ ...prev, [column]: value }));
  };

  useEffect(() => {
    if (!validatorId || !selectedMasterFile) return;
    if (skipFetch) { setSkipFetch(false); return; }
    fetch(`${VALIDATE_API}/get_validator_config/${validatorId}`)
      .then((res) => res.json())
      .then((cfg) => {
        const schemaCols = cfg.schemas?.[selectedMasterFile]?.columns || [];
        const saved = cfg.column_types?.[selectedMasterFile] || {};
        const merged: Record<string, string> = {};
        schemaCols.forEach((c: any) => {
          merged[c.column] = saved[c.column] || "not_defined";
        });
        setColumnDataTypes(merged);
        updateSettings(atomId, {
          columnConfig: {
            ...(settings.columnConfig || {}),
            [selectedMasterFile]: merged,
          },
        });
        if (cfg.classification?.[selectedMasterFile]) {
          const cls = cfg.classification[selectedMasterFile];
          setSelectedIdentifiers(cls.identifiers || []);
          setSelectedMeasures(cls.measures || []);
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
              [selectedMasterFile]: { ranges, periodicities },
            },
          });
        }
      })
      .catch(() => {
        setColumnDataTypes({});
      });
  }, [validatorId, selectedMasterFile]);

  useEffect(() => {
    const nums = Object.entries(columnDataTypes)
      .filter(([, t]) => t === "integer" || t === "numeric")
      .map(([c]) => c);
    const dates = Object.entries(columnDataTypes)
      .filter(([, t]) => t === "date")
      .map(([c]) => c);
    const cats = Object.entries(columnDataTypes)
      .filter(([, t]) => !["integer", "numeric", "date"].includes(t))
      .map(([c]) => c);
    setNumericalColumns(nums);
    setDateColumns(dates);
    setContinuousColumns(nums);
    setCategoricalColumns(cats);
  }, [columnDataTypes]);

  useEffect(() => {
    if (selectedMasterFile && settings.validations?.[selectedMasterFile]) {
      const val = settings.validations[selectedMasterFile];
      setRangeValidations(
        val.ranges.length > 0
          ? val.ranges
          : [{ id: Date.now(), column: "", min: "", max: "" }],
      );
      setPeriodicityValidations(
        val.periodicities.length > 0
          ? val.periodicities
          : [{ id: Date.now(), column: "", periodicity: "" }],
      );
    } else {
      setRangeValidations([{ id: Date.now(), column: "", min: "", max: "" }]);
      setPeriodicityValidations([
        { id: Date.now(), column: "", periodicity: "" },
      ]);
    }

    if (selectedMasterFile && settings.classification?.[selectedMasterFile]) {
      const cls = settings.classification[selectedMasterFile];
      setSelectedIdentifiers(cls.identifiers);
      setSelectedMeasures(cls.measures);
    } else {
      setSelectedIdentifiers([]);
      setSelectedMeasures([]);
    }
  }, [selectedMasterFile]);

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

  const handleSaveConfiguration = async () => {
    if (!validatorId || !selectedMasterFile) return;

    const definedTypes: Record<string, string> = {};
    Object.entries(columnDataTypes).forEach(([col, typ]) => {
      if (typ && typ !== "not_defined") definedTypes[col] = typ;
    });
    const typeForm = new FormData();
    typeForm.append("validator_atom_id", validatorId);
    typeForm.append("file_key", selectedMasterFile);
    typeForm.append("column_types", JSON.stringify(definedTypes));
    await fetch(`${VALIDATE_API}/update_column_types`, {
      method: "POST",
      body: typeForm,
    });

    const columnConditions: Record<string, any[]> = {};
    rangeValidations.forEach((r) => {
      if (!r.column) return;
      const conds: any[] = [];
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

    await fetch(`${VALIDATE_API}/configure_validation_config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        validator_atom_id: validatorId,
        file_key: selectedMasterFile,
        column_conditions: columnConditions,
        column_frequencies: columnFrequencies,
      }),
    });

    const classifyForm = new FormData();
    classifyForm.append("validator_atom_id", validatorId);
    classifyForm.append("file_key", selectedMasterFile);
    classifyForm.append("identifiers", JSON.stringify(selectedIdentifiers));
    classifyForm.append("measures", JSON.stringify(selectedMeasures));
    classifyForm.append("unclassified", JSON.stringify([]));
    await fetch(`${VALIDATE_API}/classify_columns`, {
      method: "POST",
      body: classifyForm,
    });

    const savedRanges = rangeValidations.filter(
      (r) => r.column && (r.min !== "" || r.max !== ""),
    );
    const savedPeriods = periodicityValidations.filter(
      (p) => p.column && p.periodicity,
    );
    let renamedValidations = { ...(settings.validations || {}) } as Record<string, any>;
    let renamedClassification = { ...(settings.classification || {}) } as Record<string, any>;
    let renamedColumns = { ...(settings.columnConfig || {}) } as Record<string, Record<string,string>>;
    Object.entries(renameMap).forEach(([oldName, newName]) => {
      if (renamedValidations[oldName]) {
        renamedValidations[newName] = renamedValidations[oldName];
        delete renamedValidations[oldName];
      }
      if (renamedClassification[oldName]) {
        renamedClassification[newName] = renamedClassification[oldName];
        delete renamedClassification[oldName];
      }
      if (renamedColumns[oldName]) {
        renamedColumns[newName] = renamedColumns[oldName];
        delete renamedColumns[oldName];
      }
    });
    renamedValidations = {
      ...renamedValidations,
      [selectedMasterFile]: { ranges: savedRanges, periodicities: savedPeriods },
    };
    renamedClassification = {
      ...renamedClassification,
      [selectedMasterFile]: { identifiers: selectedIdentifiers, measures: selectedMeasures },
    };
    renamedColumns = {
      ...renamedColumns,
      [selectedMasterFile]: columnDataTypes,
    };
    const finalFiles = allAvailableFiles.map(f => f.name);
    Object.keys(renamedValidations).forEach(k => { if (!finalFiles.includes(k)) delete renamedValidations[k]; });
    Object.keys(renamedClassification).forEach(k => { if (!finalFiles.includes(k)) delete renamedClassification[k]; });
    Object.keys(renamedColumns).forEach(k => { if (!finalFiles.includes(k)) delete renamedColumns[k]; });

    updateSettings(atomId, {
      validatorId,
      requiredFiles: finalFiles,
      validations: renamedValidations,
      classification: renamedClassification,
      columnConfig: renamedColumns,
    });
    setRenameMap({});
  };

  return (
    <div className="w-80 h-full bg-white border-l border-gray-200 flex flex-col">
      <div className="p-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
          <Settings className="w-4 h-4" />
          <span>Data Upload and Validate Properties</span>
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300">
        {/* Master File Upload Section */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Upload Master File
              </label>
              <input
                type="file"
                multiple
                accept=".csv,.xlsx,.xls,.json"
                onChange={handleMasterFileSelect}
                className="hidden"
                id="master-file-upload"
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

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">
                Select Master File
              </label>
              <Select
                value={selectedMasterFile}
                onValueChange={setSelectedMasterFile}
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
          </div>
        </div>

        {/* Tabs Section - Only active when master file is selected */}
        {selectedMasterFile && selectedMasterFile !== "no-files" && (
          <Tabs defaultValue="datatype" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mx-4 my-4">
              <TabsTrigger value="datatype" className="text-xs">
                <Table className="w-3 h-3 mr-1" />
                DataType
              </TabsTrigger>
              <TabsTrigger value="value" className="text-xs">
                <BarChart3 className="w-3 h-3 mr-1" />
                Value
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
                          {rangeValidations.length > 1 && (
                            <Button
                              onClick={() => removeRangeValidation(range.id)}
                              size="sm"
                              variant="outline"
                              className="h-6 px-2"
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                          )}
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
                          {periodicityValidations.length > 1 && (
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
                          )}
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

        {/* Message when no master file is selected */}
        {(!selectedMasterFile || selectedMasterFile === "no-files") && (
          <div className="p-8 text-center text-gray-500">
            <Table className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-sm">
              Select a master file to configure data types and settings
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataUploadValidateProperties;
