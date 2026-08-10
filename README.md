# Coleção de Action Figures — Dashboard

Dashboard público da minha coleção de action figures, com os itens que já tenho, os que estão encomendados e os que estão na minha lista de desejos. Feito para compartilhar com quem tiver interesse em comprar algum item da coleção.

🔗 Depois de publicado no GitHub Pages, o link do dashboard fica em:
`https://<seu-usuario>.github.io/colecao-action-figures/`

## Como atualizar a coleção

Toda a coleção vive em **`data/colecao.csv`** — um arquivo de planilha simples que dá pra editar direto pelo site do GitHub, sem precisar instalar nada:

1. No GitHub, abra o arquivo `data/colecao.csv`.
2. Clique no ícone de lápis (editar) no canto superior direito do arquivo.
3. Adicione, edite ou apague linhas seguindo o mesmo formato das existentes.
4. Role até o final da página e clique em **"Commit changes..."** para salvar direto na branch `main`.
5. Pronto — o GitHub Actions detecta a mudança automaticamente, roda o script e atualiza o dashboard publicado em poucos minutos (sem precisar fazer mais nada).

Se preferir editar em lote (mais rápido pra colar várias figures de uma vez), é mais fácil abrir esse CSV no Excel/Google Sheets, editar por lá, e depois colar o conteúdo de volta no editor do GitHub — só cuidado pra manter a primeira linha (cabeçalho) intacta. O script aceita tanto `,` quanto `;` como separador (detecta sozinho), então salvar pelo Excel em português — que usa `;` por padrão — funciona sem configurar nada.

### Colunas do CSV

| Coluna | Obrigatória? | Descrição |
|---|---|---|
| `nome` | Sim | Nome da figure |
| `linha` | Não | Linha/série do produto — ex: Match Makers, Figuarts ZERO, Pop Up Parade, S.H.Figuarts |
| `categoria` | Não | Ex: Estátua, Figure Articulada, Nendoroid, Prize |
| `franquia` | Não | Ex: Dragon Ball Z, Demon Slayer, One Piece |
| `status` | Sim | `tenho`, `encomendado` ou `quero` |
| `imagem_url` | Não | Link direto para uma imagem da figure (ex: print do MFC, foto sua) |
| `link_mfc` | Não | Link da página do item no MyFigureCollection |
| `lancamento` | Não | Data/ano de lançamento, texto livre (ex: `2026-11`) |
| `observacao` | Não | Qualquer nota curta (ex: "caixa lacrada", "edição limitada") |

Linhas com `status` fora de `tenho/encomendado/quero` fazem o script parar com um erro explicando qual linha está errada — isso evita publicar um dashboard com dado quebrado.

## Por que não busca os dados automaticamente do MyFigureCollection?

O robots.txt do MyFigureCollection bloqueia explicitamente bots de IA e scraping automatizado, e a API pública deles foi descontinuada. Por isso este projeto usa um CSV editado manualmente como fonte dos dados, em vez de um scraper — assim o dashboard não corre o risco de quebrar por bloqueio ou violar os termos do site. Você pode continuar usando o MyFigureCollection normalmente como seu catálogo pessoal e replicar aqui só o que quiser deixar público.

## Publicar no GitHub Pages (só precisa fazer uma vez)

1. No repositório, vá em **Settings → Pages**.
2. Em "Build and deployment" → "Source", selecione **Deploy from a branch**.
3. Em "Branch", selecione `main` e a pasta **`/docs`**, depois clique em **Save**.
4. Em alguns minutos o site fica no ar em `https://<seu-usuario>.github.io/colecao-action-figures/`.

Também é necessário habilitar permissão de escrita para o workflow poder commitar o `data.json` automaticamente:

1. **Settings → Actions → General → Workflow permissions**.
2. Selecione **"Read and write permissions"** e salve.

## Testar localmente antes de publicar

```bash
# 1. Gerar o data.json a partir do CSV
python scripts/atualizar_dashboard.py

# 2. Servir a pasta docs/ localmente (fetch de arquivo local não funciona com file://)
cd docs && python -m http.server 8000
```

Depois acesse `http://localhost:8000` no navegador.

## Estrutura do projeto

```
data/colecao.csv              → fonte de dados editável (você edita isso)
scripts/atualizar_dashboard.py → lê o CSV e gera docs/data.json
docs/index.html                → estrutura da página
docs/style.css                 → visual do dashboard
docs/app.js                    → lê data.json e renderiza tudo
docs/data.json                 → gerado automaticamente, não editar à mão
.github/workflows/atualizar.yml → roda o script sempre que o CSV muda
```

## Rodando manualmente pelo GitHub (sem editar o CSV)

Se quiser forçar a atualização do dashboard sem alterar o CSV: vá na aba **Actions** do repositório → workflow **"Atualizar Dashboard da Coleção"** → **Run workflow**.
