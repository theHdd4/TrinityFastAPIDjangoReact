import type { SlideObject } from '../../../store/exhibitionStore';
import { DEFAULT_CANVAS_OBJECT_HEIGHT, DEFAULT_CANVAS_OBJECT_WIDTH } from '../../../store/exhibitionStore';
import {
  DEFAULT_CHART_CONFIG,
  DEFAULT_CHART_DATA,
  DEFAULT_CHART_HEIGHT,
  DEFAULT_CHART_WIDTH,
  normalizeChartType,
} from './constants';
import type { ChartConfig, ChartDataRow } from './types';

export interface ChartSlideObjectOptions {
  data?: ChartDataRow[];
  config?: ChartConfig;
}

export const createChartSlideObject = (
  id: string,
  overrides: Partial<SlideObject> = {},
  options: ChartSlideObjectOptions = {},
): SlideObject => {
  const sourceData = Array.isArray(options.data) && options.data.length > 0 ? options.data : DEFAULT_CHART_DATA;
  const resolvedData = sourceData.map(entry => ({ ...entry }));
  const resolvedConfig: ChartConfig = {
    ...DEFAULT_CHART_CONFIG,
    ...(options.config ?? {}),
    type: normalizeChartType(options.config?.type),
    legendPosition: options.config?.legendPosition ?? DEFAULT_CHART_CONFIG.legendPosition,
  };

  return {
    id,
    type: 'chart',
    x: 160,
    y: 160,
    width: overrides.width ?? DEFAULT_CHART_WIDTH ?? DEFAULT_CANVAS_OBJECT_WIDTH,
    height: overrides.height ?? DEFAULT_CHART_HEIGHT ?? DEFAULT_CANVAS_OBJECT_HEIGHT,
    zIndex: overrides.zIndex ?? 1,
    rotation: overrides.rotation ?? 0,
    groupId: overrides.groupId ?? null,
    props: {
      ...overrides.props,
      data: resolvedData,
      config: resolvedConfig,
    },
    ...overrides,
  };
};
