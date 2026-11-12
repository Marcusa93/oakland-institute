import { describe, expect, it } from "vitest";
import { limpiarTexto, unirRenglones } from "@/lib/digitalizar";
import { extracto, minutosLectura } from "@/app/panel/biblioteca/comun";

describe("texto digitalizado", () => {
  it("une renglones cortados sin tocar títulos ni listas", () => {
    const ocr = "My Favourite Animal\nMy favourite animal is the dog. Dogs are\nfriendly and very loyal.\nKids 2 - Reading\n\ngo - went - gone\neat - ate - eaten";
    expect(unirRenglones(ocr)).toBe(
      "My Favourite Animal\nMy favourite animal is the dog. Dogs are friendly and very loyal.\nKids 2 - Reading\n\ngo - went - gone\neat - ate - eaten");
  });

  it("limpia espacios, guiones de corte y renglones vacíos de más", () => {
    expect(limpiarTexto("  Hello   world \r\n\n\n\nThis is a beau-\ntiful day ")).toBe("Hello world\n\nThis is a beautiful day");
  });

  it("estima la lectura y arma el extracto", () => {
    expect(minutosLectura(null)).toBe(0);
    expect(minutosLectura(Array(240).fill("word").join(" "))).toBe(2);
    expect(extracto("uno dos tres", 160)).toBe("uno dos tres");
    expect(extracto(Array(80).fill("palabra").join(" "), 100).endsWith("…")).toBe(true);
  });
});
