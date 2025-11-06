// --- ATENÇÃO ---
// Este é o script.js do sistema "avalia-o" refatorado para "Controle de Recebimento".
// O namespace global foi mudado de `window.GG` para `window.CR`.
// As tabelas do Supabase (ex: 'avaliacoes') foram renomeadas (ex: 'recebimentos').
// Você precisará criar estas novas tabelas no seu Supabase.

const SUPABASE_URL = 'https://xizamzncvtacaunhmsrv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpemFtem5jdnRhY2F1bmhtc3J2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4NTM3MTQsImV4cCI6MjA3NzQyOTcxNH0.tNZhQiPlpQCeFTKyahFOq_q-5i3_94AHpmIjYYrnTc8';

const SUPABASE_PROXY_URL = '/api/proxy';

// NOVO NAMESPACE GLOBAL
window.CR = {
    supabaseClient: null,
    currentUser: null, 
    authUser: null, 
    
    charts: {
        topFornecedores: null,
        mediaSecao: null,
        evolucaoGeral: null,
        evolucaoFornecedor: null
    },
    
    // ESTRUTURA DE DADOS ATUALIZADA
    dados: {
        recebimentos: [],       // (Novo) Tabela principal com os 11 campos
        fornecedores: [],     // (Novo) Cadastro de fornecedores
        valoresDescarga: [],  // (Novo) Tabela de preços (image_e9553d.png)
        filiais: [],            // (Novo) Cadastro de filiais com Chave PIX
        
        usuarios: [],           // (Mantido) Gerenciamento de usuários
        solicitacoes: [],       // (Mantido) Solicitações de acesso
        
        dadosCarregados: false, 
        recebimentosFiltrados: [] // (Novo) Para o Acompanhamento
    },
    
    // COMPETENCIAS REMOVIDO

    init() {
        console.log('🚀 Iniciando Sistema de Controle de Recebimento v1.0...');
        
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

        // REMOVIDO: injectIndicatorStyles();
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

    // (Não modificado)
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
            this.logout(); 
        }
    },

    // (Não modificado)
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

    // (Não modificado)
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

    // (Não modificado)
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
    
    // ATUALIZADO: Novas Views
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
            // ATUALIZADO: Mapeamento das novas funções de inicialização
            switch (viewId) {
                case 'homeView': this.atualizarEstatisticasHome(); break;
                case 'lancamentoView': this.inicializarFormularioLancamento(); break;
                case 'acompanhamentoView': this.carregarAcompanhamento(); break;
                case 'relatoriosView': this.inicializarRelatoriosView(); break; 
                case 'fornecedorView': this.inicializarFornecedorView(); break; 
                case 'configuracoesView': this.inicializarConfiguracoes(); break;
                case 'perfilView': this.loadPerfilView(); break;
            }
        } catch(e) { console.error(`Erro ao carregar view ${viewId}:`, e); }
        feather.replace();
    },

    // (Não modificado)
    handleHashChange() {
        if (!this.currentUser) return; 
        
        const hash = window.location.hash;
        let viewId = 'homeView'; 
        let navElement = document.querySelector('a[href="#home"]');

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

    // (Não modificado)
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
    
    // ATUALIZADO: Carrega as novas tabelas
    async carregarDadosIniciais() {
        this.mostrarLoading(true);
        this.atualizarStatusDados('🔄 Carregando dados...', 'info');
        try {
            // ATENÇÃO: Crie estas tabelas no Supabase
            const results = await Promise.allSettled([
                this.supabaseRequest('recebimentos?select=*', 'GET'),         // Tabela principal
                this.supabaseRequest('fornecedores?select=*', 'GET'),       // Cadastro de fornecedores
                this.supabaseRequest('valores_descarga?select=*', 'GET'),   // Tabela de preços
                this.supabaseRequest('filiais?select=*', 'GET')             // Cadastro de filiais (para PIX)
            ]);
            
            const [recebimentosRes, fornecedoresRes, valoresDescargaRes, filiaisRes] = results;

            this.dados.recebimentos = (recebimentosRes.status === 'fulfilled' && recebimentosRes.value) ? recebimentosRes.value : [];
            this.dados.fornecedores = (fornecedoresRes.status === 'fulfilled' && fornecedoresRes.value) ? fornecedoresRes.value : [];
            this.dados.valoresDescarga = (valoresDescargaRes.status === 'fulfilled' && valoresDescargaRes.value) ? valoresDescargaRes.value : [];
            this.dados.filiais = (filiaisRes.status === 'fulfilled' && filiaisRes.value) ? filiaisRes.value : [];
            
            results.forEach((res, i) => {
                if (res.status === 'rejected') {
                    console.error(`Falha ao carregar dados [${i}]:`, res.reason);
                }
            });

            console.log("Dados carregados:", this.dados);

            this.dados.dadosCarregados = true;
            this.atualizarStatusConexaoHome(true);
            this.atualizarEstatisticasHome();
            this.atualizarStatusDados(`✅ Dados carregados!`, 'success', 3000);
            console.log("✅ Sistema inicializado!");
        } catch (e) {
            this.atualizarStatusConexaoHome(false);
            this.atualizarStatusDados(`❌ Falha ao carregar dados: ${e.message}`, 'danger');
            console.error('❌ Erro fatal no carregamento:', e);
        } finally {
            this.mostrarLoading(false);
        }
    },
    
    // ATUALIZADO: Lógica da Home (Resumo do Dia)
    async atualizarEstatisticasHome() {
        if (!this.dados.dadosCarregados) return;
        this.mostrarLoading(true);

        try {
            // 1. Encontrar o último dia de lançamento
            const ultimoRecebimento = await this.supabaseRequest(
                'recebimentos?select=data_descarga&order=data_descarga.desc&limit=1', 
                'GET'
            );
            
            let ultimoDia = new Date().toISOString().split('T')[0]; // Hoje se não houver lançamentos
            if (ultimoRecebimento && ultimoRecebimento.length > 0) {
                ultimoDia = ultimoRecebimento[0].data_descarga;
            }
            
            document.getElementById('homeUltimoDia').textContent = new Date(ultimoDia + 'T05:00:00').toLocaleDateString('pt-BR');

            // 2. Buscar todos os dados desse dia
            // (Simulando status, pois não temos uma tabela de "agenda" separada)
            // (Vamos assumir que "PENDENTE" em tipo_pagamento significa 'Agenda' ou 'Pendente')
            
            const dadosDoDia = await this.supabaseRequest(
                `recebimentos?data_descarga=eq.${ultimoDia}&select=valor_cobrado,tipo_pagamento`,
                'GET'
            );

            let agenda = 0;
            let recebidos = 0;
            let valorRecebido = 0;
            let recusa = 0; // (Simulado)
            let noShow = 0; // (Simulado)
            let pendente = 0;

            dadosDoDia.forEach(item => {
                if (item.tipo_pagamento === 'PENDENTE') {
                    agenda++; // Usando "Pendente" como "Agendado"
                    pendente++;
                } else if (item.tipo_pagamento === 'RECUSA') {
                    recusa++;
                } else if (item.tipo_pagamento === 'NO SHOW') {
                    noShow++;
                } else {
                    recebidos++;
                    valorRecebido += parseFloat(item.valor_cobrado) || 0;
                    if(item.data_pagamento == null) {
                         pendente++;
                    }
                }
            });

            document.getElementById('homeAgenda').textContent = agenda;
            document.getElementById('homeRecebidos').textContent = recebidos;
            document.getElementById('homeValorRecebido').textContent = valorRecebido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            document.getElementById('homeRecusa').textContent = recusa;
            document.getElementById('homeNoShow').textContent = noShow;
            document.getElementById('homePendente').textContent = pendente;

        } catch (e) {
            console.error("Erro ao atualizar stats da home:", e);
            this.mostrarAlerta(`Falha ao carregar resumo: ${e.message}`, 'error');
        } finally {
            this.mostrarLoading(false);
        }
    },

    // ATUALIZADO: Lógica do Formulário de Lançamento
    inicializarFormularioLancamento() { 
        this.limparFormulario();
        
        // Popular dropdown de Tipo de Descarga
        const selectDescarga = document.getElementById('lancamentoTipoDescarga');
        selectDescarga.innerHTML = '<option value="">Selecione o tipo...</option>';
        this.dados.valoresDescarga.sort((a,b) => a.tipo_servico.localeCompare(b.tipo_servico)).forEach(val => {
            const desc = `${val.tipo_servico} (${val.descricao}) - R$ ${val.valor}`;
            selectDescarga.innerHTML += `<option value="${val.id}">${this.escapeHTML(desc)}</option>`;
        });
        
        // Popular datalist de Fornecedores
        const datalist = document.getElementById('listaFornecedores');
        datalist.innerHTML = '';
        this.dados.fornecedores.filter(f => f.status === 'ativo').forEach(f => {
            datalist.innerHTML += `<option value="${this.escapeHTML(f.nome)}">`;
        });
    },
    
    // NOVO: Atualiza o valor quando o tipo de descarga é selecionado
    atualizarValorCobrado() {
        const selectDescarga = document.getElementById('lancamentoTipoDescarga');
        const valorId = selectDescarga.value;
        const valorObj = this.dados.valoresDescarga.find(v => v.id == valorId);
        
        const inputValor = document.getElementById('lancamentoValorCobrado');
        if (valorObj) {
            inputValor.value = parseFloat(valorObj.valor).toFixed(2);
        } else {
            inputValor.value = '';
        }
    },
    
    // ATUALIZADO: Salvar o novo registro
    async salvarRecebimento() {
        // Coleta os 11 campos
        const payload = {
            data_descarga: document.getElementById('lancamentoDataDescarga').value,
            codigo_agenda: document.getElementById('lancamentoCodigoAgenda').value || null,
            fornecedor: document.getElementById('lancamentoFornecedor').value,
            nota_emitida: document.getElementById('lancamentoNotaEmitida').value || null,
            cd: document.getElementById('lancamentoCD').value,
            ref_nota: document.getElementById('lancamentoRefNota').value || null,
            tipo_descarga: document.getElementById('lancamentoTipoDescarga').options[document.getElementById('lancamentoTipoDescarga').selectedIndex].text,
            valor_cobrado: parseFloat(document.getElementById('lancamentoValorCobrado').value) || 0,
            data_pagamento: document.getElementById('lancamentoDataPagamento').value || null,
            tipo_pagamento: document.getElementById('lancamentoTipoPagamento').value || null,
            pagador: document.getElementById('lancamentoPagador').value || null,
            user_id: this.currentUser.id // Rastreia quem lançou
        };

        if (!payload.data_descarga || !payload.fornecedor || !payload.cd || !payload.tipo_descarga) {
            this.mostrarAlerta('Preencha todos os campos obrigatórios (*)!', 'danger'); return;
        }

        // Se data_pagamento foi preenchido, mas tipo_pagamento não, assume PIX
        if (payload.data_pagamento && !payload.tipo_pagamento) {
            payload.tipo_pagamento = 'PIX';
        }
        // Se data_pagamento não foi preenchido, força pendente
        if (!payload.data_pagamento) {
            payload.tipo_pagamento = 'PENDENTE';
        }
        
        try {
            this.mostrarLoading(true);
            // ATENÇÃO: Tabela 'recebimentos' precisa existir no Supabase
            const resultado = await this.supabaseRequest('recebimentos', 'POST', payload);
            
            if (resultado && resultado.length > 0) {
                this.dados.recebimentos.push(resultado[0]); 
                this.atualizarEstatisticasHome(); 
                this.mostrarAlerta(`Lançamento para ${payload.fornecedor} salvo!`, 'success');
                
                if (confirm('Lançamento salvo. Deseja imprimir um comprovante agora?')) {
                    this.exibirComprovante(resultado[0].id);
                }
                
                this.limparFormulario(true); 
            } else { throw new Error('Falha ao salvar. Nenhum dado retornado.'); }
        } catch (error) { 
            this.mostrarAlerta('Erro ao salvar: ' + error.message, 'danger'); 
        } finally { 
            this.mostrarLoading(false); 
        }
    },
    
    // ATUALIZADO: Limpar o novo formulário
    limparFormulario(force = false) {
         if (force || confirm('🗑️ Deseja limpar todos os campos?')) {
             document.getElementById('form-lancamento').reset();
             this.dados.avaliacaoAtual = null;
         }
     },
     
    // ATUALIZADO: Carregar a tabela de Acompanhamento
    async carregarAcompanhamento(){ 
        this.mostrarLoading(true);
        if (!this.dados.dadosCarregados) {
            await this.carregarDadosIniciais();
        }
        
        if (!this.dados.dadosCarregados) {
            this.mostrarAlerta("Não foi possível carregar os dados. Verifique a conexão.", 'error');
            this.mostrarLoading(false);
            return;
        }

        this.aplicarFiltros(); 
        
        const statusEl = document.getElementById('accessStatusHistorico');
        if (this.currentUser.role === 'admin') {
            statusEl.textContent = 'Modo Administrador: Visualizando todos os registros.';
            statusEl.style.display = 'block';
        } else {
             statusEl.textContent = 'Modo Usuário: Visualizando apenas seus lançamentos.';
             statusEl.style.display = 'block';
        }
        
        this.mostrarLoading(false);
    },
    
    // ATUALIZADO: Filtros do Acompanhamento
    aplicarFiltros() {
        let dadosFiltrados;
        
        if (this.currentUser.role !== 'admin') {
            dadosFiltrados = this.dados.recebimentos.filter(r => r.user_id === this.currentUser.id);
        } else {
            dadosFiltrados = [...this.dados.recebimentos];
        }

        const dataInicio = document.getElementById('filtroDataInicio').value;
        const dataFim = document.getElementById('filtroDataFim').value;
        const filtroNome = document.getElementById('filtroFornecedor').value.toLowerCase();
        const filtroPgto = document.getElementById('filtroPagamento').value;

        if (dataInicio) dadosFiltrados = dadosFiltrados.filter(r => r.data_descarga >= dataInicio);
        if (dataFim) dadosFiltrados = dadosFiltrados.filter(r => r.data_descarga <= dataFim);
        if (filtroNome) dadosFiltrados = dadosFiltrados.filter(r => r.fornecedor && r.fornecedor.toLowerCase().includes(filtroNome));
        
        if (filtroPgto === 'PENDENTE') {
            dadosFiltrados = dadosFiltrados.filter(r => r.tipo_pagamento === 'PENDENTE' || !r.data_pagamento);
        } else if (filtroPgto === 'PAGO') {
            dadosFiltrados = dadosFiltrados.filter(r => r.tipo_pagamento !== 'PENDENTE' && r.data_pagamento);
        }

        if (this.currentUser.role !== 'admin' && this.currentUser.permissoes_filiais && this.currentUser.permissoes_filiais.length > 0) {
             dadosFiltrados = dadosFiltrados.filter(r => this.currentUser.permissoes_filiais.includes(r.cd));
        }

        this.dados.recebimentosFiltrados = dadosFiltrados;
        this.renderizarTabelaAcompanhamento(dadosFiltrados);
    },
    
    // ATUALIZADO: Renderizar a tabela de 11 colunas
    renderizarTabelaAcompanhamento(dados) {
        const container = document.getElementById('tabelaAcompanhamento');
        if (dados.length === 0) { container.innerHTML = `<p style="text-align: center; padding: 20px; color: #6c757d;">Nenhum lançamento encontrado para os filtros selecionados.</p>`; return; }
        
        // Define as 11 colunas
        let html = '<table class="tabela"><thead><tr>' +
                   '<th>Data Descarga</th>' +
                   '<th>Cód. Agenda</th>' +
                   '<th>Fornecedor</th>' +
                   '<th>Nota Emitida</th>' +
                   '<th>CD</th>' +
                   '<th>Ref. Nota</th>' +
                   '<th>Tipo Descarga</th>' +
                   '<th>Valor Cobrado</th>' +
                   '<th>Data Pgto</th>' +
                   '<th>Tipo Pgto</th>' +
                   '<th>Pagador</th>' +
                   '<th>Ações</th>' +
                   '</tr></thead><tbody>';
                   
        dados.sort((a,b) => new Date(b.data_descarga) - new Date(a.data_descarga));
        
        dados.forEach(r => {
            const dataDesc = r.data_descarga ? new Date(r.data_descarga + 'T05:00:00').toLocaleDateString('pt-BR') : '-';
            const dataPgto = r.data_pagamento ? new Date(r.data_pagamento + 'T05:00:00').toLocaleDateString('pt-BR') : '-';
            const valorCob = (parseFloat(r.valor_cobrado) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            
            let statusPgtoClass = '';
            if (r.tipo_pagamento === 'PENDENTE' || !r.data_pagamento) {
                statusPgtoClass = 'status-aviso'; // Amarelo para pendente
            } else {
                 statusPgtoClass = 'status-ativo'; // Verde para pago
            }

            html += `<tr>
                        <td>${dataDesc}</td>
                        <td>${this.escapeHTML(r.codigo_agenda)}</td>
                        <td>${this.escapeHTML(r.fornecedor)}</td>
                        <td>${this.escapeHTML(r.nota_emitida)}</td>
                        <td>${this.escapeHTML(r.cd)}</td>
                        <td>${this.escapeHTML(r.ref_nota)}</td>
                        <td style="white-space: normal; min-width: 150px;">${this.escapeHTML(r.tipo_descarga)}</td>
                        <td><strong>${valorCob}</strong></td>
                        <td>${dataPgto}</td>
                        <td><span class="status-badge ${statusPgtoClass}">${this.escapeHTML(r.tipo_pagamento)}</span></td>
                        <td>${this.escapeHTML(r.pagador)}</td>
                        <td class="actions">
                            <button class="btn btn-sm btn-info" onclick='window.CR.exibirComprovante(${r.id})'>
                                <i data-feather="printer" class="h-4 w-4"></i>
                            </button>
                        </td>
                    </tr>`;
        });
        html += '</tbody></table>'; 
        container.innerHTML = html;
        feather.replace(); 
    },
    
    // ATUALIZADO: Limpar os novos filtros
    limparFiltros() {
        ['filtroDataInicio', 'filtroDataFim', 'filtroFornecedor', 'filtroPagamento'].forEach(id => document.getElementById(id).value = '');
        this.aplicarFiltros();
    },
    
    // ATUALIZADO: Exportar os novos dados
    exportarDados() {
        if (this.dados.recebimentosFiltrados.length === 0) { this.mostrarAlerta("Nenhum dado para exportar.", "warning"); return; }
        let csv = 'data_descarga,codigo_agenda,fornecedor,nota_emitida,cd,ref_nota,tipo_descarga,valor_cobrado,data_pagamento,tipo_pagamento,pagador\n';
        this.dados.recebimentosFiltrados.forEach(r => {
            const row = [
                r.data_descarga, r.codigo_agenda, `"${(r.fornecedor || '').replace(/"/g, '""')}"`,
                r.nota_emitida, r.cd, r.ref_nota,
                `"${(r.tipo_descarga || '').replace(/"/g, '""')}"`,
                r.valor_cobrado, r.data_pagamento, r.tipo_pagamento,
                `"${(r.pagador || '').replace(/"/g, '""')}"`
            ];
            csv += row.join(',') + '\n';
        });
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `acompanhamento_recebimentos_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
        this.mostrarAlerta("Download iniciado.", "success");
    },
    
    // ATUALIZADO: Gerenciar Configurações
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
        
        await this.carregarDadosAdmin(); 

        this.renderizarTabelasAdmin(); // (Usuários e Solicitações)
        this.renderizarTabelaValores(); // (Novo)
        this.renderizarTabelaFiliais(); // (Novo)
        this.renderizarTabelaFornecedores(); // (Novo)
        
        this.limparFormValor(); 
        this.limparFormFilial();
        this.limparFormFornecedor();

        this.showConfigTab('usuarios', document.querySelector('.config-tab-item')); 
        
        this.mostrarLoading(false);
        feather.replace(); 
    },

    // ATUALIZADO: Mostrar a aba correta
    showConfigTab(tabId, element) {
        document.querySelectorAll('#configAdminOnly .config-tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelectorAll('.config-tabs .config-tab-item').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Converte tabId (ex: 'valores') para o ID do DOM (ex: 'configTabValores')
        const contentId = `configTab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`;
        const content = document.getElementById(contentId);
        
        if (content) {
            content.classList.add('active');
        }
        if (element) {
            element.classList.add('active');
        }
        feather.replace();
    },
    
    // -----------------------------------------------------------------
    // FUNÇÕES DE ADMINISTRAÇÃO (Aba Usuários) - (Sem alteração)
    // -----------------------------------------------------------------
    
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
                    <button class="btn btn-sm btn-success" onclick='window.CR.aprovarSolicitacao(${s.id}, ${JSON.stringify(s.nome)}, ${JSON.stringify(s.email)})'>
                        <i data-feather="check" class="h-4 w-4"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="window.CR.rejeitarSolicitacao(${s.id})">
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
                body: JSON.stringify({ solicitacao_id: id, email: email, nome: nome })
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
                        <button class="btn btn-sm btn-warning" onclick="window.CR.abrirModalEdicaoUsuario('${u.id}')">
                            <i data-feather="edit-2" class="h-4 w-4"></i>
                        </button>
                    </td>
                </tr>`;
        });
        feather.replace();
    }, 
    
    abrirModalEdicaoUsuario(id) {
       const usuario = this.dados.usuarios.find(u => u.id == id);
        if (!usuario) { this.mostrarAlerta('Usuário não encontrado.', 'error'); return; }
        document.getElementById('modal-user-id').value = usuario.id;
        document.getElementById('modal-user-nome').value = usuario.nome || '';
        document.getElementById('modal-user-email').value = usuario.email || '';
        document.getElementById('modal-user-matricula').value = usuario.matricula || '';
        document.getElementById('modal-user-filial').value = (usuario.permissoes_filiais || []).join(', '); // ATUALIZADO
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
            permissoesArray = filiaisInput.split(',').map(f => f.trim()).filter(f => f.length > 0);
        }
        const payload = {
            nome: document.getElementById('modal-user-nome').value,
            matricula: document.getElementById('modal-user-matricula').value || null,
            permissoes_filiais: permissoesArray,
            role: document.getElementById('modal-user-role').value,
            status: document.getElementById('modal-user-status').value
        };
        if (!id || !payload.nome) { this.mostrarAlerta('Nome é obrigatório.', 'warning'); return; }
        try {
            this.mostrarLoading(true);
            const resultado = await this.supabaseRequest(`usuarios?id=eq.${id}`, 'PATCH', payload);
            const index = this.dados.usuarios.findIndex(u => u.id == id);
            if (index > -1) this.dados.usuarios[index] = { ...this.dados.usuarios[index], ...resultado[0] };
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
    // FUNÇÕES DE ADMINISTRAÇÃO (Aba Valores de Descarga) - (NOVAS)
    // -----------------------------------------------------------------

    renderizarTabelaValores() {
        const tbody = document.querySelector('#tabela-valores tbody');
        tbody.innerHTML = '';
        if (!this.dados.valoresDescarga || this.dados.valoresDescarga.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum valor cadastrado.</td></tr>'; 
            return; 
        }
        
        this.dados.valoresDescarga.sort((a,b) => a.tipo_servico.localeCompare(b.tipo_servico)).forEach(val => {
            const valorFmt = (parseFloat(val.valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            tbody.innerHTML += `<tr id="valor-row-${val.id}">
                <td>${this.escapeHTML(val.tipo_servico)}</td>
                <td style="white-space: normal;">${this.escapeHTML(val.descricao)}</td>
                <td>${valorFmt}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-warning" onclick="window.CR.editarValorDescarga(${val.id})"><i data-feather="edit-2" class="h-4 w-4"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="window.CR.excluirValorDescarga(${val.id})"><i data-feather="trash-2" class="h-4 w-4"></i></button>
                </td></tr>`;
        });
        feather.replace();
    },

    async salvarValorDescarga() {
        if (this.currentUser.role !== 'admin') return;
        const id = document.getElementById('edit-valor-id').value;
        const dados = {
            tipo_servico: document.getElementById('add-valor-tipo').value.trim().toUpperCase(),
            descricao: document.getElementById('add-valor-descricao').value.trim(),
            valor: parseFloat(document.getElementById('add-valor-valor').value) || 0,
        };
        if (!dados.tipo_servico || !dados.descricao || dados.valor <= 0) { 
            this.mostrarAlerta('Todos os campos são obrigatórios e o valor deve ser positivo.', 'warning'); 
            return; 
        }
        
        try {
            this.mostrarLoading(true);
            // ATENÇÃO: Tabela 'valores_descarga'
            if (id) { 
                const resultado = await this.supabaseRequest(`valores_descarga?id=eq.${id}`, 'PATCH', dados);
                const index = this.dados.valoresDescarga.findIndex(v => v.id == id);
                if (index > -1) this.dados.valoresDescarga[index] = resultado[0];
                this.mostrarAlerta('Valor atualizado!', 'success');
            } else { 
                const resultado = await this.supabaseRequest('valores_descarga', 'POST', dados);
                this.dados.valoresDescarga.push(resultado[0]);
                this.mostrarAlerta('Valor adicionado!', 'success');
            }
            this.limparFormValor();
            this.renderizarTabelaValores();
        } catch (e) { 
            this.mostrarAlerta(`Erro ao salvar valor: ${e.message}`, 'danger'); 
        } finally { 
            this.mostrarLoading(false); 
        }
    },

    editarValorDescarga(id) {
        if (this.currentUser.role !== 'admin') return;
        const valor = this.dados.valoresDescarga.find(v => v.id === id);
        if (!valor) return; 
        
        document.getElementById('edit-valor-id').value = id;
        document.getElementById('add-valor-tipo').value = valor.tipo_servico;
        document.getElementById('add-valor-descricao').value = valor.descricao; 
        document.getElementById('add-valor-valor').value = valor.valor; 
        document.getElementById('add-valor-tipo').focus();
        this.mostrarAlerta(`Editando Valor #${id}. Altere e clique em Salvar.`, 'info');
    },

    limparFormValor(){ 
        document.getElementById('form-add-valor').reset(); 
        document.getElementById('edit-valor-id').value = ''; 
    },

    async excluirValorDescarga(id) {
        if (this.currentUser.role !== 'admin') return;
        if (!confirm(`Tem certeza que deseja excluir este valor (ID ${id})?`)) return;
        try {
            this.mostrarLoading(true);
            await this.supabaseRequest(`valores_descarga?id=eq.${id}`, 'DELETE');
            this.dados.valoresDescarga = this.dados.valoresDescarga.filter(v => v.id !== id);
            this.renderizarTabelaValores(); 
            this.mostrarAlerta('Valor excluído!', 'success');
        } catch (e) { 
            this.mostrarAlerta(`Erro ao excluir: ${e.message}`, 'danger'); 
        } finally { 
            this.mostrarLoading(false); 
        }
    },

    // -----------------------------------------------------------------
    // FUNÇÕES DE ADMINISTRAÇÃO (Aba Filiais PIX) - (NOVAS)
    // -----------------------------------------------------------------

    renderizarTabelaFiliais() {
        const tbody = document.querySelector('#tabela-filiais tbody');
        tbody.innerHTML = '';
        if (!this.dados.filiais || this.dados.filiais.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhuma filial cadastrada.</td></tr>'; 
            return; 
        }
        
        this.dados.filiais.sort((a,b) => a.nome.localeCompare(b.nome)).forEach(f => {
            tbody.innerHTML += `<tr id="filial-row-${f.id}">
                <td>${this.escapeHTML(f.nome)}</td>
                <td>${this.escapeHTML(f.chave_pix || 'Não definida')}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-warning" onclick="window.CR.editarFilial(${f.id})"><i data-feather="edit-2" class="h-4 w-4"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="window.CR.excluirFilial(${f.id})"><i data-feather="trash-2" class="h-4 w-4"></i></button>
                </td></tr>`;
        });
        feather.replace();
    },

    async salvarFilial() {
        if (this.currentUser.role !== 'admin') return;
        const id = document.getElementById('edit-filial-id').value;
        const dados = {
            nome: document.getElementById('add-filial-nome').value.trim(),
            chave_pix: document.getElementById('add-filial-pix').value.trim() || null,
        };
        if (!dados.nome) { this.mostrarAlerta('Nome da filial é obrigatório.', 'warning'); return; }
        
        try {
            this.mostrarLoading(true);
            // ATENÇÃO: Tabela 'filiais'
            if (id) { 
                const resultado = await this.supabaseRequest(`filiais?id=eq.${id}`, 'PATCH', dados);
                const index = this.dados.filiais.findIndex(f => f.id == id);
                if (index > -1) this.dados.filiais[index] = resultado[0];
                this.mostrarAlerta('Filial atualizada!', 'success');
            } else { 
                const resultado = await this.supabaseRequest('filiais', 'POST', dados);
                this.dados.filiais.push(resultado[0]);
                this.mostrarAlerta('Filial adicionada!', 'success');
            }
            this.limparFormFilial();
            this.renderizarTabelaFiliais();
        } catch (e) { 
            this.mostrarAlerta(`Erro ao salvar filial: ${e.message}`, 'danger'); 
        } finally { 
            this.mostrarLoading(false); 
        }
    },

    editarFilial(id) {
        if (this.currentUser.role !== 'admin') return;
        const filial = this.dados.filiais.find(f => f.id === id);
        if (!filial) return; 
        
        document.getElementById('edit-filial-id').value = id;
        document.getElementById('add-filial-nome').value = filial.nome;
        document.getElementById('add-filial-pix').value = filial.chave_pix || ''; 
        document.getElementById('add-filial-nome').focus();
    },

    limparFormFilial(){ 
        document.getElementById('form-add-filial').reset(); 
        document.getElementById('edit-filial-id').value = ''; 
    },

    async excluirFilial(id) {
        if (this.currentUser.role !== 'admin') return;
        if (!confirm(`Tem certeza que deseja excluir esta filial (ID ${id})?`)) return;
        try {
            this.mostrarLoading(true);
            await this.supabaseRequest(`filiais?id=eq.${id}`, 'DELETE');
            this.dados.filiais = this.dados.filiais.filter(f => f.id !== id);
            this.renderizarTabelaFiliais(); 
            this.mostrarAlerta('Filial excluída!', 'success');
        } catch (e) { 
            this.mostrarAlerta(`Erro ao excluir: ${e.message}`, 'danger'); 
        } finally { 
            this.mostrarLoading(false); 
        }
    },
    
    // -----------------------------------------------------------------
    // FUNÇÕES DE ADMINISTRAÇÃO (Aba Fornecedores) - (NOVAS)
    // -----------------------------------------------------------------

    renderizarTabelaFornecedores() {
        const tbody = document.querySelector('#tabela-fornecedores tbody');
        tbody.innerHTML = '';
        if (!this.dados.fornecedores || this.dados.fornecedores.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum fornecedor cadastrado.</td></tr>'; 
            return; 
        }
        
        this.dados.fornecedores.sort((a,b) => a.nome.localeCompare(b.nome)).forEach(f => {
            const statusClass = f.status === 'ativo' ? 'status-ativo' : 'status-inativo';
            tbody.innerHTML += `<tr id="fornecedor-row-${f.id}">
                <td>${this.escapeHTML(f.nome)}</td>
                <td>${this.escapeHTML(f.cnpj || '--')}</td>
                <td><span class="status-badge ${statusClass}">${this.escapeHTML(f.status)}</span></td>
                <td class="actions">
                    <button class="btn btn-sm btn-warning" onclick="window.CR.editarFornecedor(${f.id})"><i data-feather="edit-2" class="h-4 w-4"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="window.CR.excluirFornecedor(${f.id})"><i data-feather="trash-2" class="h-4 w-4"></i></button>
                </td></tr>`;
        });
        feather.replace();
    },

    async salvarFornecedor() {
        if (this.currentUser.role !== 'admin') return;
        const id = document.getElementById('edit-fornecedor-id').value;
        const dados = {
            nome: document.getElementById('add-fornecedor-nome').value.trim(),
            cnpj: document.getElementById('add-fornecedor-cnpj').value.trim() || null,
            status: document.getElementById('add-fornecedor-status').value,
        };
        if (!dados.nome) { this.mostrarAlerta('Nome do fornecedor é obrigatório.', 'warning'); return; }
        
        try {
            this.mostrarLoading(true);
            // ATENÇÃO: Tabela 'fornecedores'
            if (id) { 
                const resultado = await this.supabaseRequest(`fornecedores?id=eq.${id}`, 'PATCH', dados);
                const index = this.dados.fornecedores.findIndex(f => f.id == id);
                if (index > -1) this.dados.fornecedores[index] = resultado[0];
                this.mostrarAlerta('Fornecedor atualizado!', 'success');
            } else { 
                const resultado = await this.supabaseRequest('fornecedores', 'POST', dados);
                this.dados.fornecedores.push(resultado[0]);
                this.mostrarAlerta('Fornecedor adicionado!', 'success');
            }
            this.limparFormFornecedor();
            this.renderizarTabelaFornecedores();
            this.inicializarFormularioLancamento(); // Atualiza o datalist
        } catch (e) { 
            this.mostrarAlerta(`Erro ao salvar fornecedor: ${e.message}`, 'danger'); 
        } finally { 
            this.mostrarLoading(false); 
        }
    },

    editarFornecedor(id) {
        if (this.currentUser.role !== 'admin') return;
        const f = this.dados.fornecedores.find(f => f.id === id);
        if (!f) return; 
        document.getElementById('edit-fornecedor-id').value = id;
        document.getElementById('add-fornecedor-nome').value = f.nome;
        document.getElementById('add-fornecedor-cnpj').value = f.cnpj || ''; 
        document.getElementById('add-fornecedor-status').value = f.status || 'ativo'; 
        document.getElementById('add-fornecedor-nome').focus();
    },

    limparFormFornecedor(){ 
        document.getElementById('form-add-fornecedor').reset(); 
        document.getElementById('edit-fornecedor-id').value = ''; 
    },

    async excluirFornecedor(id) {
        if (this.currentUser.role !== 'admin') return;
        if (!confirm(`Tem certeza que deseja excluir este fornecedor (ID ${id})? Isso não excluirá os lançamentos já feitos.`)) return;
        try {
            this.mostrarLoading(true);
            await this.supabaseRequest(`fornecedores?id=eq.${id}`, 'DELETE');
            this.dados.fornecedores = this.dados.fornecedores.filter(f => f.id !== id);
            this.renderizarTabelaFornecedores(); 
            this.inicializarFormularioLancamento(); // Atualiza o datalist
            this.mostrarAlerta('Fornecedor excluído!', 'success');
        } catch (e) { 
            this.mostrarAlerta(`Erro ao excluir: ${e.message}`, 'danger'); 
        } finally { 
            this.mostrarLoading(false); 
        }
    },
    
    // -----------------------------------------------------------------
    // Funções do Comprovante/Impressão
    // -----------------------------------------------------------------
    
    // ATUALIZADO: Usando o 'laudo.html' como base para o "Comprovante"
    exibirComprovante(recebimentoId) {
        const recebimento = this.dados.recebimentos.find(r => r.id === recebimentoId);
        if (!recebimento) {
            this.mostrarAlerta('Não foi possível encontrar os detalhes deste lançamento.', 'error');
            return;
        }

        try {
            // Prepara os dados para o laudo.js
            // Vamos "fingir" que é uma avaliação para o laudo.js entender
            const dadosParaLaudo = {
                id: recebimento.id,
                nome_avaliado: recebimento.fornecedor, // Campo principal
                matricula_avaliado: recebimento.codigo_agenda || 'S/C',
                filial: recebimento.cd,
                nome_gestor: this.currentUser.nome, // Usuário que lançou
                matricula_gestor: this.currentUser.matricula || 'S/M',
                mes_referencia: recebimento.data_descarga,
                
                pontuacao: recebimento.valor_cobrado,
                classificacao: recebimento.tipo_pagamento,
                
                // Usando campos de feedback para os dados
                pontos_fortes: `Nota Emitida: ${recebimento.nota_emitida || 'N/A'}\nRef. Nota: ${recebimento.ref_nota || 'N/A'}`,
                oportunidades: `Pagador: ${recebimento.pagador || 'N/A'}\nData Pgto: ${recebimento.data_pagamento ? new Date(recebimento.data_pagamento + 'T05:00:00').toLocaleDateString('pt-BR') : 'PENDENTE'}`,
                comentarios: `Lançado por: ${this.currentUser.nome}`,
                
                // Escondendo competências e indicadores
                respostas_competencias: {},
                html_indicadores: `<p style="font-style: italic;">Não aplicável para este lançamento.</p>`,
                dissertativa_lideranca: ''
            };
            
            localStorage.setItem('avaliacaoParaLaudo', JSON.stringify(dadosParaLaudo));
            
            const laudoWindow = window.open('laudo.html', '_blank');
            if (!laudoWindow) {
                this.mostrarAlerta('Seu navegador bloqueou a abertura do comprovante. Por favor, habilite pop-ups.', 'warning', 6000);
            }
        } catch (e) {
            console.error("Erro ao salvar dados para o laudo:", e);
            this.mostrarAlerta('Erro ao preparar o comprovante: ' + e.message, 'error');
        }
    },    
   

    // -----------------------------------------------------------------
    // Funções da View "Fornecedor"
    // -----------------------------------------------------------------
    
    // ATUALIZADO:
    inicializarFornecedorView() {
        this.popularDatalistFornecedor();
        document.getElementById('fornecedorSearchInput').value = ''; // Limpa o campo
        this.carregarDadosFornecedor(null); // Limpa a tela
    },
    
    popularDatalistFornecedor() {
        const datalist = document.getElementById('listaFornecedores'); // Reutiliza o datalist
        datalist.innerHTML = '';
        
        // Pega nomes únicos de fornecedores que JÁ TÊM lançamentos
        const nomesAvaliados = [...new Set(
            this.dados.recebimentos.map(r => r.fornecedor)
        )];

        nomesAvaliados.sort().forEach(nome => {
            datalist.innerHTML += `<option value="${this.escapeHTML(nome)}"></option>`;
        });
    },
    
    carregarDadosFornecedor(nomeFornecedor) {
        const dataContainer = document.getElementById('fornecedorData');
        if (!nomeFornecedor) {
            dataContainer.style.display = 'none';
            return;
        }
        
        const lancamentos = this.dados.recebimentos
            .filter(r => r.fornecedor === nomeFornecedor)
            .sort((a,b) => new Date(a.data_descarga) - new Date(b.data_descarga));
            
        const historicoContainer = document.getElementById('fornecedorHistoricoContainer');
        if (lancamentos.length === 0) {
            dataContainer.style.display = 'none';
            this.mostrarAlerta('Nenhum lançamento encontrado para este fornecedor.', 'warning');
            return;
        }

        dataContainer.style.display = 'block';
        
        // Renderiza tabela
        let html = '<table class="tabela"><thead><tr><th>Data Descarga</th><th>Tipo Descarga</th><th>Valor Cobrado</th><th>Status Pgto</th></tr></thead><tbody>';
        lancamentos.forEach(r => {
            const dataDesc = r.data_descarga ? new Date(r.data_descarga + 'T05:00:00').toLocaleDateString('pt-BR') : '-';
            const valorCob = (parseFloat(r.valor_cobrado) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const statusPgtoClass = (r.tipo_pagamento === 'PENDENTE' || !r.data_pagamento) ? 'status-aviso' : 'status-ativo';
            
            html += `<tr>
                        <td>${dataDesc}</td>
                        <td style="white-space: normal;">${this.escapeHTML(r.tipo_descarga)}</td>
                        <td><strong>${valorCob}</strong></td>
                        <td><span class="status-badge ${statusPgtoClass}">${this.escapeHTML(r.tipo_pagamento)}</span></td>
                    </tr>`;
        });
        html += '</tbody></table>'; 
        historicoContainer.innerHTML = html;

        // Calcula Stats
        const total = lancamentos.length;
        const totalCobrado = lancamentos.reduce((acc, r) => acc + (parseFloat(r.valor_cobrado) || 0), 0);
        const media = (totalCobrado / total);
        const totalPendente = lancamentos.filter(r => r.tipo_pagamento === 'PENDENTE' || !r.data_pagamento)
                                        .reduce((acc, r) => acc + (parseFloat(r.valor_cobrado) || 0), 0);
        
        document.getElementById('fornecedorTotalDescargas').textContent = total;
        document.getElementById('fornecedorMediaValor').textContent = media.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        document.getElementById('fornecedorTotalCobrado').textContent = totalCobrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        document.getElementById('fornecedorTotalPendente').textContent = totalPendente.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        // Renderiza Gráfico
        const labels = lancamentos.map(r => new Date(r.data_descarga + 'T05:00:00').toLocaleDateString('pt-BR', { month: 'short', day: '2-digit' }));
        const data = lancamentos.map(r => r.valor_cobrado);
        this.renderizarChart('evolucaoFornecedor', 'chartEvolucaoFornecedor', 'line', labels, data, 'Valor Cobrado (R$)');
    },

    // -----------------------------------------------------------------
    // Funções da View "Relatórios"
    // -----------------------------------------------------------------

    // ATUALIZADO:
    async inicializarRelatoriosView() {
        if (this.currentUser.role !== 'admin') {
            document.getElementById('accessStatusRelatorios').textContent = 'Acesso negado. Relatórios são restritos a Administradores.';
            document.getElementById('accessStatusRelatorios').className = 'access-status alert alert-error';
            document.getElementById('accessStatusRelatorios').style.display = 'block';
            document.getElementById('relatoriosAdminOnly').style.display = 'none';
            Object.values(this.charts).forEach(chart => { if (chart) chart.destroy(); });
            return;
        }
        
        document.getElementById('accessStatusRelatorios').style.display = 'none';
        document.getElementById('relatoriosAdminOnly').style.display = 'block';
        
        this.gerarRelatorios();
    },
    
    // ATUALIZADO:
    gerarRelatorios() {
        this.mostrarLoading(true);
        try {
            // Gráfico 1: Top Fornecedores por Valor
            const topFornecedores = this.processarMediaAgrupada('fornecedor', 'sum');
            this.renderizarChart('topFornecedores', 'chartTopFornecedores', 'bar', topFornecedores.labels, topFornecedores.data, 'Total Cobrado (R$)');

            // Gráfico 2: Total por Filial (CD)
            const mediaSecao = this.processarMediaAgrupada('cd', 'sum');
            this.renderizarChart('mediaSecao', 'chartMediaSecao', 'bar', mediaSecao.labels, mediaSecao.data, 'Total Cobrado (R$)');

            // Gráfico 3: Evolução Geral
            const evolucao = this.processarEvolucaoGeral();
            this.renderizarChart('evolucaoGeral', 'chartEvolucaoGeral', 'line', evolucao.labels, evolucao.data, 'Total Cobrado (R$)');
            
        } catch (e) {
            this.mostrarAlerta(`Erro ao gerar relatórios: ${e.message}`, 'error');
            console.error(e);
        } finally {
            this.mostrarLoading(false);
        }
    },
    
    // ATUALIZADO:
    processarMediaAgrupada(campo, tipo = 'avg') { // 'fornecedor' ou 'cd'
        const grupos = {};
        const contagem = {};

        this.dados.recebimentos.forEach(r => {
            const chave = r[campo] || 'Não definido';
            if (!grupos[chave]) {
                grupos[chave] = 0;
                contagem[chave] = 0;
            }
            grupos[chave] += (parseFloat(r.valor_cobrado) || 0);
            contagem[chave]++;
        });

        // Se for Top 10, ordena e fatia
        let labels = Object.keys(grupos);
        if (campo === 'fornecedor') {
            labels.sort((a,b) => grupos[b] - grupos[a]); // Ordena por valor desc
            labels = labels.slice(0, 10); // Pega Top 10
        } else {
            labels.sort(); // Ordena alfabeticamente
        }
        
        const data = labels.map(chave => {
            if (tipo === 'avg') {
                return (grupos[chave] / contagem[chave]).toFixed(2);
            }
            return grupos[chave].toFixed(2); // tipo 'sum'
        });
        
        return { labels, data };
    },
    
    // ATUALIZADO:
    processarEvolucaoGeral() {
        const grupos = {};
        const contagem = {};
        
        const dozeMesesAtras = new Date();
        dozeMesesAtras.setMonth(dozeMesesAtras.getMonth() - 12);

        this.dados.recebimentos.forEach(r => {
            const dataAv = new Date(r.data_descarga + 'T05:00:00');
            if (dataAv >= dozeMesesAtras) {
                const chave = r.data_descarga.substring(0, 7); // "YYYY-MM"
                if (!grupos[chave]) {
                    grupos[chave] = 0;
                    contagem[chave] = 0;
                }
                grupos[chave] += (parseFloat(r.valor_cobrado) || 0);
                contagem[chave]++;
            }
        });

        const labels = Object.keys(grupos).sort();
        const data = labels.map(chave => grupos[chave].toFixed(2)); // Soma total do mês
        const labelsFormatados = labels.map(l => {
            const [ano, mes] = l.split('-');
            return `${mes}/${ano}`;
        });
        
        return { labels: labelsFormatados, data };
    },
    
    // ATUALIZADO:
    renderizarChart(chartCacheKey, canvasId, type, labels, data, label) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        
        if (this.charts[chartCacheKey]) {
            this.charts[chartCacheKey].destroy();
        }
        
        this.charts[chartCacheKey] = new Chart(ctx, {
            type: type,
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: data,
                    backgroundColor: type === 'line' ? 'rgba(0, 180, 216, 0.1)' : 'rgba(0, 180, 216, 0.7)',
                    borderColor: 'rgba(0, 180, 216, 1)',
                    borderWidth: type === 'bar' ? 1 : 2,
                    fill: type === 'line' ? true : false,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    },

    // -----------------------------------------------------------------
    // FUNÇÕES DE PERFIL E UTILITÁRIOS
    // -----------------------------------------------------------------

    // (Não modificado)
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

    // (Não modificado)
    previewProfilePicture(event) {
        const reader = new FileReader();
        reader.onload = function(){
            const output = document.getElementById('perfilPicturePreview');
            output.src = reader.result;
        };
        if (event.target.files[0]) {
            reader.readAsDataURL(event.target.files[0]);
        } else {
             if(window.CR && window.CR.currentUser) {
                 document.getElementById('perfilPicturePreview').src = window.CR.currentUser.profile_picture_url || 'https://i.imgur.com/80SsE11.png';
             }
        }
    },

    // (Não modificado)
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
    
    // (Não modificado)
    fecharModal() { document.getElementById('editModal').style.display = 'none'; },
    salvarEdicaoModal() { 
        this.mostrarAlerta('Função de salvar modal genérico não implementada.', 'info');
    },
    // (Não modificado)
    atualizarStatusDados(mensagem, tipo, timeout = 0) {
        const el = document.getElementById('statusDados');
        if(el) { el.className = `alert alert-${tipo}`; el.innerHTML = `<p>${mensagem}</p>`; el.style.display = 'block';
            if(timeout > 0) setTimeout(() => { el.style.display = 'none'; }, timeout);
        }
    },
    // (Não modificado)
    atualizarStatusConexaoHome(conectado) {
        const el = document.getElementById('statusConexaoHome');
        if(el) {
            el.className = `status-conexao status-${conectado ? 'conectado' : 'desconectado'}`;
            el.querySelector('span').innerHTML = `<i class="fas ${conectado ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${conectado ? 'Conectado e dados carregados' : 'Falha na Conexão'}`;
        }
    },
    // (Não modificado)
    mostrarAlerta(msg, tipo = 'info', duracao = 4000) {
        this.mostrarNotificacao(msg, tipo, duracao);
    },
    // (Não modificado)
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
    // (Não modificado)
    mostrarLoading(mostrar) { document.getElementById('loading').style.display = mostrar ? 'flex' : 'none'; },
    // (Não modificado)
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

// ATUALIZADO: Inicializa o novo namespace
document.addEventListener('DOMContentLoaded', () => {
    if (window.CR && typeof window.CR.init === 'function') {
        window.CR.init();
    } else { 
        console.error("❌ Falha crítica: Objeto CR não inicializado."); 
        alert("Erro crítico. Verifique o console.");
    }
});
