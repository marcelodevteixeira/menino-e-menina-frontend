// Configurações e Estado Central da Aplicação - Menino E Menina
const BASE_URL = window.API_URL || 'https://menino-menina-api.onrender.com';

const state = {
  currentView: 'dashboard',
  isServerReady: false,
  healthCheckIntervalId: null,
  startTime: Date.now(),

  // Credenciais mantidas exclusivamente em memória (nunca em localStorage)
  auth: {
    login: '',
    senha: '',
    nome: '',
    perfil: '',
    id: null
  },

  // Dados sincronizados com o backend (fonte da verdade)
  categories: [],
  products: [],
  allProducts: [],
  clientes: [],
  fornecedores: [],
  funcionarios: [],
  caixaAberto: null,
  caixaMovimentacoes: [],

  // Filtros
  selectedCategoryId: null,
  searchQuery: '',
  clientesSearch: '',
  fornecedoresSearch: '',

  // Carrinhos temporários de telas operacionais
  vendaItens: [],
  vendaPagamentos: [],
  compraItens: [],

  // Métricas locais da sessão atual (sem alteração de back-end)
  sessionVendasCount: 0,
  sessionVendasCents: 0,
  sessionTopProdutos: {},
  dashboard: {
    estoqueMode: 'produto',
    terceiroMode: 'valor-estoque'
  }
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

// =========================================================================
// UTILITÁRIOS DE FORMATAÇÃO, CENTAVOS, MÁSCARAS E VALIDAÇÕES
// =========================================================================

function toCents(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100);
}

function fromCents(cents) {
  return Number((cents / 100).toFixed(2));
}

function formatMoney(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('pt-BR');
}

function onlyDigits(str) {
  return String(str || '').replace(/\D/g, '');
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

function maskCPF(value) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function maskCNPJ(value) {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function maskTelefone(value) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function isValidCPF(cpfRaw) {
  const cpf = onlyDigits(cpfRaw);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i], 10) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i], 10) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  return rev === parseInt(cpf[10], 10);
}

function isValidCNPJ(cnpjRaw) {
  const cnpj = onlyDigits(cnpjRaw);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base, weights) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += parseInt(base[i], 10) * weights[i];
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  const d1 = calc(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === parseInt(cnpj[12], 10) && d2 === parseInt(cnpj[13], 10);
}

function isValidTelefone(telRaw) {
  const d = onlyDigits(telRaw);
  return d.length === 10 || d.length === 11;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

// =========================================================================
// NOTIFICAÇÕES TOAST E MODAIS
// =========================================================================

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

  toast.innerHTML = `${iconSvg}<div style="flex: 1;">${escapeHtml(message)}</div>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 250);
  }, 4500);
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('open');
  if (!document.querySelector('.modal-backdrop.open')) {
    document.body.style.overflow = '';
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
  document.body.style.overflow = '';
}

// =========================================================================
// CLIENTE HTTP PADRONIZADO (apiRequest) E AUTENTICAÇÃO EM MEMÓRIA
// =========================================================================

async function apiRequest(path, options = {}) {
  const fetchOptions = {
    method: options.method || 'GET',
    headers: {
      'Accept': 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  };
  if (options.body) {
    fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  const response = await fetch(`${BASE_URL}${path}`, fetchOptions);

  let body = null;
  if (response.status !== 204) {
    body = await response.json().catch(() => null);
  }

  if (!response.ok) {
    const apiMsg = body?.mensagem || `Erro HTTP ${response.status}`;
    const err = new Error(apiMsg);
    err.status = response.status;
    err.body = body;
    throw err;
  }

  return body;
}

function setLoginModalAlert(message = '', type = 'warning') {
  const alertEl = document.getElementById('login-modal-alert');
  if (!alertEl) return;
  if (!message) {
    alertEl.textContent = '';
    alertEl.className = 'alert-banner warning hidden';
    return;
  }
  alertEl.textContent = message;
  alertEl.className = `alert-banner ${type}`;
}

function handleApiError(error, fallbackMessage = 'Operação não concluída.') {
  const msg = error?.message || fallbackMessage;
  if (error?.status === 401) {
    showToast(`Autenticação falhou (401): ${msg}`, 'error');
    openLoginModal({
      alertMessage: `Credenciais inválidas: ${msg}`,
      alertType: 'error'
    });
    return;
  }
  if (error?.status === 403) {
    showToast(`Acesso negado (403): ${msg}`, 'error');
    openLoginModal({
      title: 'Acesso Exclusivo — Proprietária',
      alertMessage: `Esta função é exclusiva do perfil PROPRIETARIA. (${msg}) Identifique-se com uma conta de PROPRIETARIA para continuar.`,
      alertType: 'warning',
      clearUser: true
    });
    return;
  }
  if (error?.status === 404) {
    showToast(`Não encontrado (404): ${msg}`, 'error');
    return;
  }
  if (error?.status >= 500) {
    showToast(`Erro interno do servidor (${error.status}): ${msg}`, 'error');
    return;
  }
  showToast(msg, 'error');
}

function isAuthenticated() {
  return Boolean(state.auth.login && state.auth.senha);
}

function requireAuth(requiredPerfil = null) {
  if (!isAuthenticated()) {
    if (requiredPerfil === 'PROPRIETARIA') {
      const msg = 'Esta função é exclusiva do perfil PROPRIETARIA. Faça login com uma conta de PROPRIETARIA para continuar.';
      showToast('Função exclusiva do perfil PROPRIETARIA.', 'info');
      openLoginModal({
        title: 'Acesso Exclusivo — Proprietária',
        alertMessage: msg,
        alertType: 'warning',
        clearUser: true
      });
    } else {
      showToast('Identifique o operador antes de realizar esta operação.', 'info');
      openLoginModal({
        alertMessage: 'Identifique-se com um funcionário ativo para realizar esta operação.',
        alertType: 'info'
      });
    }
    return false;
  }

  if (requiredPerfil && state.auth.perfil !== requiredPerfil) {
    const operadorAtual = state.auth.nome || state.auth.login;
    const perfilAtual = state.auth.perfil || 'sem perfil';
    const msg = `Esta função é exclusiva do perfil ${requiredPerfil}. Você está identificado como ${operadorAtual} (${perfilAtual}). Faça login com uma conta de ${requiredPerfil} para continuar.`;
    showToast(`Função exclusiva do perfil ${requiredPerfil}.`, 'error');
    openLoginModal({
      title: `Acesso Exclusivo — ${requiredPerfil === 'PROPRIETARIA' ? 'Proprietária' : requiredPerfil}`,
      alertMessage: msg,
      alertType: 'warning',
      clearUser: true
    });
    return false;
  }

  return true;
}

function getCredenciais() {
  return { login: state.auth.login, senha: state.auth.senha };
}

function updateOperatorUI() {
  const nameEl = document.getElementById('operator-name');
  const roleEl = document.getElementById('operator-role');
  const loginBtn = document.getElementById('open-login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const mobileAuthBtn = document.getElementById('mobile-auth-btn');

  if (isAuthenticated()) {
    nameEl.textContent = state.auth.nome || state.auth.login;
    roleEl.textContent = state.auth.perfil ? `Perfil: ${state.auth.perfil}` : `Login: ${state.auth.login}`;
    roleEl.className = 'operator-role ' + (state.auth.perfil === 'PROPRIETARIA' ? 'proprietaria' : 'vendedor');
    loginBtn.textContent = 'Trocar Operador';
    logoutBtn.classList.remove('hidden');
    if (mobileAuthBtn) mobileAuthBtn.textContent = state.auth.login;
  } else {
    nameEl.textContent = 'Visitante (Somente leitura)';
    roleEl.textContent = 'Faça login para gravar dados';
    roleEl.className = 'operator-role';
    loginBtn.textContent = 'Identificar Operador';
    logoutBtn.classList.add('hidden');
    if (mobileAuthBtn) mobileAuthBtn.textContent = 'Entrar';
  }
}

function openLoginModal(options = {}) {
  const opts = (options && !(options instanceof Event)) ? options : {};
  const form = document.getElementById('login-form');
  const titleEl = document.getElementById('login-modal-title');
  const userInput = document.getElementById('login-usuario');
  const passInput = document.getElementById('login-senha');

  if (form) form.reset();
  if (titleEl) titleEl.textContent = opts.title || 'Identificação do Operador';
  setLoginModalAlert(opts.alertMessage || '', opts.alertType || 'warning');

  if (!opts.clearUser && state.auth.login && userInput) {
    userInput.value = state.auth.login;
  }

  openModal('login-modal');
  setTimeout(() => {
    if (userInput && userInput.value) passInput?.focus();
    else userInput?.focus();
  }, 120);
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const loginInput = document.getElementById('login-usuario');
  const senhaInput = document.getElementById('login-senha');
  const submitBtn = document.getElementById('login-submit-btn');

  const login = loginInput.value.trim();
  const senha = senhaInput.value;

  if (!login || !senha) {
    setLoginModalAlert('Informe login e senha do funcionário.', 'error');
    return;
  }

  const origText = submitBtn ? submitBtn.textContent : 'Entrar';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Validando...';
  }
  setLoginModalAlert('');

  try {
    // Atualiza a lista de funcionários do back-end para reconhecer contas novas ou desativadas
    try {
      const funcs = await apiRequest('/api/funcionarios');
      if (Array.isArray(funcs)) {
        state.funcionarios = funcs;
        document.getElementById('nav-count-funcionarios').textContent = state.funcionarios.length;
      }
    } catch {
      if (state.funcionarios.length === 0) {
        const msg = 'Não foi possível consultar os funcionários no servidor. Tente novamente.';
        setLoginModalAlert(msg, 'error');
        showToast(msg, 'error');
        return;
      }
    }

    const found = state.funcionarios.find(f => f.login && f.login.toLowerCase() === login.toLowerCase());
    if (!found) {
      const msg = 'Login não encontrado. Informe um usuário cadastrado no sistema.';
      setLoginModalAlert(msg, 'error');
      showToast(msg, 'error');
      return;
    }

    if (found.ativo === false) {
      const msg = 'Este funcionário está desativado e não pode acessar o sistema.';
      setLoginModalAlert(msg, 'error');
      showToast(msg, 'error');
      return;
    }

    // Valida a senha contra o back-end usando uma consulta protegida de somente leitura (não altera dados)
    try {
      await apiRequest(`/api/historico/funcionarios/${found.id}`, {
        method: 'POST',
        body: { login: found.login, senha }
      });
      // 200 OK -> senha válida (PROPRIETARIA)
    } catch (authErr) {
      if (authErr.status === 403) {
        // 403 Forbidden -> senha validada pelo back-end; usuário autenticado com perfil VENDEDOR
      } else if (authErr.status === 401 || authErr.status === 400) {
        const msg = authErr.message || 'Credenciais inválidas. Verifique login e senha.';
        setLoginModalAlert(msg, 'error');
        showToast(msg, 'error');
        senhaInput.value = '';
        senhaInput.focus();
        return;
      } else {
        const msg = authErr.message || 'Erro ao validar credenciais no servidor.';
        setLoginModalAlert(msg, 'error');
        showToast(msg, 'error');
        return;
      }
    }

    state.auth = {
      login: found.login,
      senha: senha,
      nome: found.nome,
      perfil: found.perfil,
      id: found.id
    };

    senhaInput.value = '';
    setLoginModalAlert('');
    updateOperatorUI();
    renderFuncionarios();
    closeModal('login-modal');
    showToast(`Operador ${state.auth.nome} (${state.auth.perfil}) autenticado com sucesso!`, 'success');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = origText;
    }
  }
}

function handleLogout() {
  state.auth = { login: '', senha: '', nome: '', perfil: '', id: null };
  updateOperatorUI();
  renderFuncionarios();
  showToast('Sessão encerrada.', 'info');
}

// =========================================================================
// HEALTH CHECK / COLD START (GET /api/health)
// =========================================================================

function startHealthCheck() {
  const overlay = document.getElementById('cold-start-overlay');
  const timerElem = document.getElementById('cold-start-elapsed');

  const timerInterval = setInterval(() => {
    if (state.isServerReady) {
      clearInterval(timerInterval);
      return;
    }
    const elapsedSecs = Math.floor((Date.now() - state.startTime) / 1000);
    if (timerElem) timerElem.textContent = `${elapsedSecs}s`;
  }, 1000);

  async function checkHealth() {
    try {
      const data = await apiRequest('/api/health');
      if (data && data.status === 'ok') {
        state.isServerReady = true;
        clearInterval(state.healthCheckIntervalId);
        clearInterval(timerInterval);
        if (overlay) overlay.classList.add('hidden');

        await loadInitialData();
        showToast('Servidor conectado com sucesso!', 'success');
      }
    } catch {
      // Aguarda cold start do Render silenciosamente (retry apenas no GET de saúde)
    }
  }

  checkHealth();
  state.healthCheckIntervalId = setInterval(() => {
    if (!state.isServerReady) checkHealth();
  }, 5000);
}

async function loadInitialData() {
  await Promise.allSettled([
    loadCategories(),
    loadProducts(),
    loadClientes(),
    loadFornecedores(),
    loadFuncionarios(),
    loadCaixaAberto()
  ]);
  populateHistoryRegistrySelect();
}

// =========================================================================
// NAVEGAÇÃO ENTRE TELAS
// =========================================================================

function switchView(viewName) {
  state.currentView = viewName;
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `view-${viewName}`);
  });
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Fecha menu lateral no mobile
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('open');

  // Atualiza dados relevantes ao entrar na aba
  if (viewName === 'dashboard') {
    loadCaixaAberto();
    renderDashboard();
  } else if (viewName === 'vendas') {
    populateVendaSelects();
    loadCaixaAberto();
  } else if (viewName === 'caixa') {
    loadCaixaAberto();
  } else if (viewName === 'compras') {
    populateCompraSelects();
  } else if (viewName === 'clientes') {
    loadClientes();
  } else if (viewName === 'fornecedores') {
    loadFornecedores();
  } else if (viewName === 'funcionarios') {
    loadFuncionarios();
  } else if (viewName === 'historico') {
    populateHistoryRegistrySelect();
  }
}

// =========================================================================
// MÓDULO 1: CATEGORIAS E PRODUTOS
// =========================================================================

async function loadCategories() {
  try {
    const data = await apiRequest('/api/categorias');
    state.categories = Array.isArray(data) ? data : [];
    renderCategories();
    populateCategorySelect();
  } catch (error) {
    handleApiError(error, 'Não foi possível carregar as categorias.');
  }
}

async function loadProducts() {
  const grid = document.getElementById('products-grid');
  try {
    // Carrega lista completa para selects de Venda/Compra e contadores
    const allData = await apiRequest('/api/produtos');
    state.allProducts = Array.isArray(allData) ? allData : [];

    if (state.selectedCategoryId !== null) {
      const filteredData = await apiRequest(`/api/produtos?categoriaId=${encodeURIComponent(state.selectedCategoryId)}`);
      state.products = Array.isArray(filteredData) ? filteredData : [];
    } else {
      state.products = state.allProducts;
    }

    document.getElementById('nav-count-produtos').textContent = state.allProducts.length;
    renderProducts();
    renderCategories();
    populateVendaSelects();
    populateCompraSelects();
    renderDashboard();
    if (state.currentView === 'historico') populateHistoryRegistrySelect();
  } catch (error) {
    handleApiError(error, 'Erro ao carregar produtos do servidor.');
    if (grid) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">Erro ao carregar produtos</div>
          <div class="empty-state-text">Não foi possível consultar os produtos no momento.</div>
          <button type="button" class="btn-primary" id="retry-products-btn">Tentar Novamente</button>
        </div>
      `;
      document.getElementById('retry-products-btn')?.addEventListener('click', loadProducts);
    }
  }
}

