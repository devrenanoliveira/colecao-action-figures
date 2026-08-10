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
import re
import sys
import unicodedata
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

VALORES_SIM = {"sim", "s", "yes", "y", "true", "1"}

# Ordem importa: tenta UTF-8 primeiro (padrão correto); cp1252 é o mais comum quando o
# Excel/Windows salva o CSV em "ANSI"; latin-1 nunca falha, fica como último recurso.
ENCODINGS_TENTATIVAS = ["utf-8-sig", "cp1252", "latin-1"]

# Nomes alternativos aceitos por campo — o usuário pode digitar o cabeçalho de formas
# diferentes (com/sem acento, com espaço ou underscore) e o script reconhece assim mesmo.
# As chaves de ALIASES já estão normalizadas (sem acento, minúsculo, underscore).
ALIASES_COLUNA = {
    "nome": ["nome"],
    "linha": ["linha", "linha_produto"],
    "categoria": ["categoria"],
    "franquia": ["franquia"],
    "status": ["status"],
    "imagem_url": ["imagem_url", "imagem", "url_imagem", "foto"],
    "link_mfc": ["link_mfc", "link", "mfc", "link_myfigurecollection"],
    "lancamento": ["lancamento", "data_lancamento", "ano"],
    "observacao": ["observacao", "obs", "nota", "notas"],
    "interesse_venda": [
        "interesse_venda", "venda", "a_venda", "interesse_na_venda",
        "a_venda_", "vender", "interessado_em_vender",
    ],
}


def normalizar_chave(chave):
    """Remove acento, espaços e caixa de um nome de coluna pra comparar sem frescura.
    Ex: 'Interesse na Venda' → 'interesse_na_venda'."""
    if chave is None:
        return ""
    sem_acento = unicodedata.normalize("NFKD", chave).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "_", sem_acento.strip().lower()).strip("_")


def mapear_colunas(fieldnames):
    """Associa cada nome de campo interno (ex: 'interesse_venda') à coluna real do CSV
    que o usuário usou (ex: 'Interesse na Venda'), tentando os aliases conhecidos."""
    normalizados = {normalizar_chave(fn): fn for fn in (fieldnames or [])}
    mapa = {}
    for campo, aliases in ALIASES_COLUNA.items():
        for alias in aliases:
            if alias in normalizados:
                mapa[campo] = normalizados[alias]
                break
    return mapa


def pegar(linha, mapa, campo):
    coluna_real = mapa.get(campo)
    return linha.get(coluna_real) if coluna_real else None


def limpar_texto(valor):
    """Remove espaços extras e normaliza célula vazia/NaN para None."""
    if valor is None:
        return None
    valor = valor.strip()
    return valor if valor else None


def normalizar_bool(valor):
    """Converte texto livre (sim/não, s/n, yes/no...) em booleano. Vazio/ausente = False."""
    if valor is None:
        return False
    return valor.strip().lower() in VALORES_SIM


def normalizar_status(valor, linha_num):
    valor_limpo = (valor or "").strip().lower()
    status = STATUS_VALIDOS.get(valor_limpo)
    if status is None:
        raise ValueError(
            f"Linha {linha_num}: status '{valor}' inválido. "
            f"Use um destes: {sorted(set(STATUS_VALIDOS.values()))}"
        )
    return status


def detectar_delimitador(amostra):
    """Detecta se o CSV usa ',' ou ';' como separador.

    O Excel em português (pt-BR) exporta CSV com ';' por padrão (porque ','
    é o separador decimal). Detectar automaticamente evita que o script
    quebre toda vez que o usuário reabrir/resalvar o arquivo no Excel.
    """
    try:
        return csv.Sniffer().sniff(amostra, delimiters=",;").delimiter
    except csv.Error:
        # Fallback: conta qual aparece mais na primeira linha
        primeira_linha = amostra.splitlines()[0] if amostra else ""
        return ";" if primeira_linha.count(";") >= primeira_linha.count(",") else ","


