/* ============================================
   MEGAKEY — app.js
   Lógica completa do aplicativo
   ============================================ */

'use strict';

// ============================================
// ESTADO GLOBAL
// ============================================
const Estado = {
  conectado: false,
  liveViewAtivo: false,
  gradeAtiva: false,
  modoP_B: false,
  zoom: 100,
  salvarModo: 'pc',
  orientacao: 'paisagem',
  autoReconectar: true,
  atalhosFootobooth: true,
  mostraControls: true,
  mirrorLockup: false,
  autoBracket: false,
  configuracoes: {
    iso: '',
    exposicao: '',
    compensacao: '0',
    qualidade: '',
    wb: '',
    temperatura: 5500,
    medicao: '',
    drive: '',
    af: '',
    afDetail: '',
    tv: '',
    av: ''
  },
  timeLapse: {
    rodando: false,
    timer: null,
    contador: 0
  },
  fundo: {
    ativo: false,
    tipo: 'none',            // 'none' | 'color-*' | 'grad-*' | 'color-chroma' | 'upload'
    corSolida: '#000000',
    imagemUpload: null,      // HTMLImageElement
    imagemDataURL: null,
    opacidade: 1.0,
    bordaSuavidade: 6,
    birefnetURL: 'http://localhost:7860',
    birefnetOnline: false,
    birefnetTempoReal: false,
    maskCanvas: null,        // canvas com máscara BiRefNet
    ultimaMascaraTs: 0,
    sujeitoScale: 80,
    sujeitoX: 50,
    sujeitoY: 100,
    metodo: 'chromakey'      // 'chromakey' | 'birefnet'
  }
};

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  inicializarHistograma();
  configurarTecladoAtalhos();
  fecharDropdownsAoClicarFora();
  atualizarStatusUI();
  inicializarPainelFundo();
  inicializarDragAndDropFundos();
  mostrarToast('MEGAKEY iniciado com sucesso!', 'info');
});

// ============================================
// MENUS / DROPDOWNS
// ============================================
function toggleMenu(menuId) {
  const todos = document.querySelectorAll('.dropdown');
  const alvo = document.getElementById(menuId);
  const estaAberto = alvo.classList.contains('open');

  todos.forEach(m => {
    m.classList.remove('open');
    const btn = m.previousElementSibling;
    if (btn) btn.classList.remove('active');
  });

  if (!estaAberto) {
    alvo.classList.add('open');
    const btn = alvo.previousElementSibling;
    if (btn) btn.classList.add('active');
  }
}

function fecharDropdownsAoClicarFora() {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-item')) {
      document.querySelectorAll('.dropdown').forEach(m => m.classList.remove('open'));
      document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
    }
  });
}

// ============================================
// CÂMERA — CONEXÃO REAL VIA WEBCAM
// ============================================

// Elemento de vídeo oculto para capturar o feed da webcam
let videoEl = null;
let streamAtual = null;
let dispositivosVideo = [];

async function listarDispositivosVideo() {
  try {
    // Precisamos pedir permissão antes de listar
    const streamTemp = await navigator.mediaDevices.getUserMedia({ video: true });
    streamTemp.getTracks().forEach(t => t.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    dispositivosVideo = devices.filter(d => d.kind === 'videoinput');
    return dispositivosVideo;
  } catch (err) {
    return [];
  }
}

async function conectarCamera(deviceId = null) {
  fecharTodosDropdowns();

  if (Estado.conectado) {
    desconectarCamera();
    return;
  }

  // Se há múltiplos dispositivos e não foi especificado, mostra seletor
  const lista = await listarDispositivosVideo();
  if (lista.length > 1 && !deviceId) {
    mostrarSeletorCamera(lista);
    return;
  }

  await iniciarWebcam(deviceId);
}

async function iniciarWebcam(deviceId = null) {
  mostrarToast('Conectando câmera...', 'info');

  try {
    const constraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'environment' }
    };

    streamAtual = await navigator.mediaDevices.getUserMedia(constraints);

    // Cria elemento de vídeo oculto se não existir
    if (!videoEl) {
      videoEl = document.createElement('video');
      videoEl.autoplay = true;
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.style.display = 'none';
      document.body.appendChild(videoEl);
    }

    videoEl.srcObject = streamAtual;

    // Aguarda o vídeo estar pronto para reprodução
    await new Promise((resolve) => {
      videoEl.onloadedmetadata = () => {
        videoEl.play().then(resolve).catch(resolve);
      };
      // Fallback caso o evento já tenha disparado
      if (videoEl.readyState >= 2) resolve();
    });

    // Atualiza info da câmera na topbar
    const track = streamAtual.getVideoTracks()[0];
    const settings = track.getSettings();
    const nome = track.label || 'Webcam';

    Estado.conectado = true;
    Estado.nomeCamera = nome;
    Estado.resolucaoCamera = `${settings.width || '—'}×${settings.height || '—'}`;

    atualizarStatusUI();
    carregarOpcoesCamera();
    mostrarToast(`✅ ${nome} (${Estado.resolucaoCamera})`, 'success');

    // Inicia Live View imediatamente
    iniciarLiveViewWebcam();

  } catch (err) {
    console.error('Erro ao conectar câmera:', err);
    if (err.name === 'NotAllowedError') {
      mostrarToast('❌ Permissão negada. Permita o acesso à câmera no navegador.', 'error');
    } else if (err.name === 'NotFoundError') {
      mostrarToast('❌ Nenhuma câmera encontrada no dispositivo.', 'error');
    } else {
      mostrarToast(`❌ Erro ao conectar: ${err.message}`, 'error');
    }
  }
}

function mostrarSeletorCamera(lista) {
  // Remove seletor anterior se existir
  const anterior = document.getElementById('seletorCameraModal');
  if (anterior) anterior.remove();

  const overlay = document.createElement('div');
  overlay.id = 'seletorCameraModal';
  overlay.className = 'modal-overlay open';
  overlay.style.display = 'flex';

  const box = document.createElement('div');
  box.className = 'modal-box';
  box.onclick = e => e.stopPropagation();

  box.innerHTML = `
    <div class="modal-header">
      <h3>🎥 Selecionar Câmera</h3>
      <button class="modal-close" onclick="document.getElementById('seletorCameraModal').remove()">✕</button>
    </div>
    <div class="modal-body">
      <p style="color:var(--text-secondary);margin-bottom:8px">${lista.length} câmera(s) encontrada(s). Selecione qual deseja usar:</p>
      <div id="listaCameras" style="display:flex;flex-direction:column;gap:8px;">
        ${lista.map((d, i) => `
          <button class="camera-device-btn" onclick="selecionarDispositivoCamera('${d.deviceId}')" style="
            display:flex;align-items:center;gap:12px;
            padding:12px 16px;
            background:var(--bg-elevated);
            border:1px solid var(--border-medium);
            border-radius:var(--radius-md);
            color:var(--text-primary);
            cursor:pointer;
            text-align:left;
            transition:var(--transition);
            font-family:'Inter',sans-serif;
            font-size:13px;
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" stroke-width="1.5"><path d="M2 8.5C2 7.1 3.1 6 4.5 6H6L8 3h8l2 3h1.5C20.9 6 22 7.1 22 8.5v9c0 1.4-1.1 2.5-2.5 2.5h-15C3.1 20 2 18.9 2 17.5v-9z"/><circle cx="12" cy="12" r="4"/></svg>
            <span>${d.label || `Câmera ${i + 1}`}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  overlay.appendChild(box);
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}

async function selecionarDispositivoCamera(deviceId) {
  const modal = document.getElementById('seletorCameraModal');
  if (modal) modal.remove();
  await iniciarWebcam(deviceId);
}

function desconectarCamera() {
  // Para o stream da webcam
  if (streamAtual) {
    streamAtual.getTracks().forEach(t => t.stop());
    streamAtual = null;
  }
  if (videoEl) {
    videoEl.srcObject = null;
  }

  Estado.conectado = false;
  Estado.liveViewAtivo = false;
  pararLiveView();
  atualizarStatusUI();
  mostrarToast('Câmera desconectada', 'warning');
}

