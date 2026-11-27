import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ArrowRight } from 'lucide-react';
import { formatBytes } from '../engine/pathGuard';
import { NavSection } from './DashboardView';

export interface StorageSegment {
  id: 'active' | 'offloaded' | 'orphaned';
  label: string;
  description: string;
  bytes: number;
  itemCount: number;
  itemUnit: string;
  lightColor: string;
  darkColor: string;
  textClass: string;
  targetNav: NavSection;
  targetFilter?: string;
}

interface StorageUsageDonutChartProps {
  activeBytes: number;
  activeCount: number;
  offloadedBytes: number;
  offloadedCount: number;
  orphanedBytes: number;
  orphanedCount: number;
  onNavigate: (section: NavSection, presetFilter?: string) => void;
}

export const StorageUsageDonutChart: React.FC<StorageUsageDonutChartProps> = ({
  activeBytes,
  activeCount,
  offloadedBytes,
  offloadedCount,
  orphanedBytes,
  orphanedCount,
  onNavigate,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredId, setHoveredId] = useState<StorageSegment['id'] | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : false
  );

  // Sync D3 fill palette whenever root `.dark` class toggles
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains('dark'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const segments: StorageSegment[] = useMemo(
    () => [
      {
        id: 'active',
        label: 'Active',
        description: 'Apps & active AppData residing on C: NVMe',
        bytes: Math.max(0, activeBytes),
        itemCount: activeCount,
        itemUnit: activeCount === 1 ? 'item' : 'items',
        lightColor: '#0067C0',
        darkColor: '#60CDFF',
        textClass: 'text-[#0067C0] dark:text-[#60CDFF]',
        targetNav: 'apps',
        targetFilter: 'OnNVMe',
      },
      {
        id: 'offloaded',
        label: 'Offloaded',
        description: 'Relocated to D: via NTFS Junctions & MSIX',
        bytes: Math.max(0, offloadedBytes),
        itemCount: offloadedCount,
        itemUnit: offloadedCount === 1 ? 'move' : 'moves',
        lightColor: '#15803D',
        darkColor: '#4ADE80',
        textClass: 'text-[#15803D] dark:text-[#4ADE80]',
        targetNav: 'ledger',
      },
      {
        id: 'orphaned',
        label: 'Orphaned',
        description: 'Verified leftovers from uninstalled apps',
        bytes: Math.max(0, orphanedBytes),
        itemCount: orphanedCount,
        itemUnit: orphanedCount === 1 ? 'folder' : 'folders',
        lightColor: '#B91C1C',
        darkColor: '#F87171',
        textClass: 'text-[#B91C1C] dark:text-[#F87171]',
        targetNav: 'appdata',
        targetFilter: 'Orphaned',
      },
    ],
    [
      activeBytes,
      activeCount,
      offloadedBytes,
      offloadedCount,
      orphanedBytes,
      orphanedCount,
    ]
  );

  const totalBytes = useMemo(
    () => segments.reduce((sum, s) => sum + s.bytes, 0),
    [segments]
  );

  const activeSegment = useMemo(
    () => segments.find((s) => s.id === hoveredId) || null,
    [segments, hoveredId]
  );

  // D3 Donut Rendering & Transitions
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const size = 216;
    const radius = size / 2;
    const innerRadius = 64;
    const outerRadius = 92;
    const hoverOuterRadius = 98;

    const svg = d3.select(svgEl);
    svg.attr('viewBox', `0 0 ${size} ${size}`);

    let group = svg.select<SVGGElement>('g.donut-group');
    if (group.empty()) {
      group = svg
        .append('g')
        .attr('class', 'donut-group')
        .attr('transform', `translate(${radius}, ${radius})`);
    }

    const nonZero = segments.filter((s) => s.bytes > 0);
    const chartData =
      nonZero.length > 0
        ? nonZero
        : [
            {
              ...segments[0],
              bytes: 1,
            },
          ];

    const pie = d3
      .pie<StorageSegment>()
      .value((d) => d.bytes)
      .sort(null)
      .padAngle(nonZero.length > 1 ? 0.025 : 0);

    const arc = d3
      .arc<d3.PieArcDatum<StorageSegment>>()
      .innerRadius(innerRadius)
      .outerRadius((d) =>
        d.data.id === hoveredId ? hoverOuterRadius : outerRadius
      )
      .cornerRadius(4);

    const arcs = pie(chartData);

    const paths = group
      .selectAll<SVGPathElement, d3.PieArcDatum<StorageSegment>>('path.slice')
      .data(arcs, (d) => d.data.id);

    paths.exit().remove();

    const entered = paths
      .enter()
      .append('path')
      .attr('class', 'slice')
      .style('cursor', 'pointer')
      .attr('tabindex', 0)
      .attr('role', 'button');

    const merged = entered.merge(paths);

    merged
      .attr('aria-label', (d) => {
        const pct = totalBytes > 0 ? ((d.data.bytes / totalBytes) * 100).toFixed(1) : '0.0';
        return `${d.data.label}: ${formatBytes(d.data.bytes)} (${pct}%)`;
      })
      .attr('fill', (d) => {
        if (nonZero.length === 0) {
          return isDark ? '#2A2F3A' : '#E2E6EC';
        }
        return isDark ? d.data.darkColor : d.data.lightColor;
      })
      .attr('opacity', (d) =>
        hoveredId && d.data.id !== hoveredId ? 0.45 : 1
      )
      .on('mouseenter', (_event, d) => {
        if (nonZero.length > 0) setHoveredId(d.data.id);
      })
      .on('mouseleave', () => {
        setHoveredId(null);
      })
      .on('focus', (_event, d) => {
        if (nonZero.length > 0) setHoveredId(d.data.id);
      })
      .on('blur', () => {
        setHoveredId(null);
      })
      .on('click', (_event, d) => {
        if (nonZero.length > 0) {
          onNavigate(d.data.targetNav, d.data.targetFilter);
        }
      })
      .on('keydown', (event: KeyboardEvent, d) => {
        if ((event.key === 'Enter' || event.key === ' ') && nonZero.length > 0) {
          event.preventDefault();
          onNavigate(d.data.targetNav, d.data.targetFilter);
        }
      });

    merged
      .transition()
      .duration(180)
      .ease(d3.easeCubicOut)
      .attr('d', (d) => arc(d) || '');
  }, [segments, hoveredId, isDark, totalBytes, onNavigate]);

  const centerPct =
    activeSegment && totalBytes > 0
      ? ((activeSegment.bytes / totalBytes) * 100).toFixed(1)
      : null;

  return (
    <section className="rounded-xl border border-[#E2E6EC] bg-white dark:border-[#2A2F3A] dark:bg-[#1A1D23]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E9F0] px-6 py-4 dark:border-[#282D37]">
        <div>
          <h3 className="font-display text-sm font-semibold text-[#171B21] dark:text-[#EEF1F5]">
            Managed Storage Distribution
          </h3>
          <p className="mt-0.5 text-xs text-[#5E6775] dark:text-[#9AA4B2]">
            Active NVMe footprint vs. offloaded cold tier vs. orphaned leftovers
          </p>
        </div>
        <span className="font-mono text-xs tabular-nums text-[#5E6775] dark:text-[#9AA4B2]">
          Total tracked: {formatBytes(totalBytes)}
        </span>
      </div>

      <div className="grid grid-cols-1 items-center divide-y divide-[#E5E9F0] md:grid-cols-12 md:divide-x md:divide-y-0 dark:divide-[#282D37]">
        {/* D3 Donut Visualization */}
        <div className="flex flex-col items-center justify-center p-6 md:col-span-5">
          <div className="relative h-[216px] w-[216px]">
            <svg
              ref={svgRef}
              className="h-full w-full overflow-visible"
              role="img"
              aria-label="Donut chart showing Active, Offloaded, and Orphaned storage usage"
            />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[11px] font-medium text-[#5E6775] dark:text-[#9AA4B2]">
                {activeSegment ? activeSegment.label : 'Tracked Total'}
              </span>
              <span className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-[#171B21] dark:text-[#EEF1F5]">
                {formatBytes(activeSegment ? activeSegment.bytes : totalBytes)}
              </span>
              <span className="mt-0.5 font-mono text-[11px] tabular-nums text-[#5E6775] dark:text-[#9AA4B2]">
                {centerPct !== null
                  ? `${centerPct}% share`
                  : `${activeCount + offloadedCount + orphanedCount} entries`}
              </span>
            </div>
          </div>
        </div>

        {/* Interactive Breakdown Ledger */}
        <div className="divide-y divide-[#EEF1F5] md:col-span-7 dark:divide-[#242933]">
          {segments.map((seg) => {
            const pct =
              totalBytes > 0 ? (seg.bytes / totalBytes) * 100 : 0;
            const isHighlighted = hoveredId === seg.id;
            return (
              <button
                key={seg.id}
                type="button"
                onMouseEnter={() => setHoveredId(seg.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(seg.id)}
                onBlur={() => setHoveredId(null)}
                onClick={() => onNavigate(seg.targetNav, seg.targetFilter)}
                className={`group flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors ${
                  isHighlighted
                    ? 'bg-[#F8FAFC] dark:bg-[#20242C]'
                    : 'hover:bg-[#F8FAFC] dark:hover:bg-[#20242C]'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-[2px]"
                    style={{
                      backgroundColor: isDark ? seg.darkColor : seg.lightColor,
                    }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-[#171B21] dark:text-[#EEF1F5]">
                        {seg.label}
                      </span>
                      <span aria-hidden="true" className="text-[#9AA4B2]">
                        ·
                      </span>
                      <span className="font-mono tabular-nums text-[#5E6775] dark:text-[#9AA4B2]">
                        {seg.itemCount} {seg.itemUnit}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[#5E6775] dark:text-[#9AA4B2]">
                      {seg.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="font-mono text-sm font-semibold tabular-nums text-[#171B21] dark:text-[#EEF1F5]">
                      {formatBytes(seg.bytes)}
                    </div>
                    <div
                      className={`font-mono text-[11px] font-medium tabular-nums ${seg.textClass}`}
                    >
                      {pct.toFixed(1)}%
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-[#9AA4B2] transition-transform group-hover:translate-x-0.5 group-hover:text-[#171B21] dark:group-hover:text-white" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
