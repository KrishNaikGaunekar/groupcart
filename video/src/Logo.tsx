import React from "react";

/** The team's mark (assets/logo-mark.svg): a cart whose basket is a chat bubble. */
export const Logo: React.FC<{ size: number; dots?: [number, number, number]; ink?: string }> = ({ size, dots = [1, 1, 1], ink = "#16181D" }) => (
  <svg width={size} height={size} viewBox="0 0 120 120">
    <path d="M8 22 H22 L34 46" fill="none" stroke={ink} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
    <rect x={28} y={30} width={84} height={54} rx={18} fill="#F25C1F" />
    <path d="M40 80 L32 98 L62 84 Z" fill="#F25C1F" />
    {[52, 70, 88].map((cx, i) => (
      <circle key={cx} cx={cx} cy={57} r={6.5} fill="#F2F0EA" opacity={dots[i]} />
    ))}
    <circle cx={54} cy={108} r={8} fill={ink} />
    <circle cx={96} cy={108} r={8} fill={ink} />
  </svg>
);

/** The mark on a white disc, for use as a contact photo. */
export const LogoAvatar: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: "#FFF4EC", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #F3D9C8" }}>
    <Logo size={size * 0.66} />
  </div>
);
