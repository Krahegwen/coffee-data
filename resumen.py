#!/usr/bin/env python3
"""Resumen del registro de café. Uso: python resumen.py"""
import csv
import sys
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

BASE = Path(__file__).parent


def load(name):
    with open(BASE / name, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def main():
    cafes = {c["id"]: c for c in load("cafes.csv")}
    ext = load("extracciones.csv")

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
    for e in ext:
        print(f"  #{e['id']:<3} {e['fecha']}  {cafes.get(e['cafe_id'],{}).get('nombre',e['cafe_id']):<14}"
              f" {e['temp_c']}°C  {e['clics']} clics  {e['reparto']:<12}"
              f" nota {e['nota']:<4} [{e['variable_cambiada']}]")
    print()

    # aviso de frescura
    hoy = date.today()
    print("FRESCURA")
    for c in cafes.values():
        if c["estado"] != "abierto" or not c["fecha_tueste"]:
            continue
        dias = (hoy - datetime.strptime(c["fecha_tueste"], "%Y-%m-%d").date()).days
        aviso = " (pasado de vueltas)" if dias > 60 else ""
        print(f"  {c['nombre']:<16} {dias} días desde tueste{aviso}")


if __name__ == "__main__":
    sys.exit(main())