function atualizarStatusUI() {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  const btnRelease = document.getElementById('btnRelease');
  const liveViewDesconn = document.getElementById('liveviewDisconnected');
  const btnConectar = document.getElementById('btnConectar');

  if (Estado.conectado) {
    dot.classList.add('connected');
    txt.textContent = Estado.nomeCamera || 'Câmera conectada';
    btnRelease.style.opacity = '1';
    btnRelease.style.pointerEvents = 'auto';
    liveViewDesconn.style.display = 'none';
    if (btnConectar) btnConectar.textContent = 'Desconectar';
  } else {
    dot.classList.remove('connected');
    txt.textContent = 'Câmera não conectada';
    btnRelease.style.opacity = '0.4';
    btnRelease.style.pointerEvents = 'none';
    liveViewDesconn.style.display = 'flex';
    if (btnConectar) {
      btnConectar.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Conectar Câmera`;
    }
  }
}

function carregarOpcoesCamera() {
  const iso = document.getElementById('selectISO');
  const exp = document.getElementById('selectExposicao');
  const drive = document.getElementById('selectDrive');
  const af = document.getElementById('selectAF');

  if (iso) iso.value = 'auto';
  if (exp) exp.value = 'auto';
  if (drive) drive.value = 'single';
  if (af) af.value = 'one-shot';

  Estado.configuracoes.iso = 'auto';
  Estado.configuracoes.exposicao = 'auto';
}

// ============================================
// DISPARO
// ============================================
function disparar() {
  if (!Estado.conectado) {
    mostrarToast('Conecte uma câmera primeiro!', 'error');
    return;
  }

  const btn = document.getElementById('btnRelease');
  btn.style.transform = 'scale(0.93)';
  btn.style.boxShadow = '0 0 40px rgba(0,212,255,0.7)';

  setTimeout(() => {
    btn.style.transform = '';
    btn.style.boxShadow = '';
    capturarFoto();
  }, 120);
}

function capturarFoto() {
  const prefixo = localStorage.getItem('megakey_prefixo_nome') || 'IMG';
  const agora = new Date();
  const nome = `${prefixo}_${agora.getFullYear()}${String(agora.getMonth()+1).padStart(2,'0')}${String(agora.getDate()).padStart(2,'0')}_${String(agora.getHours()).padStart(2,'0')}${String(agora.getMinutes()).padStart(2,'0')}${String(agora.getSeconds()).padStart(2,'0')}.jpg`;

  // Captura frame real da webcam se estiver disponível
  let frameDataURL = null;

  if (videoEl && streamAtual && videoEl.readyState >= 2) {
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width  = videoEl.videoWidth  || 320;
    snapCanvas.height = videoEl.videoHeight || 240;
    const snapCtx = snapCanvas.getContext('2d');

    if (Estado.modoP_B) snapCtx.filter = 'grayscale(100%)';
    snapCtx.drawImage(videoEl, 0, 0, snapCanvas.width, snapCanvas.height);

    // Efeito de flash na tela
    const flashEl = document.createElement('div');
    flashEl.style.cssText = `
      position:fixed;inset:0;background:white;
      opacity:0.6;z-index:9999;pointer-events:none;
      animation:flashOut 0.3s ease forwards;
    `;
    document.body.appendChild(flashEl);
    setTimeout(() => flashEl.remove(), 350);

    frameDataURL = snapCanvas.toDataURL('image/jpeg', 0.95);
  }

  mostrarToast(`📸 ${nome}`, 'success');
  adicionarMiniatura(frameDataURL, nome);
  if (frameDataURL) {
    salvarFotoNoDiscoLocal(frameDataURL, nome);
  }
}

function adicionarMiniatura(frameDataURL = null, nome = '') {
  const grid = document.getElementById('thumbnailsGrid');
  const placeholder = grid.querySelector('.thumb-placeholder');
  if (placeholder) placeholder.remove();

  const thumb = document.createElement('div');
  thumb.className = 'thumb-item';
  thumb.title = nome;
  thumb.onclick = () => selecionarMiniatura(thumb);

  const img = document.createElement('img');

  if (frameDataURL) {
    // Frame real da webcam
    img.src = frameDataURL;

    // Clique duplo abre a foto ampliada
    thumb.ondblclick = () => abrirFotoAmpliada(frameDataURL, nome);
  } else {
    // Placeholder visual quando não há webcam
    const canvas = document.createElement('canvas');
    canvas.width = 60;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    const hue = Math.floor(Math.random() * 360);
    const grad = ctx.createLinearGradient(0, 0, 60, 40);
    grad.addColorStop(0, `hsl(${hue}, 60%, 30%)`);
    grad.addColorStop(1, `hsl(${(hue + 60) % 360}, 60%, 20%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 60, 40);
    ctx.beginPath();
    ctx.arc(30, 20, 10, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue}, 80%, 70%, 0.5)`;
    ctx.lineWidth = 1;
    ctx.stroke();
    img.src = canvas.toDataURL();
  }

  thumb.appendChild(img);
  grid.appendChild(thumb);
  selecionarMiniatura(thumb);
}

function abrirFotoAmpliada(dataURL, nome) {
  const anterior = document.getElementById('fotoAmpliada');
  if (anterior) anterior.remove();

  const overlay = document.createElement('div');
  overlay.id = 'fotoAmpliada';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.9);
    z-index:5000;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:12px;
    backdrop-filter:blur(8px);cursor:zoom-out;
    animation:overlayIn 0.2s ease;
  `;
  overlay.onclick = () => overlay.remove();

  const imgEl = document.createElement('img');
  imgEl.src = dataURL;
  imgEl.style.cssText = `
    max-width:90vw;max-height:85vh;
    object-fit:contain;border-radius:8px;
    box-shadow:0 20px 60px rgba(0,0,0,0.8);
    border:1px solid rgba(255,255,255,0.1);
  `;
  imgEl.onclick = e => e.stopPropagation();

  const nomeTxt = document.createElement('div');
  nomeTxt.textContent = nome;
  nomeTxt.style.cssText = `color:rgba(255,255,255,0.5);font-size:12px;font-family:'JetBrains Mono',monospace;`;

  const btnBaixar = document.createElement('a');
  btnBaixar.href = dataURL;
  btnBaixar.download = nome;
  btnBaixar.textContent = '⬇ Salvar foto';
  btnBaixar.style.cssText = `
    padding:8px 20px;background:rgba(0,212,255,0.15);
    border:1px solid rgba(0,212,255,0.4);border-radius:8px;
    color:#00D4FF;font-size:13px;font-weight:600;
    text-decoration:none;font-family:'Inter',sans-serif;
  `;
  btnBaixar.onclick = e => e.stopPropagation();

  overlay.appendChild(imgEl);
  overlay.appendChild(nomeTxt);
  overlay.appendChild(btnBaixar);
  document.body.appendChild(overlay);
}

function selecionarMiniatura(thumb) {
  document.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('selected'));
  thumb.classList.add('selected');

  // Espelha a imagem selecionada na segunda tela se estiver ativa
  const img = thumb.querySelector('img');
  if (img && window.windowTela2 && !window.windowTela2.closed && typeof window.windowTela2.exibirFotoEstatica === 'function') {
    window.windowTela2.exibirFotoEstatica(img.src);
  }
}

function visualizarPreview() {
  if (!Estado.conectado) {
    mostrarToast('Conecte uma câmera primeiro!', 'error');
    return;
  }
  mostrarToast('Modo Preview ativado', 'info');
}

// ============================================
// AUTO-BRACKET
// ============================================
function toggleAutoBracket() {
  Estado.autoBracket = document.getElementById('chkAutoBracket').checked;
  mostrarToast(`Auto-bracket ${Estado.autoBracket ? 'ativado' : 'desativado'}`, 'info');
}

function abrirSettingsAutoBracket() {
  mostrarToast('Configurações de Auto-bracket', 'info');
}

// ============================================
// LIVE VIEW — WEBCAM REAL
// ============================================
function toggleLiveView() {
  fecharTodosDropdowns();
  if (!Estado.conectado) {
    mostrarToast('Conecte uma câmera para usar o Live View', 'warning');
    return;
  }

  Estado.liveViewAtivo = !Estado.liveViewAtivo;
  const btn = document.getElementById('btnLiveViewToggle');

  if (Estado.liveViewAtivo) {
    btn.classList.add('active');
    iniciarLiveViewWebcam();
    mostrarToast('Live View ativado', 'success');
  } else {
    btn.classList.remove('active');
    pararLiveView();
    mostrarToast('Live View desativado', 'info');
  }
}