function renderCategories() {
  const container = document.getElementById('categories-container');
  if (!container) return;
  container.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = `category-pill ${state.selectedCategoryId === null ? 'active' : ''}`;
  allBtn.innerHTML = `<span>Todas</span><span class="category-pill-count">${state.allProducts.length}</span>`;
  allBtn.addEventListener('click', () => selectCategory(null, 'Todos os Produtos'));
  container.appendChild(allBtn);

  state.categories.forEach(cat => {
    const count = state.allProducts.filter(p => p.categoriaId === cat.id).length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `category-pill ${state.selectedCategoryId === cat.id ? 'active' : ''}`;
    btn.innerHTML = `<span>${escapeHtml(cat.nome)}</span><span class="category-pill-count">${count}</span>`;
    btn.addEventListener('click', () => selectCategory(cat.id, cat.nome));
    container.appendChild(btn);
  });
}

function populateCategorySelect() {
  const select = document.getElementById('product-category');
  if (!select) return;
  select.innerHTML = '<option value="" disabled selected>Selecione uma categoria...</option>';
  state.categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.nome;
    select.appendChild(opt);
  });
}

function selectCategory(categoryId, categoryName) {
  state.selectedCategoryId = categoryId;
  const titleEl = document.getElementById('current-category-title');
  if (titleEl) titleEl.textContent = categoryName || 'Todos os Produtos';
  loadProducts();
}

function renderProducts() {
  const grid = document.getElementById('products-grid');
  const countLabel = document.getElementById('products-count-label');
  if (!grid) return;

  let filtered = state.products;
  if (state.searchQuery.trim() !== '') {
    const q = state.searchQuery.toLowerCase().trim();
    filtered = filtered.filter(p =>
      (p.nome && p.nome.toLowerCase().includes(q)) ||
      (p.categoriaNome && p.categoriaNome.toLowerCase().includes(q)) ||
      String(p.id) === q
    );
  }

  if (countLabel) {
    countLabel.textContent = `${filtered.length} ${filtered.length === 1 ? 'produto encontrado' : 'produtos encontrados'}`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Nenhum produto encontrado</div>
        <div class="empty-state-text">
          ${state.searchQuery ? 'Nenhum produto corresponde à busca informada.' : 'Não há produtos cadastrados nesta categoria.'}
        </div>
        <button type="button" class="btn-primary" id="empty-state-add-btn">+ Cadastrar Novo Produto</button>
      </div>
    `;
    document.getElementById('empty-state-add-btn')?.addEventListener('click', openProductModal);
    return;
  }

  grid.innerHTML = '';
  filtered.forEach(product => {
    const card = document.createElement('div');
    card.className = 'product-card';
    const quantity = Number(product.quantidade) || 0;
    const isInactive = product.ativo === false;

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
        <div class="card-top-row">
          <span class="card-category">${escapeHtml(product.categoriaNome || 'Geral')}</span>
          <span class="card-id">ID #${product.id} ${isInactive ? '<span class="status-badge inactive">Inativo</span>' : ''}</span>
        </div>
        <h3 class="card-title">${escapeHtml(product.nome)}</h3>
        <div class="card-price">${formatMoney(product.preco)}</div>

        <div class="card-stock-info">
          <span class="stock-label">Estoque atual:</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="stock-value">${quantity} un.</span>
            <span class="stock-badge ${stockBadgeClass}">${stockBadgeText}</span>
          </div>
        </div>
      </div>

      <div>
        <div class="stock-update-box">
          <label class="stock-update-label" for="stock-input-${product.id}">Atualizar estoque (Proprietária):</label>
          <div class="stock-input-group">
            <input type="number" id="stock-input-${product.id}" class="stock-number-input" min="0" step="1" value="${quantity}" />
            <button type="button" class="btn-update-stock" id="btn-stock-${product.id}">Atualizar</button>
          </div>
        </div>
        <div class="card-footer-actions">
          <button type="button" class="btn-secondary btn-sm" id="btn-hist-prod-${product.id}">Histórico</button>
          ${isInactive
            ? `<button type="button" class="btn-primary btn-sm" id="btn-toggle-prod-${product.id}">Reativar</button>`
            : `<button type="button" class="btn-secondary btn-sm" id="btn-toggle-prod-${product.id}" ${quantity > 0 ? 'disabled title="Só é possível desativar produto com estoque zero"' : ''}>Desativar</button>`
          }
        </div>
      </div>
    `;

    const input = card.querySelector(`#stock-input-${product.id}`);
    const updateBtn = card.querySelector(`#btn-stock-${product.id}`);
    updateBtn.addEventListener('click', () => {
      const newQty = parseInt(input.value, 10);
      if (Number.isNaN(newQty) || newQty < 0) {
        showToast('Informe uma quantidade inteira maior ou igual a zero.', 'error');
        return;
      }
      updateProductStock(product.id, newQty, updateBtn);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') updateBtn.click();
    });

    card.querySelector(`#btn-hist-prod-${product.id}`).addEventListener('click', () => {
      openHistoryFor('produtos', product.id);
    });

    const toggleBtn = card.querySelector(`#btn-toggle-prod-${product.id}`);
    toggleBtn.addEventListener('click', () => {
      if (isInactive) {
        toggleProductStatus(product.id, true, toggleBtn);
      } else {
        if (quantity > 0) {
          showToast('Só é possível desativar produto com estoque zero.', 'error');
          return;
        }
        toggleProductStatus(product.id, false, toggleBtn);
      }
    });

    grid.appendChild(card);
  });
}

