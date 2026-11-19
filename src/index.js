import "./firebase-init";
import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

// (2026-11-19) Los módulos grandes (Planeación, Corte, Contabilidad…) se cargan cuando se entra a ellos: mientras llega el
// archivo se ve este aviso en vez de una pantalla en blanco.
function CargandoModulo() {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#5A5A7A", fontFamily: "system-ui, sans-serif", fontWeight: 700, fontSize: 14 }}>
      Cargando módulo…
    </div>
  );
}

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <Suspense fallback={<CargandoModulo />}>
      <App />
    </Suspense>
  </StrictMode>
);

// Ya con la pantalla lista, se van trayendo en segundo plano los dos módulos más usados para que al entrar abran al instante.
window.addEventListener("load", () => {
  setTimeout(() => {
    import("./modulo-planeacion").catch(() => {});
    import("./modulo-corte").catch(() => {});
  }, 4000);
});
