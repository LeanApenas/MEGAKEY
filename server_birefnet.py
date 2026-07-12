#!/usr/bin/env python3
"""
MEGAKEY — Servidor BiRefNet Local
===================================
Servidor de remoção de fundo usando BiRefNet (estado da arte em IA open-source).
Integra diretamente com o aplicativo MEGAKEY via API HTTP local.

REQUISITOS:
  pip install torch torchvision transformers pillow flask flask-cors

RECOMENDADO (para GPU NVIDIA):
  pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

USO:
  python server_birefnet.py

O servidor ficará disponível em: http://localhost:7860
Na primeira execução, o modelo BiRefNet (~1.5GB) será baixado automaticamente.
"""

import io
import base64
import sys
import os
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from PIL import Image
import numpy as np

app = Flask(__name__)
CORS(app)  # Permite requisições do browser (CORS)

# ============================================================
# CARREGAMENTO DO MODELO
# ============================================================
print("=" * 60)
print("  MEGAKEY — Servidor BiRefNet")
print("=" * 60)
print()
print("Carregando modelo BiRefNet...")
print("(Aguarde — primeira vez faz download de ~1.5GB)")
print()

device = None
pipeline = None
modelo_carregado = False
modelo_nome = "ZhengPeng7/BiRefNet"

try:
    import torch
    from transformers import pipeline as hf_pipeline

    device = "cuda" if torch.cuda.is_available() else "cpu"

    if device == "cuda":
        gpu = torch.cuda.get_device_name(0)
        vram = torch.cuda.get_device_properties(0).total_memory / 1e9
        print(f"  GPU detectada: {gpu} ({vram:.1f}GB VRAM)")
    else:
        print("  GPU NVIDIA nao detectada -- usando CPU (mais lento)")

    print(f"  Dispositivo: {device.upper()}")
    print(f"  Modelo: {modelo_nome}")
    print()

    pipeline = hf_pipeline(
        "image-segmentation",
        model=modelo_nome,
        trust_remote_code=True,
        device=device
    )

    modelo_carregado = True
    print("Modelo BiRefNet carregado com sucesso!")
    print()
    print(f"  Servidor rodando em: http://localhost:7860")
    print(f"  Pressione Ctrl+C para encerrar")
    print("=" * 60)

except ImportError as e:
    print(f"Erro de importacao: {e}")
    print()
    print("Instale as dependencias:")
    print("  pip install torch transformers pillow flask flask-cors")
    print()
    print("Para GPU NVIDIA (recomendado):")
    print("  pip install torch --index-url https://download.pytorch.org/whl/cu121")
    print()
    print("Servidor iniciando em MODO DEMO (sem IA real)")
    print()

except Exception as e:
    print(f"Erro ao carregar modelo: {e}")
    print("Servidor iniciando em MODO DEMO")
    print()


# ============================================================
# ENDPOINTS
# ============================================================

@app.route("/", methods=["GET"])
def home():
    return """
    <html>
        <head>
            <title>MEGAKEY — Servidor BiRefNet</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: #08080f;
                    color: #f0f0ff;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                }
                .card {
                    background: #131325;
                    border: 1px solid rgba(0, 212, 255, 0.2);
                    padding: 40px;
                    border-radius: 12px;
                    text-align: center;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                    max-width: 500px;
                }
                h1 {
                    color: #00D4FF;
                    margin-top: 0;
                    letter-spacing: 1px;
                }
                p {
                    color: #9898be;
                    line-height: 1.6;
                }
                .status {
                    background: rgba(16, 185, 129, 0.15);
                    border: 1px solid #10b981;
                    color: #10b981;
                    padding: 8px 16px;
                    border-radius: 20px;
                    display: inline-block;
                    font-weight: bold;
                    margin-bottom: 20px;
                }
                code {
                    background: #08080f;
                    padding: 4px 8px;
                    border-radius: 4px;
                    color: #9D5FFF;
                    font-family: monospace;
                }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="status">🟢 SERVIDORES INTEGRADOS ONLINE</div>
                <h1>MEGAKEY BiRefNet API</h1>
                <p>Este servidor local está em execução para gerenciar as funções de remoção de fundo com Inteligência Artificial do seu app <strong>MEGAKEY</strong>.</p>
                <p>Para verificar o status completo da API, acesse o endpoint de saúde em: <a href="/health" style="color:#00D4FF;text-decoration:none;"><code>/health</code></a></p>
            </div>
        </body>
    </html>
    """

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "online",
        "model": modelo_nome if modelo_carregado else "demo",
        "device": str(device) if device else "cpu",
        "modelo_carregado": modelo_carregado,
        "versao": "1.0.0"
    })


@app.route("/remove-bg", methods=["POST"])
def remove_bg():
    if "image" not in request.files:
        return jsonify({"erro": "Campo 'image' nao encontrado"}), 400

    try:
        arquivo = request.files["image"]
        img = Image.open(arquivo.stream).convert("RGB")

        if modelo_carregado and pipeline is not None:
            resultado = pipeline(img)

            mask_img = None
            for item in resultado:
                if item.get("label") in ("foreground", "subject", None) or mask_img is None:
                    mask_img = item["mask"]

            if mask_img is None:
                raise ValueError("Nenhuma mascara retornada pelo modelo")

            if mask_img.mode != "L":
                mask_img = mask_img.convert("L")

            if mask_img.size != img.size:
                mask_img = mask_img.resize(img.size, Image.LANCZOS)

            img_rgba = img.convert("RGBA")
            img_rgba.putalpha(mask_img)

        else:
            img_array = np.array(img)
            r, g, b = img_array[:, :, 0], img_array[:, :, 1], img_array[:, :, 2]

            verde_mask = (g > 100) & (g > r * 1.3) & (g > b * 1.3)
            alpha = np.where(verde_mask, 0, 255).astype(np.uint8)

            img_rgba = img.convert("RGBA")
            img_rgba.putalpha(Image.fromarray(alpha))

        buf = io.BytesIO()
        img_rgba.save(buf, format="PNG", optimize=True)
        buf.seek(0)

        return send_file(
            buf,
            mimetype="image/png",
            as_attachment=False,
            download_name="mask.png"
        )

    except Exception as e:
        print(f"Erro no processamento: {e}")
        return jsonify({"erro": str(e)}), 500


