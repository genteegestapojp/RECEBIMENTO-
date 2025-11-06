// ATENÇÃO: Use as mesmas chaves do seu projeto Supabase original
const SUPABASE_URL = 'https://nsdpsdvzqbubnhspfwwb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zZHBzZHZ6cWJ1Ym5oc3Bmd3diIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NDA0NjcsImV4cCI6MjA3ODAxNjQ2N30.0odDxhIYXw2oc2tx21Q-f1eljFuYfAfqt8IbVNnkkDM';

// ATENÇÃO: Mantenha o proxy que você já usa
const SUPABASE_PROXY_URL = '/api/proxy';

window.GG = {
    supabaseClient: null,
    currentUser: null, 
    authUser: null, 
    
    // Dados específicos deste sistema
    dados: {
        agendamentos: [],
        recebimentos: [],
        tabelaDescarga: [],
        chavesPix: [],
        
        // Dados de admin mantidos
        usuarios: [], 
        solicitacoes: [], 
        
        dadosCarregados: false, 
    },
    
    // Objeto de competências removido

    init() {
        console.log('🚀 Iniciando Sistema Perlog (Controle de Recebimento)...');
        
        try {
            if (!SUPABASE_URL || SUPABASE_URL.includes('URL_DO_SEU_PROJETO')) {
                throw new Error('Supabase URL não configurada em script.js');
            }
            if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('SUA_CHAVE_PUBLICA')) {
                throw new Error('Supabase Anon Key não configurada em script.js');
            }
           const { createClient } = supabase;

            const sessionStorageAdapter = {
              getItem: (key) => sessionStorage.getItem(key),
              setItem: (key, value) => sessionStorage.setItem(key, value),
              removeItem: (key) => sessionStorage.removeItem(key),
            };

            this.supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    storage: sessionStorageAdapter,
                    persistSession: true, 
                    autoRefreshToken: true
                }
            });
            
        } catch (error) {
            console.error("Erro ao inicializar Supabase:", error.message);
            this.mostrarAlerta("Erro crítico na configuração do cliente. Verifique o console.", 'error', 60000);
            return;
        }

        // Estilos de indicadores removidos
        this.setupUIListeners();

        window.addEventListener('hashchange', () => this.handleHashChange());

        this.supabaseClient.auth.onAuthStateChange((event, session) => {
            console.log("Auth Event:", event);
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                if (session) {
                    this.initializeApp(session);
                }
            } else if (event === 'SIGNED_OUT') {
                window.location.href = 'index.html'; 
            }
        });

        this.supabaseClient.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                console.log("Sessão encontrada. Inicializando app.");
                this.initializeApp(session);
            } else {
                console.log("Nenhuma sessão encontrada. Redirecionando para login.");
                window.location.href = 'index.html'; 
            }
        }).catch(error => {
            console.error("Erro ao pegar sessão:", error);
            window.location.href = 'index.html'; 
        });
    },

    // initializeApp, logout, setupUIListeners, showMainSystem (Mantidos 100% iguais ao script.js original)
    // ... (O código é idêntico ao seu script.js original) ...
    // ... (Vou omitir por brevidade, cole o código original aqui) ...
    
    async initializeApp(session) {
        this.authUser = session.user;
        localStorage.setItem('auth_token', session.access_token);

        try {
            const endpoint = `usuarios?auth_user_id=eq.${this.authUser.id}&select=*`;
            let profileResponse = await this.supabaseRequest(endpoint, 'GET');

            if (!profileResponse || !profileResponse[0]) {
                console.warn("Perfil não encontrado na tabela 'usuarios'. Criando um novo...");
                const newProfile = {
                    auth_user_id: this.authUser.id,
                    email: this.authUser.email,
                    nome: this.authUser.user_metadata?.full_name || this.authUser.email.split('@')[0],
                    profile_picture_url: this.authUser.user_metadata?.avatar_url || null,
                    role: 'user', 
                    status: 'ativo' 
                };
                const createResponse = await this.supabaseRequest('usuarios', 'POST', newProfile);
                if (!createResponse || !createResponse[0]) {
                    throw new Error("Falha ao criar o perfil de usuário no banco de dados.");
                }
                this.currentUser = createResponse[0];
                console.log("Novo perfil criado com sucesso!", this.currentUser);
            } else {
                this.currentUser = profileResponse[0];
                console.log("Perfil 'usuarios' encontrado:", this.currentUser);
            }

            this.showMainSystem();
            
            await this.carregarDadosIniciais();
            
            this.handleHashChange();
            
        } catch (error) {
            console.error("Erro detalhado na inicialização do app:", error);
            this.mostrarAlerta(`Erro ao carregar dados: ${error.message}`, 'error', 10000);
            // this.logout(); // <-- TEMPORARIAMENTE DESATIVADO PARA DEBUG
        }
    },

    logout() {
        console.log("Deslogando usuário...");
        this.currentUser = null;
        this.authUser = null;
        localStorage.removeItem('auth_token');
        
        if (this.supabaseClient) {
            this.supabaseClient.auth.signOut();
        } else {
            window.location.href = 'index.html';
        }
    },

    setupUIListeners() {
        const sidebarToggle = document.getElementById('sidebarToggle');
        const sidebar = document.querySelector('.sidebar');
        const appShell = document.getElementById('appShell');
        const sidebarOverlay = document.getElementById('sidebarOverlay');

        if (sidebarToggle && sidebar && appShell && sidebarOverlay) {
            sidebarToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.innerWidth <= 768) {
                    document.body.classList.toggle('sidebar-open');
                } else {
                    sidebar.classList.toggle('collapsed');
                }
            });
            
            sidebarOverlay.addEventListener('click', () => {
                document.body.classList.remove('sidebar-open');
            });

            document.querySelectorAll('.sidebar .nav-item').forEach(item => {
                item.addEventListener('click', () => {
                    if (window.innerWidth <= 768) {
                        document.body.classList.remove('sidebar-open');
                    }
                });
            });
        }

        const profileButton = document.getElementById('profileDropdownButton');
        const profileDropdown = document.getElementById('profileDropdown');

        if (profileButton && profileDropdown) {
            profileButton.addEventListener('click', (e) => {
                e.stopPropagation();
                profileDropdown.classList.toggle('open');
            });
            
            document.addEventListener('click', (e) => {
                if (profileDropdown && !profileDropdown.contains(e.target)) {
                    profileDropdown.classList.remove('open');
                }
            });
        }
    },

    showMainSystem() {
        document.getElementById('appShell').style.display = 'flex';
        document.body.classList.add('system-active');

        const userName = this.currentUser?.nome || this.currentUser?.email || 'Usuário';
        const userAvatar = this.currentUser?.profile_picture_url || 'https://i.imgur.com/80SsE11.png'; 

        document.getElementById('topBarUserName').textContent = userName;
        document.getElementById('topBarUserAvatar').src = userAvatar;
        document.getElementById('dropdownUserName').textContent = userName;
        document.getElementById('dropdownUserEmail').textContent = this.currentUser?.email || '...';
        
        this.loadPerfilView();
        
        feather.replace();
    },

    // ----- NAVEGAÇÃO (AJUSTADA) -----
    
    showView(viewId, element = null) {
        document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active'));
        const viewEl = document.getElementById(viewId);
        if(viewEl) viewEl.classList.add('active');

        document.querySelectorAll('.sidebar nav .nav-item').forEach(item => item.classList.remove('active'));
        if (element) {
            element.classList.add('active');
        } else {
            const matchingLink = document.querySelector(`.sidebar nav .nav-item[href="#${viewId.replace('View', '')}"]`);
            if (matchingLink) matchingLink.classList.add('active');
        }

        const newHash = '#' + viewId.replace('View', '');
        if (window.location.hash !== newHash) {
            history.pushState(null, '', newHash);
        }

        const profileDropdown = document.getElementById('profileDropdown');
        if (profileDropdown) profileDropdown.classList.remove('open');

        try {
            // Cases atualizados para as novas views
            switch (viewId) {
                case 'resumoView': this.atualizarResumo(); break;
                case 'agendamentoView': this.inicializarAgendamento(); break;
                case 'recebimentoView': this.inicializarRecebimento(); break;
                case 'configuracoesView': this.inicializarConfiguracoes(); break;
                case 'perfilView': this.loadPerfilView(); break;
            }
        } catch(e) { console.error(`Erro ao carregar view ${viewId}:`, e); }
        feather.replace();
    },

    handleHashChange() {
        if (!this.currentUser) return; 
        
        const hash = window.location.hash;
        // Hash padrão agora é #resumo
        let viewId = 'resumoView'; 
        let navElement = document.querySelector('a[href="#resumo"]');

        if (hash && hash !== '#') {
            const cleanHash = hash.substring(1);
            const newViewId = cleanHash + 'View';
            const newNavElement = document.querySelector(`a[href="${hash}"]`);
            
            if (document.getElementById(newViewId)) {
                viewId = newViewId;
                navElement = newNavElement;
            }
        }
        
        const currentActive = document.querySelector('.view-content.active');
        if (!currentActive || currentActive.id !== viewId) {
             this.showView(viewId, navElement);
        }
    },

    // supabaseRequest (Mantido 100% igual ao script.js original)
    // ... (O código é idêntico ao seu script.js original) ...
    async supabaseRequest(endpoint, method = 'GET', body = null, headers = {}) {
        const authToken = localStorage.getItem('auth_token');
        if (!authToken) {
            console.error("Token JWT não encontrado, deslogando.");
            this.logout();
            throw new Error("Sessão expirada. Faça login novamente.");
        }
        
        const url = `${SUPABASE_PROXY_URL}?endpoint=${encodeURIComponent(endpoint)}`;
        
        const config = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`, 
                ...headers 
            }
        };

        if (!config.headers['Prefer']) {
             config.headers['Prefer'] = 'return=representation';
        }

        if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
            config.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                let errorData = { message: `Erro ${response.status}: ${response.statusText}` };
                try { 
                    errorData = await response.json(); 
                } catch(e) {
                }
                
                console.error("Erro Supabase (via Proxy):", errorData);
                const detailedError = errorData.message || errorData.error || `Erro na requisição (${response.status})`;
                
                if (response.status === 401) {
                    throw new Error("Não autorizado. Sua sessão pode ter expirado.");
                }
                throw new Error(detailedError);
            }

            if (config.headers['Prefer'] === 'count=exact') {
                 const countRange = response.headers.get('content-range'); 
                 const count = countRange ? countRange.split('/')[1] : '0';
                 return { count: parseInt(count || '0', 10) };
            }

            if (response.status === 204 || response.headers.get('content-length') === '0' ) {
                return null; 
            }

            return await response.json(); 


        } catch (error) {
            console.error("Erro na função supabaseRequest:", error.message);
            if (error.message.includes("Não autorizado") || error.message.includes("expirada")) {
                 this.logout(); 
            }
            throw error; 
        }
    },
    
    // ----- CARREGAMENTO DE DADOS (AJUSTADO) -----
    
    async carregarDadosIniciais() {
        this.mostrarLoading(true);
        // this.atualizarStatusDados('🔄 Carregando dados...', 'info'); // Opcional
        try {
            // Tabelas atualizadas para o novo sistema
            const results = await Promise.allSettled([
                this.supabaseRequest('agendamentos?select=*&order=data.desc', 'GET'),
                this.supabaseRequest('recebimentos?select=*&order=data.desc', 'GET'),
                this.supabaseRequest('tabela_descarga?select=*', 'GET'),
                this.supabaseRequest('chaves_pix?select=*', 'GET')
            ]);
            
            const [agendRes, recebRes, descargaRes, pixRes] = results;

            this.dados.agendamentos = (agendRes.status === 'fulfilled' && agendRes.value) ? agendRes.value : [];
            this.dados.recebimentos = (recebRes.status === 'fulfilled' && recebRes.value) ? recebRes.value : [];
            this.dados.tabelaDescarga = (descargaRes.status === 'fulfilled' && descargaRes.value) ? descargaRes.value : [];
            this.dados.chavesPix = (pixRes.status === 'fulfilled' && pixRes.value) ? pixRes.value : [];
            
            results.forEach((res, i) => {
                if (res.status === 'rejected') {
                    console.error(`Falha ao carregar dados [${i}]:`, res.reason);
                }
            });

            console.log("Dados carregados:", this.dados);

            this.dados.dadosCarregados = true;
            // this.atualizarStatusConexaoHome(true); // Opcional, se você mantiver o status-conexao
            this.atualizarResumo(); // Atualiza a home
            // this.atualizarStatusDados(`✅ Dados carregados!`, 'success', 3000); // Opcional
            console.log("✅ Sistema inicializado!");
        } catch (e) {
            // this.atualizarStatusConexaoHome(false); // Opcional
            // this.atualizarStatusDados(`❌ Falha ao carregar dados: ${e.message}`, 'danger'); // Opcional
            console.error('❌ Erro fatal no carregamento:', e);
        } finally {
            this.mostrarLoading(false);
        }
    },

    // ----- FUNÇÕES DAS NOVAS VIEWS (STUBS) -----

    atualizarResumo() {
        console.log('Carregando resumo...');
        // Lógica para preencher os 6 cards (IDs: agendaCount, recebidosCount, etc.)
        // Ex: document.getElementById('agendaCount').textContent = this.dados.agendamentos.length;
        this.mostrarAlerta('View Resumo carregada. Lógica de contagem pendente.', 'info');
    },
    
    inicializarAgendamento() {
        console.log('Carregando agendamentos...');
        this.renderizarTabelaAgendamentos();
    },
    
    renderizarTabelaAgendamentos() {
        const container = document.getElementById('tabelaAgendamentos');
        if (!container) return;
        // Lógica para renderizar this.dados.agendamentos na tabela
        container.innerHTML = `<p style="text-align: center; padding: 20px;">Tabela de agendamentos (implementação pendente).</p>`;
    },
    
    async salvarAgendamento() {
        this.mostrarLoading(true);
        // Lógica para pegar dados do 'form-agendamento'
        const data = document.getElementById('agenda-data').value;
        const fornecedor = document.getElementById('agenda-fornecedor').value;
        // ...
        
        // Ex: await this.supabaseRequest('agendamentos', 'POST', { data, fornecedor, ... });
        
        this.mostrarAlerta('Função salvarAgendamento não implementada.', 'info');
        this.mostrarLoading(false);
        // Após salvar, recarregar dados e renderizar tabela
        // await this.carregarDadosIniciais();
        // this.renderizarTabelaAgendamentos();
    },
    
    inicializarRecebimento() {
        console.log('Carregando recebimentos...');
        this.renderizarTabelaRecebimento();
    },
    
    renderizarTabelaRecebimento() {
        const container = document.getElementById('tabelaRecebimento');
        if (!container) return;
        // A tabela no HTML já tem mock data.
        // Lógica para limpar o tbody e preencher com this.dados.recebimentos
        console.log('Renderização da tabela de recebimento pendente.');
    },
    
    aplicarFiltrosRecebimento() {
        this.mostrarAlerta('Filtro de recebimento não implementado.', 'info');
        // Lógica para filtrar this.dados.recebimentos e chamar renderizarTabelaRecebimento()
    },
    
    limparFiltrosRecebimento() {
        document.getElementById('filtroDataRec').value = '';
        document.getElementById('filtroFornecedorRec').value = '';
        document.getElementById('filtroStatusRec').value = '';
        this.aplicarFiltrosRecebimento();
    },
    
    editarRecebimento(id) {
        // Lógica para abrir modal e editar o recebimento
        this.mostrarAlerta(`Função editarRecebimento(id: ${id}) não implementada.`, 'info');
    },

    // ----- FUNÇÕES DE CONFIGURAÇÃO (AJUSTADAS) -----

    async inicializarConfiguracoes() {
        if (this.currentUser.role !== 'admin') {
            document.getElementById('configAdminOnly').style.display = 'none';
            document.getElementById('configUserOnly').style.display = 'block';
            document.getElementById('accessStatusConfig').textContent = 'Acesso negado. Requer permissão de Administrador.';
            document.getElementById('accessStatusConfig').className = 'access-status alert alert-error'; 
            document.getElementById('accessStatusConfig').style.display = 'block';
            return;
        }
        
        document.getElementById('configAdminOnly').style.display = 'block';
        document.getElementById('configUserOnly').style.display = 'none';
        document.getElementById('accessStatusConfig').textContent = 'Acesso de Administrador concedido.';
        document.getElementById('accessStatusConfig').className = 'access-status'; 
        document.getElementById('accessStatusConfig').style.display = 'block';

        this.mostrarLoading(true);
        if (!this.dados.dadosCarregados) {
            await this.carregarDadosIniciais(); 
        }
        
        // Carrega dados específicos de admin (usuários, solicitações)
        await this.carregarDadosAdmin(); 

        // Renderiza tabelas de admin
        this.renderizarTabelasAdmin(); // (Usuários e Solicitações)
        
        // Renderiza tabelas das novas abas
        this.renderizarTabelaDescarga();
        this.renderizarTabelaPix();
        
        // Popula dropdowns (ex: filiais no form de PIX)
        // this.popularDropdownsConfig(); // (Nova função necessária)

        // Seta a aba padrão
        this.showConfigTab('tabelaDescarga', document.querySelector('.config-tab-item')); 
        
        this.mostrarLoading(false);
        feather.replace(); 
    },

    showConfigTab(tabId, element) {
        document.querySelectorAll('#configAdminOnly .config-tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.config-tabs .config-tab-item').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // IDs atualizados para as novas abas
        let contentId = '';
        if (tabId === 'tabelaDescarga') contentId = 'configTabTabelaDescarga';
        else if (tabId === 'chavesPix') contentId = 'configTabChavesPix';
        else if (tabId === 'usuarios') contentId = 'configTabUsuarios';

        const content = document.getElementById(contentId);
        if (content) {
            content.classList.add('active');
        }
        if (element) {
            element.classList.add('active');
        }
        feather.replace();
    },
    
    // Funções de Tabela de Descarga (Stubs)
    renderizarTabelaDescarga() {
        const tbody = document.querySelector('#tabela-descarga-valores tbody');
        if (!tbody) return;
        // Mock data já está no HTML.
        // Lógica para limpar o tbody e preencher com this.dados.tabelaDescarga
        console.log('Renderização da tabela de descarga pendente.');
    },
    
    abrirModalEdicaoValor(id) {
        this.mostrarAlerta(`Função editarValorDescarga(id: ${id}) não implementada.`, 'info');
        // Lógica para abrir o 'editModal' genérico e preencher com dados
    },

    // Funções de Chaves PIX (Stubs)
    renderizarTabelaPix() {
        const tbody = document.querySelector('#tabela-pix tbody');
        if (!tbody) return;
        // Mock data já está no HTML.
        // Lógica para limpar o tbody e preencher com this.dados.chavesPix
        console.log('Renderização da tabela de PIX pendente.');
    },

    async salvarChavePix() {
        this.mostrarLoading(true);
        // Lógica para pegar dados do 'form-add-pix'
        this.mostrarAlerta('Função salvarChavePix não implementada.', 'info');
        this.mostrarLoading(false);
    },
    
    limparFormPix() {
        document.getElementById('form-add-pix').reset();
    },

    async excluirChavePix(id) {
        if (!confirm('Tem certeza que deseja excluir esta chave PIX?')) return;
        this.mostrarLoading(true);
        this.mostrarAlerta(`Função excluirChavePix(id: ${id}) não implementada.`, 'info');
        this.mostrarLoading(false);
    },


    // -----------------------------------------------------------------
    // FUNÇÕES DE ADMINISTRAÇÃO (Aba Usuários - Mantidas)
    // -----------------------------------------------------------------
    // carregarDadosAdmin, renderizarTabelasAdmin, renderizarTabelaSolicitacoes,
    // rejeitarSolicitacao, aprovarSolicitacao, renderizarTabelaUsuarios,
    // abrirModalEdicaoUsuario, fecharModalUsuario, salvarModalUsuario
    // (Mantidos 100% iguais ao script.js original)
    // ... (O código é idêntico ao seu script.js original) ...
    // ... (Vou omitir por brevidade, cole o código original aqui) ...
    
    async carregarDadosAdmin() {
        try {
            const [usuariosRes, solicitacoesRes] = await Promise.allSettled([
                this.supabaseRequest('usuarios?select=*&order=nome.asc', 'GET'),
                this.supabaseRequest('solicitacoes_acesso?status=eq.pendente&order=created_at.desc', 'GET')
            ]);

            this.dados.usuarios = (usuariosRes.status === 'fulfilled' && usuariosRes.value) ? usuariosRes.value : [];
            this.dados.solicitacoes = (solicitacoesRes.status === 'fulfilled' && solicitacoesRes.value) ? solicitacoesRes.value : [];
            
        } catch (e) {
            this.mostrarAlerta(`Erro ao carregar dados de admin: ${e.message}`, 'error');
            console.error(e);
        }
    },
    
    renderizarTabelasAdmin() {
        this.renderizarTabelaUsuarios();
        this.renderizarTabelaSolicitacoes();
        feather.replace();
    },

   renderizarTabelaSolicitacoes() {
        const tbody = document.querySelector('#tabela-solicitacoes-admin tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (this.dados.solicitacoes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhuma solicitação pendente.</td></tr>';
            return;
        }
        
        this.dados.solicitacoes.forEach(s => {
            const data = new Date(s.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            tbody.innerHTML += `<tr>
                <td>${this.escapeHTML(s.nome)}</td>
                <td>${this.escapeHTML(s.email)}</td>
                <td style="white-space: normal; min-width: 250px;">${this.escapeHTML(s.motivo)}</td>
                <td>${data}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-success" onclick='window.GG.aprovarSolicitacao(${s.id}, ${JSON.stringify(s.nome)}, ${JSON.stringify(s.email)})'>
                        <i data-feather="check" class="h-4 w-4"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="window.GG.rejeitarSolicitacao(${s.id})">
                        <i data-feather="x" class="h-4 w-4"></i>
                    </button>
                </td>
            </tr>`;
        });
    },

    async rejeitarSolicitacao(id) {
        if (!confirm('Tem certeza que deseja rejeitar esta solicitação?')) return;
        try {
            this.mostrarLoading(true);
            await this.supabaseRequest(`solicitacoes_acesso?id=eq.${id}`, 'PATCH', { status: 'rejeitado' });
            this.mostrarAlerta('Solicitação rejeitada.', 'success');
            await this.carregarDadosAdmin(); 
            this.renderizarTabelasAdmin(); 
        } catch(e) {
            this.mostrarAlerta(`Erro ao rejeitar: ${e.message}`, 'error');
        } finally {
            this.mostrarLoading(false);
        }
    },
    
    async aprovarSolicitacao(id, nome, email) {
        if (!confirm(`Tem certeza que deseja aprovar a solicitação para "${nome}" (${email})?\n\nIsso enviará um e-mail de convite para o usuário definir a própria senha.`)) return;

        try {
            this.mostrarLoading(true);

            const response = await fetch('/api/approve-access', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify({
                    solicitacao_id: id,
                    email: email,
                    nome: nome
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Erro ${response.status}`);
            }

            this.mostrarAlerta('Usuário aprovado e convite enviado!', 'success');
            
            await this.carregarDadosAdmin(); 
            this.renderizarTabelasAdmin(); 

        } catch(e) {
            this.mostrarAlerta(`Erro ao aprovar: ${e.message}`, 'error');
            console.error("Erro em aprovarSolicitacao:", e);
        } finally {
            this.mostrarLoading(false);
        }
    },

    renderizarTabelaUsuarios() {
        const tbody = document.querySelector('#tabela-usuarios-admin tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (this.dados.usuarios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum usuário encontrado.</td></tr>';
            return;
        }
        
        this.dados.usuarios.forEach(u => {
            const status = u.status || 'ativo';
            let statusClass = '';
            switch(status) {
                case 'ativo': statusClass = 'status-ativo'; break;
                case 'inativo': statusClass = 'status-inativo'; break;
                default: statusClass = 'status-inativo';
            }
            const roleClass = u.role === 'admin' ? 'font-bold text-blue-600' : 'text-gray-700';

            tbody.innerHTML += `
                <tr>
                    <td>${this.escapeHTML(u.nome)}</td>
                    <td>${this.escapeHTML(u.email)}</td>
                    <td>${this.escapeHTML(u.matricula || '--')}</td>
                    <td class="${roleClass}">${this.escapeHTML(u.role)}</td>
                    <td>${this.escapeHTML(u.filial || '--')}</td>
                    <td><span class="status-badge ${statusClass}">${this.escapeHTML(status)}</span></td>
                    <td class="actions">
                        <button class="btn btn-sm btn-warning" onclick="window.GG.abrirModalEdicaoUsuario('${u.id}')">
                            <i data-feather="edit-2" class="h-4 w-4"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        feather.replace();
    },
    
    abrirModalEdicaoUsuario(id) {
       const usuario = this.dados.usuarios.find(u => u.id == id);
        if (!usuario) {
            this.mostrarAlerta('Usuário não encontrado.', 'error');
            return;
        }
        
        document.getElementById('modal-user-id').value = usuario.id;
        document.getElementById('modal-user-nome').value = usuario.nome || '';
        document.getElementById('modal-user-email').value = usuario.email || '';
        document.getElementById('modal-user-matricula').value = usuario.matricula || '';
        document.getElementById('modal-user-filial').value = usuario.filial || '';
        document.getElementById('modal-user-role').value = usuario.role || 'user';
        document.getElementById('modal-user-status').value = usuario.status || 'inativo';

        document.getElementById('userEditModal').style.display = 'flex';
        feather.replace();
    },
    
    fecharModalUsuario() {
        document.getElementById('userEditModal').style.display = 'none';
        document.getElementById('userEditForm').reset();
    },

    async salvarModalUsuario() {
        const id = document.getElementById('modal-user-id').value;
        const filiaisInput = document.getElementById('modal-user-filial').value || '';
        let permissoesArray = null; 

        if (filiaisInput.trim().length > 0) {
            permissoesArray = filiaisInput
                .split(',')
                .map(f => f.trim())
                .filter(f => f.length > 0);
        }

        const payload = {
            nome: document.getElementById('modal-user-nome').value,
            matricula: document.getElementById('modal-user-matricula').value || null,
            permissoes_filiais: permissoesArray,
            role: document.getElementById('modal-user-role').value,
            status: document.getElementById('modal-user-status').value
        };

        if (payload.hasOwnProperty('filial')) {
             delete payload.filial;
        }

        if (!id || !payload.nome) {
            this.mostrarAlerta('Nome é obrigatório.', 'warning');
            return;
        }

        try {
            this.mostrarLoading(true);
            const resultado = await this.supabaseRequest(`usuarios?id=eq.${id}`, 'PATCH', payload);
            
            const index = this.dados.usuarios.findIndex(u => u.id == id);
            if (index > -1) {
                this.dados.usuarios[index] = { ...this.dados.usuarios[index], ...resultado[0] };
            }
            
            if (this.currentUser.id == id) {
                this.currentUser = { ...this.currentUser, ...resultado[0] };
                this.showMainSystem(); 
            }
            
            this.renderizarTabelaUsuarios();
            this.fecharModalUsuario();
            this.mostrarAlerta('Usuário atualizado com sucesso!', 'success');
            
        } catch (e) {
            this.mostrarAlerta(`Erro ao salvar usuário: ${e.message}`, 'error');
        } finally {
            this.mostrarLoading(false);
        }
    },
    
    // -----------------------------------------------------------------
    // FUNÇÕES DE PERFIL E UTILITÁRIOS (Mantidas)
    // -----------------------------------------------------------------
    // loadPerfilView, previewProfilePicture, handlePerfilFormSubmit,
    // fecharModal, salvarEdicaoModal, atualizarStatusDados,
    // atualizarStatusConexaoHome, mostrarAlerta, mostrarNotificacao,
    // mostrarLoading, escapeHTML
    // (Mantidos 100% iguais ao script.js original)
    // ... (O código é idêntico ao seu script.js original) ...

    loadPerfilView() {
        const form = document.getElementById('perfilForm');
        const alertContainer = document.getElementById('perfilAlert');
        if (!form || !alertContainer || !this.currentUser) return; 
        alertContainer.innerHTML = '';
        form.reset();

        document.getElementById('perfilEmail').value = this.currentUser.email || '';
        document.getElementById('perfilNome').value = this.currentUser.nome || '';
        document.getElementById('perfilMatricula').value = this.currentUser.matricula || '';
        document.getElementById('perfilPicturePreview').src = this.currentUser.profile_picture_url || 'https://i.imgur.com/80SsE11.png';
        feather.replace();
    },

    previewProfilePicture(event) {
        const reader = new FileReader();
        reader.onload = function(){
            const output = document.getElementById('perfilPicturePreview');
            output.src = reader.result;
        };
        if (event.target.files[0]) {
            reader.readAsDataURL(event.target.files[0]);
        } else {
             if(window.GG && window.GG.currentUser) {
                 document.getElementById('perfilPicturePreview').src = window.GG.currentUser.profile_picture_url || 'https://i.imgur.com/80SsE11.png';
             }
        }
    },

    async handlePerfilFormSubmit(event) {
        if (event) event.preventDefault(); 
        
        const alertContainer = document.getElementById('perfilAlert');
        const saveButton = document.querySelector('#perfilForm button[type="submit"]');
        if (!saveButton || !alertContainer) return;
        
        const originalButtonText = saveButton.innerHTML;
        alertContainer.innerHTML = '';
        saveButton.disabled = true;
        saveButton.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:5px;"></div> Salvando...';

        let profilePicUrl = this.currentUser.profile_picture_url;
        let newPictureUploaded = false; 

        const pictureFile = document.getElementById('perfilPicture').files[0];
        if (pictureFile) {
            try {
                newPictureUploaded = true; 
                const apiUrl = `/api/upload?fileName=${encodeURIComponent(pictureFile.name)}&fileType=${encodeURIComponent(pictureFile.type || 'application/octet-stream')}`;
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/octet-stream', 
                        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                    },
                    body: pictureFile,
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Erro ${response.status} ao enviar foto: ${errorData.details || errorData.error}`);
                }
                const result = await response.json();
                if (result.publicUrl) {
                    profilePicUrl = result.publicUrl;
                } else {
                     throw new Error("API de upload não retornou URL pública.");
                }
            } catch (uploadError) {
                console.error("Falha no upload da foto:", uploadError);
                alertContainer.innerHTML = `<div class="alert alert-error">Falha ao enviar a nova foto: ${uploadError.message}.</div>`;
                 saveButton.disabled = false;
                 saveButton.innerHTML = originalButtonText;
                 feather.replace();
                 return; 
            }
        }

        const profileData = {
            nome: document.getElementById('perfilNome').value,
            matricula: document.getElementById('perfilMatricula').value || null,
            profile_picture_url: profilePicUrl || null
        };

        try {
            const updatedUser = await this.supabaseRequest(`usuarios?id=eq.${this.currentUser.id}`, 'PATCH', profileData);

            if (updatedUser && updatedUser[0]) {
                this.currentUser = { ...this.currentUser, ...updatedUser[0] };
                
                this.showMainSystem();
                if (!newPictureUploaded) {
                     document.getElementById('perfilPicturePreview').src = this.currentUser.profile_picture_url || 'https://i.imgur.com/80SsE11.png';
                }
                
                this.mostrarAlerta('Perfil atualizado com sucesso!', 'success');
            } else {
                 throw new Error("Resposta inesperada do servidor ao atualizar perfil.");
            }

        } catch (error) {
            console.error("Erro ao salvar perfil:", error);
            if (!alertContainer.innerHTML) { 
                 alertContainer.innerHTML = `<div class="alert alert-error">Erro ao salvar dados: ${error.message}</div>`;
            }
        } finally {
            saveButton.disabled = false;
            saveButton.innerHTML = '<i data-feather="save" class="h-4 w-4 mr-2"></i> Salvar Alterações';
            feather.replace();
            document.getElementById('perfilPicture').value = ''; 
        }
    },
    
    fecharModal() { document.getElementById('editModal').style.display = 'none'; },
    
    async salvarEdicaoModal() { 
        this.mostrarAlerta('Função de salvar modal genérico não implementada. Use as funções específicas.', 'info');
        // Implementar lógica de salvar para Tabela de Descarga aqui, usando 'editItemType'
    },

    atualizarStatusDados(mensagem, tipo, timeout = 0) {
        // Esta função tentará encontrar 'statusDados', que não existe mais.
        // Você pode remover esta função ou adaptar o HTML para ter um local de status.
        console.log(`[StatusDados - ${type}]: ${mensagem}`);
    },
    
    atualizarStatusConexaoHome(conectado) {
        // Esta função não é mais necessária, pois a homeView mudou.
        console.log(`[StatusConexao]: ${conectado}`);
    },
    
    mostrarAlerta(msg, tipo = 'info', duracao = 4000) {
        this.mostrarNotificacao(msg, tipo, duracao);
    },
    
    mostrarNotificacao(message, type = 'info', timeout = 4000) {
        const container = document.getElementById('notificationContainer');
        if (!container) return;
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        let icon = type === 'success' ? 'check-circle' : (type === 'error' ? 'x-circle' : 'info');
        if (type === 'warning') icon = 'alert-triangle';
        
        notification.innerHTML = `
            <div class="notification-header">
                <i data-feather="${icon}" class="h-5 w-5 mr-2"></i>
                <span>${type === 'success' ? 'Sucesso!' : (type === 'error' ? 'Erro!' : (type === 'warning' ? 'Atenção!' : 'Aviso'))}</span>
            </div>
            <div class="notification-body">${this.escapeHTML(message)}</div>`;
        container.appendChild(notification);
        feather.replace();
        setTimeout(() => {
            notification.classList.add('hide');
            notification.addEventListener('animationend', () => notification.remove());
        }, timeout);
    },

    mostrarLoading(mostrar) { document.getElementById('loading').style.display = mostrar ? 'flex' : 'none'; },
    
    escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
             .replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;')
             .replace(/"/g, '&quot;')
             .replace(/'/g, '&#39;');
    }
}; 

document.addEventListener('DOMContentLoaded', () => {
    if (window.GG && typeof window.GG.init === 'function') {
        window.GG.init();
    } else { 
        console.error("❌ Falha crítica: Objeto GG não inicializado."); 
        alert("Erro crítico. Verifique o console.");
    }
});
