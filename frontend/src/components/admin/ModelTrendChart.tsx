"use client";

import { useEffect, useState, useRef } from "react";
import { Loader2, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";

interface TrendData {
  dates: string[];
  series: Record<string, number[]>;
}

const TYPE_LABELS: Record<string, string> = {
  image: "图片",
  video: "视频",
};

const TYPE_COLORS: Record<string, string> = {
  image: "#6c3bff",
  video: "#00d4ff",
};

export function ModelTrendChart() {
  const [data, setData] = useState<TrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    api.get<TrendData>("/api/v1/admin/dashboard/trends?days=30")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!data || !containerRef.current) return;
    const obs = new ResizeObserver(() => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth - 48; // padding
        const dates = data.dates.length || 1;
        setBarWidth(Math.max(4, Math.min(24, (w - dates) / dates)));
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-5 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!data || data.dates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-muted">
        <Activity className="size-10 mb-3 opacity-30" />
        <p className="text-sm">暂无调用数据</p>
      </div>
    );
  }

  const types = Object.keys(data.series);
  const activeTypes = selectedType ? [selectedType] : types;

  // Compute max value for scaling
  const allValues = activeTypes.flatMap((t) => data.series[t]);
  const maxVal = Math.max(...allValues, 1);
  const chartHeight = 200;
  const yTicks = 5;

  return (
    <div>
      {/* Legend / type filter */}
      <div className="flex items-center gap-3 mb-4">
        {types.map((t) => {
          const active = !selectedType || selectedType === t;
          const count = data.series[t].reduce((a, b) => a + b, 0);
          return (
            <button
              key={t}
              onClick={() => setSelectedType(active && !selectedType ? t : null)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-all",
                active
                  ? "bg-white/[0.06] text-text-primary"
                  : "text-text-muted opacity-50",
              )}
            >
              <span
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: TYPE_COLORS[t] || "#666" }}
              />
              {TYPE_LABELS[t] || t}
              <span className="text-text-muted ml-0.5">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div ref={containerRef} className="w-full">
        <div className="relative" style={{ height: chartHeight + 24 }}>
          {/* Y-axis grid lines */}
          {Array.from({ length: yTicks + 1 }).map((_, i) => {
            const y = chartHeight - (i / yTicks) * chartHeight;
            const label = Math.round((i / yTicks) * maxVal);
            return (
              <div key={i} className="absolute left-0 right-0 flex items-center" style={{ top: y }}>
                <span className="w-10 text-[10px] text-text-muted text-right pr-2">
                  {label}
                </span>
                <div className="flex-1 border-t border-white/[0.04]" />
              </div>
            );
          })}

          {/* Bars */}
          <div className="absolute left-12 right-0 bottom-0 flex items-end" style={{ height: chartHeight }}>
            {data.dates.map((date, di) => {
              const isWeek = new Date(date).getDay() === 0;
              const totalHeight = activeTypes.reduce(
                (sum, t) => sum + (data.series[t][di] / maxVal) * chartHeight,
                0,
              );
              return (
                <div
                  key={date}
                  className="flex-1 flex items-end justify-center gap-px h-full"
                  title={`${date}: ${activeTypes.map((t) => `${TYPE_LABELS[t] || t} ${data.series[t][di]}`).join(", ")}`}
                >
                  <div className="flex flex-col-reverse items-center w-full" style={{ maxHeight: "100%" }}>
                    {activeTypes.map((t) => {
                      const h = (data.series[t][di] / maxVal) * chartHeight;
                      if (h < 1) return null;
                      return (
                        <div
                          key={t}
                          className="w-full transition-all duration-300 rounded-t-sm opacity-90 hover:opacity-100"
                          style={{
                            height: `${h}px`,
                            backgroundColor: TYPE_COLORS[t] || "#666",
                            minHeight: h > 0 ? "2px" : undefined,
                          }}
                        />
                      );
                    })}
                    {/* Date label: show every 5 days */}
                    {di % 5 === 0 && (
                      <span className="text-[9px] text-text-muted/60 mt-1 truncate w-full text-center">
                        {date.slice(5)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Summary footer */}
      <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center gap-4 text-[11px] text-text-muted">
        <span>近 30 天总计</span>
        {types.map((t) => (
          <span key={t}>
            {TYPE_LABELS[t] || t}: {data.series[t].reduce((a, b) => a + b, 0)}
          </span>
        ))}
      </div>
    </div>
  );
}
