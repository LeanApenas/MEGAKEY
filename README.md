# MEGAKEY — Controle Remoto de Câmera

Software profissional e moderno para controle remoto de câmera tethered, suporte a Live View, Galeria e Remoção de Fundo Virtual inteligente via **BiRefNet IA**.

---

## 🚀 Funcionalidades

- **Controle Completo da Câmera**: ISO, Modo de Exposição, Compensação, Balanço de Branco, Temperatura, Modo de Medição, Modo Drive e Auto-bracket.
- **Conexão Real via Webcam**: Visualização ao vivo com baixa latência no Live View central.
- **Disparo com Feedback Visual**: Simulação de obturador e flash na tela ao disparar.
- **Galeria Embutida**: Miniaturas das capturas com zoom em tela cheia e download direto.
- **Painel de Fundo Virtual (BiRefNet)**:
  - IA de ponta para recortes perfeitos (fios de cabelo, bordas).
  - Mais de 9 opções de fundos (cores sólidas, gradientes e imagem personalizada).
  - Controle de suavização de bordas e opacidade do fundo.
- **Servidor BiRefNet Local**: Script em Python integrado para rodar a remoção de fundo na rede local.

---

## 🛠️ Como Executar

### 1. Aplicativo Principal
Abra o arquivo `index.html` em qualquer navegador moderno.

### 2. Servidor de Remoção de Fundo (BiRefNet)
Para usar a remoção inteligente de fundo, instale e inicie o servidor Python localmente:

```bash
# Instalar dependências
pip install torch transformers pillow flask flask-cors numpy

# Executar o servidor
python server_birefnet.py
```
O servidor rodará em `http://localhost:7860`. Caso possua GPU NVIDIA (CUDA), o processamento será acelerado automaticamente.

---

## ⚖️ Licença
Projeto desenvolvido sob medida para automação de estúdios fotográficos e cabines de foto.
