type Props = { size?: number; showWord?: boolean; className?: string };

export function CleviaGear({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} style={{ width: size, height: size }} aria-label="CLEVIA">
      <defs>
        <linearGradient id="clv-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>
        <linearGradient id="clv-gear" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id="clv-accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id="clv-wave" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
        <filter id="clv-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#clv-bg)" />
      <rect x="16" y="16" width="480" height="240" rx="112" fill="#ffffff" opacity="0.06" />
      <circle cx="256" cy="256" r="170" fill="none" stroke="#7dd3fc" strokeWidth="2.5" opacity="0.25" strokeDasharray="6 10" />

      <g filter="url(#clv-glow)">
        <path d="M340 150c-26-22-57-33-90-29-34 4-64 22-84 50-20 28-26 62-18 95 8 33 28 60 57 76 29 16 64 18 95 8"
          fill="none" stroke="url(#clv-gear)" strokeWidth="34" strokeLinecap="round" />
      </g>

      <circle cx="340" cy="150" r="16" fill="url(#clv-gear)" />
      <circle cx="300" cy="342" r="13" fill="#38bdf8" />
      <circle cx="178" cy="350" r="10" fill="#7dd3fc" opacity="0.8" />
      <circle cx="256" cy="256" r="14" fill="url(#clv-accent)" filter="url(#clv-glow)" />

      <g transform="translate(256,256) rotate(-20)">
        <path d="M-40 60 Q-20 40 0 50 Q20 60 40 40"
          fill="none" stroke="url(#clv-wave)" strokeWidth="10" strokeLinecap="round" opacity="0.9" />
      </g>

      <g fill="#fbbf24" opacity="0.9">
        <path d="M400 200 l4 12 12 4 -12 4 -4 12 -4 -12 -12 -4 12 -4 z" />
        <path d="M120 300 l3 9 9 3 -9 3 -3 9 -3 -9 -9 -3 9 -3 z" opacity="0.7" />
      </g>
    </svg>
  );
}

export default function CleviaLogo({ size = 40, showWord = true, className = '' }: Props) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <CleviaGear size={size} />
      {showWord && (
        <span className="font-extrabold tracking-tight bg-gradient-to-r from-sky-400 via-blue-500 to-blue-600 bg-clip-text text-transparent">
          CLEVIA
        </span>
      )}
    </div>
  );
}