function iniciarLiveViewWebcam() {
  if (!videoEl || !streamAtual) return;

  Estado.liveViewAtivo = true;
  document.getElementById('btnLiveViewToggle').classList.add('active');

  const container = document.getElementById('liveviewContainer');
  const canvas = document.getElementById('liveviewCanvas');

  // Ajusta canvas ao tamanho do container
  const resize = () => {
    canvas.width  = container.offsetWidth;
    canvas.height = container.offsetHeight;
  };
  resize();
  window.addEventListener('resize', resize);

  canvas.style.display = 'block';
  canvas.style.width  = '100%';
  canvas.style.height = '100%';
  canvas.style.objectFit = 'cover';

  const ctx = canvas.getContext('2d');

  function loop() {
    if (!Estado.liveViewAtivo || !videoEl) return;

    const vw = videoEl.videoWidth  || 1;
    const vh = videoEl.videoHeight || 1;
    const cw = canvas.width;
    const ch = canvas.height;

    // Mantém proporção (letterbox / cover)
    const scale = Math.max(cw / vw, ch / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;

    ctx.clearRect(0, 0, cw, ch);

    // Desenha vídeo com fundo virtual (ou sem fundo, se desativado)
    ctx.save();
    compositorFundo(ctx, videoEl, cw, ch, dx, dy, dw, dh);
    ctx.restore();

    // Espelha o canvas limpo (sem HUD) na segunda tela
    if (window.windowTela2 && !window.windowTela2.closed && typeof window.windowTela2.desenharFrame === 'function') {
      window.windowTela2.desenharFrame(canvas);
    }

    // Solicita máscara BiRefNet em tempo real (quando ativo)
    if (Estado.fundo.ativo && Estado.fundo.birefnetTempoReal && Estado.fundo.birefnetOnline) {
      requisitarMascaraBiRefNet(videoEl, cw, ch);
    }

    // HUD — overlay de informações
    const iso = document.getElementById('selectISO').value || 'AUTO';
    const exp = document.getElementById('selectExposicao').value || 'AUTO';
    const wb  = document.getElementById('selectWB').value   || 'AUTO';
    const res = Estado.resolucaoCamera || '—';

    // Barra inferior do HUD
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, ch - 28, cw, 28);

    ctx.fillStyle = '#00D4FF';
    ctx.font = '11px \'JetBrains Mono\', monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`ISO ${iso.toUpperCase()}`, 12, ch - 10);

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(`  |  ${exp.toUpperCase()}`, 80, ch - 10);
    ctx.fillText(`  |  BB: ${wb.toUpperCase()}`, 155, ch - 10);
    ctx.fillText(`  |  ${res}`, 290, ch - 10);

    // Indicador REC pulsante
    const pulso = Math.sin(Date.now() * 0.004) > 0;
    if (pulso) {
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(cw - 20, ch - 14, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('LIVE', cw - 28, ch - 10);
    }

    Estado._liveViewFrame = requestAnimationFrame(loop);
  }

  loop();
}

function pararLiveView() {
  Estado.liveViewAtivo = false;
  if (Estado._liveViewFrame) {
    cancelAnimationFrame(Estado._liveViewFrame);
    Estado._liveViewFrame = null;
  }
  const canvas = document.getElementById('liveviewCanvas');
  canvas.style.display = 'none';
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ============================================
// ZOOM
// ============================================
function zoomIn() {
  Estado.zoom = Math.min(Estado.zoom + 25, 400);
  atualizarZoom();
}

function zoomOut() {
  Estado.zoom = Math.max(Estado.zoom - 25, 25);
  atualizarZoom();
}

function fitView() {
  Estado.zoom = 100;
  atualizarZoom();
}

function atualizarZoom() {
  document.getElementById('zoomLevel').textContent = `${Estado.zoom}%`;
  const canvas = document.getElementById('liveviewCanvas');
  canvas.style.transform = `scale(${Estado.zoom / 100})`;
}

// ============================================
// GRADE
// ============================================
function toggleGrade() {
  fecharTodosDropdowns();
  Estado.gradeAtiva = !Estado.gradeAtiva;
  const overlay = document.getElementById('gridOverlay');
  const btn = document.getElementById('btnGrade');

  overlay.style.display = Estado.gradeAtiva ? 'block' : 'none';
  btn.classList.toggle('active', Estado.gradeAtiva);
  mostrarToast(`Grade ${Estado.gradeAtiva ? 'exibida' : 'ocultada'}`, 'info');
}

// ============================================
// MODO PRETO E BRANCO
// ============================================
function toggleModoPB() {
  fecharTodosDropdowns();
  Estado.modoP_B = !Estado.modoP_B;
  const btn = document.getElementById('btnPB');
  btn.classList.toggle('active', Estado.modoP_B);
  mostrarToast(`Modo ${Estado.modoP_B ? 'Preto e Branco' : 'Colorido'} ativado`, 'info');
}

// ============================================
// SALVAR MODO
// ============================================
function setSalvarModo(modo) {
  fecharTodosDropdowns();
  Estado.salvarModo = modo;

  document.getElementById('checkPC').classList.remove('active');
  document.getElementById('checkAmbos').classList.remove('active');
  document.getElementById('checkCamera').classList.remove('active');

  const mapa = { 'pc': 'checkPC', 'ambos': 'checkAmbos', 'camera': 'checkCamera' };
  document.getElementById(mapa[modo]).classList.add('active');

  const nomes = { 'pc': 'Salvar somente no PC', 'ambos': 'Salvar na Câmera e no PC', 'camera': 'Salvar somente na Câmera' };
  mostrarToast(nomes[modo], 'info');
}

// ============================================
// ORIENTAÇÃO
// ============================================
function setOrientacao(orientacao) {
  fecharTodosDropdowns();
  Estado.orientacao = orientacao;

  ['checkPaisagem','checkRetratoCCW','checkRetratoCW','checkInvertido'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  const mapa = {
    'paisagem': 'checkPaisagem',
    'retrato-ccw': 'checkRetratoCCW',
    'retrato-cw': 'checkRetratoCW',
    'invertido': 'checkInvertido'
  };
  const el = document.getElementById(mapa[orientacao]);
  if (el) el.classList.add('active');

  const canvas = document.getElementById('liveviewCanvas');
  const rotacao = { 'paisagem': 0, 'retrato-ccw': -90, 'retrato-cw': 90, 'invertido': 180 };
  canvas.style.transform = `rotate(${rotacao[orientacao]}deg) scale(${Estado.zoom / 100})`;

  const nomes = {
    'paisagem': 'Paisagem',
    'retrato-ccw': 'Retrato (90° anti-horário)',
    'retrato-cw': 'Retrato (90° horário)',
    'invertido': 'Invertido'
  };
  mostrarToast(`Orientação: ${nomes[orientacao]}`, 'info');
}

// ============================================
// CONFIGURAÇÕES DA CÂMERA
// ============================================
function setISO(v) {
  Estado.configuracoes.iso = v;
  if (v) mostrarToast(`ISO ajustado para ${v}`, 'info');
}

function setExposicao(v) {
  Estado.configuracoes.exposicao = v;
  const nomes = { manual:'Manual', av:'Prioridade de Abertura', tv:'Prioridade de Obturador', p:'Programa', auto:'Auto', bulb:'Bulb' };
  if (v) mostrarToast(`Modo: ${nomes[v] || v}`, 'info');
}

function setCompensacao(v) {
  Estado.configuracoes.compensacao = v;
}

function setQualidade(v) {
  Estado.configuracoes.qualidade = v;
  if (v) mostrarToast(`Qualidade: ${v.toUpperCase()}`, 'info');
}

function setWB(v) {
  Estado.configuracoes.wb = v;
  const nomes = { auto:'Auto', daylight:'Luz do Dia', shade:'Sombra', cloudy:'Nublado', tungsten:'Tungstênio', fluorescent:'Fluorescente', flash:'Flash', custom:'Personalizado', kelvin:'Temperatura (K)' };
  if (v) mostrarToast(`Balanço de Branco: ${nomes[v] || v}`, 'info');
}

function setTemperatura(v) {
  Estado.configuracoes.temperatura = parseInt(v);
  document.getElementById('tempValue').textContent = `${v}K`;
}

function setMedicao(v) {
  Estado.configuracoes.medicao = v;
  if (v) mostrarToast(`Medição: ${v}`, 'info');
}

function setDrive(v) {
  Estado.configuracoes.drive = v;
  if (v) mostrarToast(`Drive: ${v}`, 'info');
}

function setAF(v) {
  Estado.configuracoes.af = v;
  if (v) mostrarToast(`AF: ${v.toUpperCase()}`, 'info');
}

function setAFDetail(v) {
  Estado.configuracoes.afDetail = v;
  if (v) mostrarToast(`Detalhe AF: ${v}`, 'info');
}

function setTv(v) {
  Estado.configuracoes.tv = v;
}

function setAv(v) {
  Estado.configuracoes.av = v;
}

// ============================================
// TIME LAPSE
// ============================================
function abrirTimeLapse() {
  fecharTodosDropdowns();
  abrirModal('modalTimeLapse');

  document.getElementById('tlIntervalo').addEventListener('input', calcularDuracaoTL);
  document.getElementById('tlNumFotos').addEventListener('input', calcularDuracaoTL);
}

function calcularDuracaoTL() {
  const intervalo = parseInt(document.getElementById('tlIntervalo').value) || 1;
  const num = parseInt(document.getElementById('tlNumFotos').value) || 1;
  const totalSeg = intervalo * num;
  const min = Math.floor(totalSeg / 60);
  const seg = totalSeg % 60;
  document.getElementById('tlDuracao').textContent = `${min} min ${seg} seg`;
}

function iniciarTimeLapse() {
  if (!Estado.conectado) {
    mostrarToast('Conecte uma câmera para iniciar o Time-Lapse', 'error');
    return;
  }

  const intervalo = parseInt(document.getElementById('tlIntervalo').value) * 1000;
  const numFotos = parseInt(document.getElementById('tlNumFotos').value);

  fecharModal('modalTimeLapse');
  Estado.timeLapse.rodando = true;
  Estado.timeLapse.contador = 0;

  mostrarToast(`⏱ Time-Lapse iniciado! ${numFotos} fotos com intervalo de ${intervalo/1000}s`, 'success');

  Estado.timeLapse.timer = setInterval(() => {
    if (Estado.timeLapse.contador >= numFotos) {
      pararTimeLapse();
      return;
    }
    Estado.timeLapse.contador++;
    capturarFoto();
    mostrarToast(`⏱ Time-Lapse: ${Estado.timeLapse.contador}/${numFotos}`, 'info');
  }, intervalo);
}

function pararTimeLapse() {
  clearInterval(Estado.timeLapse.timer);
  Estado.timeLapse.rodando = false;
  mostrarToast('⏱ Time-Lapse concluído!', 'success');
}

// ============================================
// MIRROR LOCKUP
// ============================================
function toggleMirrorLockup() {
  fecharTodosDropdowns();
  Estado.mirrorLockup = !Estado.mirrorLockup;
  mostrarToast(`Mirror Lockup ${Estado.mirrorLockup ? 'ativado' : 'desativado'}`, 'info');
}

// ============================================
// AUTO-RECONECTAR
// ============================================
function toggleAutoReconectar() {
  Estado.autoReconectar = !Estado.autoReconectar;
  const check = document.getElementById('checkAutoReconectar');
  check.classList.toggle('active', Estado.autoReconectar);
  fecharTodosDropdowns();
  mostrarToast(`Reconexão automática ${Estado.autoReconectar ? 'ativa' : 'inativa'}`, 'info');
}

// ============================================
// WEBCAM MODE
// ============================================
function toggleWebcam() {
  fecharTodosDropdowns();
  mostrarToast('Modo Webcam: Use o OBS ou software de captura', 'info');
}

// ============================================
// NAVEGAÇÃO DE IMAGENS
// ============================================
function prevImagem() {
  const thumbs = document.querySelectorAll('.thumb-item');
  const selecionado = document.querySelector('.thumb-item.selected');
  if (!selecionado || thumbs.length === 0) return;

  const idx = Array.from(thumbs).indexOf(selecionado);
  if (idx > 0) selecionarMiniatura(thumbs[idx - 1]);
}

function nextImagem() {
  const thumbs = document.querySelectorAll('.thumb-item');
  const selecionado = document.querySelector('.thumb-item.selected');
  if (!selecionado || thumbs.length === 0) return;

  const idx = Array.from(thumbs).indexOf(selecionado);
  if (idx < thumbs.length - 1) selecionarMiniatura(thumbs[idx + 1]);
}

// ============================================
// TOGGLES DE VISUALIZAÇÃO
// ============================================
function toggleAtalhosFootobooth() {
  Estado.atalhosFootobooth = !Estado.atalhosFootobooth;
  const check = document.getElementById('checkAtalhosFoto');
  const bar = document.getElementById('photoboothBar');
  check.classList.toggle('active', Estado.atalhosFootobooth);
  bar.style.display = Estado.atalhosFootobooth ? 'flex' : 'none';
  fecharTodosDropdowns();
}

function toggleControlsCamera() {
  Estado.mostraControls = !Estado.mostraControls;
  const check = document.getElementById('checkControls');
  const panel = document.getElementById('controlsPanel');
  check.classList.toggle('active', Estado.mostraControls);
  panel.style.display = Estado.mostraControls ? 'flex' : 'none';
  fecharTodosDropdowns();
}

function toggleTelaEscura() {
  fecharTodosDropdowns();
  mostrarToast('Tela escura ao fotografar: configurada', 'info');
}

function toggleIgnorarEventos() {
  fecharTodosDropdowns();
  mostrarToast('Ignorar eventos: alternado', 'info');
}

function toggleDestaques() {
  fecharTodosDropdowns();
  mostrarToast('Destaques piscantes: alternado', 'info');
}

function togglePontosAF() {
  fecharTodosDropdowns();
  mostrarToast('Pontos de Foco: alternado', 'info');
}

function toggleNitidezHQ() {
  fecharTodosDropdowns();
  mostrarToast('Nitidez HQ: alternado', 'info');
}

function toggleSuprimirImagem() {
  fecharTodosDropdowns();
  mostrarToast('Exibição de imagem suprimida', 'info');
}

function toggleSensorOrientacao() {
  fecharTodosDropdowns();
  mostrarToast('Sensor de orientação: alternado', 'info');
}

function toggleGerenciamentoCor() {
  fecharTodosDropdowns();
  mostrarToast('Gerenciamento de cor: alternado', 'info');
}

// ============================================
// TELA CHEIA
// ============================================
function telaCheia() {
  fecharTodosDropdowns();
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {
      mostrarToast('Não foi possível entrar em tela cheia', 'error');
    });
  } else {
    document.exitFullscreen();
  }
}

function organizarJanelas() {
  fecharTodosDropdowns();
  mostrarToast('Janelas organizadas', 'info');
}

// ============================================
// FOTOBOOTH
// ============================================
function iniciarFotobooth() {
  if (!Estado.conectado) {
    mostrarToast('Conecte uma câmera para iniciar o Fotobooth', 'warning');
    return;
  }
  mostrarToast('🎉 Modo Fotobooth iniciado!', 'success');
}

function abrirAssistenteFotobooth() {
  fecharTodosDropdowns();
  mostrarToast('Assistente Fotobooth: abrindo...', 'info');
}

function salvarConfiguracoesFotobooth() {
  fecharTodosDropdowns();
  mostrarToast('Configurações Fotobooth salvas!', 'success');
}

function abrirConfiguracoesFotobooth() {
  fecharTodosDropdowns();
  mostrarToast('Configurações Fotobooth', 'info');
}

function abrirConfiguracoesVideobooth() {
  fecharTodosDropdowns();
  mostrarToast('Configurações Videobooth', 'info');
}

function abrirModoBloqueo() {
  fecharTodosDropdowns();
  mostrarToast('Modo de Bloqueio: configure no painel', 'info');
}

function modoFotobooth() {
  fecharTodosDropdowns();
  iniciarFotobooth();
}

function reimprimirFotos() {
  fecharTodosDropdowns();
  mostrarToast('Reimprimindo última foto...', 'info');
}

function imprimirFotosSelecionadas() {
  fecharTodosDropdowns();
  const sel = document.querySelectorAll('.thumb-item.selected').length;
  if (sel === 0) {
    mostrarToast('Nenhuma foto selecionada', 'warning');
    return;
  }
  mostrarToast(`Imprimindo ${sel} foto(s) selecionada(s)...`, 'info');
}

function infoEventoFotobooth() {
  fecharTodosDropdowns();
  mostrarToast('Informações do evento Fotobooth', 'info');
}

function remocaoFundoIA() {
  fecharTodosDropdowns();
  mostrarToast('🤖 Ferramenta de Remoção de Fundo por IA iniciada', 'info');
}

function abrirLayoutImpressao() {
  mostrarToast('Layout de Impressão: configurar', 'info');
}

function abrirConfigAvancadas() {
  mostrarToast('Configurações Avançadas', 'info');
}

// ============================================
// EMAIL / SMS / QR
// ============================================
function abrirServidorEmail() {
  fecharTodosDropdowns();
  mostrarToast('Configurações do Servidor de Email', 'info');
}

function enviarEmailSMS() {
  fecharTodosDropdowns();
  mostrarToast('Envio de Email/SMS: configure o servidor primeiro', 'info');
}

function editarQRCode() {
  fecharTodosDropdowns();
  mostrarToast('Editor de QR Code', 'info');
}

function qrCodeUnico() {
  fecharTodosDropdowns();
  mostrarToast('Gerenciador de QR Codes únicos', 'info');
}

// ============================================
// ARQUIVO
// ============================================
function renomearImagem() {
  fecharTodosDropdowns();
  const sel = document.querySelector('.thumb-item.selected');
  if (!sel) {
    mostrarToast('Selecione uma imagem para renomear', 'warning');
    return;
  }
  const nome = prompt('Novo nome da imagem:');
  if (nome) mostrarToast(`Imagem renomeada para: ${nome}`, 'success');
}

function excluirImagem() {
  fecharTodosDropdowns();
  const sel = document.querySelector('.thumb-item.selected');
  if (!sel) {
    mostrarToast('Selecione uma imagem para excluir', 'warning');
    return;
  }
  if (confirm('Excluir a imagem selecionada?')) {
    sel.remove();
    const thumbs = document.querySelectorAll('.thumb-item');
    if (thumbs.length === 0) {
      const grid = document.getElementById('thumbnailsGrid');
      grid.innerHTML = `<div class="thumb-placeholder">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      </div>`;
    } else {
      selecionarMiniatura(thumbs[thumbs.length - 1]);
    }
    mostrarToast('Imagem excluída', 'success');
  }
}

function abrirConfigEditor() {
  fecharTodosDropdowns();
  mostrarToast('Configurar Editor de Imagem', 'info');
}

function abrirGerenciamentoCor() {
  fecharTodosDropdowns();
  mostrarToast('Gerenciamento de Cor', 'info');
}

function editarIPTC() {
  fecharTodosDropdowns();
  mostrarToast('Editor IPTC', 'info');
}

function adicionarIPTC() {
  fecharTodosDropdowns();
  mostrarToast('Adicionar dados IPTC às imagens', 'info');
}

function abrirConfiguracaoImpressora() {
  fecharTodosDropdowns();
  mostrarToast('Configuração de Impressora', 'info');
}

// ============================================
// FERRAMENTAS
// ============================================
function relatorioCompartilhamento() {
  fecharTodosDropdowns();
  mostrarToast('📊 Relatório de compartilhamento gerado', 'info');
}

function relatorioPesquisa() {
  fecharTodosDropdowns();
  mostrarToast('📊 Relatório de pesquisa gerado', 'info');
}

function relatorioEstatisticas() {
  fecharTodosDropdowns();
  mostrarToast('📊 Relatório de estatísticas gerado', 'info');
}

function abrirUploader() {
  fecharTodosDropdowns();
  mostrarToast('Uploader: configure o destino de upload', 'info');
}

function exportarConfiguracoes() {
  fecharTodosDropdowns();
  const config = JSON.stringify(Estado.configuracoes, null, 2);
  const blob = new Blob([config], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'megakey_configuracoes.json';
  a.click();
  URL.revokeObjectURL(url);
  mostrarToast('Configurações exportadas!', 'success');
}

function abrirStatusURL() {
  fecharTodosDropdowns();
  mostrarToast('URL de Status: http://localhost:8080/status', 'info');
}

// ============================================
// VISUALIZAÇÃO
// ============================================
function abrirConfigAtalhosFootobooth() {
  fecharTodosDropdowns();
  mostrarToast('Configurações de Atalhos Fotobooth', 'info');
}

function abrirConfigGrade() {
  fecharTodosDropdowns();
  mostrarToast('Configurações de Grade', 'info');
}

function abrirConfigDestaques() {
  fecharTodosDropdowns();
  mostrarToast('Configurações de Destaques', 'info');
}

function abrirConfigNitidez() {
  fecharTodosDropdowns();
  mostrarToast('Configurações de Nitidez', 'info');
}

function visualizarImagem() {
  fecharTodosDropdowns();
  mostrarToast('Abrindo visualizador de imagem...', 'info');
}

function editarImagem() {
  fecharTodosDropdowns();
  mostrarToast('Abrindo editor de imagem...', 'info');
}

// ============================================
// AJUDA
// ============================================
function abrirConteudo() {
  fecharTodosDropdowns();
  mostrarToast('Manual do usuário: abrindo...', 'info');
}

function verificarAtualizacoes() {
  fecharTodosDropdowns();
  mostrarToast('Verificando atualizações...', 'info');
  setTimeout(() => {
    mostrarToast('MEGAKEY está atualizado! Versão 1.0.0', 'success');
  }, 1200);
}

function abrirSobre() {
  fecharTodosDropdowns();
  abrirModal('modalSobre');
}

// ============================================
// PREFERÊNCIAS
// ============================================
function abrirPreferencias() {
  fecharTodosDropdowns();
  abrirModal('modalPreferencias');
}

function salvarPreferencias() {
  fecharModal('modalPreferencias');
  mostrarToast('Preferências salvas!', 'success');
}

function setPrefTab(tab) {
  document.querySelectorAll('.pref-tab').forEach(t => t.classList.remove('active'));
  const btn = event.target;
  btn.classList.add('active');
}

// ============================================
// OUTROS MENUS
// ============================================
function atualizar() {
  fecharTodosDropdowns();
  mostrarToast('Atualizando interface...', 'info');
  location.reload();
}

function sair() {
  if (confirm('Deseja sair do MEGAKEY?')) {
    mostrarToast('Até logo!', 'info');
    setTimeout(() => window.close(), 500);
  }
}

// ============================================
// MODAIS (genérico)
// ============================================
function abrirModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('open');
    modal.style.display = 'flex';
  }
}

function fecharModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
}

// ============================================
// TOAST NOTIFICATION
// ============================================
function mostrarToast(mensagem, tipo = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;

  const icones = {
    success: '✓',
    info: 'ℹ',
    warning: '⚠',
    error: '✕'
  };

  toast.innerHTML = `
    <span style="font-weight:700; opacity:0.8;">${icones[tipo] || 'ℹ'}</span>
    <span>${mensagem}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================
// HISTOGRAMA
// ============================================
function inicializarHistograma() {
  const canvas = document.getElementById('histogramCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  desenharHistograma(ctx, canvas.width, canvas.height);

  // Animação suave
  setInterval(() => {
    desenharHistograma(ctx, canvas.width, canvas.height);
  }, 2000);
}

function desenharHistograma(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);

  const channels = [
    { color: 'rgba(100,100,255,0.6)', offset: 0 },
    { color: 'rgba(100,255,100,0.5)', offset: 5 },
    { color: 'rgba(255,100,100,0.5)', offset: 10 },
  ];

  channels.forEach(ch => {
    ctx.beginPath();
    ctx.moveTo(0, h);

    for (let x = 0; x < w; x++) {
      const baseY = Math.sin((x / w) * Math.PI * 2 + ch.offset) * 0.3 + 0.5;
      const noise = Math.random() * 0.15;
      const y = h - (baseY + noise) * h * 0.9;
      ctx.lineTo(x, y);
    }

    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = ch.color;
    ctx.fill();
  });
}

// ============================================
// ATALHOS DE TECLADO
// ============================================
function configurarTecladoAtalhos() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toUpperCase();

    if (e.key === 'F8') { e.preventDefault(); disparar(); }
    if (e.key === 'F9') { e.preventDefault(); visualizarPreview(); }
    if (e.key === 'F11') { e.preventDefault(); telaCheia(); }
    if (e.key === 'F5')  { e.preventDefault(); atualizar(); }
    if (e.key === 'F7')  { e.preventDefault(); visualizarImagem(); }

    if (e.ctrlKey) {
      if (key === 'L') { e.preventDefault(); toggleLiveView(); }
      if (key === 'G') { e.preventDefault(); toggleGrade(); }
      if (key === 'W') { e.preventDefault(); toggleModoP_B_wrapper(); }
      if (key === 'H') { e.preventDefault(); toggleDestaques(); }
      if (key === 'F') { e.preventDefault(); togglePontosAF(); }
      if (key === 'Q') { e.preventDefault(); toggleNitidezHQ(); }
      if (key === 'P') { e.preventDefault(); abrirPreferencias(); }
      if (key === 'E') { e.preventDefault(); editarImagem(); }
      if (key === 'R') { e.preventDefault(); renomearImagem(); }
      if (key === 'M') { e.preventDefault(); toggleGerenciamentoCor(); }
      if (key === 'A') { e.preventDefault(); organizarJanelas(); }
      if (key === 'S') { e.preventDefault(); salvarConfiguracoesFotobooth(); }
      if (key === 'V') { e.preventDefault(); abrirConfiguracoesVideobooth(); }
      if (key === 'F4') { e.preventDefault(); modoFotobooth(); }
    }

    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
      fecharTodosDropdowns();
    }

    if (e.key === 'Delete' && !e.ctrlKey) {
      excluirImagem();
    }
  });
}

function toggleModoP_B_wrapper() {
  Estado.modoP_B = !Estado.modoP_B;
  const btn = document.getElementById('btnPB');
  btn.classList.toggle('active', Estado.modoP_B);
  mostrarToast(`Modo ${Estado.modoP_B ? 'Preto e Branco' : 'Colorido'} ativado`, 'info');
}

function fecharTodosDropdowns() {
  document.querySelectorAll('.dropdown').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
}

// ============================================
// COMENTÁRIO
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  const comentario = document.getElementById('inputComentario');
  if (comentario) {
    comentario.addEventListener('change', () => {
      if (comentario.value.trim()) {
        mostrarToast('Comentário salvo', 'success');
      }
    });
  }
});

// ============================================
// SISTEMA DE FUNDO VIRTUAL — BiRefNet
// ============================================

function inicializarPainelFundo() {
  // Carrega configuração salva do localStorage
  const savedURL = localStorage.getItem('megakey_birefnet_url');
  if (savedURL) {
    Estado.fundo.birefnetURL = savedURL;
    const input = document.getElementById('inputBiRefNetURL');
    if (input) input.value = savedURL;
  }

  // Testa a conexão silenciosamente na inicialização
  verificarConexaoBiRefNetSilencioso();
}

async function verificarConexaoBiRefNetSilencioso() {
  const url = Estado.fundo.birefnetURL;
  try {
    const resp = await fetch(`${url}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000)
    });
    if (resp.ok) {
      Estado.fundo.birefnetOnline = true;
      carregarFundosLocaisDoServidor();
    } else {
      Estado.fundo.birefnetOnline = false;
    }
  } catch (err) {
    Estado.fundo.birefnetOnline = false;
  }
  atualizarStatusFundo();
}

