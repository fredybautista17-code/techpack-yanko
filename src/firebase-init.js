// (2026-11-19, a pedido de Fredy) Se importa PRIMERO en index.js, antes que App y los módulos, para que Firestore se inicie
// una sola vez con una caché en memoria que NO borra los datos apenas se cierra una pantalla (por defecto sí los borra: cada vez
// que se salía de Planeación o Corte y se volvía a entrar, se descargaban otra vez todas las colecciones).
// Es solo memoria (no se guarda en disco): al recargar la página o cerrarla se limpia, así que no queda nada en el computador.
// Cada módulo sigue haciendo getFirestore(app): devuelve esta misma instancia.
import { initializeApp, getApps } from "firebase/app";
import { initializeFirestore, memoryLocalCache, memoryLruGarbageCollector } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBDNvCaem-IbP0Z87eBt1pBtDy8sZdkEqc",
  authDomain: "techpack-yanko-f37b8.firebaseapp.com",
  projectId: "techpack-yanko-f37b8",
  storageBucket: "techpack-yanko-f37b8.firebasestorage.app",
  messagingSenderId: "700796768091",
  appId: "1:700796768091:web:5ab0db90c17390e6e7547e",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
try {
  initializeFirestore(app, {
    localCache: memoryLocalCache({ garbageCollector: memoryLruGarbageCollector({ cacheSizeBytes: 100 * 1024 * 1024 }) }),
  });
} catch (e) {
  // Si Firestore ya estaba iniciado se deja como está: todo sigue funcionando, solo sin esta mejora.
}
export default app;
