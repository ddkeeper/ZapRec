export default function CapletLogo({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))' }}
    >
      {/* 底座：圆角矩形，深色渐变 */}
      <defs>
        <linearGradient id="capletGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e293b" />  {/* slate-800 */}
          <stop offset="100%" stopColor="#020617" /> {/* slate-950 */}
        </linearGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* 主底座 */}
      <rect 
        x="4" 
        y="4" 
        width="56" 
        height="56" 
        rx="14" 
        ry="14" 
        fill="url(#capletGradient)"
        stroke="#334155"
        strokeWidth="1"
        strokeOpacity="0.5"
      />
      
      {/* Scan 图标：四个角的准星（代表区域捕获/框选） */}
      <g stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity="0.9">
        {/* 左上角 */}
        <path d="M16 22 L16 16 L22 16" />
        {/* 右上角 */}
        <path d="M42 16 L48 16 L48 22" />
        {/* 左下角 */}
        <path d="M16 42 L16 48 L22 48" />
        {/* 右下角 */}
        <path d="M42 48 L48 48 L48 42" />
      </g>
      
      {/* Zap 闪电：核心性能图腾（代表极速、零等待） */}
      <path
        d="M33 26 L28 35 L33 35 L31 44 L38 33 L33 33 L36 26 Z"
        fill="#3b82f6"
        stroke="#60a5fa"
        strokeWidth="1"
        strokeLinejoin="round"
        filter="url(#glow)"
        style={{ 
          transform: 'rotate(5deg)',
          transformOrigin: 'center'
        }}
      />
      
      {/* 闪电内发光 */}
      <path
        d="M33 28 L30 34 L33 34 L32 40"
        fill="#93c5fd"
        opacity="0.6"
        style={{ 
          transform: 'rotate(5deg)',
          transformOrigin: 'center'
        }}
      />
    </svg>
  )
}
