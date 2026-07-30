"use client";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function CollectionChart({ data }: { data: { label: string; value: number }[] }) {
  return (
    <div className="mt-2 h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="gradCollection" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-fg-subtle)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "var(--color-fg-subtle)" }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v: unknown) => [`₹ ${Number(v).toLocaleString("en-IN")}`, "Collected"]}
          />
          <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill="url(#gradCollection)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
