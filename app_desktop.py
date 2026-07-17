import webview
import threading
import time
import os
import sys
from server_birefnet import app

def start_server():
    # Executa o Flask localmente na porta 7860
    app.run(
        host="127.0.0.1",
        port=7860,
        debug=False,
        threaded=True
    )

if __name__ == '__main__':
    # Garante que as pastas locais existam no diretório de execução
    if getattr(sys, "frozen", False):
        base_dir = os.path.dirname(sys.executable)
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        
    os.makedirs(os.path.join(base_dir, "capturas"), exist_ok=True)
    os.makedirs(os.path.join(base_dir, "fundos"), exist_ok=True)

    # Inicia o servidor Flask em segundo plano
    t = threading.Thread(target=start_server, daemon=True)
    t.start()

    # Aguarda o Flask subir completamente
    time.sleep(0.5)

    # Abre a janela nativa do Desktop (como um aplicativo real)
    webview.create_window(
        title='MEGAKEY',
        url='http://127.0.0.1:7860',
        width=1280,
        height=800,
        resizable=True
    )
    webview.start()
