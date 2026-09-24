# Configurar a sincronização com Google (Supabase)

O GrowBro agora pode sincronizar seus cultivos entre aparelhos usando login
com Google, através do Supabase. Este documento é o passo a passo para
deixar isso funcionando — nada aqui precisa ser repetido depois de feito
uma vez.

## ⚠️ Sobre as credenciais do Google

**O Client Secret do Google nunca deve aparecer em `app.js`, `index.html`
ou qualquer arquivo que rode no navegador.** Este app é 100% client-side —
qualquer coisa escrita no código é visível a quem abrir "Ver código-fonte"
da página. Um Client Secret exposto assim pode ser usado por qualquer
pessoa para se passar pelo seu app perante o Google.

Por isso a arquitetura usada aqui é a recomendada pela própria Supabase:
o Client ID e o Client Secret do Google ficam guardados **no painel do
Supabase**, que faz a troca de tokens do lado do servidor deles. O app só
precisa da URL do projeto Supabase e da chave pública ("publishable"/anon)
— essas duas *são* feitas para ficar no código do navegador; o acesso real
aos dados é controlado por Row Level Security no banco (configurado no
passo 1 abaixo), não pela chave em si.

## Passo 1 — Criar a tabela no Supabase

No painel do Supabase, abra **SQL Editor** → **New query**, cole o SQL
abaixo e rode:

```sql
create table if not exists public.growbro_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.growbro_data enable row level security;

create policy "growbro_select_own"
  on public.growbro_data for select
  using (auth.uid() = user_id);

create policy "growbro_insert_own"
  on public.growbro_data for insert
  with check (auth.uid() = user_id);

create policy "growbro_update_own"
  on public.growbro_data for update
  using (auth.uid() = user_id);
```

Isso cria uma tabela com **uma linha por usuário**, guardando o estado
inteiro do app como JSON, e garante que cada pessoa só enxerga e só
grava a própria linha (Row Level Security).

## Passo 2 — Ativar o login com Google no Supabase

1. No painel do Supabase: **Authentication → Providers → Google**.
2. Ative o provedor.
3. Cole:
   - **Client ID**: `110781350692-srshm8qg5sotcaeofumu23g2qv9nec73.apps.googleusercontent.com`
   - **Client Secret**: o valor que você já tem (não repito aqui por segurança — cole o
     mesmo que está configurado no Google Cloud Console).
4. Salve. O Supabase vai mostrar uma **Callback URL** — ela já deve ser:
   ```
   https://klaktdvanzuooddxlvsb.supabase.co/auth/v1/callback
   ```

## Passo 3 — Autorizar essa Callback URL no Google Cloud Console

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs e serviços →
   Credenciais** → seu Client ID OAuth 2.0.
2. Em **URIs de redirecionamento autorizados**, adicione exatamente:
   ```
   https://klaktdvanzuooddxlvsb.supabase.co/auth/v1/callback
   ```
3. Salve.

## Passo 4 — Autorizar a URL do seu app no Supabase

Isso é o que falta para o login realmente devolver a pessoa pro GrowBro
depois de passar pelo Google.

1. No painel do Supabase: **Authentication → URL Configuration**.
2. Em **Site URL**, coloque a URL onde o GrowBro vai ficar hospedado
   (ex: `https://seu-usuario.github.io/growbro/`).
3. Em **Redirect URLs**, adicione a mesma URL (pode adicionar mais de uma,
   por exemplo uma para produção e outra para testes locais, como
   `http://localhost:5500`).

> Sem isso, o Supabase recusa o redirecionamento de volta e o login falha
> silenciosamente.

## Passo 5 — Hospedar o app num endereço http(s)

**O login com Google não funciona abrindo `index.html` direto do disco
(`file://...`)** — isso é uma exigência do próprio OAuth, não uma
limitação deste app. O resto do GrowBro (tudo que não é login) continua
funcionando 100% localmente, sem servidor nenhum, como sempre funcionou.

Formas rápidas e gratuitas de hospedar:
- **GitHub Pages**: suba `index.html` e `app.js` para um repositório e
  ative Pages nas configurações. Use a URL gerada nos passos 3 e 4.
- **Netlify Drop** ([app.netlify.com/drop](https://app.netlify.com/drop)):
  arraste a pasta com os dois arquivos, pronto.
- **Teste local**: `npx serve` (ou qualquer servidor estático) na pasta do
  projeto, e use `http://localhost:PORTA` nos passos 3 e 4 enquanto testa.

## Como a sincronização se comporta

- **Sem login**: nada muda — os dados continuam só no `localStorage` do
  navegador, como sempre.
- **Ao entrar pela primeira vez** com uma conta que já tem dados na nuvem
  (de outro aparelho) e este aparelho está vazio: adota os dados da nuvem
  automaticamente, sem perguntar.
- **Se este aparelho já tem dados locais** e a nuvem também tem dados
  diferentes: o app pergunta qual usar — **nunca escolhe sozinho** nesse
  caso, mesmo que um pareça "mais recente", porque isso poderia apagar
  histórico de outro aparelho sem avisar.
- **Depois de sincronizado**, qualquer alteração (novo registro, editar
  planta, etc.) é enviada para a nuvem automaticamente, cerca de 1
  segundo depois da alteração.
- A sincronização é do **estado inteiro**, não campo a campo — se você
  editar em dois aparelhos ao mesmo tempo sem esperar a sincronização
  entre um e outro, o último envio prevalece. Não é uma mesclagem
  inteligente linha a linha.

## Testando

1. Confirme que os passos 1–4 foram feitos.
2. Abra o app pela URL hospedada (não por `file://`).
3. Clique em **"Entrar com Google"** na barra lateral.
4. Depois de logar, o rodapé da barra lateral deve mostrar seu e-mail e
   "Sincronizado". Se aparecer "Erro ao sincronizar", confira se a tabela
   do Passo 1 foi criada e se as políticas de RLS estão ativas.
