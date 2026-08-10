#!/usr/bin/env python3
"""
Lê data/colecao.csv (editado manualmente pelo dono da coleção) e gera
docs/data.json, que é a única fonte de dados consumida pelo dashboard
(docs/index.html + docs/app.js).

Rodar localmente:
    python scripts/atualizar_dashboard.py

O GitHub Actions roda este mesmo script automaticamente sempre que
data/colecao.csv é alterado (ver .github/workflows/atualizar.yml).
"""

import csv
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CSV_PATH = BASE_DIR / "data" / "colecao.csv"
JSON_PATH = BASE_DIR / "docs" / "data.json"

# Fuso de Brasília (fixo, sem horário de verão desde 2019)
BRASILIA_TZ = timezone(timedelta(hours=-3))

STATUS_VALIDOS = {
    "tenho": "tenho",
    "owned": "tenho",
    "encomendado": "encomendado",
    "ordered": "encomendado",
    "quero": "quero",
    "wished": "quero",
    "desejo": "quero",
}

STATUS_LABEL = {
    "tenho": "Tenho",
    "encomendado": "Encomendado",
    "quero": "Quero",
}

COLUNAS_OBRIGATORIAS = ["nome", "status"]


def limpar_texto(valor):
    """Remove espaços extras e normaliza célula vazia/NaN para None."""
    if valor is None:
        return None
    valor = valor.strip()
    return valor if valor else None


def normalizar_status(valor, linha_num):
    valor_limpo = (valor or "").strip().lower()
    status = STATUS_VALIDOS.get(valor_limpo)
    if status is None:
        raise ValueError(
            f"Linha {linha_num}: status '{valor}' inválido. "
            f"Use um destes: {sorted(set(STATUS_VALIDOS.values()))}"
        )
    return status


def ler_csv():
    if not CSV_PATH.exists():
        print(f"ERRO: arquivo não encontrado: {CSV_PATH}")
        sys.exit(1)

    itens = []
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        leitor = csv.DictReader(f)

        colunas_faltando = [c for c in COLUNAS_OBRIGATORIAS if c not in (leitor.fieldnames or [])]
        if colunas_faltando:
            print(f"ERRO: coluna(s) obrigatória(s) faltando no CSV: {colunas_faltando}")
            sys.exit(1)

        for i, linha in enumerate(leitor, start=2):  # start=2 pois linha 1 é o cabeçalho
            nome = limpar_texto(linha.get("nome"))
            if not nome:
                print(f"Aviso: linha {i} sem 'nome' — pulando.")
                continue

            try:
                status = normalizar_status(linha.get("status"), i)
            except ValueError as e:
                print(f"ERRO: {e}")
                sys.exit(1)

            item = {
                "id": i - 1,
                "nome": nome,
                "categoria": limpar_texto(linha.get("categoria")) or "Sem categoria",
                "franquia": limpar_texto(linha.get("franquia")) or "Sem franquia",
                "status": status,
                "imagem_url": limpar_texto(linha.get("imagem_url")),
                "link_mfc": limpar_texto(linha.get("link_mfc")),
                "lancamento": limpar_texto(linha.get("lancamento")),
                "observacao": limpar_texto(linha.get("observacao")),
            }
            itens.append(item)

    print(f"Lidas {len(itens)} linhas válidas de {CSV_PATH.name}")
    return itens


def montar_resumo(itens):
    total = len(itens)
    por_status = {"tenho": 0, "encomendado": 0, "quero": 0}
    por_categoria = {}
    por_franquia = {}

    for item in itens:
        por_status[item["status"]] += 1
        por_categoria[item["categoria"]] = por_categoria.get(item["categoria"], 0) + 1
        por_franquia[item["franquia"]] = por_franquia.get(item["franquia"], 0) + 1

    return {
        "total": total,
        "tenho": por_status["tenho"],
        "encomendado": por_status["encomendado"],
        "quero": por_status["quero"],
        "por_categoria": dict(sorted(por_categoria.items(), key=lambda x: -x[1])),
        "por_franquia": dict(sorted(por_franquia.items(), key=lambda x: -x[1])),
    }


def validar_antes_de_gravar(dados):
    """Checagem mínima para não gravar um JSON obviamente quebrado."""
    if dados["resumo"]["total"] == 0:
        print("ERRO: nenhum item válido encontrado — abortando para não sobrescrever o data.json com coleção vazia.")
        sys.exit(1)
    if not dados["itens"]:
        print("ERRO: lista de itens vazia — abortando.")
        sys.exit(1)


def main():
    itens = ler_csv()
    resumo = montar_resumo(itens)

    agora = datetime.now(BRASILIA_TZ).strftime("%d/%m/%Y %H:%M")

    dados = {
        "atualizado_em": agora,
        "resumo": resumo,
        "status_labels": STATUS_LABEL,
        "itens": itens,
    }

    validar_antes_de_gravar(dados)

    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)

    print(f"OK: {JSON_PATH.relative_to(BASE_DIR)} atualizado com {resumo['total']} itens "
          f"(tenho={resumo['tenho']}, encomendado={resumo['encomendado']}, quero={resumo['quero']})")


if __name__ == "__main__":
    main()
