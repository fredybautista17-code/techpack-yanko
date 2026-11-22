// Dice si la ventana es angosta (para mostrar tarjetas en vez de tablas). Se actualiza sola al cambiar el tamaño.
import { useEffect, useState } from "react";

export default function useAnchoCorto(px) {
  const q = `(max-width: ${px}px)`;
  const [corto, setCorto] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(q).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const m = window.matchMedia(q);
    const f = () => setCorto(m.matches);
    f();
    if (m.addEventListener) m.addEventListener("change", f); else m.addListener(f);
    return () => { if (m.removeEventListener) m.removeEventListener("change", f); else m.removeListener(f); };
  }, [q]);
  return corto;
}
