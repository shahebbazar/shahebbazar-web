"use client";

import { useEffect, useRef, useState } from "react";
import { localiseDigits } from "@/lib/format";
import { fill, type Locale } from "@/lib/i18n";
import { providerText, shortMonths } from "@/lib/i18n-provider";

// Daily profile views and search appearances, as two lines on one axis.

type Row = { day: string; views: number; appearances: number };

const SERIES = [
    { key: "views", label: "profileViews", color: "#2563eb" },
    { key: "appearances", label: "searchAppearances", color: "#16a34a" },
] as const;

// Drawn at the container's measured width, so text stays true pixel size on any screen.
const INITIAL_W = 640;
const H = 240;
const PAD = { top: 12, right: 12, bottom: 28, left: 44 };
const PLOT_H = H - PAD.top - PAD.bottom;
const Y_TICKS = 4;
const FONT = 12;

/** "2026-09-03" -> "Sep 3" (Bangla: "৩ সেপ্টে"). Parsed by hand: new Date() would apply a timezone. */
function shortDate(day: string, locale: Locale): string {
    const [, m, d] = day.split("-").map(Number);
    const month = shortMonths(locale)[m - 1];
    return locale === "bn" ? `${localiseDigits(String(d), locale)} ${month}` : `${month} ${d}`;
}

/** Smallest 1/2/5 x 10^n step that fits the maximum in Y_TICKS steps. */
function niceMax(max: number): { top: number; step: number } {
    if (max <= 0) return { top: Y_TICKS, step: 1 };
    const raw = max / Y_TICKS;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((f) => f * magnitude).find((s) => s >= raw)!;
    return { top: step * Y_TICKS, step };
}

