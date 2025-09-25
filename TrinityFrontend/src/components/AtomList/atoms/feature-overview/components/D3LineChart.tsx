import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import './D3LineChart.css';

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

    const margin = { top: 5, right: 30, bottom: 40, left: 50 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const parseDate = (d: string) => new Date(d);
    const dataParsed = data
      .map(d => ({ date: parseDate(d.date), value: d.value }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

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

    const formatTick = (n: number) => {
      const abs = Math.abs(n);
      if (abs >= 1_000_000_000) {
        return (n / 1_000_000_000).toFixed(2).replace(/\.00$/, '') + 'B';
      }
      if (abs >= 1_000_000) {
        return (n / 1_000_000).toFixed(2).replace(/\.00$/, '') + 'M';
      }
      if (abs >= 1_000) {
        return (n / 1_000).toFixed(2).replace(/\.00$/, '') + 'T';
      }
      return n.toFixed(2).replace(/\.00$/, '');
    };

    const yAxis = g
      .append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => formatTick(d as number)));
    yAxis.selectAll('text').style('font-size', '12px');


    const line = d3
      .line<{ date: Date; value: number }>()
      .x(d => x(d.date))
      .y(d => y(d.value));

    const path = g
      .append('path')
      .datum(dataParsed)
      .attr('class', 'chart-line')
      .attr('fill', 'none')
      .attr('stroke', '#e74c3c')
      .attr('stroke-width', 4)
      .attr('d', line);

    // Animate line drawing
    const totalLength = (path.node() as SVGPathElement).getTotalLength();
    path
      .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
      .attr('stroke-dashoffset', totalLength)
      .transition()
      .duration(1000)
      .ease(d3.easeCubic)
      .attr('stroke-dashoffset', 0);

    g.selectAll('.dot')
      .data(dataParsed)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', d => x(d.date))
      .attr('cy', d => y(d.value))
      .attr('r', 0)
      .attr('fill', '#e74c3c')
      .transition()
      .delay((_, i) => i * 100)
      .duration(500)
      .attr('r', 4);

    // Legend
    const legend = g
      .append('g')
      .attr(
        'transform',
        `translate(${innerWidth / 2 - 50}, ${innerHeight + margin.bottom - 10})`
      );

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

  return (
    <svg
      ref={ref}
      className="d3-line-chart"
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
    />
  );
};

export default D3LineChart;
