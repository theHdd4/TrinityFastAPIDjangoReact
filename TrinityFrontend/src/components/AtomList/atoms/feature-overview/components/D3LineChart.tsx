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
  width = 600,
  height = 400,
  xLabel = 'Date',
  yLabel = 'Value'
}) => {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();

    const margin = { top: 10, right: 30, bottom: 80, left: 50 };
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

    const xAxis = g
      .append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(5));
    xAxis.selectAll('text').style('font-size', '12px');
    xAxis
      .append('text')
      .attr('fill', '#374151')
      .attr('x', innerWidth / 2)
      .attr('y', margin.bottom - 25)
      .attr('text-anchor', 'middle')
      .text(xLabel);

    const yAxis = g.append('g').call(d3.axisLeft(y).ticks(5));
    yAxis.selectAll('text').style('font-size', '12px');
    yAxis
      .append('text')
      .attr('fill', '#374151')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -margin.left + 15)
      .attr('text-anchor', 'middle')
      .text(yLabel);


    const line = d3
      .line<{ date: Date; value: number }>()
      .x(d => x(d.date))
      .y(d => y(d.value));

    g.append('path')
      .datum(dataParsed)
      .attr('fill', 'none')
      .attr('stroke', '#e74c3c')
      .attr('stroke-width', 4)
      .attr('d', line);

    g.selectAll('.dot')
      .data(dataParsed)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', d => x(d.date))
      .attr('cy', d => y(d.value))
      .attr('r', 4)
      .attr('fill', '#e74c3c');

    // Legend
    const legend = g
      .append('g')
      .attr('transform', `translate(${innerWidth / 2 - 50}, ${innerHeight + margin.bottom - 30})`);

    legend
      .append('rect')
      .attr('width', 14)
      .attr('height', 14)
      .attr('fill', '#e74c3c');

    legend
      .append('text')
      .attr('x', 20)
      .attr('y', 12)
      .style('font-size', '16px')
      .style('fill', '#000')
      .text(yLabel);

    const focus = g.append('g').style('display', 'none');
    focus.append('circle').attr('r', 4).attr('fill', '#e74c3c');
    const tooltip = focus
      .append('text')
      .attr('x', 9)
      .attr('dy', '-0.35em')
      .attr('font-size', '12px')
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
