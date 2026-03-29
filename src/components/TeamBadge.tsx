interface TeamBadgeProps {
  name?: string
  shieldUrl?: string | null
  primaryColor?: string | null
  secondaryColor?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  showName?: boolean
  className?: string
}

const sizes = {
  xs: { wrap: 'h-5 w-5', text: 'text-[9px]' },
  sm: { wrap: 'h-7 w-7', text: 'text-xs' },
  md: { wrap: 'h-9 w-9', text: 'text-sm' },
  lg: { wrap: 'h-16 w-16', text: 'text-lg' },
  xl: { wrap: 'h-20 w-20', text: 'text-xl' },
}

export function TeamBadge({
  name,
  shieldUrl,
  primaryColor,
  secondaryColor,
  size = 'sm',
  showName = false,
  className = '',
}: TeamBadgeProps) {
  const { wrap, text } = sizes[size]

  const icon = shieldUrl ? (
    <img
      src={shieldUrl}
      alt={name ?? ''}
      className={`${wrap} rounded-full object-contain bg-slate-800 border border-white/10 flex-shrink-0`}
    />
  ) : name ? (
    <div
      className={`${wrap} ${text} rounded-full flex items-center justify-center font-bold border border-white/20 flex-shrink-0`}
      style={{
        backgroundColor: primaryColor || '#1e293b',
        color: secondaryColor || '#94a3b8',
      }}
    >
      {name.charAt(0)}
    </div>
  ) : null

  if (!showName) return <span className={className}>{icon}</span>

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {icon}
      {name && <span>{name}</span>}
    </span>
  )
}
