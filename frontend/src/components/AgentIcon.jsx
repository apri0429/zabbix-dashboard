/* Ikon robot asisten AI (kepala robot + antena + headset). Badan memakai
   currentColor; `face` = warna kaca depan & lubang antena, samakan dengan
   warna latar tempat ikon dipasang supaya mata terlihat "menyala". */
export default function AgentIcon({ size = 24, face = "#2a5db0", animate = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={animate ? "agent-ico agent-ico--on" : "agent-ico"}>
      {animate && (
        <style>{`
          @keyframes agent-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-1px) } }
          @keyframes agent-blink { 0%,92%,100% { transform: scaleY(1) } 96% { transform: scaleY(0.1) } }
          @keyframes agent-ping { 0%,100% { opacity: 1; transform: scale(1) } 50% { opacity: .35; transform: scale(.7) } }
          .agent-ico--on { animation: agent-bob 3s ease-in-out infinite }
          .agent-ico--on .agent-eye { transform-box: fill-box; transform-origin: center; animation: agent-blink 4.2s infinite }
          .agent-ico--on .agent-led { transform-box: fill-box; transform-origin: center; animation: agent-ping 1.4s ease-in-out infinite }
          @media (prefers-reduced-motion: reduce) { .agent-ico--on, .agent-ico--on .agent-eye, .agent-ico--on .agent-led { animation: none } }
        `}</style>
      )}
      {/* antena */}
      <rect x="11.3" y="3.2" width="1.4" height="2.6" rx="0.7" fill="currentColor" />
      <circle className="agent-led" cx="12" cy="2.6" r="1.6" fill="currentColor" />
      {/* kepala */}
      <rect x="4.2" y="5.6" width="15.6" height="12" rx="4.6" fill="currentColor" />
      {/* kaca depan + mata */}
      <rect x="6.4" y="8.2" width="11.2" height="6.4" rx="3.2" fill={face} />
      <circle className="agent-eye" cx="9.7" cy="11.4" r="1.25" fill="currentColor" />
      <circle className="agent-eye" cx="14.3" cy="11.4" r="1.25" fill="currentColor" />
      {/* headset: earcup kiri-kanan + mic */}
      <rect x="1.6" y="9" width="2.6" height="5.8" rx="1.3" fill="currentColor" />
      <rect x="19.8" y="9" width="2.6" height="5.8" rx="1.3" fill="currentColor" />
      <path d="M21.1 14.6 C21.1 19.2 17.4 19.8 14.2 19.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="13.2" cy="19.8" r="1.35" fill="currentColor" />
    </svg>
  );
}