function openProductModal() {
  if (!requireAuth('PROPRIETARIA')) return;
  document.getElementById('product-form')?.reset();
  openModal('product-modal');
  setTimeout(() => document.getElementById('product-name')?.focus(), 120);
}

async function handleProductSubmit(e) {
  e.preventDefault();
  if (!requireAuth('PROPRIETARIA')) return;

  const nome = document.getElementById('product-name').value.trim();
  const categoriaId = parseInt(document.getElementById('product-category').value, 10);
  const preco = parseFloat(document.getElementById('product-price').value);
  const quantidade = parseInt(document.getElementById('product-quantity').value, 10);
  const saveBtn = document.getElementById('save-product-btn');

  if (!nome) return showToast('Preencha o nome do produto.', 'error');
  if (Number.isNaN(categoriaId)) return showToast('Selecione uma categoria válida.', 'error');
  if (Number.isNaN(preco) || preco < 0) return showToast('O preço não pode ser negativo.', 'error');
  if (Number.isNaN(quantidade) || quantidade < 0) return showToast('A quantidade não pode ser negativa.', 'error');

  const payload = {
    nome,
    categoriaId,
    quantidade,
    preco,
    ...getCredenciais()
  };

  const orig = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Salvando...';

  try {
    await apiRequest('/api/produtos', { method: 'POST', body: payload });
    closeModal('product-modal');
    showToast('Produto cadastrado com sucesso!', 'success');
    await Promise.all([loadProducts(), loadCategories()]);
  } catch (error) {
    handleApiError(error, 'Erro ao cadastrar produto.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = orig;
  }
}

async function updateProductStock(productId, quantidade, btn) {
  if (!requireAuth('PROPRIETARIA')) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    await apiRequest(`/api/produtos/${productId}/quantidade`, {
      method: 'PATCH',
      body: { quantidade, ...getCredenciais() }
    });
    showToast('Estoque atualizado com sucesso!', 'success');
    await loadProducts();
  } catch (error) {
    handleApiError(error, 'Não foi possível atualizar o estoque.');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function toggleProductStatus(productId, ativar, btn) {
  if (!requireAuth('PROPRIETARIA')) return;
  const action = ativar ? 'ativar' : 'desativar';
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Processando...';

  try {
    await apiRequest(`/api/produtos/${productId}/${action}`, {
      method: 'PATCH',
      body: getCredenciais()
    });
    showToast(`Produto ${ativar ? 'reativado' : 'desativado'} com sucesso!`, 'success');
    await loadProducts();
  } catch (error) {
    handleApiError(error, `Não foi possível ${action} o produto.`);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function handleReactivateProductSubmit(e) {
  e.preventDefault();
  if (!requireAuth('PROPRIETARIA')) return;
  const id = parseInt(document.getElementById('reactivate-product-id').value, 10);
  const btn = document.getElementById('reactivate-product-submit-btn');
  if (Number.isNaN(id) || id <= 0) return showToast('Informe um ID de produto válido.', 'error');

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Reativando...';
  try {
    await apiRequest(`/api/produtos/${id}/ativar`, {
      method: 'PATCH',
      body: getCredenciais()
    });
    closeModal('reactivate-product-modal');
    showToast(`Produto #${id} reativado com sucesso!`, 'success');
    await loadProducts();
  } catch (error) {
    handleApiError(error, 'Não foi possível reativar o produto.');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// =========================================================================
// MÓDULO 2: CLIENTES
// =========================================================================

async function loadClientes() {
  try {
    const data = await apiRequest('/api/clientes');
    state.clientes = Array.isArray(data) ? data : [];
    document.getElementById('nav-count-clientes').textContent = state.clientes.length;
    renderClientes();
    populateVendaSelects();
    if (state.currentView === 'historico') populateHistoryRegistrySelect();
  } catch (error) {
    handleApiError(error, 'Erro ao carregar clientes.');
  }
}

function renderClientes() {
  const tbody = document.getElementById('clientes-tbody');
  const label = document.getElementById('clientes-count-label');
  if (!tbody) return;

  let list = state.clientes;
  if (state.clientesSearch.trim()) {
    const q = state.clientesSearch.toLowerCase().trim();
    const qDigits = onlyDigits(q);
    list = list.filter(c =>
      (c.nome && c.nome.toLowerCase().includes(q)) ||
      (qDigits && c.cpf && onlyDigits(c.cpf).includes(qDigits))
    );
  }

  label.textContent = `${list.length} ${list.length === 1 ? 'cliente encontrado' : 'clientes encontrados'}`;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Nenhum cliente encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  list.forEach(c => {
    const tr = document.createElement('tr');
    const ativo = c.ativo !== false;
    tr.innerHTML = `
      <td>#${c.id}</td>
      <td><strong>${escapeHtml(c.nome)}</strong></td>
      <td>${c.cpf ? escapeHtml(maskCPF(c.cpf)) : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>${c.telefone ? escapeHtml(maskTelefone(c.telefone)) : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td><span class="status-badge ${ativo ? 'active' : 'inactive'}">${ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td>
        <div class="table-actions">
          <button type="button" class="btn-secondary btn-sm" data-action="edit">Editar</button>
          <button type="button" class="btn-secondary btn-sm" data-action="toggle">${ativo ? 'Desativar' : 'Reativar'}</button>
          <button type="button" class="btn-secondary btn-sm" data-action="history">Histórico</button>
        </div>
      </td>
    `;
    tr.querySelector('[data-action="edit"]').addEventListener('click', () => openClienteModal(c));
    tr.querySelector('[data-action="toggle"]').addEventListener('click', e => toggleClienteStatus(c.id, !ativo, e.currentTarget));
    tr.querySelector('[data-action="history"]').addEventListener('click', () => openHistoryFor('clientes', c.id));
    tbody.appendChild(tr);
  });
}

function openClienteModal(cliente = null) {
  if (!requireAuth()) return;
  document.getElementById('cliente-form').reset();
  document.getElementById('cliente-id').value = cliente ? cliente.id : '';
  document.getElementById('cliente-modal-title').textContent = cliente ? `Editar Cliente #${cliente.id}` : 'Novo Cliente';
  if (cliente) {
    document.getElementById('cliente-nome').value = cliente.nome || '';
    document.getElementById('cliente-cpf').value = cliente.cpf ? maskCPF(cliente.cpf) : '';
    document.getElementById('cliente-telefone').value = cliente.telefone ? maskTelefone(cliente.telefone) : '';
  }
  openModal('cliente-modal');
  setTimeout(() => document.getElementById('cliente-nome')?.focus(), 120);
}

async function handleClienteSubmit(e) {
  e.preventDefault();
  if (!requireAuth()) return;

  const id = document.getElementById('cliente-id').value;
  const nome = document.getElementById('cliente-nome').value.trim();
  const cpfDigits = onlyDigits(document.getElementById('cliente-cpf').value);
  const telDigits = onlyDigits(document.getElementById('cliente-telefone').value);
  const btn = document.getElementById('save-cliente-btn');

  if (!nome) return showToast('O nome do cliente é obrigatório.', 'error');
  if (cpfDigits && !isValidCPF(cpfDigits)) return showToast('CPF inválido. Verifique os 11 dígitos ou deixe em branco.', 'error');
  if (telDigits && !isValidTelefone(telDigits)) return showToast('Telefone inválido. Informe DDD + 8 ou 9 dígitos.', 'error');

  const payload = {
    nome,
    cpf: cpfDigits || null,
    telefone: telDigits || null,
    ...getCredenciais()
  };

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    if (id) {
      await apiRequest(`/api/clientes/${id}`, { method: 'PUT', body: payload });
      showToast('Cliente atualizado com sucesso!', 'success');
    } else {
      await apiRequest('/api/clientes', { method: 'POST', body: payload });
      showToast('Cliente cadastrado com sucesso!', 'success');
    }
    closeModal('cliente-modal');
    await loadClientes();
  } catch (error) {
    handleApiError(error, 'Erro ao salvar cliente.');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function toggleClienteStatus(id, ativar, btn) {
  if (!requireAuth('PROPRIETARIA')) return;
  const action = ativar ? 'ativar' : 'desativar';
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '...';
  try {
    await apiRequest(`/api/clientes/${id}/${action}`, { method: 'PATCH', body: getCredenciais() });
    showToast(`Cliente ${ativar ? 'reativado' : 'desativado'} com sucesso!`, 'success');
    await loadClientes();
  } catch (error) {
    handleApiError(error, `Não foi possível ${action} o cliente.`);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// =========================================================================
// MÓDULO 3: FORNECEDORES
// =========================================================================

async function loadFornecedores() {
  try {
    const data = await apiRequest('/api/fornecedores');
    state.fornecedores = Array.isArray(data) ? data : [];
    document.getElementById('nav-count-fornecedores').textContent = state.fornecedores.length;
    renderFornecedores();
    populateCompraSelects();
    if (state.currentView === 'historico') populateHistoryRegistrySelect();
  } catch (error) {
    handleApiError(error, 'Erro ao carregar fornecedores.');
  }
}

function renderFornecedores() {
  const tbody = document.getElementById('fornecedores-tbody');
  const label = document.getElementById('fornecedores-count-label');
  if (!tbody) return;

  let list = state.fornecedores;
  if (state.fornecedoresSearch.trim()) {
    const q = state.fornecedoresSearch.toLowerCase().trim();
    const qDigits = onlyDigits(q);
    list = list.filter(f =>
      (f.razaoSocial && f.razaoSocial.toLowerCase().includes(q)) ||
      (f.nomeFantasia && f.nomeFantasia.toLowerCase().includes(q)) ||
      (qDigits && f.cnpj && onlyDigits(f.cnpj).includes(qDigits))
    );
  }

  label.textContent = `${list.length} ${list.length === 1 ? 'fornecedor encontrado' : 'fornecedores encontrados'}`;

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Nenhum fornecedor encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  list.forEach(f => {
    const tr = document.createElement('tr');
    const ativo = f.ativo !== false;
    tr.innerHTML = `
      <td>#${f.id}</td>
      <td>
        <strong>${escapeHtml(f.razaoSocial)}</strong>
        ${f.nomeFantasia ? `<div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(f.nomeFantasia)}</div>` : ''}
      </td>
      <td>${f.cnpj ? escapeHtml(maskCNPJ(f.cnpj)) : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>
        <div>${f.telefone ? escapeHtml(maskTelefone(f.telefone)) : '<span style="color:var(--text-muted)">—</span>'}</div>
        ${f.email ? `<div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(f.email)}</div>` : ''}
      </td>
      <td><span class="status-badge ${ativo ? 'active' : 'inactive'}">${ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td>
        <div class="table-actions">
          <button type="button" class="btn-secondary btn-sm" data-action="edit">Editar</button>
          <button type="button" class="btn-secondary btn-sm" data-action="toggle">${ativo ? 'Desativar' : 'Reativar'}</button>
          <button type="button" class="btn-secondary btn-sm" data-action="history">Histórico</button>
        </div>
      </td>
    `;
    tr.querySelector('[data-action="edit"]').addEventListener('click', () => openFornecedorModal(f));
    tr.querySelector('[data-action="toggle"]').addEventListener('click', e => toggleFornecedorStatus(f.id, !ativo, e.currentTarget));
    tr.querySelector('[data-action="history"]').addEventListener('click', () => openHistoryFor('fornecedores', f.id));
    tbody.appendChild(tr);
  });
}

function openFornecedorModal(fornecedor = null) {
  if (!requireAuth('PROPRIETARIA')) return;
  document.getElementById('fornecedor-form').reset();
  document.getElementById('fornecedor-id').value = fornecedor ? fornecedor.id : '';
  document.getElementById('fornecedor-modal-title').textContent = fornecedor ? `Editar Fornecedor #${fornecedor.id}` : 'Novo Fornecedor';
  if (fornecedor) {
    document.getElementById('fornecedor-razao').value = fornecedor.razaoSocial || '';
    document.getElementById('fornecedor-fantasia').value = fornecedor.nomeFantasia || '';
    document.getElementById('fornecedor-cnpj').value = fornecedor.cnpj ? maskCNPJ(fornecedor.cnpj) : '';
    document.getElementById('fornecedor-telefone').value = fornecedor.telefone ? maskTelefone(fornecedor.telefone) : '';
    document.getElementById('fornecedor-email').value = fornecedor.email || '';
  }
  openModal('fornecedor-modal');
  setTimeout(() => document.getElementById('fornecedor-razao')?.focus(), 120);
}

async function handleFornecedorSubmit(e) {
  e.preventDefault();
  if (!requireAuth('PROPRIETARIA')) return;

  const id = document.getElementById('fornecedor-id').value;
  const razaoSocial = document.getElementById('fornecedor-razao').value.trim();
  const nomeFantasia = document.getElementById('fornecedor-fantasia').value.trim();
  const cnpjDigits = onlyDigits(document.getElementById('fornecedor-cnpj').value);
  const telDigits = onlyDigits(document.getElementById('fornecedor-telefone').value);
  const email = document.getElementById('fornecedor-email').value.trim();
  const btn = document.getElementById('save-fornecedor-btn');

  if (!razaoSocial) return showToast('A razão social é obrigatória.', 'error');
  if (cnpjDigits && !isValidCNPJ(cnpjDigits)) return showToast('CNPJ inválido. Verifique os 14 dígitos ou deixe em branco.', 'error');
  if (telDigits && !isValidTelefone(telDigits)) return showToast('Telefone inválido. Informe DDD + 8 ou 9 dígitos.', 'error');
  if (email && !isValidEmail(email)) return showToast('Informe um e-mail válido.', 'error');

  const payload = {
    razaoSocial,
    nomeFantasia: nomeFantasia || null,
    cnpj: cnpjDigits || null,
    telefone: telDigits || null,
    email: email || null,
    ...getCredenciais()
  };

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    if (id) {
      await apiRequest(`/api/fornecedores/${id}`, { method: 'PUT', body: payload });
      showToast('Fornecedor atualizado com sucesso!', 'success');
    } else {
      await apiRequest('/api/fornecedores', { method: 'POST', body: payload });
      showToast('Fornecedor cadastrado com sucesso!', 'success');
    }
    closeModal('fornecedor-modal');
    await loadFornecedores();
  } catch (error) {
    handleApiError(error, 'Erro ao salvar fornecedor.');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function toggleFornecedorStatus(id, ativar, btn) {
  if (!requireAuth('PROPRIETARIA')) return;
  const action = ativar ? 'ativar' : 'desativar';
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '...';
  try {
    await apiRequest(`/api/fornecedores/${id}/${action}`, { method: 'PATCH', body: getCredenciais() });
    showToast(`Fornecedor ${ativar ? 'reativado' : 'desativado'} com sucesso!`, 'success');
    await loadFornecedores();
  } catch (error) {
    handleApiError(error, `Não foi possível ${action} o fornecedor.`);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// =========================================================================
// MÓDULO 4: FUNCIONÁRIOS
// =========================================================================

async function loadFuncionarios() {
  try {
    const data = await apiRequest('/api/funcionarios');
    state.funcionarios = Array.isArray(data) ? data : [];
    document.getElementById('nav-count-funcionarios').textContent = state.funcionarios.length;
    renderFuncionarios();
    if (state.currentView === 'historico') populateHistoryRegistrySelect();
  } catch (error) {
    handleApiError(error, 'Erro ao carregar funcionários.');
  }
}

function renderFuncionarios() {
  const tbody = document.getElementById('funcionarios-tbody');
  const label = document.getElementById('funcionarios-count-label');
  if (!tbody) return;

  label.textContent = `${state.funcionarios.length} ${state.funcionarios.length === 1 ? 'funcionário cadastrado' : 'funcionários cadastrados'}`;

  if (state.funcionarios.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Nenhum funcionário encontrado.</td></tr>';
    return;
  }

  const activePropsCount = state.funcionarios.filter(f => f.perfil === 'PROPRIETARIA' && f.ativo !== false).length;

  tbody.innerHTML = '';
  state.funcionarios.forEach(f => {
    const tr = document.createElement('tr');
    const ativo = f.ativo !== false;
    const isSelf = state.auth.login && f.login && f.login.toLowerCase() === state.auth.login.toLowerCase();
    const isLastProp = ativo && f.perfil === 'PROPRIETARIA' && activePropsCount <= 1;
    const disableDeactivate = ativo && (isSelf || isLastProp);

    let disableTitle = '';
    if (isSelf) disableTitle = 'Você não pode desativar a própria conta.';
    else if (isLastProp) disableTitle = 'Não é possível desativar a última proprietária ativa.';

    tr.innerHTML = `
      <td>#${f.id}</td>
      <td><strong>${escapeHtml(f.nome)}</strong>${isSelf ? ' <span class="status-badge role-prop">Você</span>' : ''}</td>
      <td><code>${escapeHtml(f.login)}</code></td>
      <td><span class="status-badge ${f.perfil === 'PROPRIETARIA' ? 'role-prop' : 'role-vend'}">${escapeHtml(f.perfil)}</span></td>
      <td>
        <div>${f.cpf ? escapeHtml(maskCPF(f.cpf)) : '<span style="color:var(--text-muted)">—</span>'}</div>
        ${f.telefone ? `<div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(maskTelefone(f.telefone))}</div>` : ''}
      </td>
      <td><span class="status-badge ${ativo ? 'active' : 'inactive'}">${ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td>
        <div class="table-actions">
          <button type="button" class="btn-secondary btn-sm" data-action="toggle" ${disableDeactivate ? `disabled title="${disableTitle}"` : ''}>
            ${ativo ? 'Desativar' : 'Reativar'}
          </button>
          <button type="button" class="btn-secondary btn-sm" data-action="history">Histórico</button>
        </div>
      </td>
    `;
    tr.querySelector('[data-action="toggle"]').addEventListener('click', e => {
      if (disableDeactivate) return showToast(disableTitle, 'error');
      toggleFuncionarioStatus(f.id, !ativo, e.currentTarget);
    });
    tr.querySelector('[data-action="history"]').addEventListener('click', () => openHistoryFor('funcionarios', f.id));
    tbody.appendChild(tr);
  });
}

function openFuncionarioModal() {
  if (!requireAuth('PROPRIETARIA')) return;
  document.getElementById('funcionario-form').reset();
  openModal('funcionario-modal');
  setTimeout(() => document.getElementById('func-nome')?.focus(), 120);
}

async function handleFuncionarioSubmit(e) {
  e.preventDefault();
  if (!requireAuth('PROPRIETARIA')) return;

  const nome = document.getElementById('func-nome').value.trim();
  const cpfDigits = onlyDigits(document.getElementById('func-cpf').value);
  const telDigits = onlyDigits(document.getElementById('func-telefone').value);
  const login = document.getElementById('func-login').value.trim();
  const senha = document.getElementById('func-senha').value;
  const perfil = document.getElementById('func-perfil').value;
  const btn = document.getElementById('save-funcionario-btn');

  if (!nome || !login || !senha || !perfil) {
    return showToast('Preencha nome, login, senha e perfil.', 'error');
  }
  if (cpfDigits && !isValidCPF(cpfDigits)) return showToast('CPF inválido. Verifique os 11 dígitos ou deixe em branco.', 'error');
  if (telDigits && !isValidTelefone(telDigits)) return showToast('Telefone inválido. Informe DDD + 8 ou 9 dígitos.', 'error');

  // Atenção ao contrato de FuncionarioRequest: operadorLogin e operadorSenha!
  const payload = {
    nome,
    cpf: cpfDigits || null,
    telefone: telDigits || null,
    login,
    senha,
    perfil,
    operadorLogin: state.auth.login,
    operadorSenha: state.auth.senha
  };

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    await apiRequest('/api/funcionarios', { method: 'POST', body: payload });
    closeModal('funcionario-modal');
    showToast('Funcionário cadastrado com sucesso!', 'success');
    await loadFuncionarios();
  } catch (error) {
    handleApiError(error, 'Erro ao cadastrar funcionário.');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function toggleFuncionarioStatus(id, ativar, btn) {
  if (!requireAuth('PROPRIETARIA')) return;
  const action = ativar ? 'ativar' : 'desativar';
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '...';
  try {
    await apiRequest(`/api/funcionarios/${id}/${action}`, { method: 'PATCH', body: getCredenciais() });
    showToast(`Funcionário ${ativar ? 'reativado' : 'desativado'} com sucesso!`, 'success');
    await loadFuncionarios();
  } catch (error) {
    handleApiError(error, `Não foi possível ${action} o funcionário.`);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// =========================================================================
// MÓDULO 5: CAIXA
// =========================================================================

async function loadCaixaAberto() {
  try {
    const caixa = await apiRequest('/api/caixa/aberto');
    state.caixaAberto = caixa;
    if (caixa && caixa.id) {
      const movs = await apiRequest(`/api/caixa/${caixa.id}/movimentacoes`).catch(() => []);
      state.caixaMovimentacoes = Array.isArray(movs) ? movs : [];
    } else {
      state.caixaMovimentacoes = [];
    }
  } catch (error) {
    if (error.status === 404) {
      state.caixaAberto = null;
      state.caixaMovimentacoes = [];
    } else {
      handleApiError(error, 'Erro ao consultar o estado do caixa.');
    }
  }
  renderCaixa();
  updateVendaCaixaStatus();
  renderDashboard();
}

function getCaixaSaldoEstimado() {
  if (!state.caixaAberto) return 0;
  const abertura = Number(state.caixaAberto.valorAbertura ?? state.caixaAberto.valor_abertura ?? 0);
  let cents = toCents(abertura);
  state.caixaMovimentacoes.forEach(m => {
    const vCents = toCents(m.valor);
    if (m.tipo === 'ENTRADA') cents += vCents;
    else if (m.tipo === 'SAIDA') cents -= vCents;
  });
  return fromCents(cents);
}

function renderCaixa() {
  const dot = document.getElementById('nav-caixa-dot');
  const statusEl = document.getElementById('caixa-status-text');
  const aberturaEl = document.getElementById('caixa-abertura-val');
  const saldoEl = document.getElementById('caixa-saldo-val');
  const dataEl = document.getElementById('caixa-data-abertura');
  const openPanel = document.getElementById('caixa-open-panel');
  const activePanels = document.getElementById('caixa-active-panels');
  const tbody = document.getElementById('caixa-mov-tbody');

  if (state.caixaAberto) {
    dot.className = 'nav-status-dot open';
    statusEl.innerHTML = `<span class="status-badge active" style="font-size:13px;">ABERTO (#${state.caixaAberto.id})</span>`;
    const valorAbertura = state.caixaAberto.valorAbertura ?? state.caixaAberto.valor_abertura ?? 0;
    const dataAbertura = state.caixaAberto.dataAbertura ?? state.caixaAberto.data_abertura;
    aberturaEl.textContent = formatMoney(valorAbertura);
    saldoEl.textContent = formatMoney(getCaixaSaldoEstimado());
    dataEl.textContent = formatDateTime(dataAbertura);

    openPanel.classList.add('hidden');
    activePanels.classList.remove('hidden');

    if (state.caixaMovimentacoes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Nenhuma movimentação registrada neste caixa.</td></tr>';
    } else {
      tbody.innerHTML = '';
      state.caixaMovimentacoes.forEach(m => {
        const tr = document.createElement('tr');
        const isEntrada = m.tipo === 'ENTRADA';
        const dataMov = m.dataMovimentacao ?? m.data_movimentacao;
        tr.innerHTML = `
          <td>${escapeHtml(formatDateTime(dataMov))}</td>
          <td><span class="status-badge ${isEntrada ? 'active' : 'inactive'}">${escapeHtml(m.tipo)}</span></td>
          <td>${escapeHtml(m.categoria)}</td>
          <td>${escapeHtml(m.descricao)}</td>
          <td style="font-weight:700;color:${isEntrada ? '#047857' : '#b91c1c'}">${isEntrada ? '+' : '-'} ${formatMoney(m.valor)}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  } else {
    dot.className = 'nav-status-dot closed';
    statusEl.innerHTML = '<span class="status-badge inactive" style="font-size:13px;">FECHADO</span>';
    aberturaEl.textContent = 'R$ 0,00';
    saldoEl.textContent = 'R$ 0,00';
    dataEl.textContent = '—';
    openPanel.classList.remove('hidden');
    activePanels.classList.add('hidden');
  }
}

async function handleCaixaAbrir(e) {
  e.preventDefault();
  if (!requireAuth('PROPRIETARIA')) return;
  const valor = parseFloat(document.getElementById('caixa-valor-abertura').value);
  const btn = document.getElementById('caixa-abrir-btn');
  if (Number.isNaN(valor) || valor < 0) return showToast('Valor de abertura não pode ser negativo.', 'error');

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Abrindo...';
  try {
    await apiRequest('/api/caixa/abrir', {
      method: 'POST',
      body: { valor, ...getCredenciais() }
    });
    document.getElementById('caixa-fechamento-resultado').classList.add('hidden');
    showToast('Caixa aberto com sucesso!', 'success');
    await loadCaixaAberto();
  } catch (error) {
    handleApiError(error, 'Não foi possível abrir o caixa.');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function handleCaixaMovimento(e, tipo) {
  e.preventDefault();
  if (!requireAuth('PROPRIETARIA')) return;
  if (!state.caixaAberto) return showToast('Não há caixa aberto.', 'error');

  const isEntrada = tipo === 'entrada';
  const valorInput = document.getElementById(isEntrada ? 'caixa-entrada-valor' : 'caixa-retirada-valor');
  const descInput = document.getElementById(isEntrada ? 'caixa-entrada-desc' : 'caixa-retirada-desc');
  const btn = document.getElementById(isEntrada ? 'caixa-entrada-btn' : 'caixa-retirada-btn');

  const valor = parseFloat(valorInput.value);
  const descricao = descInput.value.trim();

  if (Number.isNaN(valor) || valor <= 0) return showToast('Informe um valor maior que zero.', 'error');
  if (!descricao) return showToast('Informe a descrição da movimentação.', 'error');

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    await apiRequest(`/api/caixa/${tipo}`, {
      method: 'POST',
      body: { valor, descricao, ...getCredenciais() }
    });
    valorInput.value = '';
    descInput.value = '';
    showToast(`${isEntrada ? 'Entrada manual' : 'Retirada'} registrada com sucesso!`, 'success');
    await loadCaixaAberto();
  } catch (error) {
    handleApiError(error, `Erro ao registrar ${tipo}.`);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function handleCaixaFechar(e) {
  e.preventDefault();
  if (!requireAuth('PROPRIETARIA')) return;
  if (!state.caixaAberto) return showToast('Não há caixa aberto.', 'error');

  const valorInput = document.getElementById('caixa-fechar-valor');
  const btn = document.getElementById('caixa-fechar-btn');
  const valor = parseFloat(valorInput.value);
  if (Number.isNaN(valor) || valor < 0) return showToast('Informe um valor conferido maior ou igual a zero.', 'error');

  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Fechando...';

  try {
    const res = await apiRequest('/api/caixa/fechar', {
      method: 'POST',
      body: { valor, ...getCredenciais() }
    });
    valorInput.value = '';

    const banner = document.getElementById('caixa-fechamento-resultado');
    const situacao = res?.situacao || 'FECHADO';
    const diferenca = res?.diferenca ?? 0;
    const esperado = res?.caixa?.valorFechamentoEsperado ?? res?.caixa?.valor_fechamento_esperado;
    const informado = res?.caixa?.valorFechamentoInformado ?? res?.caixa?.valor_fechamento_informado ?? valor;

    banner.className = `alert-banner ${situacao === 'VALOR CONFERIDO' ? 'success' : 'warning'}`;
    banner.innerHTML = `
      <strong>Fechamento concluído — ${escapeHtml(situacao)}</strong><br/>
      Esperado: <strong>${esperado !== undefined ? formatMoney(esperado) : '—'}</strong> |
      Informado: <strong>${formatMoney(informado)}</strong> |
      Diferença: <strong>${formatMoney(diferenca)}</strong>
    `;
    banner.classList.remove('hidden');

    showToast(`Caixa fechado: ${situacao}`, 'success');
    await loadCaixaAberto();
  } catch (error) {
    handleApiError(error, 'Erro ao fechar caixa.');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// =========================================================================
// MÓDULO 6: VENDAS (PDV COM PAGAMENTO MISTO)
// =========================================================================

function updateVendaCaixaStatus() {
  const badge = document.getElementById('venda-caixa-badge');
  const warn = document.getElementById('venda-caixa-warning');
  if (!badge || !warn) return;

  if (state.caixaAberto) {
    badge.className = 'status-badge active';
    badge.textContent = `Caixa #${state.caixaAberto.id} Aberto`;
    warn.classList.add('hidden');
  } else {
    badge.className = 'status-badge warn';
    badge.textContent = 'Caixa Fechado (apenas PIX/Cartão)';
    warn.classList.remove('hidden');
  }
}

function populateVendaSelects() {
  const cliSel = document.getElementById('venda-cliente');
  const prodSel = document.getElementById('venda-produto');
  if (cliSel) {
    const prev = cliSel.value;
    cliSel.innerHTML = '<option value="">Cliente não identificado (Balcão)</option>';
    state.clientes.filter(c => c.ativo !== false).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.nome}${c.cpf ? ` (${maskCPF(c.cpf)})` : ''}`;
      cliSel.appendChild(opt);
    });
    if (prev) cliSel.value = prev;
  }
  if (prodSel) {
    const prev = prodSel.value;
    prodSel.innerHTML = '<option value="">Selecione um produto...</option>';
    state.allProducts.filter(p => p.ativo !== false && (Number(p.quantidade) || 0) > 0).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.nome} — ${formatMoney(p.preco)} (Estoque: ${p.quantidade})`;
      prodSel.appendChild(opt);
    });
    if (prev) prodSel.value = prev;
  }
}

function getVendaTotalCents() {
  return state.vendaItens.reduce((acc, item) => acc + toCents(item.preco) * item.quantidade, 0);
}

function getVendaPagoCents() {
  return state.vendaPagamentos.reduce((acc, pag) => acc + pag.valorCents, 0);
}

function addVendaItem() {
  const prodId = parseInt(document.getElementById('venda-produto').value, 10);
  const qtd = parseInt(document.getElementById('venda-qtd').value, 10);

  if (Number.isNaN(prodId)) return showToast('Selecione um produto.', 'error');
  if (Number.isNaN(qtd) || qtd <= 0) return showToast('Informe uma quantidade positiva.', 'error');

  const prod = state.allProducts.find(p => p.id === prodId);
  if (!prod) return showToast('Produto não encontrado.', 'error');
  if (prod.ativo === false) return showToast('Não é permitido vender produto inativo.', 'error');

  const existing = state.vendaItens.find(i => i.produtoId === prodId);
  const totalQtd = (existing ? existing.quantidade : 0) + qtd;
  if (totalQtd > prod.quantidade) {
    return showToast(`Estoque insuficiente para ${prod.nome}. Disponível: ${prod.quantidade} un.`, 'error');
  }

  if (existing) {
    existing.quantidade = totalQtd;
  } else {
    state.vendaItens.push({
      produtoId: prod.id,
      nome: prod.nome,
      preco: Number(prod.preco) || 0,
      quantidade: qtd
    });
  }

  document.getElementById('venda-qtd').value = 1;
  renderVendaState();
  const remCents = getVendaTotalCents() - getVendaPagoCents();
  const pagInput = document.getElementById('venda-valor-pagamento');
  if (pagInput && remCents > 0) {
    pagInput.value = fromCents(remCents).toFixed(2);
  }
}

function addVendaPagamento() {
  const forma = document.getElementById('venda-forma-pagamento').value;
  const valorInput = document.getElementById('venda-valor-pagamento');
  const rawVal = parseFloat(valorInput.value);
  const remBeforeCents = getVendaTotalCents() - getVendaPagoCents();

  let valorCents = Number.isNaN(rawVal) ? 0 : toCents(rawVal);

  // Se o campo estiver vazio ou zerado e houver saldo restante, assume automaticamente o valor restante
  if (valorCents <= 0 && remBeforeCents > 0) {
    valorCents = remBeforeCents;
  }

  if (valorCents <= 0) return showToast('Adicione itens à venda ou informe um valor maior que zero.', 'error');
  if (forma === 'DINHEIRO' && !state.caixaAberto) {
    return showToast('Pagamento em DINHEIRO exige caixa aberto. Abra o caixa ou escolha PIX/Cartão.', 'error');
  }

  state.vendaPagamentos.push({ formaPagamento: forma, valorCents });
  renderVendaState();
  const remAfterCents = getVendaTotalCents() - getVendaPagoCents();
  valorInput.value = remAfterCents > 0 ? fromCents(remAfterCents).toFixed(2) : '';
}

function fillVendaRestante() {
  const diffCents = getVendaTotalCents() - getVendaPagoCents();
  const input = document.getElementById('venda-valor-pagamento');
  if (diffCents <= 0) {
    showToast('O valor total da venda já foi coberto.', 'info');
    return;
  }
  input.value = fromCents(diffCents).toFixed(2);
}

function renderVendaState() {
  const itensTbody = document.getElementById('venda-itens-tbody');
  const pagsTbody = document.getElementById('venda-pagamentos-tbody');

  if (state.vendaItens.length === 0) {
    itensTbody.innerHTML = '<tr><td colspan="5" class="table-empty">Nenhum item adicionado à venda.</td></tr>';
  } else {
    itensTbody.innerHTML = '';
    state.vendaItens.forEach((item, idx) => {
      const subCents = toCents(item.preco) * item.quantidade;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(item.nome)}</strong></td>
        <td>${formatMoney(item.preco)}</td>
        <td>${item.quantidade}</td>
        <td><strong>${formatMoney(fromCents(subCents))}</strong></td>
        <td><button type="button" class="btn-secondary btn-sm">Remover</button></td>
      `;
      tr.querySelector('button').addEventListener('click', () => {
        state.vendaItens.splice(idx, 1);
        renderVendaState();
        const remCents = getVendaTotalCents() - getVendaPagoCents();
        const pagInput = document.getElementById('venda-valor-pagamento');
        if (pagInput) {
          pagInput.value = remCents > 0 ? fromCents(remCents).toFixed(2) : '';
        }
      });
      itensTbody.appendChild(tr);
    });
  }

  const formaLabels = {
    DINHEIRO: 'Dinheiro',
    PIX: 'PIX',
    CARTAO_DEBITO: 'Cartão Débito',
    CARTAO_CREDITO: 'Cartão Crédito'
  };

  if (state.vendaPagamentos.length === 0) {
    pagsTbody.innerHTML = '<tr><td colspan="3" class="table-empty">Nenhum pagamento informado.</td></tr>';
  } else {
    pagsTbody.innerHTML = '';
    state.vendaPagamentos.forEach((pag, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${formaLabels[pag.formaPagamento] || pag.formaPagamento}</strong></td>
        <td>${formatMoney(fromCents(pag.valorCents))}</td>
        <td><button type="button" class="btn-secondary btn-sm">Remover</button></td>
      `;
      tr.querySelector('button').addEventListener('click', () => {
        state.vendaPagamentos.splice(idx, 1);
        renderVendaState();
      });
      pagsTbody.appendChild(tr);
    });
  }

  const totalCents = getVendaTotalCents();
  const pagoCents = getVendaPagoCents();
  const diffCents = totalCents - pagoCents;

  document.getElementById('venda-total-display').textContent = formatMoney(fromCents(totalCents));
  document.getElementById('venda-pago-display').textContent = formatMoney(fromCents(pagoCents));
  const faltaEl = document.getElementById('venda-falta-display');
  faltaEl.textContent = formatMoney(fromCents(diffCents));
  faltaEl.style.color = diffCents === 0 && totalCents > 0 ? '#047857' : diffCents < 0 ? '#b91c1c' : 'var(--text-primary)';
}

function clearVenda() {
  state.vendaItens = [];
  state.vendaPagamentos = [];
  document.getElementById('venda-cliente').value = '';
  document.getElementById('venda-valor-pagamento').value = '';
  renderVendaState();
}

async function submitVenda() {
  if (!requireAuth()) return;
  if (state.vendaItens.length === 0) return showToast('Adicione pelo menos um item à venda.', 'error');
  if (state.vendaPagamentos.length === 0) return showToast('Informe pelo menos uma forma de pagamento.', 'error');

  const totalCents = getVendaTotalCents();
  const pagoCents = getVendaPagoCents();
  if (totalCents !== pagoCents) {
    return showToast(`A soma dos pagamentos (${formatMoney(fromCents(pagoCents))}) deve ser exatamente igual ao total da venda (${formatMoney(fromCents(totalCents))}).`, 'error');
  }

  const usaDinheiro = state.vendaPagamentos.some(p => p.formaPagamento === 'DINHEIRO');
  if (usaDinheiro) {
    await loadCaixaAberto();
    if (!state.caixaAberto) {
      return showToast('Venda com pagamento em DINHEIRO bloqueada: abra o caixa primeiro.', 'error');
    }
  }

  const clienteVal = document.getElementById('venda-cliente').value;
  const payload = {
    clienteId: clienteVal ? parseInt(clienteVal, 10) : null,
    itens: state.vendaItens.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
    pagamentos: state.vendaPagamentos.map(p => ({ formaPagamento: p.formaPagamento, valor: fromCents(p.valorCents) })),
    ...getCredenciais()
  };

  const btn = document.getElementById('venda-submit-btn');
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Registrando venda...';

  try {
    await apiRequest('/api/vendas', { method: 'POST', body: payload });
    state.sessionVendasCount += 1;
    state.sessionVendasCents += totalCents;
    state.vendaItens.forEach(item => {
      const key = String(item.produtoId);
      if (!state.sessionTopProdutos[key]) {
        state.sessionTopProdutos[key] = {
          produtoId: item.produtoId,
          nome: item.nome,
          unidades: 0,
          valorCents: 0
        };
      }
      state.sessionTopProdutos[key].unidades += item.quantidade;
      state.sessionTopProdutos[key].valorCents += toCents(item.preco) * item.quantidade;
    });
    showToast('Venda registrada com sucesso!', 'success');
    clearVenda();
    await Promise.all([loadProducts(), loadCaixaAberto()]);
    renderDashboard();
  } catch (error) {
    handleApiError(error, 'Erro ao registrar venda.');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// =========================================================================
// MÓDULO 7: COMPRAS
// =========================================================================

function populateCompraSelects() {
  const fornSel = document.getElementById('compra-fornecedor');
  const prodSel = document.getElementById('compra-produto');

  if (fornSel) {
    const prev = fornSel.value;
    fornSel.innerHTML = '<option value="">Selecione um fornecedor...</option>';
    state.fornecedores.filter(f => f.ativo !== false).forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.nomeFantasia ? `${f.razaoSocial} (${f.nomeFantasia})` : f.razaoSocial;
      fornSel.appendChild(opt);
    });
    if (prev) fornSel.value = prev;
  }

  if (prodSel) {
    const prev = prodSel.value;
    prodSel.innerHTML = '<option value="">Selecione um produto...</option>';
    state.allProducts.filter(p => p.ativo !== false).forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.nome} (Estoque atual: ${p.quantidade})`;
      prodSel.appendChild(opt);
    });
    if (prev) prodSel.value = prev;
  }
}

function addCompraItem() {
  if (!requireAuth('PROPRIETARIA')) return;
  const prodId = parseInt(document.getElementById('compra-produto').value, 10);
  const qtd = parseInt(document.getElementById('compra-qtd').value, 10);
  const custo = parseFloat(document.getElementById('compra-custo').value);

  if (Number.isNaN(prodId)) return showToast('Selecione um produto.', 'error');
  if (Number.isNaN(qtd) || qtd <= 0) return showToast('Informe uma quantidade positiva.', 'error');
  if (Number.isNaN(custo) || custo < 0) return showToast('O custo unitário não pode ser negativo.', 'error');

  const prod = state.allProducts.find(p => p.id === prodId);
  if (!prod) return showToast('Produto não encontrado.', 'error');
  if (prod.ativo === false) return showToast('Não é permitido comprar produto inativo.', 'error');

  state.compraItens.push({
    produtoId: prod.id,
    nome: prod.nome,
    quantidade: qtd,
    custoCents: toCents(custo)
  });

  document.getElementById('compra-qtd').value = 1;
  document.getElementById('compra-custo').value = '';
  renderCompraState();
}

function renderCompraState() {
  const tbody = document.getElementById('compra-itens-tbody');
  let totalCents = 0;

  if (state.compraItens.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">Nenhum item adicionado à compra.</td></tr>';
  } else {
    tbody.innerHTML = '';
    state.compraItens.forEach((item, idx) => {
      const subCents = item.custoCents * item.quantidade;
      totalCents += subCents;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(item.nome)}</strong></td>
        <td>${item.quantidade}</td>
        <td>${formatMoney(fromCents(item.custoCents))}</td>
        <td><strong>${formatMoney(fromCents(subCents))}</strong></td>
        <td><button type="button" class="btn-secondary btn-sm">Remover</button></td>
      `;
      tr.querySelector('button').addEventListener('click', () => {
        state.compraItens.splice(idx, 1);
        renderCompraState();
      });
      tbody.appendChild(tr);
    });
  }

  document.getElementById('compra-total-display').textContent = formatMoney(fromCents(totalCents));
}

function clearCompra() {
  state.compraItens = [];
  document.getElementById('compra-fornecedor').value = '';
  renderCompraState();
}

async function submitCompra() {
  if (!requireAuth('PROPRIETARIA')) return;
  const fornecedorId = parseInt(document.getElementById('compra-fornecedor').value, 10);
  if (Number.isNaN(fornecedorId)) return showToast('Selecione um fornecedor ativo.', 'error');
  if (state.compraItens.length === 0) return showToast('Adicione pelo menos um item à compra.', 'error');

  const payload = {
    fornecedorId,
    itens: state.compraItens.map(i => ({
      produtoId: i.produtoId,
      quantidade: i.quantidade,
      custoUnitario: fromCents(i.custoCents)
    })),
    ...getCredenciais()
  };

  const btn = document.getElementById('compra-submit-btn');
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Registrando compra...';

  try {
    await apiRequest('/api/compras', { method: 'POST', body: payload });
    showToast('Compra registrada e estoque atualizado!', 'success');
    clearCompra();
    await loadProducts();
  } catch (error) {
    handleApiError(error, 'Erro ao registrar compra.');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// =========================================================================
// MÓDULO 8: HISTÓRICO / AUDITORIA
// =========================================================================

function populateHistoryRegistrySelect() {
  const tipo = document.getElementById('hist-tipo')?.value;
  const sel = document.getElementById('hist-registro');
  if (!sel || !tipo) return;

  sel.innerHTML = '<option value="">Selecione um registro...</option>';
  let source = [];
  if (tipo === 'produtos') source = state.allProducts.map(x => ({ id: x.id, label: `#${x.id} — ${x.nome}` }));
  if (tipo === 'clientes') source = state.clientes.map(x => ({ id: x.id, label: `#${x.id} — ${x.nome}` }));
  if (tipo === 'fornecedores') source = state.fornecedores.map(x => ({ id: x.id, label: `#${x.id} — ${x.razaoSocial}` }));
  if (tipo === 'funcionarios') source = state.funcionarios.map(x => ({ id: x.id, label: `#${x.id} — ${x.nome} (${x.login})` }));

  source.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.label;
    sel.appendChild(opt);
  });
}

function openHistoryFor(tipo, id) {
  if (!requireAuth('PROPRIETARIA')) return;
  switchView('historico');
  document.getElementById('hist-tipo').value = tipo;
  populateHistoryRegistrySelect();
  document.getElementById('hist-registro').value = String(id);
  document.getElementById('hist-id-manual').value = String(id);
  consultarHistorico();
}

async function consultarHistorico() {
  if (!requireAuth('PROPRIETARIA')) return;
  const tipo = document.getElementById('hist-tipo').value;
  const idManual = parseInt(document.getElementById('hist-id-manual').value, 10);
  const idSelect = parseInt(document.getElementById('hist-registro').value, 10);
  const id = !Number.isNaN(idManual) && idManual > 0 ? idManual : idSelect;

  if (Number.isNaN(id) || id <= 0) {
    return showToast('Selecione um registro ou informe um ID válido.', 'error');
  }

  const btn = document.getElementById('hist-consultar-btn');
  const container = document.getElementById('hist-resultado');
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Consultando...';

  try {
    const data = await apiRequest(`/api/historico/${tipo}/${id}`, {
      method: 'POST',
      body: getCredenciais()
    });
    const list = Array.isArray(data) ? data : [];

    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 36px 20px;">
          <div class="empty-state-title">Nenhum histórico encontrado</div>
          <div class="empty-state-text" style="margin-bottom:0;">Não há registros de auditoria para ${escapeHtml(tipo)} #${id}.</div>
        </div>
      `;
      return;
    }

    const html = list.map(snap => {
      const tipoAtt = snap.tipoAtualizacao ?? snap.tipo_atualizacao ?? '—';
      const ts = snap.timestampAlteracao ?? snap.timestamp_alteracao ?? snap.id?.timestampAlteracao;
      const userId = snap.usuarioId ?? snap.usuario_id;
      const userObj = state.funcionarios.find(f => f.id === userId);
      const userLabel = userObj ? `${userObj.nome} (#${userId})` : (userId ? `Usuário #${userId}` : '—');

      const ignoreKeys = new Set(['tipoAtualizacao', 'tipo_atualizacao', 'timestampAlteracao', 'timestamp_alteracao', 'usuarioId', 'usuario_id', 'senha', 'senhaHash', 'senha_hash']);
      const fieldsHtml = Object.entries(snap)
        .filter(([k]) => !ignoreKeys.has(k))
        .map(([k, v]) => {
          let valText = v === null || v === undefined ? '—' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
          if (typeof v === 'boolean') valText = v ? 'Sim' : 'Não';
          return `<div><span class="history-field-key">${escapeHtml(k)}</span><strong>${escapeHtml(valText)}</strong></div>`;
        }).join('');

      return `
        <div class="history-item">
          <div class="history-item-head">
            <div>
              <span class="status-badge ${tipoAtt === 'I' ? 'active' : 'role-prop'}">${tipoAtt === 'I' ? 'I — Inclusão' : 'A — Alteração'}</span>
              <span style="margin-left: 8px;">Responsável: <strong>${escapeHtml(userLabel)}</strong></span>
            </div>
            <div>${escapeHtml(formatDateTime(ts))}</div>
          </div>
          <div class="history-fields">${fieldsHtml}</div>
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="history-list">${html}</div>`;
  } catch (error) {
    handleApiError(error, 'Erro ao consultar histórico.');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}


// =========================================================================
// MÓDULO DASHBOARD (SOMENTE FRONT-END, SEM ALTERAÇÃO NO BACK-END)
// =========================================================================

function renderBarRows(rows, maxVal, formatValueFn, colorClassFn) {
  if (!rows.length) {
    return '<div class="empty-state" style="padding: 28px 16px;"><div class="empty-state-title">Sem dados para exibir</div><div class="empty-state-text" style="margin-bottom:0;">Nenhum registro disponível para este gráfico no momento.</div></div>';
  }
  const safeMax = maxVal > 0 ? maxVal : 1;
  return `<div class="bar-chart-list">${rows.map(r => {
    const pct = Math.max(0, Math.min(100, (r.value / safeMax) * 100));
    const colorClass = colorClassFn ? colorClassFn(r) : '';
    const subHtml = r.sub ? `<span class="bar-chart-sub">(${escapeHtml(r.sub)})</span>` : '';
    return `
      <div class="bar-chart-row">
        <div class="bar-chart-meta">
          <div>
            <span class="bar-chart-label">${escapeHtml(r.label)}</span>
            ${subHtml}
          </div>
          <span class="bar-chart-value">${escapeHtml(formatValueFn(r.value, r))}</span>
        </div>
        <div class="bar-chart-track">
          <div class="bar-chart-fill ${colorClass}" style="width: ${pct.toFixed(1)}%;"></div>
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

function renderDashboard() {
  const dashSection = document.getElementById('view-dashboard');
  if (!dashSection) return;

  const produtosAtivos = state.allProducts.filter(p => p.ativo !== false);
  const totalUnidades = produtosAtivos.reduce((acc, p) => acc + (Number(p.quantidade) || 0), 0);
  const totalEstoqueCents = produtosAtivos.reduce((acc, p) => acc + toCents(p.preco) * (Number(p.quantidade) || 0), 0);
  const saldoCaixa = getCaixaSaldoEstimado();

  const kpiUnidades = document.getElementById('dash-kpi-unidades');
  const kpiEstoqueVal = document.getElementById('dash-kpi-estoque-valor');
  const kpiCaixaSaldo = document.getElementById('dash-kpi-caixa-saldo');
  const kpiSessao = document.getElementById('dash-kpi-sessao-vendas');

  if (kpiUnidades) kpiUnidades.textContent = `${totalUnidades} un.`;
  if (kpiEstoqueVal) kpiEstoqueVal.textContent = formatMoney(fromCents(totalEstoqueCents));
  if (kpiCaixaSaldo) kpiCaixaSaldo.textContent = formatMoney(saldoCaixa);
  if (kpiSessao) kpiSessao.textContent = `${state.sessionVendasCount} (${formatMoney(fromCents(state.sessionVendasCents))})`;

  renderDashboardEstoqueChart(produtosAtivos);
  renderDashboardCaixaChart();
  renderDashboardTerceiroChart(produtosAtivos);
}

function renderDashboardEstoqueChart(produtosAtivos) {
  const container = document.getElementById('dash-chart-estoque');
  const subEl = document.getElementById('dash-estoque-sub');
  const btnProd = document.getElementById('dash-estoque-mode-prod');
  const btnCat = document.getElementById('dash-estoque-mode-cat');
  if (!container) return;

  const mode = state.dashboard.estoqueMode;
  if (btnProd) btnProd.classList.toggle('active', mode === 'produto');
  if (btnCat) btnCat.classList.toggle('active', mode === 'categoria');

  if (mode === 'categoria') {
    if (subEl) subEl.textContent = 'Unidades disponíveis agrupadas por categoria';
    const mapCat = new Map();
    produtosAtivos.forEach(p => {
      const cat = p.categoriaNome || 'Geral';
      const qtd = Number(p.quantidade) || 0;
      const cur = mapCat.get(cat) || { label: cat, value: 0, itens: 0 };
      cur.value += qtd;
      cur.itens += 1;
      mapCat.set(cat, cur);
    });
    const rows = Array.from(mapCat.values())
      .sort((a, b) => b.value - a.value)
      .map(r => ({ ...r, sub: `${r.itens} ${r.itens === 1 ? 'produto' : 'produtos'}` }));
    const maxVal = rows.reduce((m, r) => Math.max(m, r.value), 0);
    container.innerHTML = renderBarRows(
      rows,
      maxVal,
      v => `${v} un.`,
      r => r.value === 0 ? 'danger' : r.value <= 10 ? 'warning' : ''
    );
  } else {
    if (subEl) subEl.textContent = 'Unidades disponíveis por produto ativo';
    const rows = [...produtosAtivos]
      .sort((a, b) => (Number(b.quantidade) || 0) - (Number(a.quantidade) || 0))
      .map(p => ({
        label: p.nome,
        sub: p.categoriaNome || 'Geral',
        value: Number(p.quantidade) || 0
      }));
    const maxVal = rows.reduce((m, r) => Math.max(m, r.value), 0);
    container.innerHTML = renderBarRows(
      rows,
      maxVal,
      v => `${v} un.`,
      r => r.value === 0 ? 'danger' : r.value <= 10 ? 'warning' : ''
    );
  }
}

function renderDashboardCaixaChart() {
  const container = document.getElementById('dash-chart-caixa');
  const subEl = document.getElementById('dash-caixa-sub');
  if (!container) return;

  if (!state.caixaAberto) {
    if (subEl) subEl.textContent = 'Nenhum caixa aberto no momento';
    container.innerHTML = `
      <div class="empty-state" style="padding: 28px 16px;">
        <div class="empty-state-title">Caixa fechado</div>
        <div class="empty-state-text" style="margin-bottom:0;">Abra o caixa na aba <strong>Caixa</strong> para visualizar abertura, entradas, saídas e saldo estimado.</div>
      </div>
    `;
    return;
  }

  const abertura = Number(state.caixaAberto.valorAbertura ?? state.caixaAberto.valor_abertura ?? 0);
  let entradasCents = 0;
  let saidasCents = 0;
  state.caixaMovimentacoes.forEach(m => {
    const vCents = toCents(m.valor);
    if (m.tipo === 'ENTRADA') entradasCents += vCents;
    else if (m.tipo === 'SAIDA') saidasCents += vCents;
  });

  const entradas = fromCents(entradasCents);
  const saidas = fromCents(saidasCents);
  const saldo = getCaixaSaldoEstimado();

  if (subEl) subEl.textContent = `Referente ao Caixa #${state.caixaAberto.id} aberto`;

  const rows = [
    { key: 'abertura', label: 'Valor de Abertura', sub: 'Fundo inicial', value: abertura },
    { key: 'entradas', label: 'Entradas', sub: 'Vendas em dinheiro e entradas manuais', value: entradas },
    { key: 'saidas', label: 'Saídas', sub: 'Retiradas / sangrias', value: saidas },
    { key: 'saldo', label: 'Saldo Estimado', sub: 'Dinheiro esperado no caixa', value: saldo }
  ];
  const maxVal = rows.reduce((m, r) => Math.max(m, Math.abs(r.value)), 0);

  container.innerHTML = renderBarRows(
    rows,
    maxVal,
    v => formatMoney(v),
    r => {
      if (r.key === 'entradas') return 'success';
      if (r.key === 'saidas') return 'danger';
      if (r.key === 'saldo') return r.value >= 0 ? 'success' : 'danger';
      return 'neutral';
    }
  );
}

function renderDashboardTerceiroChart(produtosAtivos) {
  const container = document.getElementById('dash-chart-terceiro');
  const tituloEl = document.getElementById('dash-terceiro-titulo');
  const legendaEl = document.getElementById('dash-terceiro-legenda');
  const btnValor = document.getElementById('dash-terceiro-mode-valor');
  const btnTop3 = document.getElementById('dash-terceiro-mode-top3');
  if (!container) return;

  const mode = state.dashboard.terceiroMode;
  if (btnValor) btnValor.classList.toggle('active', mode === 'valor-estoque');
  if (btnTop3) btnTop3.classList.toggle('active', mode === 'top3-sessao');

  if (mode === 'top3-sessao') {
    if (tituloEl) tituloEl.textContent = 'Top 3 Produtos Mais Vendidos (Sessão Atual)';
    if (legendaEl) legendaEl.textContent = 'Métrica limitada à sessão atual do navegador (o back-end não expõe histórico consolidado de vendas)';

    const top3 = Object.values(state.sessionTopProdutos)
      .sort((a, b) => b.unidades - a.unidades || b.valorCents - a.valorCents)
      .slice(0, 3)
      .map((item, idx) => ({
        label: `#${idx + 1} ${item.nome}`,
        sub: `Sessão atual • ${formatMoney(fromCents(item.valorCents))}`,
        value: item.unidades
      }));

    if (!top3.length) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 28px 16px;">
          <div class="empty-state-title">Nenhuma venda registrada nesta sessão</div>
          <div class="empty-state-text" style="margin-bottom:0;">Realize vendas na aba <strong>Vendas (PDV)</strong> durante esta sessão para rankear os top 3 produtos vendidos.</div>
        </div>
        <div class="dash-footnote">
          <strong>Observação:</strong> Este ranking contabiliza apenas as vendas realizadas nesta sessão atual, pois o back-end não disponibiliza endpoint de consulta/histórico consolidado de vendas.
        </div>
      `;
      return;
    }

    const maxVal = top3.reduce((m, r) => Math.max(m, r.value), 0);
    container.innerHTML = `
      ${renderBarRows(top3, maxVal, v => `${v} ${v === 1 ? 'un.' : 'un.'}`, () => 'success')}
      <div class="dash-footnote">
        <strong>Observação:</strong> Dados referentes exclusivamente à sessão atual do navegador (o back-end não expõe histórico consolidado de vendas).
      </div>
    `;
  } else {
    if (tituloEl) tituloEl.textContent = 'Valor Financeiro em Estoque por Categoria';
    if (legendaEl) legendaEl.textContent = 'Capital estimado em estoque (preço × quantidade) por categoria de produto ativo';

    const mapCatCents = new Map();
    produtosAtivos.forEach(p => {
      const cat = p.categoriaNome || 'Geral';
      const qtd = Number(p.quantidade) || 0;
      const cents = toCents(p.preco) * qtd;
      const cur = mapCatCents.get(cat) || { label: cat, cents: 0, unidades: 0 };
      cur.cents += cents;
      cur.unidades += qtd;
      mapCatCents.set(cat, cur);
    });

    const rows = Array.from(mapCatCents.values())
      .sort((a, b) => b.cents - a.cents)
      .map(r => ({
        label: r.label,
        sub: `${r.unidades} un. em estoque`,
        value: fromCents(r.cents)
      }));

    const maxVal = rows.reduce((m, r) => Math.max(m, r.value), 0);
    container.innerHTML = renderBarRows(rows, maxVal, v => formatMoney(v), () => '');
  }
}

// =========================================================================
// INICIALIZAÇÃO DE EVENTOS DO DOM
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
  startHealthCheck();
  updateOperatorUI();

  // Dashboard
  document.getElementById('dashboard-refresh-btn')?.addEventListener('click', async () => {
    await Promise.allSettled([loadProducts(), loadCategories(), loadCaixaAberto()]);
    renderDashboard();
    showToast('Dashboard atualizado!', 'info');
  });
  document.getElementById('dash-estoque-mode-prod')?.addEventListener('click', () => {
    state.dashboard.estoqueMode = 'produto';
    renderDashboard();
  });
  document.getElementById('dash-estoque-mode-cat')?.addEventListener('click', () => {
    state.dashboard.estoqueMode = 'categoria';
    renderDashboard();
  });
  document.getElementById('dash-terceiro-mode-valor')?.addEventListener('click', () => {
    state.dashboard.terceiroMode = 'valor-estoque';
    renderDashboard();
  });
  document.getElementById('dash-terceiro-mode-top3')?.addEventListener('click', () => {
    state.dashboard.terceiroMode = 'top3-sessao';
    renderDashboard();
  });

    // Navegação principal
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Menu mobile
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const toggleMobileMenu = () => {
    sidebar?.classList.toggle('open');
    sidebarBackdrop?.classList.toggle('open');
  };
  mobileMenuBtn?.addEventListener('click', toggleMobileMenu);
  sidebarBackdrop?.addEventListener('click', toggleMobileMenu);

  // Autenticação em memória
  document.getElementById('open-login-btn')?.addEventListener('click', () => openLoginModal());
  document.getElementById('mobile-auth-btn')?.addEventListener('click', () => openLoginModal());
  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
  document.getElementById('login-form')?.addEventListener('submit', handleLoginSubmit);

  // Fechar modais via botão, backdrop ou ESC
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) closeModal(backdrop.id);
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllModals();
  });

  // Produtos
  document.getElementById('open-product-modal-btn')?.addEventListener('click', openProductModal);
  document.getElementById('product-form')?.addEventListener('submit', handleProductSubmit);
  document.getElementById('open-reactivate-product-btn')?.addEventListener('click', () => {
    if (!requireAuth('PROPRIETARIA')) return;
    document.getElementById('reactivate-product-form')?.reset();
    openModal('reactivate-product-modal');
  });
  document.getElementById('reactivate-product-form')?.addEventListener('submit', handleReactivateProductSubmit);
  document.getElementById('search-input')?.addEventListener('input', e => {
    state.searchQuery = e.target.value;
    renderProducts();
  });

  // Clientes
  document.getElementById('open-cliente-modal-btn')?.addEventListener('click', () => openClienteModal(null));
  document.getElementById('cliente-form')?.addEventListener('submit', handleClienteSubmit);
  document.getElementById('clientes-search')?.addEventListener('input', e => {
    state.clientesSearch = e.target.value;
    renderClientes();
  });

  // Fornecedores
  document.getElementById('open-fornecedor-modal-btn')?.addEventListener('click', () => openFornecedorModal(null));
  document.getElementById('fornecedor-form')?.addEventListener('submit', handleFornecedorSubmit);
  document.getElementById('fornecedores-search')?.addEventListener('input', e => {
    state.fornecedoresSearch = e.target.value;
    renderFornecedores();
  });

  // Funcionários
  document.getElementById('open-funcionario-modal-btn')?.addEventListener('click', openFuncionarioModal);
  document.getElementById('funcionario-form')?.addEventListener('submit', handleFuncionarioSubmit);

  // Caixa
  document.getElementById('caixa-refresh-btn')?.addEventListener('click', loadCaixaAberto);
  ['caixa-abrir-btn', 'caixa-entrada-btn', 'caixa-retirada-btn', 'caixa-fechar-btn'].forEach(btnId => {
    document.getElementById(btnId)?.addEventListener('click', e => {
      if (!isAuthenticated() || state.auth.perfil !== 'PROPRIETARIA') {
        e.preventDefault();
        requireAuth('PROPRIETARIA');
      }
    });
  });
  document.getElementById('caixa-abrir-form')?.addEventListener('submit', handleCaixaAbrir);
  document.getElementById('caixa-entrada-form')?.addEventListener('submit', e => handleCaixaMovimento(e, 'entrada'));
  document.getElementById('caixa-retirada-form')?.addEventListener('submit', e => handleCaixaMovimento(e, 'retirada'));
  document.getElementById('caixa-fechar-form')?.addEventListener('submit', handleCaixaFechar);

  // Vendas
  document.getElementById('venda-add-item-btn')?.addEventListener('click', addVendaItem);
  document.getElementById('venda-add-pag-btn')?.addEventListener('click', addVendaPagamento);
  document.getElementById('venda-fill-rest-btn')?.addEventListener('click', fillVendaRestante);
  document.getElementById('venda-clear-btn')?.addEventListener('click', clearVenda);
  document.getElementById('venda-submit-btn')?.addEventListener('click', submitVenda);

  // Compras
  document.getElementById('compra-add-item-btn')?.addEventListener('click', addCompraItem);
  document.getElementById('compra-clear-btn')?.addEventListener('click', clearCompra);
  document.getElementById('compra-submit-btn')?.addEventListener('click', submitCompra);

  // Histórico
  document.getElementById('hist-tipo')?.addEventListener('change', () => {
    document.getElementById('hist-id-manual').value = '';
    populateHistoryRegistrySelect();
  });
  document.getElementById('hist-registro')?.addEventListener('change', e => {
    document.getElementById('hist-id-manual').value = e.target.value;
  });
  document.getElementById('hist-consultar-btn')?.addEventListener('click', consultarHistorico);

  // Máscaras visuais de CPF, CNPJ e Telefone
  ['cliente-cpf', 'func-cpf'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', e => {
      e.target.value = maskCPF(e.target.value);
    });
  });
  document.getElementById('fornecedor-cnpj')?.addEventListener('input', e => {
    e.target.value = maskCNPJ(e.target.value);
  });
  ['cliente-telefone', 'fornecedor-telefone', 'func-telefone'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', e => {
      e.target.value = maskTelefone(e.target.value);
    });
  });
});
