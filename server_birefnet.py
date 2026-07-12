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
from flask import Flask, request, jsonify, send_file
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
