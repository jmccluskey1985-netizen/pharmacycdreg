/**
 * PharmacyCDReg.ie logo: same family as the PharmacyConsultation.ie mark:
 * green map-pin with a white disc + cross, then a two-tone wordmark
 * (dark "Pharmacy" / light "CDReg" / dark ".ie") and a grey tagline.
 * Pure SVG so it is crisp at any size and needs no image assets.
 */
const LIGHT = '#54BD50';
const DARK = '#184B21';

export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 80 100" className={className} aria-hidden="true">
      <path d="M40 2C19 2 2 19 2 40c0 27 38 58 38 58s38-31 38-58C78 19 61 2 40 2z" fill={LIGHT} />
      <circle cx="40" cy="38" r="23" fill="#fff" />
      <rect x="34" y="23" width="12" height="30" rx="3" fill={LIGHT} />
      <rect x="25" y="32" width="30" height="12" rx="3" fill={LIGHT} />
    </svg>
  );
}

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  tagline?: boolean;
  /** Use on dark backgrounds: dark-green parts turn white. */
  inverse?: boolean;
  className?: string;
}

const sizes = {
  sm: { mark: 26, text: 'text-lg', tag: 'text-[10px]' },
  md: { mark: 36, text: 'text-2xl', tag: 'text-xs' },
  lg: { mark: 56, text: 'text-4xl', tag: 'text-base' },
};

export function Logo({ size = 'md', tagline = true, inverse = false, className = '' }: LogoProps) {
  const s = sizes[size];
  const dark = inverse ? '#FFFFFF' : DARK;
  return (
    <div className={`flex items-center gap-2.5 ${className}`} role="img" aria-label="PharmacyCDReg.ie">
      <LogoMark size={s.mark} />
      <div className="flex flex-col leading-none">
        <span className={`${s.text} font-bold tracking-tight`}>
          <span style={{ color: dark }}>Pharmacy</span>
          <span style={{ color: LIGHT }}>CDReg</span>
          <span style={{ color: dark }}>.ie</span>
        </span>
        {tagline && (
          <span className={`${s.tag} mt-1 ${inverse ? 'text-white/70' : 'text-neutral-500'}`}>
            Electronic Controlled Drug Register
          </span>
        )}
      </div>
    </div>
  );
}
