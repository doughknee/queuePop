type Props = {
  src: string
  alt: string
  className?: string
  /** Glow tint behind the frame. */
  glow?: 'teal' | 'gold' | 'none'
  priority?: boolean
}

/**
 * A real app screenshot dressed in the Hextech window treatment: corner
 * brackets, hairline gold border, soft glow. The shots already carry the app's
 * own dark chrome, so they blend straight into the page.
 */
export function Shot({ src, alt, className = '', glow = 'teal', priority = false }: Props) {
  return (
    <div className={`relative ${className}`}>
      {glow !== 'none' && (
        <div className={`absolute -inset-5 -z-10 ${glow === 'teal' ? 'glow-teal' : 'glow-gold'}`} />
      )}
      <div className="framed hextech-strong p-1.5 transition-shadow duration-300 hover:shadow-[0_0_34px_-10px_rgba(10,200,185,0.45)]">
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          className="block w-full"
          draggable={false}
        />
      </div>
    </div>
  )
}