// ---- TOGGLE DO PAINEL ----
function toggleRemoverFundo() {
  const chk = document.getElementById('chkRemoverFundo');
  Estado.fundo.ativo = chk.checked;
  const bgControls = document.getElementById('bgControls');
  const statusBar = document.getElementById('bgStatusBar');

  if (Estado.fundo.ativo) {
    if (Estado.fundo.metodo === 'chromakey') {
      mostrarToast('🎨 Fundo Virtual ativado com Chroma Key!', 'success');
      if (statusBar) statusBar.style.display = 'none';
    } else {
      if (!Estado.fundo.birefnetOnline) {
        mostrarToast('⚠️ Servidor BiRefNet offline. O fundo será aplicado sem remoção automática.', 'warning');
      } else {
        mostrarToast('🎨 Fundo Virtual ativado com BiRefNet!', 'success');
      }
      if (statusBar) statusBar.style.display = 'flex';
      atualizarStatusFundo();
    }
    bgControls.style.display = 'flex';
  } else {
    bgControls.style.display = 'none';
    if (statusBar) statusBar.style.display = 'none';
    Estado.fundo.maskCanvas = null;
    mostrarToast('Fundo Virtual desativado', 'info');
  }
}

// ---- SELEÇÃO DE FUNDO ----
function selecionarFundo(tipo) {
  // Remove seleção anterior
  document.querySelectorAll('.bg-option').forEach(el => el.classList.remove('selected'));

  // Define novo tipo
  Estado.fundo.tipo = tipo;

  // Seleciona visualmente
  const idMap = {
    'none':         'bgOpt-none',
    'color-black':  'bgOpt-black',
    'color-white':  'bgOpt-white',
    'color-gray':   'bgOpt-gray',
    'grad-blue':    'bgOpt-grad-blue',
    'grad-purple':  'bgOpt-grad-purple',
    'grad-gold':    'bgOpt-grad-gold',
    'grad-green':   'bgOpt-grad-green',
    'color-chroma': 'bgOpt-chroma',
    'upload':       'bgOpt-upload'
  };

  const el = document.getElementById(idMap[tipo]);
  if (el) el.classList.add('selected');

  const nomes = {
    'none': 'Fundo removido', 'color-black': 'Fundo preto', 'color-white': 'Fundo branco',
    'color-gray': 'Fundo cinza', 'grad-blue': 'Oceano', 'grad-purple': 'Galáxia',
    'grad-gold': 'Âmbar', 'grad-green': 'Floresta', 'color-chroma': 'Chroma Key',
    'upload': 'Imagem personalizada'
  };

  if (tipo !== 'none') mostrarToast(`Fundo: ${nomes[tipo] || tipo}`, 'info');
}

// ---- UPLOAD DE FUNDO PERSONALIZADO ----
function uploadFundo() {
  document.getElementById('inputFundoImg').click();
}

