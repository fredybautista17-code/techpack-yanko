import { interpretarTextoLogo, planLogos, limpiarLineas, nombreDeArchivo } from "./ficha-logos";

describe("interpretarTextoLogo", () => {
  test("nombre, código rotulado y tipo", () => {
    const r = interpretarTextoLogo("LOGO KAMILA PECHO\nCOD: KP-102\nDTF", "foto1.jpg");
    expect(r).toMatchObject({ nombre: "LOGO KAMILA PECHO", codigo: "KP-102", tipo: "DTF", deArchivo: false });
  });
  test("código suelto con números", () => {
    const r = interpretarTextoLogo("Logo Yanko espalda\n4587\nvinilo", "x.png");
    expect(r.codigo).toBe("4587");
    expect(r.tipo).toBe("Vinilo");
    expect(r.nombre).toBe("Logo Yanko espalda");
  });
  test("ruido del OCR se descarta y sin texto usa el nombre del archivo", () => {
    const r = interpretarTextoLogo("~~ ;; | \n l  \n", "logo_kamila-pecho.JPG");
    expect(r.nombre).toBe("logo kamila pecho");
    expect(r.deArchivo).toBe(true);
    expect(r.tipo).toBeNull();
    expect(r.codigo).toBe("");
  });
  test("tipo bordado / sublimación", () => {
    expect(interpretarTextoLogo("Escudo\nBordado", "a.jpg").tipo).toBe("Bordado");
    expect(interpretarTextoLogo("Escudo sublimacion", "a.jpg").tipo).toBe("Sublimación");
  });
  test("el tipo no queda dentro del nombre", () => {
    expect(interpretarTextoLogo("DTF Corazon rojo", "a.jpg").nombre).toBe("Corazon rojo");
  });
  test("limpiarLineas y nombreDeArchivo", () => {
    expect(limpiarLineas("ok bien\n§§§\n--").length).toBe(1);
    expect(nombreDeArchivo("a_b-c.png")).toBe("a b c");
  });
});

describe("planLogos", () => {
  const ex = [{ id: "1", nombre: "Logo Kamila", codigo: "KP-1" }];
  test("marca existentes por nombre o código, repetidos del lote y sin nombre", () => {
    const p = planLogos(ex, [
      { nombre: "logo kamila", codigo: "" },
      { nombre: "Otro", codigo: "kp-1" },
      { nombre: "Nuevo", codigo: "" },
      { nombre: "NUEVO", codigo: "" },
      { nombre: "", codigo: "" },
    ]);
    expect(p.map((x) => x.estado)).toEqual(["existe", "existe", "nuevo", "repetidoLote", "sinNombre"]);
    expect(p[0].dup.id).toBe("1");
  });
});
