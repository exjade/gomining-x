import React from 'react';

interface PowMinerLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
}

export const PowMinerLogo: React.FC<PowMinerLogoProps> = ({
  className = '',
  size = 'md',
  showSubtitle = false,
}) => {
  // Height scale mapping
  const heightMap = {
    sm: 'h-6',
    md: 'h-8 sm:h-9',
    lg: 'h-11 sm:h-12',
    xl: 'h-14 sm:h-16',
  };

  return (
    <div className={`inline-flex items-center gap-3 select-none group ${className}`}>
      {/* SpaceX-inspired High-Tech Aerodynamic Emblem for PouwMiner */}
      <svg
        viewBox="0 0 310 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${heightMap[size]} w-auto transition-transform duration-300 group-hover:scale-[1.02]`}
        aria-label="PouwMiner Logo"
      >
        <defs>
          <linearGradient id="pouwOrbit" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#a855f7" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="pouwMetal" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#f4f4f5" />
            <stop offset="100%" stopColor="#d4d4d8" />
          </linearGradient>
        </defs>

        {/* Aerodynamic Orbital Arc (SpaceX inspired hypersonic trajectory curve) */}
        <path
          d="M 6 52 C 55 12, 130 2, 304 12"
          stroke="url(#pouwOrbit)"
          strokeWidth="3.2"
          strokeLinecap="round"
          className="opacity-90"
        />
        {/* Orbital ignite beacon */}
        <circle cx="304" cy="12" r="3.2" fill="#ffffff" className="animate-pulse" />

        {/* "POUW" Letters - Clean Aerospace Geometric Type */}
        <text
          x="10"
          y="44"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="900"
          fontSize="35"
          letterSpacing="0.06em"
          fill="url(#pouwMetal)"
          style={{ textTransform: 'uppercase' }}
        >
          POUW
        </text>

        {/* Orbital Trajectory Slash separator */}
        <path
          d="M 132 48 L 146 18"
          stroke="#ffffff"
          strokeWidth="3.5"
          strokeLinecap="square"
          strokeOpacity="0.4"
        />

        {/* "MINER" Letters - High Velocity SpaceX Typography */}
        <text
          x="154"
          y="44"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="800"
          fontSize="35"
          letterSpacing="0.12em"
          fill="#ffffff"
          style={{ textTransform: 'uppercase' }}
        >
          MINER
        </text>

        {/* HUD Target crosshair corner */}
        <path
          d="M 294 34 L 302 34 L 302 42"
          stroke="#ffffff"
          strokeWidth="1.5"
          strokeOpacity="0.4"
        />
      </svg>

      {showSubtitle && (
        <span className="hidden sm:inline-block text-[9px] font-mono uppercase tracking-[0.35em] text-white/40 pl-2 border-l border-white/15">
          Cloud Mining Protocol
        </span>
      )}
    </div>
  );
};
