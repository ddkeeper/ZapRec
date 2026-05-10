interface AppIconProps {
  size?: number
  className?: string
  variant?: 'default' | 'recording'
}

const COLORS = {
  default: {
    ring: '#478A8F',
    dot: '#2C5F63',
  },
  recording: {
    ring: '#EF4444',
    dot: '#B91C1C',
  }
}

export function AppIcon({ size = 28, className, variant = 'default' }: AppIconProps) {
  const colors = COLORS[variant]
  const containerSize = size
  const ringSize = size * 0.78 
  const dotSize = size * 0.18 

  return (
    <div 
      className={`relative ${className || ''}`}
      style={{
        width: containerSize,
        height: containerSize,
        backgroundColor: variant === 'recording' ? '#FEF2F2' : '#F5F9F9',
        borderRadius: '28%',
        border: '1px solid rgba(0, 0, 0, 0.04)',
        boxShadow: '0 2px 6px rgba(71, 138, 143, 0.08)',
        boxSizing: 'border-box',
      }}
    >
      <div 
        className="absolute"
        style={{
          width: ringSize,
          height: ringSize,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          borderRadius: '9999px',
          border: `3.5px solid ${colors.ring}`,
          boxShadow: 'inset 0 1px 3px rgba(245, 249, 249, 0.6), 0 2px 4px rgba(71, 138, 143, 0.12)',
          boxSizing: 'border-box',
        }}
      />
      <div 
        className="absolute"
        style={{
          width: dotSize,
          height: dotSize,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          borderRadius: '9999px',
          backgroundColor: colors.dot,
          boxShadow: '0 1px 2px rgba(44, 95, 99, 0.3)', 
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

export function AppIconRecording({ size = 28, className }: Omit<AppIconProps, 'variant'>) {
  return <AppIcon size={size} className={className} variant="recording" />
}