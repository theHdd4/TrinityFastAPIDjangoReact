import React from 'react';
import ChartMakerCanvas from '../../chart-maker/components/ChartMakerCanvas';
import type { ChartMakerConfig, ChartData } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Props {
  type: 'bar_chart' | 'line_chart' | 'pie_chart';
  data: any[];
  xField?: string;
  yField?: string;
  title?: string;
  [key: string]: any;
}

/**
 * Minimal wrapper around ChartMakerCanvas to mimic simple mode rendering
 * for the Explore atom. This leverages the existing Chart Maker chart
 * logic while allowing Explore to maintain its current API surface.
 */
const ChartMakerRenderer: React.FC<Props> = ({
  type,
  data,
  xField,
  yField,
  title
}) => {
  const charts: ChartMakerConfig[] = [
    {
      id: '0',
      title: title || '',
      type: type === 'bar_chart' ? 'bar' : type === 'line_chart' ? 'line' : 'pie',
      xAxis: xField || '',
      yAxis: yField || '',
      filters: {},
      chartConfig: { data },
      chartRendered: true
    }
  ];

  const chartData: ChartData = {
    columns: data.length > 0 ? Object.keys(data[0]) : [],
    rows: data
  };

  return (
    <ChartMakerCanvas
      charts={charts}
      data={chartData}
      isFullWidthMode
    />
  );
};

export default ChartMakerRenderer;

