# Menino E Menina - Frontend (Sistema de Gestão Comercial)

Este é o frontend da aplicação web **Menino E Menina**, um sistema de gestão comercial, estoque, caixa, vendas e cadastros desenvolvido como parte do Projeto Integrador (**Análise e Desenvolvimento de Sistemas - UniCEUB**).

O repositório contém a **Interface de Usuário (UI)** e a **Lógica Client-side**, construídas em HTML5, CSS3 e JavaScript puro (Single Page Application), integradas a uma API REST hospedada remotamente.

## Funcionalidades Implementadas

- **Dashboard Gerencial:** Indicadores de unidades em estoque, valor financeiro em estoque, saldo estimado do caixa aberto e vendas da sessão atual, acompanhados de gráficos interativos por produto, categoria e movimentação de caixa.
- **Gestão de Produtos e Categorias:** Filtro por categoria e busca por nome, ID ou código de barras, cadastro de novos produtos (com campo opcional de código de barras somente em dígitos), atualização de estoque, ativação/desativação e acesso ao histórico.
- **Vendas (PDV):** Busca rápida de produtos ativos com estoque por nome ou código de barras, montagem de carrinho, seleção opcional de cliente ativo e registro de pagamentos (incluindo pagamento misto via PIX, dinheiro, cartão de débito e cartão de crédito).
- **Controle de Caixa:** Consulta de caixa aberto, abertura de caixa, registro de entradas manuais e retiradas/sangrias, fechamento com conferência de valores e listagem de movimentações.
- **Compras:** Registro de reposição de estoque vinculada a fornecedor ativo, atualizando quantidades sem alterar preços de venda.
- **Cadastros e Auditoria:** Gerenciamento de clientes, fornecedores e funcionários (com máscaras e validações de CPF, CNPJ, telefone e e-mail) e consulta de histórico (`I` — Inclusão e `A` — Alteração).
- **Tela Inicial e Guia de Testes:** *Splash screen* com barra de progresso e cronômetro durante a inicialização do servidor, credenciais de homologação, escopo por perfil de acesso e link para o formulário de avaliação.

## Autenticação e Controle de Acesso

- As credenciais do operador ficam armazenadas **exclusivamente em memória** durante a sessão (nunca em `localStorage`) e são enviadas no corpo das operações protegidas.
- As regras de permissão diferenciam os perfis **PROPRIETARIA** e **VENDEDOR** conforme as rotas da API.

## Tecnologias Utilizadas

- **HTML5:** Estruturação semântica das views, modais e formulários.
- **CSS3:** Estilização responsiva com variáveis CSS (*Custom Properties*), *layout* adaptável e estilos críticos embutidos para a tela inicial.
- **JavaScript (Vanilla):** Gerenciamento de estado em memória, validações, máscaras, renderização de tabelas/gráficos e consumo da API.
- **Fetch API:** Comunicação HTTP assíncrona em JSON com a API REST.

## Arquitetura e Integração

A aplicação funciona como um site estático desacoplado do backend, dispensando servidor Node.js local para rodar no navegador.

### Gerenciamento de "Cold Start" (Render)
Como a API está hospedada no plano gratuito da Render, a primeira requisição após um período de inatividade pode levar cerca de um minuto para responder (*Cold Start*). Na abertura, a interface exibe a tela de inicialização com barra de carregamento e consulta periódica a `GET /api/health` até o servidor ficar disponível.

### Endpoints Consumidos
- **URL Base:** `https://menino-menina-api.onrender.com`
- **Saúde:** `GET /api/health`
- **Categorias:** `GET /api/categorias`
- **Produtos:** `GET /api/produtos` | `POST /api/produtos` | `PATCH /api/produtos/{id}/quantidade` | `PATCH /api/produtos/{id}/ativar` | `PATCH /api/produtos/{id}/desativar`
- **Vendas:** `POST /api/vendas`
- **Caixa:** `GET /api/caixa/aberto` | `GET /api/caixa/{id}/movimentacoes` | `POST /api/caixa/abrir` | `POST /api/caixa/entrada` | `POST /api/caixa/retirada` | `POST /api/caixa/fechar`
- **Compras:** `POST /api/compras`
- **Clientes:** `GET /api/clientes` | `POST /api/clientes` | `PUT /api/clientes/{id}` | `PATCH /api/clientes/{id}/ativar` | `PATCH /api/clientes/{id}/desativar`
- **Fornecedores:** `GET /api/fornecedores` | `POST /api/fornecedores` | `PUT /api/fornecedores/{id}` | `PATCH /api/fornecedores/{id}/ativar` | `PATCH /api/fornecedores/{id}/desativar`
- **Funcionários:** `GET /api/funcionarios` | `POST /api/funcionarios` | `PATCH /api/funcionarios/{id}/ativar` | `PATCH /api/funcionarios/{id}/desativar`
- **Histórico:** `POST /api/historico/{tipo}/{id}`

## Como Executar

### Uso Local
1. Clone ou baixe este repositório.
2. Abra o arquivo `index.html` em um navegador web atualizado (ou sirva os arquivos estáticos via servidor local de sua preferência).

### Versão Online
A aplicação é publicada como *Static Site* na Render conectada à API pública:
- **Aplicação:** [https://menino-e-menina-app.onrender.com](https://menino-e-menina-app.onrender.com)

## Desenvolvedor
- **Marcelo Teixeira** — Frontend e Integração da UI | Projeto Integrador (**UniCEUB** - 2026)
