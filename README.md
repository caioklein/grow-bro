<div align="center">

# 🌿 GrowBro

**Um diário de cultivo simples e com possibilidade de ser 100% local**

Pode ser acessado pelo link: https://caioklein.github.io/grow-bro/ ou usado localmente na sua máquina com os arquivos desse repositório.

Acompanhe rega, nutrientes, ambiente (temperatura, umidade, VPD, PPFD, DLI) e o desenvolvimento de
cada planta, dia após dia, com faixas de referência inteligentes, gráficos interativos e importação
direta de planilhas.

![Feito com](https://img.shields.io/badge/feito%20com-HTML5%20%7C%20CSS3%20%7C%20JavaScript-6FAE7C?style=flat-square)
![Sem build step](https://img.shields.io/badge/build%20step-nenhum-5FA8BF?style=flat-square)
![100% client-side](https://img.shields.io/badge/dados-100%25%20locais-D9A64E?style=flat-square)
![Licença](https://img.shields.io/badge/licença-GNU%20GPL%203.0-9B84C9?style=flat-square)

</div>

---

## Sumário

- [Por que este projeto existe](#por-que-este-projeto-existe)
- [Funcionalidades](#funcionalidades)
- [Como usar](#como-usar)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Como funciona por baixo dos panos](#como-funciona-por-baixo-dos-panos)
- [Faixas de referência usadas](#faixas-de-referência-usadas)
- [Privacidade e dados](#privacidade-e-dados)
- [Roadmap](#roadmap)
- [Contribuindo](#contribuindo)
- [Créditos](#créditos)
- [Licença](#licença)

---

## 🌱 Por que este projeto existe

Planilhas de cultivo funcionam, mas ficam confusas rápido: abas demais, fórmulas quebradas, sem
visão geral, sem gráficos de verdade. O **GrowBro** é a alternativa — um app de página
única que roda direto no navegador, guarda tudo no seu computador, e transforma anotações diárias
em algo que dá pra *olhar* e entender de relance.


## ✨ Funcionalidades

### 🪴 Cultivos & plantas
- Vários cultivos em paralelo, cada um com seu próprio histórico e plantas.
- Diferenciação entre cultivo **Fotoperíodo** e **Automática** — isso muda as faixas de referência
  de pH e de luz usadas em todo o app.
- Várias plantas por cultivo, com leituras de saída (pH, PPM, EC) individuais por planta.
- Marque um cultivo como **finalizado** quando a colheita acontecer.

### 📋 Registros diários
- Um formulário por dia: estágio, atividade, nutrientes, litros, pH/PPM/EC de entrada,
  temperatura, umidade, VPD (calculado automaticamente), PPFD, DLI e leitura de saída por planta.
- **VPD sempre calculado automaticamente** a partir de temperatura e umidade, já considerando a
  folha ~2 °C mais fria que o ar.
- Campo livre de **observações** por registro.
- Data pré-preenchida com o dia atual, mas sempre editável.
- Clique em qualquer linha da tabela de registros para expandir os detalhes.

### 🧪 Nutrientes & programa de nutrição
- Catálogo de nutrientes agrupado por **categoria e ordem correta de mistura na água**
  (sílica → cálcio/magnésio → enraizadores → base → potencializadores → carboidratos → finalização).
- Linha completa Smart Grow já cadastrada; adicione qualquer nutriente próprio a qualquer momento.
- **Programas de nutrição**: monte uma tabela de nutrientes por semana (um bloco pode cobrir várias
  semanas de uma vez, ex. "3-5"), vincule a um cultivo, e aplique a semana certa direto num registro
  novo — os nutrientes e doses já vêm preenchidos.

### 📥 Importar planilha
- Envie um `.xlsx` no formato do app (Estágio, Data, Atividade, Nutrientes, Ph/PPM/EC de entrada,
  Temperatura, Umidade, VPD, PPFD, DLI + colunas de leitura por planta) e cada aba compatível vira
  um cultivo novo — plantas, nutrientes, atividades e estágios já preenchidos.
- Detecta e recupera problemas comuns de planilha (números que viraram datas por acidente, umidade
  guardada como fração, etc.) em vez de importar valores errados.

### 🏠 Visão Geral
- Página inicial de cada cultivo com uma linha do tempo do estágio atual, estimativa de colheita
  (com base na duração típica de floração, ou no ciclo padrão de automáticas), resumo rápido e um
  gráfico de temperatura/umidade dos últimos 7 dias **registrados**.

### 📈 Gráficos (aba Tendências)
- Temperatura & umidade, VPD, PPFD & DLI, pH/EC de entrada, e comparativos de EC/pH de saída entre
  plantas — todos lado a lado, do mesmo tamanho.
- **Passe o mouse** (ou toque, no celular) sobre qualquer gráfico para ver a data e os valores exatos
  daquele dia.
- **Filtro de intervalo de datas** com atalhos de 7 dias / 30 dias / tudo.
- Linhas continuam de um ponto a outro mesmo quando falta um dado no meio, sem quebrar o traçado.

### 🎨 Interface
- Tema claro, pastel, com boa legibilidade — tipografia serifada para títulos, monoespaçada para
  números.
- **pH e VPD ganham um selo colorido** (verde = ideal / amarelo = atenção / vermelho = fora da
  faixa) de acordo com o estágio e o tipo de cultivo, em tempo real enquanto você digita.
- Cada tipo de atividade tem sua própria cor.
- Barra lateral **recolhível** no desktop, com avatares coloridos por cultivo — o estado fica salvo.
- **Layout dedicado para celular**: a barra lateral vira uma gaveta, a tabela de registros vira
  cartões, os modais ocupam a tela toda e um botão flutuante substitui o "+ Novo registro" do topo
  — mesma identidade visual, pensado para uso com o polegar.

### ☁️ Sincronização com Google
- Entre com sua conta Google para sincronizar os cultivos entre vários aparelhos.
- Sem login, o app funciona 100% offline como sempre — a sincronização é opcional.
- Ao logar, se um aparelho estiver vazio e o outro tiver dados, adota o que existe automaticamente;
  se os dois tiverem dados diferentes, **pergunta antes de sobrescrever** qualquer um dos lados.
- Configuração (chaves, SQL, painel do Supabase) em [`SYNC-SETUP.md`](./SYNC-SETUP.md) — leva uns
  10 minutos e só precisa ser feito uma vez.

## 🚀 Como usar

Não tem build, não tem instalação, não precisa de Node nem de servidor.

1. Baixe `index.html` e `app.js` para a **mesma pasta**.
2. Abra `index.html` num navegador (desktop ou celular — o layout se adapta sozinho).
3. Pronto. Crie seu primeiro cultivo e comece a registrar.

> Internet é usada para carregar as fontes (Google Fonts), a biblioteca de leitura de planilhas
> (SheetJS) e, se você optar por usar, o cliente do Supabase para sincronização — nada é enviado
> para fora do seu navegador além do que você mesmo sincronizar.
>
> A sincronização com Google **exige que o app esteja hospedado num endereço `http(s)`** (GitHub
> Pages, Netlify, etc.) — é uma exigência do OAuth, não deste app. Sem login, abrir `index.html`
> direto do disco continua funcionando normalmente. Veja [`SYNC-SETUP.md`](./SYNC-SETUP.md).

## 📁 Estrutura do projeto

```
.
├── index.html        # estrutura, estilos (design system em CSS custom properties) e modais
├── app.js             # toda a lógica do app: estado, renderização, gráficos, importação, sync
├── README.md
└── SYNC-SETUP.md      # passo a passo pra ativar a sincronização com Google
```

Um único módulo JavaScript, sem framework, sem bundler, sem dependência de build — só HTML, CSS e
JS "vanilla" bem organizados.

## 🧠 Como funciona por baixo dos panos

- **Estado**: um objeto de estado em memória, persistido no `localStorage` a cada mudança
  (`diario-cultivo:v2`). Migração automática de dados salvos por versões anteriores do app.
- **Renderização**: funções puras que geram HTML a partir do estado (`renderSidebar`, `renderMain`,
  `renderRegistrosPanel`, etc.) — sem virtual DOM, sem framework, `innerHTML` direto e event
  listeners reatribuídos a cada render.
- **Gráficos**: SVG desenhado à mão (`drawLineChart`), com uma camada de captura de mouse/toque para
  o tooltip interativo — sem biblioteca de gráficos.
- **Importação de planilha**: [SheetJS](https://sheetjs.com/) lê o `.xlsx` inteiramente no
  navegador; um parser dedicado (`parseGrowSheet`) reconhece o layout de colunas mescladas do
  template e converte cada aba num cultivo.
- **Cálculos**: VPD (com ajuste de temperatura foliar), DLI e as faixas ideais de pH/VPD/luz são
  calculados em funções puras isoladas, fáceis de testar e ajustar.
- **Layout mobile**: media queries reorganizam sidebar, tabela e modais abaixo de 780px de largura —
  o mesmo HTML e os mesmos dados, só a apresentação muda.
- **Sincronização**: [Supabase](https://supabase.com/) cuida do login com Google e guarda o estado
  inteiro como JSON numa tabela protegida por Row Level Security (uma linha por usuário). O app só
  fala com a Supabase pela URL do projeto e a chave pública — o Client Secret do Google fica só no
  painel do Supabase, nunca no código. Detalhes em [`SYNC-SETUP.md`](./SYNC-SETUP.md).

## 🌡️ Faixas de referência usadas

Essas faixas alimentam os selos coloridos de pH/VPD e as dicas de PPFD/DLI. São referências gerais
— ajuste como preferir para a sua rotina.

**pH da solução de entrada**

| Tipo de cultivo | Faixa ideal |
|---|---|
| Fotoperíodo | 6,0 – 7,0 |
| Automática | 5,8 – 6,5 |

**VPD por estágio** (igual para os dois tipos)

| Estágio | Faixa ideal (kPa) |
|---|---|
| Germinação / Muda | 0,4 – 0,8 |
| Vegetativo / Pré-floração | 0,8 – 1,2 |
| Floração / Flush | 1,0 – 1,5 |

**Estimativa de colheita**

| Tipo | Base do cálculo |
|---|---|
| Automática | 70–100 dias a partir do início do cultivo |
| Fotoperíodo | 56–63 dias a partir do início da Floração registrada |

## 🔒 Privacidade e dados

Por padrão, tudo fica no `localStorage` do navegador em que você abriu o app — nada é enviado
para nenhum servidor. Isso também quer dizer:

- Trocar de navegador ou de computador começa do zero (a menos que você importe uma planilha de
  novo, ou **entre com sua conta Google** — veja [`SYNC-SETUP.md`](./SYNC-SETUP.md)).
- Limpar os dados do site apaga o histórico local (se não estiver sincronizado, apaga de vez).
- Modo anônimo/privado não persiste entre sessões — evite para uso contínuo.
- Com a sincronização ativada, o estado do cultivo passa a existir também no banco do Supabase,
  protegido por Row Level Security — só a conta dona dos dados consegue lê-los ou escrevê-los.

## 🗺️ Roadmap

Ideias que ficaram de fora por enquanto, mas fariam sentido num próximo passo:

- [ ] Exportar/importar um backup em JSON de todos os cultivos.
- [ ] Modo escuro.
- [ ] Anexar fotos às plantas/registros.
- [ ] PWA instalável com funcionamento 100% offline garantido.

## 🤝 Contribuindo

Pull requests são bem-vindos. Como é um projeto de arquivo único sem build, o fluxo é simples:

1. Edite `index.html` e/ou `app.js` diretamente.
2. Abra `index.html` no navegador para testar.
3. Descreva a mudança no PR.

## 🙏 Créditos

- Linha de nutrientes [Smart Grow](https://smartgrow.com.br/) usada como catálogo padrão.
- Tipografia [Fraunces](https://fonts.google.com/specimen/Fraunces) e
  [IBM Plex](https://fonts.google.com/specimen/IBM+Plex+Sans), via Google Fonts.
- Leitura de planilhas com [SheetJS](https://sheetjs.com/).

## 📜 Licença

Distribuído sob a licença GPL-3.0 license
