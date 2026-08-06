import os
import json
import re
import csv
import subprocess
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
import threading
import glob

app = Flask(__name__)
NOTEBOOK_PATH = "evaluate_model.ipynb"

# Global dictionary to track running evaluations
evaluation_status = {
    "is_running": False,
    "progress": 0,
    "total": 0,
    "current_model": "",
    "logs": []
}

def extract_notebook_code():
    with open(NOTEBOOK_PATH, 'r', encoding='utf-8') as f:
        nb = json.load(f)
    code = ""
    for cell in nb.get('cells', []):
        if cell['cell_type'] == 'code':
            code += ''.join(cell.get('source', [])) + '\n\n'
    return code

def run_evaluation(models):
    global evaluation_status
    evaluation_status["is_running"] = True
    evaluation_status["total"] = len(models)
    evaluation_status["progress"] = 0
    evaluation_status["logs"] = []

    try:
        base_code = extract_notebook_code()
    except Exception as e:
        evaluation_status["logs"].append(f"Error reading notebook: {str(e)}")
        evaluation_status["is_running"] = False
        return

    for idx, model_path in enumerate(models):
        evaluation_status["current_model"] = model_path
        evaluation_status["logs"].append(f"Starting evaluation for {model_path}...")
        
        # Replace MODEL_PATH
        # Need to handle both r"..." and "..." cases, but the notebook uses MODEL_PATH = r"..."
        modified_code = re.sub(
            r'MODEL_PATH\s*=\s*r?["\'].*?["\']', 
            f'MODEL_PATH = r"{model_path}"', 
            base_code
        )
        
        # To avoid the notebook calling plt.show() and blocking, we can patch plt.show
        # Actually it's fine, since we run without UI, but let's disable plt.show blocking
        modified_code = modified_code.replace('plt.show()', 'plt.close("all")')
        
        temp_script = f"temp_runner_{idx}.py"
        with open(temp_script, 'w', encoding='utf-8') as f:
            f.write(modified_code)
            
        # Find highest analiz folder before run
        existing_analiz = [d for d in os.listdir('.') if os.path.isdir(d) and d.startswith('analiz')]
        before_count = len(existing_analiz)
        
        try:
            # Run the script
            process = subprocess.Popen(
                ["python", temp_script],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace'
            )
            
            for line in process.stdout:
                evaluation_status["logs"].append(line.strip())
            process.wait()
            
            # Find the newly created analiz folder
            existing_analiz_after = [d for d in os.listdir('.') if os.path.isdir(d) and d.startswith('analiz')]
            new_folders = list(set(existing_analiz_after) - set(existing_analiz))
            
            if new_folders:
                new_folder = new_folders[0]
                # Write model info to the folder so we know which model it was
                with open(os.path.join(new_folder, 'model_info.txt'), 'w', encoding='utf-8') as f:
                    f.write(model_path)
            
        except Exception as e:
            evaluation_status["logs"].append(f"Error running model {model_path}: {str(e)}")
        finally:
            if os.path.exists(temp_script):
                os.remove(temp_script)
                
        evaluation_status["progress"] += 1
        
    evaluation_status["is_running"] = False
    evaluation_status["logs"].append("All evaluations completed!")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/evaluate', methods=['POST'])
def start_evaluate():
    global evaluation_status
    if evaluation_status["is_running"]:
        return jsonify({"error": "An evaluation is already running"}), 400
        
    data = request.json
    models = data.get('models', [])
    if not models:
        return jsonify({"error": "No models provided"}), 400
        
    thread = threading.Thread(target=run_evaluation, args=(models,))
    thread.start()
    return jsonify({"message": "Evaluation started successfully"})

@app.route('/api/status', methods=['GET'])
def get_status():
    global evaluation_status
    return jsonify(evaluation_status)

@app.route('/api/rename', methods=['POST'])
def rename_model():
    data = request.json
    folder = data.get('folder')
    new_name = data.get('new_name')
    if not folder or not new_name:
        return jsonify({"error": "Invalid data"}), 400
    
    custom_name_path = os.path.join(folder, 'custom_name.txt')
    try:
        with open(custom_name_path, 'w', encoding='utf-8') as f:
            f.write(new_name)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/results', methods=['GET'])
def get_results():
    results = []
    # Find all analiz folders
    analiz_folders = [d for d in os.listdir('.') if os.path.isdir(d) and d.startswith('analiz')]
    
    for folder in sorted(analiz_folders):
        model_name = folder
        model_info_path = os.path.join(folder, 'model_info.txt')
        custom_name_path = os.path.join(folder, 'custom_name.txt')
        
        if os.path.exists(custom_name_path):
            with open(custom_name_path, 'r', encoding='utf-8') as f:
                model_name = f.read().strip()
        elif os.path.exists(model_info_path):
            with open(model_info_path, 'r', encoding='utf-8') as f:
                model_name = f.read().strip()
                # Get just the filename
                model_name = os.path.basename(model_name)
        
        sonuclar_dir = os.path.join(folder, 'sonuclar')
        if not os.path.exists(sonuclar_dir):
            continue
            
        # Parse metrics_comparison.csv
        metrics_csv = os.path.join(sonuclar_dir, 'metrics_comparison.csv')
        metrics = {}
        
        # Parse metrics_by_size.csv
        metrics_by_size = []
        metrics_by_size_csv = os.path.join(sonuclar_dir, 'metrics_by_size.csv')
        if os.path.exists(metrics_by_size_csv):
            with open(metrics_by_size_csv, 'r', encoding='utf-8', errors='replace') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    metrics_by_size.append({
                        'Split': row.get('Split', ''),
                        'Boyut Grubu': row.get('Boyut Grubu', ''),
                        'Precision': float(row.get('Precision', 0) or 0),
                        'Recall': float(row.get('Recall', 0) or 0),
                        'F1': float(row.get('F1', 0) or 0),
                        'mAP50': float(row.get('mAP@0.5', 0) or 0)
                    })
        if os.path.exists(metrics_csv):
            with open(metrics_csv, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    split = row.get('Split', '')
                    metrics[split] = {
                        'Precision': float(row.get('Precision', 0)),
                        'Recall': float(row.get('Recall', 0)),
                        'mAP50': float(row.get('mAP@0.5', 0)),
                        'mAP5095': float(row.get('mAP@0.5:0.95', 0))
                    }
        
        # We also want to provide paths to the images so the frontend can load them
        images = [os.path.basename(p) for p in glob.glob(os.path.join(sonuclar_dir, '*.png'))]
        
        results.append({
            'folder': folder,
            'model_name': model_name,
            'metrics': metrics,
            'images': images, 'metrics_by_size': metrics_by_size
        })
        
    return jsonify(results)

@app.route('/api/image/<folder>/<filename>')
def serve_image(folder, filename):
    return send_from_directory(os.path.join(folder, 'sonuclar'), filename)

if __name__ == '__main__':
    app.run(debug=True, port=5000, use_reloader=False)


