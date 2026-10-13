      // Configurações e Estado Central da Aplicação
      const BASE_URL = 'https://menino-menina-api.onrender.com';
      
      let state = {
        categories: [],
        products: [],
        selectedCategoryId: null, // null significa "Todas as Categorias"
        searchQuery: '',
        isServerReady: false,
        healthCheckIntervalId: null,
        startTime: Date.now()
      };

      // Formatador monetário brasileiro em Reais
      const currencyFormatter = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });

      // Sistema de Notificações Toast
      function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let iconSvg = '';
        if (type === 'success') {
          iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        } else if (type === 'error') {
          iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
        } else {
          iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
        }

        toast.innerHTML = `
          ${iconSvg}
          <div style="flex: 1;">${message}</div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transform = 'translateY(8px)';
          toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
          setTimeout(() => {
            if (toast.parentNode) {
              toast.parentNode.removeChild(toast);
            }
          }, 250);
        }, 4000);
      }

      // Regra Crítica de Inicialização: Health Check a cada 5 segundos
      function startHealthCheck() {
        const overlay = document.getElementById('cold-start-overlay');
        const timerElem = document.getElementById('cold-start-elapsed');

        // Cronômetro visual amigável do tempo de resposta
        const timerInterval = setInterval(() => {
          if (state.isServerReady) {
            clearInterval(timerInterval);
            return;
          }
          const elapsedSecs = Math.floor((Date.now() - state.startTime) / 1000);
          if (timerElem) {
            timerElem.textContent = `${elapsedSecs}s`;
          }
        }, 1000);

        async function checkHealth() {
          try {
            const response = await fetch(`${BASE_URL}/api/health`, {
              method: 'GET',
              headers: {
                'Accept': 'application/json'
              }
            });

            if (response.status === 200) {
              const data = await response.json();
              if (data && data.status === 'ok') {
                state.isServerReady = true;
                clearInterval(state.healthCheckIntervalId);
                clearInterval(timerInterval);

                // Esconde a tela de carregamento (overlay)
                if (overlay) {
                  overlay.classList.add('hidden');
                }

                // Dispara busca inicial de categorias e produtos
                await Promise.all([
                  loadCategories(),
                  loadProducts()
                ]);

                showToast('Servidor conectado com sucesso!', 'success');
              }
            }
          } catch (err) {
            // Continua tentando silenciosamente a cada 5 segundos
            console.warn('Verificando disponibilidade do servidor Render...', err);
          }
        }

        // Executa imediatamente a primeira verificação
        checkHealth();

        // Se ainda não estiver pronto, verifica a cada 5 segundos
        state.healthCheckIntervalId = setInterval(() => {
          if (!state.isServerReady) {
            checkHealth();
          }
        }, 5000);
      }

      // Buscar Categorias: GET /api/categorias
      async function loadCategories() {
        try {
          const response = await fetch(`${BASE_URL}/api/categorias`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            }
          });

          if (!response.ok) {
            throw new Error(`Falha ao obter categorias: HTTP ${response.status}`);
          }

          const data = await response.json();
          state.categories = Array.isArray(data) ? data : [];
          renderCategories();
          populateCategorySelect();
        } catch (error) {
          console.error('Erro ao carregar categorias:', error);
          showToast('Não foi possível carregar a lista de categorias.', 'error');
        }
      }

      // Renderizar Categorias no Menu Lateral
      function renderCategories() {
        const container = document.getElementById('categories-container');
        if (!container) return;

        // Limpa lista mantendo item "Todas as Categorias"
        container.innerHTML = '';

        // Item "Todas as Categorias"
        const allLi = document.createElement('li');
        const isAllActive = state.selectedCategoryId === null;
        allLi.innerHTML = `
          <button class="category-item ${isAllActive ? 'active' : ''}" data-category-id="">
            <span>Todas as Categorias</span>
            <span class="category-count">${state.products.length}</span>
          </button>
        `;
        allLi.querySelector('button').addEventListener('click', () => {
          selectCategory(null, 'Todos os Produtos');
        });
        container.appendChild(allLi);

        // Cada categoria retornada da API
        state.categories.forEach(cat => {
          const li = document.createElement('li');
          const isActive = state.selectedCategoryId === cat.id;
          
          // Quantidade de produtos pertencentes a essa categoria
          const count = state.products.filter(p => p.categoriaId === cat.id).length;

          li.innerHTML = `
            <button class="category-item ${isActive ? 'active' : ''}" data-category-id="${cat.id}">
              <span>${escapeHtml(cat.nome)}</span>
              <span class="category-count">${count}</span>
            </button>
          `;

          li.querySelector('button').addEventListener('click', () => {
            selectCategory(cat.id, cat.nome);
          });

          container.appendChild(li);
        });
      }

      // Preencher o Select do Modal de Cadastro com as Categorias Reais
      function populateCategorySelect() {
        const select = document.getElementById('product-category');
        if (!select) return;

        select.innerHTML = '<option value="" disabled selected>Selecione uma categoria...</option>';
        state.categories.forEach(cat => {
          const option = document.createElement('option');
          option.value = cat.id;
          option.textContent = cat.nome;
          select.appendChild(option);
        });
      }

      // Selecionar Categoria
      function selectCategory(categoryId, categoryName) {
        state.selectedCategoryId = categoryId;
        
        // Atualiza título da seção
        const titleElem = document.getElementById('current-category-title');
        if (titleElem) {
          titleElem.textContent = categoryName || 'Todos os Produtos';
        }

        // Fecha sidebar no mobile se estiver aberta
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('open')) {
          sidebar.classList.remove('open');
        }

        // Recarrega produtos da categoria selecionada
        loadProducts();
      }

      // Buscar Produtos: GET /api/produtos (com opcional ?categoriaId=ID)
      async function loadProducts() {
        const grid = document.getElementById('products-grid');
        const countLabel = document.getElementById('products-count-label');

        try {
          let url = `${BASE_URL}/api/produtos`;
          if (state.selectedCategoryId !== null) {
            url += `?categoriaId=${encodeURIComponent(state.selectedCategoryId)}`;
          }

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            }
          });

          if (!response.ok) {
            throw new Error(`Falha ao obter produtos: HTTP ${response.status}`);
          }

          const data = await response.json();
          state.products = Array.isArray(data) ? data : [];
          
          renderProducts();
          renderCategories(); // atualiza os contadores
        } catch (error) {
          console.error('Erro ao carregar produtos:', error);
          showToast('Erro ao carregar produtos do servidor.', 'error');
          if (grid) {
            grid.innerHTML = `
              <div class="empty-state">
                <div class="empty-state-title">Erro ao carregar produtos</div>
                <div class="empty-state-text">Não foi possível carregar os produtos do servidor. Verifique sua conexão e tente novamente.</div>
                <button class="btn-primary" onclick="loadProducts()">Tentar Novamente</button>
              </div>
            `;
          }
        }
      }

      // Renderizar Lista de Produtos em Cards
      function renderProducts() {
        const grid = document.getElementById('products-grid');
        const countLabel = document.getElementById('products-count-label');
        if (!grid) return;

        // Aplica filtro de busca por texto se houver
        let filtered = state.products;
        if (state.searchQuery.trim() !== '') {
          const query = state.searchQuery.toLowerCase().trim();
          filtered = filtered.filter(p => 
            (p.nome && p.nome.toLowerCase().includes(query)) ||
            (p.categoriaNome && p.categoriaNome.toLowerCase().includes(query))
          );
        }

        // Atualiza rótulo de contagem
        if (countLabel) {
          countLabel.textContent = `${filtered.length} ${filtered.length === 1 ? 'produto encontrado' : 'produtos encontrados'}`;
        }

        // Se vazio, exibe estado amigável
        if (filtered.length === 0) {
          grid.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-title">Nenhum produto encontrado</div>
              <div class="empty-state-text">
                ${state.searchQuery ? 'Não encontramos produtos com o termo buscado.' : 'Não há produtos cadastrados nesta categoria no momento.'}
              </div>
              <button class="btn-primary" id="empty-state-add-btn">
                <span>Cadastrar Novo Produto</span>
              </button>
            </div>
          `;
          const emptyAddBtn = document.getElementById('empty-state-add-btn');
          if (emptyAddBtn) {
            emptyAddBtn.addEventListener('click', openProductModal);
          }
          return;
        }

        grid.innerHTML = '';

        filtered.forEach(product => {
          const card = document.createElement('div');
          card.className = 'product-card';
          card.id = `product-card-${product.id}`;

          const priceFormatted = currencyFormatter.format(product.preco || 0);
          const quantity = Number(product.quantidade) || 0;

          let stockBadgeClass = 'high';
          let stockBadgeText = 'Em Estoque';
          if (quantity === 0) {
            stockBadgeClass = 'zero';
            stockBadgeText = 'Esgotado';
          } else if (quantity <= 10) {
            stockBadgeClass = 'medium';
            stockBadgeText = 'Estoque Baixo';
          }

          card.innerHTML = `
            <div>
              <div class="card-header">
                <div class="card-category">${escapeHtml(product.categoriaNome || 'Geral')}</div>
                <h3 class="card-title">${escapeHtml(product.nome)}</h3>
                <div class="card-price">${priceFormatted}</div>
              </div>

              <div class="card-stock-info">
                <span class="stock-label">Estoque atual:</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="stock-value" id="stock-val-${product.id}">${quantity} un.</span>
                  <span class="stock-badge ${stockBadgeClass}" id="stock-badge-${product.id}">${stockBadgeText}</span>
                </div>
              </div>
            </div>

            <div class="stock-update-box">
              <label class="stock-update-label" for="stock-input-${product.id}">Atualizar estoque:</label>
              <div class="stock-input-group">
                <input 
                  type="number" 
                  id="stock-input-${product.id}" 
                  class="stock-number-input" 
                  min="0" 
                  step="1" 
                  value="${quantity}"
                  aria-label="Nova quantidade para ${escapeHtml(product.nome)}"
                />
                <button 
                  type="button" 
                  class="btn-update-stock" 
                  id="btn-stock-${product.id}"
                  data-product-id="${product.id}"
                >
                  Atualizar
                </button>
              </div>
            </div>
          `;

          // Evento de atualização de estoque
          const updateBtn = card.querySelector(`#btn-stock-${product.id}`);
          const input = card.querySelector(`#stock-input-${product.id}`);

          updateBtn.addEventListener('click', () => {
            const newQty = parseInt(input.value, 10);
            if (isNaN(newQty) || newQty < 0) {
              showToast('Informe uma quantidade válida maior ou igual a zero.', 'error');
              return;
            }
            updateStock(product.id, newQty, updateBtn);
          });

          // Permite dar Enter no campo numérico
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              updateBtn.click();
            }
          });

          grid.appendChild(card);
        });
      }

      // Atualizar Estoque: PATCH /api/produtos/{id}/quantidade
      async function updateStock(productId, newQuantity, buttonElement) {
        if (!productId) return;

        const originalText = buttonElement.textContent;
        buttonElement.disabled = true;
        buttonElement.textContent = 'Salvando...';

        try {
          const response = await fetch(`${BASE_URL}/api/produtos/${productId}/quantidade`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              quantidade: Number(newQuantity)
            })
          });

          if (!response.ok) {
            throw new Error(`Erro ao atualizar estoque: HTTP ${response.status}`);
          }

          const updatedProduct = await response.json();
          
          // Atualiza estado local
          const index = state.products.findIndex(p => p.id === productId);
          if (index !== -1) {
            state.products[index].quantidade = newQuantity;
          }

          // Atualiza visualmente o card sem re-renderizar toda a lista
          const stockValElem = document.getElementById(`stock-val-${productId}`);
          const stockBadgeElem = document.getElementById(`stock-badge-${productId}`);

          if (stockValElem) {
            stockValElem.textContent = `${newQuantity} un.`;
          }

          if (stockBadgeElem) {
            let badgeClass = 'high';
            let badgeText = 'Em Estoque';
            if (newQuantity === 0) {
              badgeClass = 'zero';
              badgeText = 'Esgotado';
            } else if (newQuantity <= 10) {
              badgeClass = 'medium';
              badgeText = 'Estoque Baixo';
            }
            stockBadgeElem.className = `stock-badge ${badgeClass}`;
            stockBadgeText = badgeText;
            stockBadgeElem.textContent = badgeText;
          }

          showToast('Estoque atualizado com sucesso!', 'success');
        } catch (error) {
          console.error('Erro ao atualizar estoque:', error);
          showToast('Não foi possível atualizar o estoque.', 'error');
        } finally {
          buttonElement.disabled = false;
          buttonElement.textContent = originalText;
        }
      }

      // Modal de Cadastro de Produto
      function openProductModal() {
        const modal = document.getElementById('product-modal');
        const form = document.getElementById('product-form');
        if (modal) {
          modal.classList.add('open');
          document.body.style.overflow = 'hidden';
          if (form) form.reset();
          
          // Foca no primeiro campo após abrir
          setTimeout(() => {
            const nameInput = document.getElementById('product-name');
            if (nameInput) nameInput.focus();
          }, 150);
        }
      }

      function closeProductModal() {
        const modal = document.getElementById('product-modal');
        if (modal) {
          modal.classList.remove('open');
          document.body.style.overflow = '';
        }
      }

      // Cadastrar Produto: POST /api/produtos
      async function handleProductSubmit(e) {
        e.preventDefault();

        const nameInput = document.getElementById('product-name');
        const categorySelect = document.getElementById('product-category');
        const priceInput = document.getElementById('product-price');
        const quantityInput = document.getElementById('product-quantity');
        const saveBtn = document.getElementById('save-product-btn');

        const nome = nameInput.value.trim();
        const categoriaId = parseInt(categorySelect.value, 10);
        const preco = parseFloat(priceInput.value);
        const quantidade = parseInt(quantityInput.value, 10);

        if (!nome) {
          showToast('Preencha o nome do produto.', 'error');
          return;
        }

        if (isNaN(categoriaId)) {
          showToast('Selecione uma categoria válida.', 'error');
          return;
        }

        if (isNaN(preco) || preco <= 0) {
          showToast('Informe um preço válido.', 'error');
          return;
        }

        if (isNaN(quantidade) || quantidade < 0) {
          showToast('Informe uma quantidade válida.', 'error');
          return;
        }

        const payload = {
          nome: nome,
          categoriaId: categoriaId,
          quantidade: quantidade,
          preco: preco
        };

        const originalBtnText = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span>Salvando...</span>';

        try {
          const response = await fetch(`${BASE_URL}/api/produtos`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          // Se retornar 201 Created (ou 200)
          if (response.status === 201 || response.ok) {
            closeProductModal();
            document.getElementById('product-form').reset();
            showToast('Produto cadastrado com sucesso!', 'success');
            
            // Recarrega lista de produtos e categorias
            await Promise.all([
              loadProducts(),
              loadCategories()
            ]);
          } else {
            const errorData = await response.text();
            throw new Error(`Falha no cadastro: HTTP ${response.status} - ${errorData}`);
          }
        } catch (error) {
          console.error('Erro ao cadastrar produto:', error);
          showToast('Erro ao cadastrar produto. Tente novamente.', 'error');
        } finally {
          saveBtn.disabled = false;
          saveBtn.innerHTML = originalBtnText;
        }
      }

      // Auxiliar para escapar HTML em strings dinâmicas
      function escapeHtml(text) {
        if (!text) return '';
        const map = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;'
        };
        return String(text).replace(/[&<>"']/g, m => map[m]);
      }

      // Inicialização de Eventos do DOM
      document.addEventListener('DOMContentLoaded', () => {
        // Inicializa o Health Check e carregamento da API
        startHealthCheck();

        // Botões do Modal
        const openModalBtn = document.getElementById('open-modal-btn');
        const mobileNewProductBtn = document.getElementById('mobile-new-product-btn');
        const closeModalBtn = document.getElementById('close-modal-btn');
        const cancelModalBtn = document.getElementById('cancel-modal-btn');
        const productForm = document.getElementById('product-form');
        const modalBackdrop = document.getElementById('product-modal');

        if (openModalBtn) openModalBtn.addEventListener('click', openProductModal);
        if (mobileNewProductBtn) mobileNewProductBtn.addEventListener('click', openProductModal);
        if (closeModalBtn) closeModalBtn.addEventListener('click', closeProductModal);
        if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeProductModal);
        if (productForm) productForm.addEventListener('submit', handleProductSubmit);

        // Fechar modal ao clicar fora da caixa
        if (modalBackdrop) {
          modalBackdrop.addEventListener('click', (e) => {
            if (e.target === modalBackdrop) {
              closeProductModal();
            }
          });
        }

        // Fechar modal com a tecla Escape
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            closeProductModal();
          }
        });

        // Campo de busca em tempo real
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
          searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            renderProducts();
          });
        }

        // Toggle do Menu Mobile
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const sidebar = document.getElementById('sidebar');
        if (mobileMenuBtn && sidebar) {
          mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
          });
        }
      });