def ler_conteudo_com_fallback():
    """Lê os bytes do CSV e tenta decodificar em UTF-8 primeiro; se o arquivo tiver sido
    salvo pelo Excel no Windows como 'CSV (ANSI)' ou similar, cai pra cp1252/latin-1 em vez
    de travar o script inteiro com um UnicodeDecodeError."""
    bruto = CSV_PATH.read_bytes()
    for encoding in ENCODINGS_TENTATIVAS:
        try:
            return bruto.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    # latin-1 nunca deveria falhar (mapeia todo byte 0-255), mas por segurança:
    print("ERRO: não foi possível decodificar o CSV em nenhuma codificação conhecida.")
    sys.exit(1)


def ler_csv():
    if not CSV_PATH.exists():
        print(f"ERRO: arquivo não encontrado: {CSV_PATH}")
        sys.exit(1)

    conteudo, encoding_usado = ler_conteudo_com_fallback()
    if encoding_usado != "utf-8-sig":
        print(f"Aviso: o CSV não estava em UTF-8 — lido como '{encoding_usado}'. "
              f"Se algum acento aparecer errado no dashboard, salve o arquivo como "
              f"'CSV UTF-8 (Comma delimited)' no Excel/Planilhas Google da próxima vez.")

    delimitador = detectar_delimitador(conteudo[:2048])
    print(f"Delimitador detectado: '{delimitador}'")

    itens = []
    leitor = csv.DictReader(conteudo.splitlines(), delimiter=delimitador)
    mapa = mapear_colunas(leitor.fieldnames)

    colunas_faltando = [c for c in COLUNAS_OBRIGATORIAS if c not in mapa]
    if colunas_faltando:
        print(f"ERRO: coluna(s) obrigatória(s) faltando no CSV: {colunas_faltando} "
              f"(cabeçalho encontrado: {leitor.fieldnames})")
        sys.exit(1)

    for i, linha in enumerate(leitor, start=2):  # start=2 pois linha 1 é o cabeçalho
        nome = limpar_texto(pegar(linha, mapa, "nome"))
        if not nome:
            # Linha totalmente em branco (comum no final do arquivo ao salvar pelo Excel) — ignora silenciosamente.
            if any(limpar_texto(v) for v in linha.values()):
                print(f"Aviso: linha {i} sem 'nome' — pulando.")
            continue

        try:
            status = normalizar_status(pegar(linha, mapa, "status"), i)
        except ValueError as e:
            print(f"ERRO: {e}")
            sys.exit(1)

        item = {
            "id": i - 1,
            "nome": nome,
            "linha_produto": limpar_texto(pegar(linha, mapa, "linha")),
            "categoria": limpar_texto(pegar(linha, mapa, "categoria")) or "Sem categoria",
            "franquia": limpar_texto(pegar(linha, mapa, "franquia")) or "Sem franquia",
            "status": status,
            "imagem_url": limpar_texto(pegar(linha, mapa, "imagem_url")),
            "link_mfc": limpar_texto(pegar(linha, mapa, "link_mfc")),
            "lancamento": limpar_texto(pegar(linha, mapa, "lancamento")),
            "observacao": limpar_texto(pegar(linha, mapa, "observacao")),
            "interesse_venda": normalizar_bool(pegar(linha, mapa, "interesse_venda")),
        }
        itens.append(item)

    print(f"Lidas {len(itens)} linhas válidas de {CSV_PATH.name}")
    return itens


def montar_resumo(itens):
    total = len(itens)
    por_status = {"tenho": 0, "encomendado": 0, "quero": 0}
    por_categoria = {}
    por_franquia = {}
    a_venda = 0

    for item in itens:
        por_status[item["status"]] += 1
        por_categoria[item["categoria"]] = por_categoria.get(item["categoria"], 0) + 1
        por_franquia[item["franquia"]] = por_franquia.get(item["franquia"], 0) + 1
        if item["interesse_venda"]:
            a_venda += 1

    return {
        "total": total,
        "tenho": por_status["tenho"],
        "encomendado": por_status["encomendado"],
        "quero": por_status["quero"],
        "a_venda": a_venda,
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