function carregarImagemFundo(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      Estado.fundo.imagemUpload = img;
      Estado.fundo.imagemDataURL = e.target.result;

      // Atualiza preview no botão
      const preview = document.getElementById('bgPreviewUpload');
      if (preview) {
        preview.style.backgroundImage = `url(${e.target.result})`;
        preview.style.backgroundSize = 'cover';
        preview.innerHTML = '';
      }

      selecionarFundo('upload');
      mostrarToast(`Fundo carregado: ${file.name}`, 'success');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ---- CONTROLES DE BORDA E OPACIDADE ----
function setBordaIA(v) {
  Estado.fundo.bordaSuavidade = parseInt(v);
  document.getElementById('bordaIAValue').textContent = `${v}px`;
}

function setOpacidadeFundo(v) {
  Estado.fundo.opacidade = parseInt(v) / 100;
  document.getElementById('opacidadeFundoValue').textContent = `${v}%`;
}

// ---- PINTA O FUNDO NO CANVAS ----
function pintarFundoNoCanvas(ctx, w, h) {
  const tipo = Estado.fundo.tipo;
  if (tipo === 'none') return;

  ctx.save();
  ctx.globalAlpha = Estado.fundo.opacidade;

  if (tipo === 'color-black')  { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, h); }
  else if (tipo === 'color-white')  { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
  else if (tipo === 'color-gray')   { ctx.fillStyle = '#555555'; ctx.fillRect(0, 0, w, h); }
  else if (tipo === 'color-chroma') { ctx.fillStyle = '#00b140'; ctx.fillRect(0, 0, w, h); }
  else if (tipo === 'grad-blue') {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#0f2027'); g.addColorStop(0.5, '#203a43'); g.addColorStop(1, '#2c5364');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  else if (tipo === 'grad-purple') {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1a0533'); g.addColorStop(0.5, '#4a1080'); g.addColorStop(1, '#7c3aed');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  else if (tipo === 'grad-gold') {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1a0a00'); g.addColorStop(0.5, '#7c3d00'); g.addColorStop(1, '#f59e0b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  else if (tipo === 'grad-green') {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#001a0a'); g.addColorStop(0.5, '#004d20'); g.addColorStop(1, '#10b981');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  else if (tipo === 'upload' && Estado.fundo.imagemUpload) {
    // Mantém proporção da imagem cobrindo o canvas
    const img = Estado.fundo.imagemUpload;
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  ctx.restore();
}

// ---- COMPOSIÇÃO DO LIVE VIEW COM FUNDO ----
// Elementos de canvas em cache para o processamento de Chroma Key do Live View
let _chromaCanvas = null;
let _chromaCtx = null;

function compositorFundo(ctx, videoEl, cw, ch, dx, dy, dw, dh) {
  if (!Estado.fundo.ativo || Estado.fundo.tipo === 'none') {
    // Sem fundo: desenha vídeo normal
    if (Estado.modoP_B) ctx.filter = 'grayscale(100%)';
    ctx.drawImage(videoEl, dx, dy, dw, dh);
    ctx.filter = 'none';
    return;
  }

  // 1. Pinta o fundo primeiro
  pintarFundoNoCanvas(ctx, cw, ch);

  // 2. Se for método Chroma Key: processa localmente a remoção do verde em tempo real
  if (Estado.fundo.metodo === 'chromakey') {
    if (!_chromaCanvas) {
      _chromaCanvas = document.createElement('canvas');
      _chromaCtx = _chromaCanvas.getContext('2d');
    }
    if (_chromaCanvas.width !== cw || _chromaCanvas.height !== ch) {
      _chromaCanvas.width = cw;
      _chromaCanvas.height = ch;
    }

    if (Estado.modoP_B) _chromaCtx.filter = 'grayscale(100%)';
    _chromaCtx.drawImage(videoEl, dx, dy, dw, dh);
    _chromaCtx.filter = 'none';

    const frame = _chromaCtx.getImageData(0, 0, cw, ch);
    const data = frame.data;
    const len = data.length;

    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Detecção matemática avançada de verde (Chroma Key) resistente a sombras
      const maxRedBlue = r > b ? r : b;
      if (g > 50 && (g - maxRedBlue) > 16) {
        data[i + 3] = 0; // Transparente
      }
    }
    _chromaCtx.putImageData(frame, 0, 0);

    const scaleFactor = Estado.fundo.sujeitoScale / 100;
    const targetW = cw * scaleFactor;
    const targetH = ch * scaleFactor;
    const targetX = (cw * (Estado.fundo.sujeitoX / 100)) - (targetW / 2);
    const targetY = (ch * (Estado.fundo.sujeitoY / 100)) - targetH;

    ctx.drawImage(_chromaCanvas, targetX, targetY, targetW, targetH);
    return;
  }

  // 3. Se BiRefNet está online e em tempo real: usa máscara
  if (Estado.fundo.birefnetOnline && Estado.fundo.birefnetTempoReal && Estado.fundo.maskCanvas) {
    // Aplica máscara: compositing
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cw; tempCanvas.height = ch;
    const tempCtx = tempCanvas.getContext('2d');

    // Desenha vídeo no canvas temporário
    if (Estado.modoP_B) tempCtx.filter = 'grayscale(100%)';
    tempCtx.drawImage(videoEl, dx, dy, dw, dh);
    tempCtx.filter = 'none';

    // Aplica máscara (destination-in)
    tempCtx.globalCompositeOperation = 'destination-in';
    tempCtx.drawImage(Estado.fundo.maskCanvas, 0, 0, cw, ch);
    tempCtx.globalCompositeOperation = 'source-over';

    // Suavização de borda via blur
    if (Estado.fundo.bordaSuavidade > 0) {
      tempCtx.filter = `blur(${Estado.fundo.bordaSuavidade * 0.5}px)`;
      // Re-aplica com blur nas bordas (edge feathering simples)
    }

    // Composita sobre o fundo aplicando escala e coordenadas X, Y customizadas
    const scaleFactor = Estado.fundo.sujeitoScale / 100;
    const targetW = cw * scaleFactor;
    const targetH = ch * scaleFactor;
    const targetX = (cw * (Estado.fundo.sujeitoX / 100)) - (targetW / 2);
    const targetY = (ch * (Estado.fundo.sujeitoY / 100)) - targetH;

    ctx.drawImage(tempCanvas, targetX, targetY, targetW, targetH);

  } else {
    // Sem máscara IA: sobrepõe vídeo com modo de composição normal aplicando escala e coordenadas X, Y
    if (Estado.modoP_B) ctx.filter = 'grayscale(100%)';
    ctx.globalAlpha = 0.95;

    const scaleFactor = Estado.fundo.sujeitoScale / 100;
    const targetW = cw * scaleFactor;
    const targetH = ch * scaleFactor;
    const targetX = (cw * (Estado.fundo.sujeitoX / 100)) - (targetW / 2);
    const targetY = (ch * (Estado.fundo.sujeitoY / 100)) - targetH;

    ctx.drawImage(videoEl, targetX, targetY, targetW, targetH);
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
  }
}

// ---- REQUISIÇÃO BIREFNET PARA MÁSCARA EM TEMPO REAL ----
let _birefnetProcessando = false;

async function requisitarMascaraBiRefNet(videoEl, w, h) {
  if (_birefnetProcessando) return;
  if (!Estado.fundo.birefnetOnline) return;

  const agora = Date.now();
  // Limita a 5 FPS para não sobrecarregar o servidor
  if (agora - Estado.fundo.ultimaMascaraTs < 200) return;
  Estado.fundo.ultimaMascaraTs = agora;

  _birefnetProcessando = true;

  try {
    // Captura frame reduzido para enviar ao BiRefNet
    const snapW = Math.min(w, 640);
    const snapH = Math.round(h * (snapW / w));
    const snap = document.createElement('canvas');
    snap.width = snapW; snap.height = snapH;
    const sCtx = snap.getContext('2d');
    sCtx.drawImage(videoEl, 0, 0, snapW, snapH);

    const blob = await new Promise(r => snap.toBlob(r, 'image/jpeg', 0.85));
    const fd = new FormData();
    fd.append('image', blob, 'frame.jpg');

    const resp = await fetch(`${Estado.fundo.birefnetURL}/remove-bg`, {
      method: 'POST',
      body: fd,
      signal: AbortSignal.timeout(500)
    });

    if (resp.ok) {
      const maskBlob = await resp.blob();
      const maskURL = URL.createObjectURL(maskBlob);
      const maskImg = new Image();
      maskImg.onload = () => {
        if (!Estado.fundo.maskCanvas) {
          Estado.fundo.maskCanvas = document.createElement('canvas');
        }
        Estado.fundo.maskCanvas.width  = w;
        Estado.fundo.maskCanvas.height = h;
        const mc = Estado.fundo.maskCanvas.getContext('2d');
        mc.drawImage(maskImg, 0, 0, w, h);
        URL.revokeObjectURL(maskURL);
      };
      maskImg.src = maskURL;
    }
  } catch {
    // Silencia erros de rede
  } finally {
    _birefnetProcessando = false;
  }
}

// ---- APLICAR FUNDO EM FOTO CAPTURADA ----
async function removerFundoFotoSelecionada() {
  const sel = document.querySelector('.thumb-item.selected img');
  if (!sel) {
    mostrarToast('Selecione uma foto na galeria primeiro', 'warning');
    return;
  }

  if (Estado.fundo.tipo === 'none') {
    mostrarToast('Selecione um fundo antes de aplicar', 'warning');
    return;
  }

  mostrarToast('🤖 Processando com BiRefNet...', 'info');

  const srcImg = new Image();
  srcImg.src = sel.src;
  await new Promise(r => { srcImg.onload = r; if (srcImg.complete) r(); });

  const W = srcImg.naturalWidth  || 640;
  const H = srcImg.naturalHeight || 480;

  const resultCanvas = document.createElement('canvas');
  resultCanvas.width  = W;
  resultCanvas.height = H;
  const rCtx = resultCanvas.getContext('2d');

  if (Estado.fundo.metodo === 'chromakey') {
    // Pinta fundo
    pintarFundoNoCanvas(rCtx, W, H);

    // Chroma key de alta resolução da foto selecionada
    const tempC = document.createElement('canvas');
    tempC.width = W; tempC.height = H;
    const tCtx = tempC.getContext('2d');
    tCtx.drawImage(srcImg, 0, 0);

    const frame = tCtx.getImageData(0, 0, W, H);
    const data = frame.data;
    const len = data.length;

    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Detecção matemática avançada de verde (Chroma Key) resistente a sombras
      const maxRedBlue = r > b ? r : b;
      if (g > 50 && (g - maxRedBlue) > 16) {
        data[i + 3] = 0; // Transparente
      }
    }
    tCtx.putImageData(frame, 0, 0);

    // Pinta sujeito com escala e posição
    const scaleFactor = Estado.fundo.sujeitoScale / 100;
    const targetW = W * scaleFactor;
    const targetH = H * scaleFactor;
    const targetX = (W * (Estado.fundo.sujeitoX / 100)) - (targetW / 2);
    const targetY = (H * (Estado.fundo.sujeitoY / 100)) - targetH;

    rCtx.drawImage(tempC, targetX, targetY, targetW, targetH);
    mostrarToast('✅ Chroma Key aplicado com sucesso!', 'success');
  } else if (Estado.fundo.birefnetOnline) {
    try {
      // Envia foto ao BiRefNet local
      const snap = document.createElement('canvas');
      snap.width = W; snap.height = H;
      snap.getContext('2d').drawImage(srcImg, 0, 0);

      const blob = await new Promise(r => snap.toBlob(r, 'image/jpeg', 0.95));
      const fd = new FormData();
      fd.append('image', blob, 'photo.jpg');

      const resp = await fetch(`${Estado.fundo.birefnetURL}/remove-bg`, {
        method: 'POST',
        body: fd,
        signal: AbortSignal.timeout(10000)
      });

      if (resp.ok) {
        const maskBlob = await resp.blob();
        const maskURL = URL.createObjectURL(maskBlob);
        const maskImg = await new Promise((res, rej) => {
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = rej;
          img.src = maskURL;
        });

        // Pinta fundo
        pintarFundoNoCanvas(rCtx, W, H);

        // Pinta sujeito com máscara
        const tempC = document.createElement('canvas');
        tempC.width = W; tempC.height = H;
        const tCtx = tempC.getContext('2d');
        tCtx.drawImage(srcImg, 0, 0);
        tCtx.globalCompositeOperation = 'destination-in';
        tCtx.drawImage(maskImg, 0, 0, W, H);

        // Aplica o tamanho e posicionamento ao renderizar o canvas temporário
        const scaleFactor = Estado.fundo.sujeitoScale / 100;
        const targetW = W * scaleFactor;
        const targetH = H * scaleFactor;
        const targetX = (W * (Estado.fundo.sujeitoX / 100)) - (targetW / 2);
        const targetY = (H * (Estado.fundo.sujeitoY / 100)) - targetH;

        if (Estado.fundo.bordaSuavidade > 0) {
          rCtx.filter = `blur(${Estado.fundo.bordaSuavidade * 0.3}px)`;
        }
        rCtx.drawImage(tempC, targetX, targetY, targetW, targetH);
        rCtx.filter = 'none';

        URL.revokeObjectURL(maskURL);
        mostrarToast('✅ Fundo removido com BiRefNet!', 'success');
      } else {
        throw new Error('BiRefNet retornou erro');
      }
    } catch (err) {
      mostrarToast('⚠️ BiRefNet falhou — aplicando fundo sem remoção', 'warning');
      pintarFundoNoCanvas(rCtx, W, H);
      rCtx.globalAlpha = 0.9;
      
      const scaleFactor = Estado.fundo.sujeitoScale / 100;
      const targetW = W * scaleFactor;
      const targetH = H * scaleFactor;
      const targetX = (W * (Estado.fundo.sujeitoX / 100)) - (targetW / 2);
      const targetY = (H * (Estado.fundo.sujeitoY / 100)) - targetH;
      
      rCtx.drawImage(srcImg, targetX, targetY, targetW, targetH);
      rCtx.globalAlpha = 1;
    }
  } else {
    // Sem BiRefNet: aplica fundo direto sem remoção
    pintarFundoNoCanvas(rCtx, W, H);
    rCtx.globalAlpha = 0.9;
    
    const scaleFactor = Estado.fundo.sujeitoScale / 100;
    const targetW = W * scaleFactor;
    const targetH = H * scaleFactor;
    const targetX = (W * (Estado.fundo.sujeitoX / 100)) - (targetW / 2);
    const targetY = (H * (Estado.fundo.sujeitoY / 100)) - targetH;
    
    rCtx.drawImage(srcImg, targetX, targetY, targetW, targetH);
    rCtx.globalAlpha = 1;
    mostrarToast('⚠️ BiRefNet offline — fundo aplicado sem remoção de IA', 'warning');
  }

  // Atualiza a miniatura com resultado
  const novoDataURL = resultCanvas.toDataURL('image/jpeg', 0.95);
  sel.src = novoDataURL;

  const agoraFundo = new Date();
  const nomeFundo = `IMG_FUNDO_${agoraFundo.getFullYear()}${String(agoraFundo.getMonth()+1).padStart(2,'0')}${String(agoraFundo.getDate()).padStart(2,'0')}_${String(agoraFundo.getHours()).padStart(2,'0')}${String(agoraFundo.getMinutes()).padStart(2,'0')}${String(agoraFundo.getSeconds()).padStart(2,'0')}.jpg`;
  
  salvarFotoNoDiscoLocal(novoDataURL, nomeFundo);

  // Espelha a foto processada na segunda tela se estiver ativa
  if (window.windowTela2 && !window.windowTela2.closed && typeof window.windowTela2.exibirFotoEstatica === 'function') {
    window.windowTela2.exibirFotoEstatica(novoDataURL);
  }

  sel.closest('.thumb-item').ondblclick = () => {
    abrirFotoAmpliada(novoDataURL, nomeFundo);
  };
}

