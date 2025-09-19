"use client"

import React, { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"

import { Database } from 'lucide-react'
import type { ExploreData, ExploreSettings } from "../ExploreAtom"
import { VALIDATE_API, EXPLORE_API } from "@/lib/api"
import { useDataSourceChangeWarning } from '@/hooks/useDataSourceChangeWarning'

interface ExploreInputProps {
  data: ExploreData
  settings: ExploreSettings
  onDataChange: (data: Partial<ExploreData>) => void
  onDataUpload: (summary: ColumnSummary[], fileId: string) => void
}

interface ColumnClassifierConfig {
  identifiers: string[]
  measures: string[]
  dimensions: { [key: string]: string[] }
}

interface ColumnSummary {
  column: string
  data_type: string
  unique_count: number
  unique_values: string[]
  entries: string[]
  is_numerical: boolean
}

interface Frame {
  object_name: string
  arrow_name: string
}

const ExploreInput: React.FC<ExploreInputProps> = ({ data, settings, onDataChange, onDataUpload }) => {
  /** --------------------------------------------------
   * Local state
   * --------------------------------------------------*/
  const [frames, setFrames] = useState<Frame[]>([])
  const [selected, setSelected] = useState<string>(data.dataframe || "")

  const [columnSummary, setColumnSummary] = useState<ColumnSummary[]>([])
  const [originalColumnSummary, setOriginalColumnSummary] = useState<ColumnSummary[]>([])
  const [isLoadingSummary, setIsLoadingSummary] = useState(false)
  
  // Column classifier config state
  const [columnClassifierConfig, setColumnClassifierConfig] = useState<ColumnClassifierConfig | null>(null)
  // Select Columns UI state
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [filterUnique, setFilterUnique] = useState<boolean>(data.filterUnique || false)
  const [isLoadingClassifier, setIsLoadingClassifier] = useState(false)

  /** --------------------------------------------------
   * Fetch list of saved dataframes on mount
   * --------------------------------------------------*/
  useEffect(() => {
    fetch(`${VALIDATE_API}/list_saved_dataframes`)
      .then((r) => r.json())
      .then((d) =>
        setFrames(
          Array.isArray(d.files)
            ? d.files
                .filter((f: any) => !!f.arrow_name)
                .map((f: any) => ({
                  object_name: f.object_name,
                  arrow_name: f.arrow_name
                }))
            : []
        )
      )
      .catch(() => setFrames([]))
  }, [])

  /** --------------------------------------------------
   * Sync selected file from external data
   * --------------------------------------------------*/
  useEffect(() => {
    setSelected(data.dataframe || "")
  }, [data.dataframe])

  /** --------------------------------------------------
   * Sync filterUnique from external data
   * --------------------------------------------------*/
  useEffect(() => {
    setFilterUnique(data.filterUnique || false)
  }, [data.filterUnique])

  /** --------------------------------------------------
   * Sync columnSummary from external data
   * --------------------------------------------------*/
  useEffect(() => {
    if (data.columnSummary && Array.isArray(data.columnSummary)) {
      setColumnSummary(data.columnSummary as ColumnSummary[])
      // Also update original if it's empty (first load)
      if (originalColumnSummary.length === 0) {
        setOriginalColumnSummary(data.columnSummary as ColumnSummary[])
      }
    }
  }, [data.columnSummary, originalColumnSummary.length])

  /** --------------------------------------------------
   * When a file is selected → fetch classifier config + summary
   * --------------------------------------------------*/
  useEffect(() => {
    if (!selected) return
    fetchColumnClassifierConfig(selected)
    fetchColumnSummary(selected)
  }, [selected])

  /** --------------------------------------------------
   * Try to fetch project-level column classifier config as fallback
   * --------------------------------------------------*/
  const tryProjectLevelConfig = async (client_name: string, app_name: string, project_name: string) => {
    try {
      
      const response = await fetch(`${EXPLORE_API}/column-classifier/config/${encodeURIComponent(client_name)}/${encodeURIComponent(app_name)}/${encodeURIComponent(project_name)}`)
      
      if (response.ok) {
        const result = await response.json()

        if (result.status === 'success' && (result.config || result.data)) {
          const rawConfig = result.config || result.data
          const filteredDims = Object.fromEntries(
            Object.entries(rawConfig.dimensions || {}).filter(
              ([key]) => key.toLowerCase() !== 'unattributed'
            )
          )
          const cleanedConfig = { ...rawConfig, dimensions: filteredDims }
          setColumnClassifierConfig(cleanedConfig)
          onDataChange({
            columnClassifierConfig: cleanedConfig,
            dimensions: Object.keys(filteredDims),
            measures: rawConfig.measures || [],
            selectedIdentifiers: Object.fromEntries(
              Object.entries(filteredDims).map(([dim, ids]) => [dim, ids || []])
            )
          })
        } else {
          setColumnClassifierConfig(null)
        }
      } else {
        setColumnClassifierConfig(null)
      }
    } catch (error) {
      setColumnClassifierConfig(null)
    }
  }

  /** --------------------------------------------------
   * Fetch column classifier config
   * --------------------------------------------------*/
  const fetchColumnClassifierConfig = async (fileKey: string) => {
    setIsLoadingClassifier(true)
    try {
      // Extract client_name, app_name, project_name from file path
      // File path format: Quant_Matrix_AI_Schema/marketing-mix/marketing-mix project/filename.arrow
      const pathParts = fileKey.split('/')
      if (pathParts.length >= 3) {
        const client_name = pathParts[0] // Quant_Matrix_AI_Schema
        const app_name = pathParts[1] // marketing-mix
        const project_name = pathParts[2] // marketing-mix project
        const fileName = pathParts[pathParts.length - 1] // filename.arrow
        
        
        // Try to fetch config specific to this file first
        
        // Add timeout to prevent infinite loading
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
        
        const response = await fetch(`${EXPLORE_API}/column-classifier/config/${encodeURIComponent(client_name)}/${encodeURIComponent(app_name)}/${encodeURIComponent(project_name)}?file=${encodeURIComponent(fileName)}`, {
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        
        if (response.ok) {
          const result = await response.json()

          if (result.status === 'success' && (result.config || result.data)) {
            const rawConfig = result.config || result.data
            const filteredDims = Object.fromEntries(
              Object.entries(rawConfig.dimensions || {}).filter(
                ([key]) => key.toLowerCase() !== 'unattributed'
              )
            )
            const cleanedConfig = { ...rawConfig, dimensions: filteredDims }
            setColumnClassifierConfig(cleanedConfig)

            // Immediately apply config so filters show up in canvas
            onDataChange({
              columnClassifierConfig: cleanedConfig,
              dimensions: Object.keys(filteredDims),
              measures: rawConfig.measures || [],
              selectedIdentifiers: Object.fromEntries(
                Object.entries(filteredDims).map(([dim, ids]) => [dim, ids || []])
              )
            })
          } else {
            // Try fallback to project-level config
            await tryProjectLevelConfig(client_name, app_name, project_name)
          }
        } else {
          // Try fallback to project-level config
          await tryProjectLevelConfig(client_name, app_name, project_name)
        }
      } else {
        setColumnClassifierConfig(null)
        // Still call onDataChange to clear any previous config
        onDataChange({ columnClassifierConfig: null })
      }
    } catch (error) {
      setColumnClassifierConfig(null)
      // Still call onDataChange to clear any previous config
      onDataChange({ columnClassifierConfig: null })
    } finally {
      setIsLoadingClassifier(false)
    }
  }

  /** --------------------------------------------------
   * Fetch column summary
   * --------------------------------------------------*/
  const fetchColumnSummary = async (fileKey: string) => {
    setIsLoadingSummary(true)
    try {
      // Ensure proper file extension
      const objectName = fileKey.endsWith('.arrow') ? fileKey : `${fileKey}.arrow`
      const response = await fetch(`${EXPLORE_API}/column_summary?object_name=${encodeURIComponent(objectName)}`)
      if (response.ok) {
        const summary = await response.json()
        const summaryData = Array.isArray(summary.summary) ? summary.summary.filter(Boolean) : []
        setColumnSummary(summaryData)
        setOriginalColumnSummary(summaryData) // Store original for filtering
        // Reset Select Columns UI state when new summary arrives
        setSelectedColumns([])
        // Don't reset filterUnique - keep the user's preference
        onDataUpload(summaryData, fileKey)
        
        // Extract dimensions and measures from column summary as fallback
        const extractedDimensions = summaryData
          .filter(col => !col.is_numerical && col.unique_count > 1)
          .map(col => col.column)
        const extractedMeasures = summaryData
          .filter(col => col.is_numerical)
          .map(col => col.column)
        
        
        // Update settings with the column summary and extracted dimensions/measures
        onDataChange({ 
          columnSummary: summaryData,
          allColumns: summaryData.map(col => col.column),
          dataframe: fileKey,
          // Add fallback dimensions and measures
          fallbackDimensions: extractedDimensions,
          fallbackMeasures: extractedMeasures
        })
      } else {
        setColumnSummary([])
        onDataChange({ columnSummary: [], allColumns: [], dataframe: fileKey })
      }
    } catch (error) {
      setColumnSummary([])
      onDataChange({ columnSummary: [], allColumns: [], dataframe: fileKey })
    } finally {
      setIsLoadingSummary(false)
    }
  }

  const applyFrameChange = (val: string) => {
    setSelected(val)
    onDataChange({ dataframe: val })
    fetchColumnClassifierConfig(val)
    fetchColumnSummary(val)
  }

  const { requestChange: confirmFrameChange, dialog } = useDataSourceChangeWarning(async nextValue => {
    applyFrameChange(nextValue)
  })

  const handleFrameChange = (val: string) => {
    if (!val) return
    const hasExistingUpdates = Boolean(
      data.applied ||
      (data.chartDataSets && Object.keys(data.chartDataSets).length > 0) ||
      (data.chartReadyData && Object.keys(data.chartReadyData).length > 0) ||
      (Array.isArray(data.columnSummary) && data.columnSummary.length > 0)
    )
    const isDifferentSource = val !== (data.dataframe || '')
    confirmFrameChange(val, hasExistingUpdates && isDifferentSource)
  }

  // Helper: columns to show based on unique filter (use original for dropdown)
  const displayedColumns = React.useMemo(
    () => (filterUnique ? originalColumnSummary.filter(c => c.unique_count > 1) : originalColumnSummary),
    [originalColumnSummary, filterUnique]
  )

  // Effect to handle filter changes - auto-select filtered columns when toggle is enabled
  useEffect(() => {
    if (filterUnique) {
      const allowed = displayedColumns.map(c => c.column);
      // Auto-select all filtered columns when toggle is enabled
      setSelectedColumns(allowed);
    } else {
      // When toggle is disabled, clear selection to show all columns
      setSelectedColumns([]);
    }
  }, [filterUnique, displayedColumns]);

  const handleReview = () => {
    // If no columns are selected but filter is enabled, use all displayed columns
    let columnsToUse = selectedColumns;
    if (selectedColumns.length === 0 && filterUnique) {
      columnsToUse = displayedColumns.map(c => c.column);
    }
    
    // Filter the original column summary to only include selected columns
    const filteredSummary = originalColumnSummary
      .filter(c => c && columnsToUse.includes(c.column))
      .map(c => c);
    
    // Update the data with selected columns and filtered summary
    onDataChange({ 
      selectedColumns: columnsToUse,
      columnSummary: filteredSummary // This will be used by the canvas
    })
  }

  return (
    <div className="space-y-4 p-2 h-full overflow-auto">
      {/* ---------------- File selector ---------------- */}
      <Card className="p-4 space-y-3">
        <label className="text-sm font-medium text-gray-700 flex items-center">
          <Database className="w-4 h-4 mr-2 text-blue-600" />
          Input File
        </label>
        <Select value={selected} onValueChange={handleFrameChange}>
          <SelectTrigger className="bg-white border-gray-300">
            <SelectValue placeholder="Select saved dataframe" />
          </SelectTrigger>
          <SelectContent>
            {Array.isArray(frames)
              ? frames.map((f) => (
                  <SelectItem key={f.object_name} value={f.object_name}>
                    {f.arrow_name.split("/").pop()?.replace(".arrow", "")}
                  </SelectItem>
                ))
              : null}
          </SelectContent>
        </Select>

        {/* Column classifier status - Only show if explicitly configured */}
        {isLoadingClassifier && (
          <div className="flex items-center space-x-2 text-xs text-blue-600">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span>Loading column classifier configuration...</span>
          </div>
        )}

        {/* Only show column classifier config if it was explicitly set by user */}
        {data.columnClassifierConfig && (
          <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded-md text-xs text-green-700">
            <span className="font-medium text-green-800 block mb-1">Column Classifier Configuration Loaded</span>
            <div className="flex gap-4">
              <span>Identifiers: {data.columnClassifierConfig.identifiers?.length || 0}</span>
              <span>Measures: {data.columnClassifierConfig.measures?.length || 0}</span>
              <span>Dimensions: {Object.keys(data.columnClassifierConfig.dimensions || {}).length}</span>
            </div>
          </div>
        )}

        {/* Show option to activate found config if not already active */}
        {columnClassifierConfig && !data.columnClassifierConfig && !isLoadingClassifier && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-700">
            <span className="font-medium text-blue-800 block mb-1">Column Classifier Configuration Found</span>
            <span className="block mb-2">A configuration exists for this project. This may be for a different file in the same project.</span>
            <button
              onClick={() => {
                onDataChange({ 
                  columnClassifierConfig: columnClassifierConfig,
                  dimensions: columnClassifierConfig.identifiers || [],
                  measures: columnClassifierConfig.measures || []
                });
              }}
              className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
            >
              Activate Configuration
            </button>
          </div>
        )}

        {!data.columnClassifierConfig && !columnClassifierConfig && !isLoadingClassifier && (
          <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-md text-xs text-orange-700">
            <span className="font-medium text-orange-800 block">No Column Classifier Configuration</span>
            <span>Go to Column Classifier atom to create and save a configuration.</span>
          </div>
        )}

        {/* Column summary status */}
        {isLoadingSummary && (
          <div className="flex items-center space-x-2 text-xs text-blue-600">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span>Loading column summary...</span>
          </div>
        )}




      </Card>

      {dialog}

    </div>
  )
}

export default ExploreInput