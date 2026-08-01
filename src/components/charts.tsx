type DonutDatum = { label: string; value: number; color: string };

export function DonutChart({ data, centerLabel, centerSublabel }: {
  data: DonutDatum[];
  centerLabel?: string;
  centerSublabel?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative w-44 h-44 flex-shrink-0">
        <svg viewBox="0 0 180 180" className="w-full h-full -rotate-90">
          <circle cx="90" cy="90" r={radius} fill="none" stroke="currentColor" strokeWidth="20" className="text-slate-100 dark:text-slate-800" />
          {total > 0 && data.map((d, i) => {
            const fraction = d.value / total;
            const dash = fraction * circumference;
            const offset = cumulative * circumference;
            cumulative += fraction;
            return (
              <circle key={i} cx="90" cy="90" r={radius} fill="none" stroke={d.color}
                strokeWidth="20" strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset} strokeLinecap="butt" />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-slate-900 dark:text-white">{centerLabel ?? total}</span>
          {centerSublabel && <span className="text-xs text-slate-500 dark:text-slate-400">{centerSublabel}</span>}
        </div>
      </div>
      <div className="flex-1 space-y-2 w-full">
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ background: d.color }} />
              <span className="text-sm text-slate-600 dark:text-slate-300">{d.label}</span>
            </div>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarChart({ data, colorFrom = 'from-cyan-500', colorTo = 'to-sky-400' }: {
  data: { label: string; value: number }[];
  colorFrom?: string;
  colorTo?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end justify-between gap-2 h-48">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{d.value}</span>
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-t-lg flex items-end" style={{ height: '100%' }}>
            <div className={`w-full bg-gradient-to-t ${colorFrom} ${colorTo} rounded-t-lg transition-all duration-500`}
              style={{ height: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function LineChart({ data, color = '#06b6d4' }: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const width = 100;
  const height = 100;
  const points = data.map((d, i) => ({
    x: (i / Math.max(data.length - 1, 1)) * width,
    y: height - (d.value / max) * (height - 10) - 5,
  label: d.label,
    value: d.value,
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-48">
        <defs>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#lineGradient)" />
        <path d={path} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="1.5" fill={color} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="flex justify-between mt-2">
        {data.map((d, i) => (
          <span key={i} className="text-xs text-slate-500 dark:text-slate-400 capitalize">{d.label}</span>
        ))}
      </div>
    </div>
  );
}
