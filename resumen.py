#!/usr/bin/env python3
"""Resumen del registro de café. Uso: python resumen.py

Lee de la API, que es la fuente de verdad desde el corte a D1. Los CSV del
repo son una exportación, no el original.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date, datetime

API = os.environ.get("COFFEE_API", "https://brew.krahegwen.com")

# Cloudflare responde 403 al User-Agent por defecto de urllib, así que hay que
# identificarse. El dominio propio pasa por el WAF de la zona; workers.dev no.
AGENTE = "coffee-data (+https://github.com/Krahegwen/coffee-data)"


def traer(ruta):
    """GET a la API. La lectura es pública, no hace falta token."""
    peticion = urllib.request.Request(f"{API}{ruta}", headers={"User-Agent": AGENTE})
    try:
        with urllib.request.urlopen(peticion, timeout=15) as respuesta:
            return json.load(respuesta)
    except urllib.error.URLError as error:
        print(f"No se pudo leer {API}{ruta}: {error}", file=sys.stderr)
        raise SystemExit(1)


def num(valor):
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


def main():
    cafes = {c["id"]: c for c in traer("/api/cafes")}
    ext = traer("/api/extracciones")

    notas = [num(e["nota"]) for e in ext if num(e["nota"]) is not None]
    print(f"Extracciones: {len(ext)}   Cafés: {len(cafes)}")
    if notas:
        print(f"Nota media global: {sum(notas)/len(notas):.1f}   Mejor: {max(notas):.0f}")
    print()

    por_cafe = defaultdict(list)
    for e in ext:
        n = num(e["nota"])
        if n is not None:
            por_cafe[e["cafe_id"]].append(n)

    print("RANKING")
    ranking = sorted(por_cafe.items(), key=lambda kv: -sum(kv[1]) / len(kv[1]))
    for cid, ns in ranking:
        nombre = cafes.get(cid, {}).get("nombre", cid)
        print(f"  {sum(ns)/len(ns):4.1f}  {nombre:<16} ({len(ns)} extracc.)")
    print()

    print("HISTÓRICO")
    for e in sorted(ext, key=lambda e: e["id"]):
        dias = e.get("dias_tueste")
        print(f"  #{e['id']:<3} {e['fecha']}  {e.get('cafe_nombre') or e['cafe_id']:<14}"
              f" {e['temp_c']}°C  {e['clics']} clics  {e['reparto']:<12}"
              f" nota {e['nota']:<4} [{e['variable_cambiada']}]"
              f"{'' if dias is None else f'  {dias}d'}")
    print()

    hoy = date.today()
    print("FRESCURA")
    for c in cafes.values():
        if c["estado"] != "abierto" or not c.get("fecha_tueste"):
            continue
        dias = (hoy - datetime.strptime(c["fecha_tueste"], "%Y-%m-%d").date()).days
        aviso = " (pasado de vueltas)" if dias > 60 else ""
        print(f"  {c['nombre']:<16} {dias} días desde tueste{aviso}")


if __name__ == "__main__":
    sys.exit(main())