// ---- CONFIGURAÇÃO BIREFNET ----
function abrirConfigBiRefNet() {
  abrirModal('modalBiRefNet');
}

async function testarConexaoBiRefNet() {
  const url = document.getElementById('inputBiRefNetURL').value.trim();
  const resultado = document.getElementById('birefnetTestResult');

  resultado.innerHTML = `<span style="color:var(--accent-gold)">🔄 Testando conexão com ${url}...</span>`;

  try {
    const resp = await fetch(`${url}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });

    if (resp.ok) {
      const data = await resp.json().catch(() => ({}));
      const modelo = data.model || 'BiRefNet';
      resultado.innerHTML = `<span style="color:var(--accent-green)">✅ Servidor online! Modelo: ${modelo}</span>`;
      Estado.fundo.birefnetOnline = true;
      Estado.fundo.birefnetURL = url;
      atualizarStatusFundo();
      carregarFundosLocaisDoServidor();
    } else {
      throw new Error(`Status: ${resp.status}`);
    }
  } catch (err) {
    resultado.innerHTML = `<span style="color:var(--accent-red)">❌ Servidor offline ou inacessível. Erro: ${err.message}</span>`;
    Estado.fundo.birefnetOnline = false;
    atualizarStatusFundo();
  }
}

function salvarConfigBiRefNet() {
  const url = document.getElementById('inputBiRefNetURL').value.trim();
  Estado.fundo.birefnetURL = url;
  Estado.fundo.birefnetTempoReal = document.getElementById('chkBiRefNetTempoReal').checked;
  localStorage.setItem('megakey_birefnet_url', url);
  fecharModal('modalBiRefNet');
  mostrarToast('Configurações BiRefNet salvas!', 'success');
}

function atualizarStatusFundo() {
  const dot  = document.getElementById('bgStatusDot');
  const txt  = document.getElementById('bgStatusText');
  if (!dot || !txt) return;

  if (!Estado.fundo.ativo) {
    dot.className = 'bg-status-dot';
    txt.textContent = 'IA desativada';
    return;
  }

  if (Estado.fundo.birefnetOnline) {
    dot.className = 'bg-status-dot online';
    txt.textContent = 'BiRefNet online ✓';
  } else {
    dot.className = 'bg-status-dot error';
    txt.textContent = 'Servidor BiRefNet offline';
  }
}

async function salvarFotoNoDiscoLocal(dataURL, nome) {
  if (!Estado.fundo.birefnetOnline) return;

  const destinoDir = localStorage.getItem('megakey_caminho_salvar') || 'C:\\Users\\l\\Desktop\\MEGAKEY\\capturas';

  try {
    const response = await fetch(`${Estado.fundo.birefnetURL}/save-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_b64: dataURL,
        filename: nome,
        destino_dir: destinoDir
      })
    });
    if (response.ok) {
      const res = await response.json();
      console.log('Foto salva localmente em:', res.caminho);
      mostrarToast(`💾 Salva no disco: ${nome}`, 'success');
    }
  } catch (err) {
    console.error('Falha ao salvar foto localmente:', err);
  }
}

// ---- IMPORTAR FOTO PERSONALIZADA PARA A GALERIA ----
function triggerImportarFoto() {
  document.getElementById('inputImportarFoto').click();
}

function importarFotoGaleria(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // Adiciona na galeria de miniaturas
      adicionarMiniatura(e.target.result, file.name);
      mostrarToast(`📥 Foto importada: ${file.name}`, 'success');
      
      // Salva no disco local automaticamente
      salvarFotoNoDiscoLocal(e.target.result, file.name);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ---- CARREGAR FUNDOS LOCAIS DO SERVIDOR ----
async function carregarFundosLocaisDoServidor() {
  if (!Estado.fundo.birefnetOnline) return;

  try {
    const response = await fetch(`${Estado.fundo.birefnetURL}/list-backgrounds`);
    if (response.ok) {
      const data = await response.json();
      const backgrounds = data.backgrounds || [];
      
      adicionarFundosServidorNaGrid(backgrounds);
      renderizarCartoesFundoProjeto(backgrounds);
    }
  } catch (err) {
    console.error('Erro ao carregar fundos do servidor:', err);
  }
}

function adicionarFundosServidorNaGrid(backgrounds) {
  const grid = document.getElementById('bgGrid');
  
  // Remove itens dinâmicos antigos se houver
  document.querySelectorAll('.bg-option-dynamic').forEach(el => el.remove());
  
  if (backgrounds.length === 0) return;
  
  backgrounds.forEach(filename => {
    const url = `${Estado.fundo.birefnetURL}/background/${filename}`;
    const id = `bgOpt-dynamic-${filename.replace(/\.[^/.]+$/, "")}`;
    
    const bgOpt = document.createElement('div');
    bgOpt.className = 'bg-option bg-option-dynamic';
    bgOpt.id = id;
    bgOpt.title = filename;
    
    // Configura o clique no fundo local
    bgOpt.onclick = () => {
      document.querySelectorAll('.bg-option').forEach(el => el.classList.remove('selected'));
      bgOpt.classList.add('selected');
      
      const img = new Image();
      img.onload = () => {
        Estado.fundo.imagemUpload = img;
        Estado.fundo.imagemDataURL = url;
        Estado.fundo.tipo = 'upload'; // Trata como imagem de upload carregada
        mostrarToast(`Fundo local: ${filename}`, 'info');
      };
      img.src = url;
    };
    
    const preview = document.createElement('div');
    preview.className = 'bg-opt-preview';
    preview.style.backgroundImage = `url(${url})`;
    preview.style.backgroundSize = 'cover';
    preview.style.backgroundPosition = 'center';
    
    const span = document.createElement('span');
    span.textContent = filename.split('.')[0]; // Nome amigável sem extensão
    
    bgOpt.appendChild(preview);
    bgOpt.appendChild(span);
    
    // Insere antes do botão 'Carregar' (bgOpt-upload)
    const uploadBtn = document.getElementById('bgOpt-upload');
    grid.insertBefore(bgOpt, uploadBtn);
  });
}

// ---- INICIALIZAR ARRASTAR E SOLTAR DE FUNDOS ----
function inicializarDragAndDropFundos() {
  const dropZone = document.getElementById('bgDragZone');
  if (!dropZone) return;

  // Ao clicar, abre o explorador de arquivos
  dropZone.addEventListener('click', () => {
    document.getElementById('inputFundoCustomizado').click();
  });

  // Impedir propagação padrão de drag/drop no resto da tela
  window.addEventListener('dragover', (e) => e.preventDefault(), false);
  window.addEventListener('drop', (e) => e.preventDefault(), false);

  // Efeitos visuais ao arrastar arquivos sobre a zona
  ['dragenter', 'dragover'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }, false);
  });

  // Captura o drop dos arquivos
  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    processarUploadDeFundos(files);
  }, false);
}

function uploadFundosCustomizados(input) {
  processarUploadDeFundos(input.files);
}

