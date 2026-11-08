"""Execute one packaged AIC case and write new prediction and verification artifacts."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument('--package', required=True)
parser.add_argument('--case', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--device', choices=['cpu', 'cuda'], default='cpu')
args = parser.parse_args()
package = Path(args.package).resolve()
output = Path(args.output).resolve()
source = package / 'demo_inputs' / (args.case + '_input.json')
if source.parent.resolve() != (package / 'demo_inputs').resolve() or not source.is_file():
    raise ValueError('Unknown packaged case')
output.mkdir(parents=True, exist_ok=True)
os.environ.update(OMP_NUM_THREADS='1', OPENBLAS_NUM_THREADS='1', MKL_NUM_THREADS='1', AIC_ROOT=str(package / ('runtime_' + args.device)))
subprocess.run([sys.executable, str(package / 'bootstrap_portable.py'), args.device], check=True)
import numpy as np
sys.path.insert(0, str(Path(os.environ['AIC_ROOT']) / 'work/evidence_upgrade_20261007'))
from lean_entry import Predictor
info = json.loads(source.read_text(encoding='utf-8'))
with np.load(source.with_suffix('.npz'), allow_pickle=False) as data:
    row = {key: data[key] for key in ['fields', 'geom', 'mask', 'times']}
    values = data['values']
row.update(id=info['id'], q=info['q'])
print('Loading model', flush=True)
started = time.perf_counter()
model = Predictor(Path(os.environ['AIC_ROOT']) / 'system.json')
loaded = time.perf_counter()
print('Running inference', flush=True)
prediction, diagnostics = model.predict(row, values)
finished = time.perf_counter()
if not np.isfinite(prediction).all():
    raise ValueError('Prediction contains non-finite values')
np.savez_compressed(output / 'prediction.npz', prediction=prediction)
with np.load(package / 'expected_predictions' / (info['id'] + '.npz'), allow_pickle=False) as data:
    expected = data['prediction']
delta = float(np.max(np.abs(prediction - expected)))
report = dict(case_id=info['id'], device=args.device, load_seconds=loaded-started, inference_seconds=finished-loaded, max_abs_difference_from_packaged_prediction=delta, replay_verified=delta < 2e-4, prediction_shape=list(prediction.shape), prediction_sha256=hashlib.sha256((output / 'prediction.npz').read_bytes()).hexdigest(), evaluation_scope='Numerical replay verification against packaged prediction; not CFD accuracy or model optimization.')
(output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
(output / 'report.md').write_text(f"# AIC 推理复核\n\n工况：{info['id']}\n\n推理耗时：{finished-loaded:.3f} 秒\n\n与交付包预测的最大绝对差：{delta:.8g}\n\n本报告验证推理复现一致性，不代表模型优化或相对 CFD 真值精度评测。\n", encoding='utf-8')
print(json.dumps(report, ensure_ascii=False), flush=True)