export function TrendChart({ series, locale = "en" }: { series: Row[]; locale?: Locale }) {
    const copy = providerText(locale);
    const fmt = (n: number) => localiseDigits(n.toLocaleString("en-US"), locale);
    const date = (day: string) => shortDate(day, locale);
    const [pointed, setActive] = useState<number | null>(null);
    const [W, setW] = useState(INITIAL_W);
    const frame = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = frame.current;
        if (!el) return;
        const observer = new ResizeObserver(([entry]) => {
            setW(Math.max(280, Math.round(entry.contentRect.width)));
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    if (series.length === 0) return null;

    const PLOT_W = W - PAD.left - PAD.right;

    // Ignores a hover position left over from a longer series after switching period.
    const active = pointed !== null && pointed < series.length ? pointed : null;

    const max = Math.max(...series.map((r) => Math.max(r.views, r.appearances)));
    const { top, step } = niceMax(max);

    const x = (i: number) =>
        PAD.left + (series.length === 1 ? PLOT_W / 2 : (i / (series.length - 1)) * PLOT_W);
    const y = (v: number) => PAD.top + PLOT_H - (v / top) * PLOT_H;

    const point = (key: "views" | "appearances", i: number) =>
        `${x(i).toFixed(1)},${y(series[i][key]).toFixed(1)}`;
    // Complete days, solid; the step into today, dashed.
    const donePath = (key: "views" | "appearances") =>
        series
            .slice(0, Math.max(1, series.length - 1))
            .map((_, i) => `${i === 0 ? "M" : "L"}${point(key, i)}`)
            .join("");
    const todayPath = (key: "views" | "appearances") =>
        series.length > 1 ? `M${point(key, series.length - 2)}L${point(key, series.length - 1)}` : "";
    const areaPath = (key: "views" | "appearances") =>
        `${donePath(key)}L${x(Math.max(0, series.length - 2)).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;

    // Date labels at least ~70px apart, always including the first and last day.
    const last = series.length - 1;
    const maxLabels = Math.max(2, Math.floor(PLOT_W / 70));
    const labelEvery = Math.max(1, Math.ceil(last / (maxLabels - 1)));
    const xLabels = series
        .map((r, i) => ({ i, day: r.day }))
        .filter(({ i }) => i === last || (i % labelEvery === 0 && last - i >= labelEvery * 0.75));

    function indexFromPointer(e: React.PointerEvent<SVGSVGElement>) {
        const box = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - box.left) / box.width) * W;
        const ratio = (px - PAD.left) / PLOT_W;
        return Math.min(series.length - 1, Math.max(0, Math.round(ratio * (series.length - 1))));
    }

    function onKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            const delta = e.key === "ArrowRight" ? 1 : -1;
            setActive((current) =>
                Math.min(series.length - 1, Math.max(0, (current ?? series.length - 1) + delta))
            );
        } else if (e.key === "Escape") {
            setActive(null);
        }
    }

    const shown = active === null ? null : series[active];

    return (
        <div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem] text-muted">
                {SERIES.map((s) => (
                    <li key={s.key} className="flex items-center gap-2">
                        <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ backgroundColor: s.color }} />
                        {copy[s.label]}
                    </li>
                ))}
                {series.length > 1 && (
                    <li className="flex items-center gap-2">
                        <span aria-hidden className="w-4 border-t-2 border-dashed border-soft" />
                        {copy.chartToday}
                    </li>
                )}
            </ul>

            <div ref={frame} className="relative mt-3">
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    className="block h-auto w-full touch-pan-y outline-none focus-visible:ring-3 focus-visible:ring-brand-100"
                    role="img"
                    aria-label={fill(copy.chartLabel, { from: date(series[0].day), to: date(series[series.length - 1].day) })}
                    tabIndex={0}
                    onPointerMove={(e) => setActive(indexFromPointer(e))}
                    onPointerDown={(e) => setActive(indexFromPointer(e))}
                    onPointerLeave={(e) => {
                        if (e.pointerType === "mouse") setActive(null);
                    }}
                    onKeyDown={onKeyDown}
                    onBlur={() => setActive(null)}
                >
                    {/* Recessive hairline grid and y-axis values. */}
                    {Array.from({ length: Y_TICKS + 1 }, (_, t) => {
                        const value = t * step;
                        return (
                            <g key={t}>
                                <line
                                    x1={PAD.left}
                                    x2={W - PAD.right}
                                    y1={y(value)}
                                    y2={y(value)}
                                    stroke="#e6eaf2"
                                    strokeWidth={1}
                                />
                                <text
                                    x={PAD.left - 8}
                                    y={y(value)}
                                    textAnchor="end"
                                    dominantBaseline="middle"
                                    fontSize={FONT}
                                    fill="#64748b"
                                >
                                    {fmt(value)}
                                </text>
                            </g>
                        );
                    })}

                    {xLabels.map(({ i, day }) => (
                        <text
                            key={day}
                            x={x(i)}
                            y={H - 8}
                            textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"}
                            fontSize={FONT}
                            fill="#64748b"
                        >
                            {date(day)}
                        </text>
                    ))}

                    {SERIES.map((s) => (
                        <path key={`area-${s.key}`} d={areaPath(s.key)} fill={s.color} fillOpacity={0.08} />
                    ))}
                    {SERIES.map((s) => (
                        <g key={`line-${s.key}`}>
                            <path
                                d={donePath(s.key)}
                                fill="none"
                                stroke={s.color}
                                strokeWidth={2}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                            <path
                                d={todayPath(s.key)}
                                fill="none"
                                stroke={s.color}
                                strokeWidth={2}
                                strokeDasharray="3 4"
                                strokeLinecap="round"
                            />
                        </g>
                    ))}

                    {/* End-of-line markers, or the crosshair when active. */}
                    {active === null ? (
                        SERIES.map((s) => (
                            <circle
                                key={`end-${s.key}`}
                                cx={x(series.length - 1)}
                                cy={y(series[series.length - 1][s.key])}
                                r={4}
                                fill={s.color}
                                stroke="#ffffff"
                                strokeWidth={2}
                            />
                        ))
                    ) : (
                        <g>
                            <line
                                x1={x(active)}
                                x2={x(active)}
                                y1={PAD.top}
                                y2={PAD.top + PLOT_H}
                                stroke="#94a3b8"
                                strokeWidth={1}
                            />
                            {SERIES.map((s) => (
                                <circle
                                    key={`dot-${s.key}`}
                                    cx={x(active)}
                                    cy={y(series[active][s.key])}
                                    r={4.5}
                                    fill={s.color}
                                    stroke="#ffffff"
                                    strokeWidth={2}
                                />
                            ))}
                        </g>
                    )}
                </svg>

                {shown && active !== null && (
                    <div
                        role="status"
                        className="pointer-events-none absolute top-0 z-10 min-w-[170px] rounded-lg border border-line bg-surface px-3 py-2 text-[0.8125rem] shadow-float"
                        style={
                            // Flips to the left of the crosshair in the right half.
                            x(active) > W / 2
                                ? { right: `${100 - (x(active) / W) * 100 + 2}%` }
                                : { left: `${(x(active) / W) * 100 + 2}%` }
                        }
                    >
                        <p className="font-semibold">
                            {date(shown.day)}
                            {active === last && <span className="font-normal text-muted"> · {copy.chartTodayShort}</span>}
                        </p>
                        {SERIES.map((s) => (
                            <p key={s.key} className="mt-1 flex items-center gap-2 text-muted">
                                <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                                <span className="flex-1">{copy[s.label]}</span>
                                <span className="font-semibold text-ink tabular-nums">{fmt(shown[s.key])}</span>
                            </p>
                        ))}
                    </div>
                )}
            </div>

            <details className="mt-3 text-[0.8125rem]">
                <summary className="cursor-pointer text-muted hover:text-ink">{copy.chartTable}</summary>
                <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-line">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-surface-2 text-muted">
                            <tr>
                                <th scope="col" className="px-3 py-2 font-medium">{copy.chartDay}</th>
                                <th scope="col" className="px-3 py-2 text-right font-medium">{copy.profileViews}</th>
                                <th scope="col" className="px-3 py-2 text-right font-medium">{copy.searchAppearances}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                            {series.map((r) => (
                                <tr key={r.day}>
                                    <td className="px-3 py-1.5">
                                        {date(r.day)}
                                        {r === series[last] && <span className="text-muted"> ({copy.chartTodayShort})</span>}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.views)}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.appearances)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </details>
        </div>
    );
}
