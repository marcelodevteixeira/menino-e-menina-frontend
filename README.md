# Menino E Menina - Frontend (Módulo de Produtos)

Este é o frontend da aplicação web "Menino E Menina", um sistema de gestão de catálogo e estoque de moda infantil, desenvolvido como parte do Projeto Integrador (Análise e Desenvolvimento de Sistemas - UniCEUB).

Este repositório contém estritamente a **Interface de Usuário (UI)** e a **Lógica de Comunicação (Client-side)**, desenvolvidas em HTML, CSS e JavaScript puros (Single Page Application). O backend do sistema foi desenvolvido separadamente.

## 🎯 Objetivo do Projeto

Prover uma interface limpa, intuitiva e amigável para que a administração da loja possa:
- Visualizar o catálogo completo de produtos em um formato de *dashboard*.
- Navegar rapidamente pelas categorias de vestuário e brinquedos.
- Monitorar a disponibilidade de estoque em tempo real com indicadores visuais de criticidade.
- Cadastrar novos itens no sistema de forma dinâmica.
- Realizar atualizações rápidas de quantidade no inventário.

## ⚙️ Tecnologias Utilizadas

- **HTML5:** Estruturação semântica do layout.
- **CSS3:** Estilização baseada em variáveis (Custom Properties), design responsivo (Mobile-first) e animações suaves, garantindo uma interface moderna e minimalista.
- **JavaScript (Vanilla):** Lógica de negócios no frontend, manipulação do DOM e comunicação assíncrona com o servidor.
- **API Fetch:** Integração HTTP com a API RESTful do backend.

## 🔌 Integração e Arquitetura

O frontend atua de forma totalmente desacoplada, conectando-se a uma API REST hospedada remotamente. Não há dependência de ambientes locais como Node.js para execução da interface, facilitando o deploy via serviços de hospedagem estática.

### Gerenciamento de "Cold Start" (Render)
A API do projeto está hospedada no plano gratuito da plataforma Render. Para garantir uma excelente experiência do usuário e contornar a suspensão do servidor por inatividade ("Cold Start"), a interface implementa uma lógica de **Health Check**:
Ao ser acessada, a aplicação exibe uma tela amigável de "Conectando ao servidor" e realiza requisições contínuas à rota `GET /api/health` do backend. O catálogo de produtos só é carregado e exibido após o servidor retornar um *status OK*, prevenindo erros de tela quebrada.

### Contrato da API Consumida
- **URL Base:** `https://menino-menina-api.onrender.com`
- **Health Check:** `GET /api/health`
- **Categorias:** `GET /api/categorias`
- **Produtos:** `GET /api/produtos` | `POST /api/produtos` | `PATCH /api/produtos/{id}/quantidade`

*Nota: O backend (Java, Quarkus, Banco H2) foi desenvolvido colaborativamente e o seu código fonte e documentação própria podem ser encontrados no repositório correspondente.*

## 🚀 Como Executar

Por ser uma aplicação web estática, a execução é imediata e não requer instalação de dependências.

**Opção 1: Uso Local**
1. Clone ou baixe este repositório.
2. Abra o arquivo `index.html` em qualquer navegador web atual (Google Chrome, Firefox, Edge).

**Opção 2: Versão Online (Hospedagem)**
O projeto está hospedado diretamente na nuvem (Static Site no Render) e conectado à API pública.
- **Acessar a Aplicação:** [https://loja-menino-e-menina.onrender.com]

## 👨‍💻 Desenvolvedor
- **Marcelo Teixeira** - Responsável pelo Frontend e Integração da UI. Projeto Integrador (UniCEUB - 2026).
