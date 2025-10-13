import React, { useMemo } from 'react';
import {
  buildContextEntries,
  buildSkuTableModel,
  collectCombinationEntries,
  collectDimensions,
  extractSkuRowEntries,
  extractSummaryEntries,
  renderCombinationEntries,
  renderContextEntries,
  renderDimensions,
  renderSkuDetails,
  renderSummaryEntries,
  renderTable,
} from './shared';
import { FeatureOverviewComponentProps } from './types';

const StatisticalSummary: React.FC<FeatureOverviewComponentProps> = ({ metadata, variant }) => {
  const dimensions = useMemo(() => collectDimensions(metadata), [metadata]);
  const combinationEntries = useMemo(() => collectCombinationEntries(metadata), [metadata]);
  const summaryEntries = useMemo(
    () => extractSummaryEntries(metadata.statisticalDetails),
    [metadata.statisticalDetails],
  );
  const skuTableModel = useMemo(
    () => buildSkuTableModel(metadata.skuStatisticsSettings, variant),
    [metadata.skuStatisticsSettings, variant],
  );
  const skuRowEntries = useMemo(() => extractSkuRowEntries(metadata.skuRow), [metadata.skuRow]);
  const contextEntries = useMemo(() => buildContextEntries(metadata), [metadata]);

  return (
    <div className="space-y-4">
      {renderDimensions(dimensions)}
      {renderCombinationEntries(combinationEntries)}

      {renderSummaryEntries(summaryEntries)}
      {renderTable(skuTableModel)}
      {renderSkuDetails(skuRowEntries)}
      {renderContextEntries(contextEntries)}
    </div>
  );
};

export default StatisticalSummary;
