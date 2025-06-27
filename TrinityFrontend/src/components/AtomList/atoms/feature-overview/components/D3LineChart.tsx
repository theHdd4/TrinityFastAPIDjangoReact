import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

interface DataPoint {
  date: string;
  value: number;
}

interface Props {
  data: DataPoint[];
  width?: number;
  height?: number;
  xLabel?: string;
  yLabel?: string;
}

const D3LineChart: React.FC<Props> = ({
  data,
  width = 400,
  height = 200,
  xLabel = 'Date',
  yLabel = 'Value'
}) => {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();

    const margin = { top: 10, right: 20, bottom: 35, left: 40 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const parseDate = (d: string) => new Date(d);
    const dataParsed = data.map(d => ({ date: parseDate(d.date), value: d.value }));

    const x = d3
      .scaleTime()
      .domain(d3.extent(dataParsed, d => d.date) as [Date, Date])
      .range([0, innerWidth]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(dataParsed, d => d.value) || 1])
      .nice()
      .range([innerHeight, 0]);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(5))
      .append('text')
      .attr('fill', '#374151')
      .attr('x', innerWidth / 2)
      .attr('y', margin.bottom - 5)
      .attr('text-anchor', 'middle')
      .text(xLabel);

    g.append('g')
      .call(d3.axisLeft(y).ticks(5))
      .append('text')
      .attr('fill', '#374151')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -margin.left + 12)
      .attr('text-anchor', 'middle')
      .text(yLabel);

    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(5)
          .tickSize(-innerHeight)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', '#e5e7eb');

    g.append('g')
      .attr('class', 'grid')
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', '#e5e7eb');

    const line = d3
      .line<{ date: Date; value: number }>()
      .x(d => x(d.date))
      .y(d => y(d.value));

    g.append('path')
      .datum(dataParsed)
      .attr('fill', 'none')
      .attr('stroke', '#6366f1')
      .attr('stroke-width', 3)
      .attr('d', line);

    const focus = g.append('g').style('display', 'none');
    focus.append('circle').attr('r', 4).attr('fill', '#6366f1');
    const tooltip = focus
      .append('text')
      .attr('x', 9)
      .attr('dy', '-0.35em')
      .attr('font-size', '10px')
      .attr('fill', '#111827');

    const bisect = d3.bisector<{ date: Date }>(d => d.date).left;

    svg
      .append('rect')
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('transform', `translate(${margin.left},${margin.top})`)
      .on('mouseover', () => focus.style('display', null))
      .on('mouseout', () => focus.style('display', 'none'))
      .on('mousemove', event => {
        const x0 = x.invert(d3.pointer(event)[0]);
        const i = bisect(dataParsed, x0, 1);
        const d0 = dataParsed[i - 1];
        const d1 = dataParsed[i] || d0;
        const d = x0.getTime() - d0.date.getTime() > d1.date.getTime() - x0.getTime() ? d1 : d0;
        focus.attr('transform', `translate(${x(d.date)},${y(d.value)})`);
        tooltip.text(`${d3.timeFormat('%Y-%m-%d')(d.date)}, ${d.value}`);
      });
  }, [data, height, width, xLabel, yLabel]);

  return <svg ref={ref} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} />;
};

export default D3LineChart;
