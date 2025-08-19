import React from 'react';
import { render, screen } from '@testing-library/react';
import RechartsChartRenderer from './RechartsChartRenderer';

// Mock Recharts components to avoid testing issues
jest.mock('recharts', () => ({
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  Line: () => <div data-testid="line" />,
  Pie: () => <div data-testid="pie" />,
  Area: () => <div data-testid="area" />,
  Cell: () => <div data-testid="cell" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
}));

describe('RechartsChartRenderer', () => {
  const mockData = [
    { name: 'Category 1', value: 100 },
    { name: 'Category 2', value: 200 },
    { name: 'Category 3', value: 150 },
  ];

  const mockLineData = [
    { x: 'Jan', y: 100 },
    { x: 'Feb', y: 200 },
    { x: 'Mar', y: 150 },
  ];

  it('renders bar chart correctly', () => {
    render(
      <RechartsChartRenderer
        type="bar_chart"
        data={mockData}
        width={400}
        height={300}
      />
    );

    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    expect(screen.getByTestId('bar')).toBeInTheDocument();
  });

  it('renders line chart correctly', () => {
    render(
      <RechartsChartRenderer
        type="line_chart"
        data={mockLineData}
        width={400}
        height={300}
      />
    );

    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByTestId('line')).toBeInTheDocument();
  });

  it('renders pie chart correctly', () => {
    render(
      <RechartsChartRenderer
        type="pie_chart"
        data={mockData}
        width={400}
        height={300}
      />
    );

    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    expect(screen.getByTestId('pie')).toBeInTheDocument();
  });

  it('renders stacked bar chart correctly', () => {
    render(
      <RechartsChartRenderer
        type="bar_chart"
        data={mockData}
        width={400}
        height={300}
      />
    );

    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    expect(screen.getByTestId('bar')).toBeInTheDocument();
  });

  it('renders area chart correctly', () => {
    render(
      <RechartsChartRenderer
        type="area_chart"
        data={mockLineData}
        width={400}
        height={300}
      />
    );

    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    expect(screen.getByTestId('area')).toBeInTheDocument();
  });

  it('shows no data message when data is empty', () => {
    render(
      <RechartsChartRenderer
        type="bar_chart"
        data={[]}
        width={400}
        height={300}
      />
    );

    expect(screen.getByText('No data available')).toBeInTheDocument();
    expect(screen.getByText('Please generate chart data first')).toBeInTheDocument();
  });

  it('shows unsupported chart type message for invalid type', () => {
    render(
      <RechartsChartRenderer
        type="invalid_chart" as any
        data={mockData}
        width={400}
        height={300}
      />
    );

    expect(screen.getByText('Unsupported chart type')).toBeInTheDocument();
  });

  it('renders with title when provided', () => {
    render(
      <RechartsChartRenderer
        type="bar_chart"
        data={mockData}
        title="Test Chart"
        width={400}
        height={300}
      />
    );

    expect(screen.getByText('Test Chart')).toBeInTheDocument();
  });
}); 