@app.route("/remove-bg-base64", methods=["POST"])
def remove_bg_base64():
    data = request.get_json()
    if not data or "image_b64" not in data:
        return jsonify({"erro": "Campo 'image_b64' nao encontrado"}), 400

    try:
        img_bytes = base64.b64decode(data["image_b64"])
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")

        if modelo_carregado and pipeline is not None:
            resultado = pipeline(img)
            mask_img = resultado[0]["mask"].convert("L")
            img_rgba = img.convert("RGBA")
            img_rgba.putalpha(mask_img)
        else:
            img_rgba = img.convert("RGBA")

        buf = io.BytesIO()
        img_rgba.save(buf, format="PNG")
        buf.seek(0)
        mask_b64 = base64.b64encode(buf.read()).decode("utf-8")

        return jsonify({
            "mask_b64": mask_b64,
            "formato": "PNG",
            "modo": "birefnet" if modelo_carregado else "demo"
        })
    except Exception as e:
        return jsonify({"erro": str(e)}), 500


@app.route("/save-photo", methods=["POST"])
def save_photo():
    data = request.get_json()
    if not data or "image_b64" not in data or "filename" not in data:
        return jsonify({"erro": "Parametros ausentes"}), 400

    try:
        filename = data["filename"]
        filename = os.path.basename(filename)
        
        # Pasta de destino (aceita valor enviado do cliente ou padrão)
        destino_dir = data.get("destino_dir")
        if not destino_dir:
            destino_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "capturas")
            
        os.makedirs(destino_dir, exist_ok=True)
        filepath = os.path.join(destino_dir, filename)
        
        img_data = data["image_b64"]
        if "," in img_data:
            img_data = img_data.split(",")[1]
            
        img_bytes = base64.b64decode(img_data)
        
        with open(filepath, "wb") as f:
            f.write(img_bytes)
            
        print(f"📸 Foto salva localmente: {filepath}")
        return jsonify({
            "status": "sucesso",
            "caminho": filepath
        })
    except Exception as e:
        print(f"Erro ao salvar foto localmente: {e}")
        return jsonify({"erro": str(e)}), 500


# Pasta para colocar imagens de fundos personalizados localmente
FUNDOS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fundos")
os.makedirs(FUNDOS_DIR, exist_ok=True)

@app.route("/list-backgrounds", methods=["GET"])
def list_backgrounds():
    formatos = (".png", ".jpg", ".jpeg", ".webp")
    imagens = []
    if os.path.exists(FUNDOS_DIR):
        for f in os.listdir(FUNDOS_DIR):
            if f.lower().endswith(formatos):
                imagens.append(f)
    return jsonify({"backgrounds": imagens})

@app.route("/background/<path:filename>", methods=["GET"])
def get_background(filename):
    return send_from_directory(FUNDOS_DIR, filename)

@app.route("/save-background", methods=["POST"])
def save_background():
    data = request.get_json()
    if not data or "image_b64" not in data or "filename" not in data:
        return jsonify({"erro": "Parametros ausentes"}), 400

    try:
        filename = data["filename"]
        filename = os.path.basename(filename)
        filepath = os.path.join(FUNDOS_DIR, filename)

        img_data = data["image_b64"]
        if "," in img_data:
            img_data = img_data.split(",")[1]

        img_bytes = base64.b64decode(img_data)
        with open(filepath, "wb") as f:
            f.write(img_bytes)

        print(f"🖼️ Novo fundo salvo na pasta fundos: {filepath}")
        return jsonify({
            "status": "sucesso",
            "caminho": filepath
        })
    except Exception as e:
        print(f"Erro ao salvar fundo: {e}")
        return jsonify({"erro": str(e)}), 500


@app.route("/delete-background/<path:filename>", methods=["DELETE"])
def delete_background(filename):
    try:
        filename = os.path.basename(filename)
        filepath = os.path.join(FUNDOS_DIR, filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            print(f"🗑️ Fundo removido do servidor: {filepath}")
            return jsonify({"status": "sucesso"})
        else:
            return jsonify({"erro": "Arquivo nao encontrado"}), 404
    except Exception as e:
        return jsonify({"erro": str(e)}), 500


@app.route("/verify-directory", methods=["POST"])
def verify_directory():
    data = request.get_json()
    if not data or "directory" not in data:
        return jsonify({"erro": "Parametro 'directory' ausente"}), 400
    
    dir_path = data["directory"]
    try:
        os.makedirs(dir_path, exist_ok=True)
        temp_file = os.path.join(dir_path, ".megakey_test")
        with open(temp_file, "w") as f:
            f.write("test")
        os.remove(temp_file)
        return jsonify({"status": "valido", "mensagem": "Pasta acessivel e gravavel!"})
    except Exception as e:
        return jsonify({"status": "invalido", "erro": str(e)}), 500


# ============================================================
# INICIALIZACAO
# ============================================================
if __name__ == "__main__":
    porta = int(os.environ.get("PORT", 7860))
    debug = os.environ.get("DEBUG", "false").lower() == "true"

    app.run(
        host="0.0.0.0",
        port=porta,
        debug=debug,
        threaded=True
    )