// Processa e envia os fundos arrastados para o servidor
async function processarUploadDeFundos(files) {
  if (files.length === 0) return;

  mostrarToast(`📤 Salvando ${files.length} fundo(s) no projeto...`, 'info');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.type.startsWith('image/')) {
      mostrarToast('⚠️ Apenas imagens são suportadas como fundo', 'warning');
      continue;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataURL = e.target.result;

      if (Estado.fundo.birefnetOnline) {
        try {
          const response = await fetch(`${Estado.fundo.birefnetURL}/save-background`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              image_b64: dataURL,
              filename: file.name
            })
          });

          if (response.ok) {
            mostrarToast(`✅ Fundo salvo: ${file.name}`, 'success');
            // Recarrega lista de fundos
            carregarFundosLocaisDoServidor();
          } else {
            throw new Error('Falha no upload do servidor');
          }
        } catch (err) {
          console.error(err);
          mostrarToast('❌ Erro ao enviar ao servidor de fundos', 'error');
        }
      } else {
        mostrarToast('⚠️ Servidor local offline. Inicie o server_birefnet.py para usar fundos customizados.', 'warning');
      }
    };
    reader.readAsDataURL(file);
  }
}

// ---- RENDERIZAR CARTOES DE FUNDOS DO PROJETO ----
function renderizarCartoesFundoProjeto(backgrounds) {
  const container = document.getElementById('customBgList');
  if (!container) return;

  container.innerHTML = '';

  if (backgrounds.length === 0) {
    container.innerHTML = `<div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 12px; border: 1px dashed var(--border-subtle); border-radius: var(--radius-sm); margin-top: 4px;">Nenhum fundo customizado na pasta</div>`;
    return;
  }

  backgrounds.forEach(filename => {
    const url = `${Estado.fundo.birefnetURL}/background/${filename}`;

    const card = document.createElement('div');
    card.className = 'custom-bg-card';
    if (Estado.fundo.imagemDataURL === url) {
      card.classList.add('selected');
    }

    // Clique seleciona este fundo
    card.onclick = () => {
      document.querySelectorAll('.bg-option').forEach(el => el.classList.remove('selected'));
      document.querySelectorAll('.custom-bg-card').forEach(el => el.classList.remove('selected'));
      
      card.classList.add('selected');

      const img = new Image();
      img.onload = () => {
        Estado.fundo.imagemUpload = img;
        Estado.fundo.imagemDataURL = url;
        Estado.fundo.tipo = 'upload'; // Trata como imagem carregada
        mostrarToast(`Fundo ativo: ${filename}`, 'info');
      };
      img.src = url;
    };

    const imgEl = document.createElement('img');
    imgEl.src = url;

    const details = document.createElement('div');
    details.className = 'custom-bg-details';

    const name = document.createElement('span');
    name.className = 'custom-bg-name';
    name.textContent = filename.split('.')[0];

    const meta = document.createElement('span');
    meta.className = 'custom-bg-meta';
    meta.textContent = 'Fundo customizado';

    details.appendChild(name);
    details.appendChild(meta);

    // Botão de deletar
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'custom-bg-delete';
    deleteBtn.title = 'Excluir fundo';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      excluirFundoDoServidor(filename);
    };
    deleteBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
    `;

    card.appendChild(imgEl);
    card.appendChild(details);
    card.appendChild(deleteBtn);
    container.appendChild(card);
  });
}

// Excluir fundo físico do servidor
async function excluirFundoDoServidor(filename) {
  if (!Estado.fundo.birefnetOnline) return;

  if (!confirm(`Deseja realmente excluir o fundo "${filename}" do projeto?`)) return;

  try {
    const response = await fetch(`${Estado.fundo.birefnetURL}/delete-background/${filename}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      mostrarToast(`🗑️ Fundo removido: ${filename}`, 'success');
      
      // Se era o fundo ativo, reseta para nenhum
      const url = `${Estado.fundo.birefnetURL}/background/${filename}`;
      if (Estado.fundo.imagemDataURL === url) {
        selecionarFundo('none');
        Estado.fundo.imagemUpload = null;
        Estado.fundo.imagemDataURL = null;
      }
      
      // Recarrega lista
      carregarFundosLocaisDoServidor();
    }
  } catch (err) {
    console.error('Falha ao excluir fundo do servidor:', err);
    mostrarToast('❌ Erro ao remover fundo', 'error');
  }
}

// ---- CONFIGURAÇÃO DE PREFERÊNCIAS ----
function abrirPreferencias() {
  const prefCaminho = localStorage.getItem('megakey_caminho_salvar') || 'C:\\Users\\l\\Desktop\\MEGAKEY\\capturas';
  const prefPrefixo = localStorage.getItem('megakey_prefixo_nome') || 'IMG';
  
  const inputCaminho = document.getElementById('prefCaminhoSalvar');
  if (inputCaminho) inputCaminho.value = prefCaminho;
  
  const inputPrefixo = document.getElementById('prefNomePrefixo');
  if (inputPrefixo) inputPrefixo.value = prefPrefixo;
  
  setPrefTab('geral');
  abrirModal('modalPreferencias');
}

function setPrefTab(tabName) {
  // Desmarca abas ativas
  document.querySelectorAll('.pref-tab').forEach(t => t.classList.remove('active'));
  // Oculta todos os conteúdos
  document.querySelectorAll('.pref-content').forEach(c => c.classList.add('hidden'));
  
  // Ativa a aba clicada
  const activeTab = Array.from(document.querySelectorAll('.pref-tab')).find(t => 
    t.textContent.toLowerCase().includes(tabName === 'pasta' ? 'pasta' : tabName)
  );
  if (activeTab) activeTab.classList.add('active');
  
  // Mostra o conteúdo da aba
  const idMap = {
    'geral': 'prefGeral',
    'pasta': 'prefPasta',
    'nomeacao': 'prefNomeacao',
    'interface': 'prefInterface'
  };
  const activeContent = document.getElementById(idMap[tabName]);
  if (activeContent) activeContent.classList.remove('hidden');
}

async function testarPastaDestino() {
  if (!Estado.fundo.birefnetOnline) {
    mostrarToast('⚠️ Servidor local offline. Conecte-o primeiro.', 'warning');
    return;
  }
  
  const caminho = document.getElementById('prefCaminhoSalvar').value.trim();
  mostrarToast('🔄 Verificando pasta no computador...', 'info');
  
  try {
    const response = await fetch(`${Estado.fundo.birefnetURL}/verify-directory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory: caminho })
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.status === 'valido') {
        mostrarToast('✅ Pasta de destino válida e acessível!', 'success');
      } else {
        mostrarToast(`❌ Erro de pasta: ${data.erro}`, 'error');
      }
    } else {
      mostrarToast('❌ Servidor local retornou erro ao verificar', 'error');
    }
  } catch (err) {
    mostrarToast('❌ Falha na conexão com o servidor local', 'error');
  }
}

function salvarPreferencias() {
  const inputCaminho = document.getElementById('prefCaminhoSalvar');
  const inputPrefixo = document.getElementById('prefNomePrefixo');
  
  if (inputCaminho) {
    localStorage.setItem('megakey_caminho_salvar', inputCaminho.value.trim());
  }
  if (inputPrefixo) {
    localStorage.setItem('megakey_prefixo_nome', inputPrefixo.value.trim());
  }
  
  fecharModal('modalPreferencias');
  mostrarToast('Preferências salvas!', 'success');
}

function baixarFotoSelecionada() {
  const sel = document.querySelector('.thumb-item.selected img');
  if (!sel) {
    mostrarToast('Selecione uma foto na galeria primeiro', 'warning');
    return;
  }
  
  const link = document.createElement('a');
  link.href = sel.src;
  
  const prefixo = localStorage.getItem('megakey_prefixo_nome') || 'IMG';
  const agora = new Date();
  const nome = `${prefixo}_EDITADA_${agora.getTime()}.jpg`;
  link.download = nome;
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  mostrarToast('📥 Download iniciado no seu navegador!', 'success');
}

// ---- CONTROLE DE TAMANHO E POSIÇÃO DO SUJEITO ----
function setSujeitoScale(v) {
  Estado.fundo.sujeitoScale = parseInt(v);
  const valSpan = document.getElementById('sujeitoScaleValue');
  if (valSpan) valSpan.textContent = `${v}%`;
}

function setSujeitoX(v) {
  Estado.fundo.sujeitoX = parseInt(v);
  const valSpan = document.getElementById('sujeitoXValue');
  if (valSpan) valSpan.textContent = `${v}%`;
}

function setSujeitoY(v) {
  Estado.fundo.sujeitoY = parseInt(v);
  const valSpan = document.getElementById('sujeitoYValue');
  if (valSpan) valSpan.textContent = `${v}%`;
}

// ---- ABRIR SEGUNDA TELA (Slideshow/Projetor) ----
window.windowTela2 = null;

function abrirSegundaTela() {
  if (window.windowTela2 && !window.windowTela2.closed) {
    window.windowTela2.focus();
    return;
  }
  window.windowTela2 = window.open('tela2.html', 'MEGAKEY_Tela2', 'width=1024,height=768,menubar=no,toolbar=no,location=no,status=no');
  mostrarToast('🖥️ Tela 2 (Slideshow) aberta! Arraste para o segundo monitor.', 'success');
}
function alterarMetodoRemocao(value) {
  Estado.fundo.metodo = value;
  
  const aiBadge = document.getElementById('aiBadgeLabel');
  const statusBar = document.getElementById('bgStatusBar');
  
  if (value === 'chromakey') {
    if (aiBadge) aiBadge.textContent = 'Chroma Key';
    if (statusBar) statusBar.style.display = 'none';
    mostrarToast('🟢 Modo de Remoção: Chroma Key (Fundo Verde local)', 'success');
  } else {
    if (aiBadge) aiBadge.textContent = 'BiRefNet IA';
    if (statusBar) statusBar.style.display = 'flex';
    mostrarToast('🤖 Modo de Remoção: Inteligência Artificial (BiRefNet)', 'success');
    atualizarStatusFundo();
  }
}
