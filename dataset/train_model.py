#!/usr/bin/env python3
"""
train_model.py — VisualAI ASL ML Training Pipeline
====================================================
Loads your recorded JSON dataset, trains multiple classifiers,
shows accuracy report, and exports the best model as TF.js + pickle.

Usage:
  pip install scikit-learn numpy tensorflowjs
  python train_model.py --data path/to/your_recorded.json
  python train_model.py --data asl_landmark_dataset.json --model tfjs
"""

import json
import sys
import argparse
import pathlib
import numpy as np
from datetime import datetime

# ── Feature Extraction ────────────────────────────────────────────────────────

def landmarks_to_features(landmarks):
    """
    Convert 21 MediaPipe landmarks to a flat normalised feature vector.
    Strategy:
      - Translate so wrist (lm[0]) = origin
      - Scale by palm length = dist(lm[0], lm[9])
      - Return flat [x0,y0,z0, x1,y1,z1, ... x20,y20,z20] = 63 dims
    """
    if len(landmarks) != 21:
        raise ValueError(f"Expected 21 landmarks, got {len(landmarks)}")

    pts = np.array([[p["x"], p["y"], p["z"]] for p in landmarks], dtype=np.float32)

    # Translate to wrist origin
    pts -= pts[0]

    # Scale by palm length (wrist → middle MCP)
    scale = np.linalg.norm(pts[9]) or 1.0
    pts /= scale

    return pts.flatten()  # 63-dim vector


def load_dataset(json_path):
    """Load recorded JSON and return X, y arrays."""
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    samples = data.get("samples", data) if isinstance(data, dict) else data
    print(f"\n  Loaded {len(samples)} samples from {json_path}")

    X, y = [], []
    skipped = 0
    for s in samples:
        try:
            feat = landmarks_to_features(s["landmarks"])
            X.append(feat)
            y.append(s["label"].upper())
        except Exception as e:
            skipped += 1

    if skipped:
        print(f"  Skipped {skipped} malformed samples")

    X = np.array(X, dtype=np.float32)
    y = np.array(y)

    classes, counts = np.unique(y, return_counts=True)
    print(f"  Classes  : {list(classes)}")
    print(f"  Samples  : {dict(zip(classes, counts))}")
    print(f"  Features : {X.shape[1]} dims per sample")
    return X, y


# ── Models ────────────────────────────────────────────────────────────────────

def train_knn(X_train, y_train, k=5):
    from sklearn.neighbors import KNeighborsClassifier
    m = KNeighborsClassifier(n_neighbors=k, metric="euclidean", weights="distance")
    m.fit(X_train, y_train)
    return m

def train_svm(X_train, y_train):
    from sklearn.svm import SVC
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    m = Pipeline([
        ("scaler", StandardScaler()),
        ("svc", SVC(kernel="rbf", C=10, gamma="scale", probability=True)),
    ])
    m.fit(X_train, y_train)
    return m

def train_rf(X_train, y_train):
    from sklearn.ensemble import RandomForestClassifier
    m = RandomForestClassifier(n_estimators=300, max_depth=None,
                                min_samples_leaf=1, random_state=42, n_jobs=-1)
    m.fit(X_train, y_train)
    return m

def train_mlp(X_train, y_train):
    from sklearn.neural_network import MLPClassifier
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    m = Pipeline([
        ("scaler", StandardScaler()),
        ("mlp", MLPClassifier(hidden_layer_sizes=(256, 128, 64),
                              activation="relu",
                              max_iter=1000,
                              early_stopping=True,
                              validation_fraction=0.1,
                              random_state=42)),
    ])
    m.fit(X_train, y_train)
    return m


# ── Evaluation ────────────────────────────────────────────────────────────────

def evaluate(name, model, X_test, y_test):
    from sklearn.metrics import accuracy_score, classification_report
    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"\n  {name}")
    print(f"  {'─'*50}")
    print(f"  Accuracy : {acc*100:.1f}%")
    print(classification_report(y_test, y_pred, zero_division=0))
    return acc


# ── TF.js Export ──────────────────────────────────────────────────────────────

def export_tfjs(model, X_train, y_train, classes, out_dir):
    """Train a Keras model and export as TF.js for browser use."""
    try:
        import tensorflow as tf
        import tensorflowjs as tfjs
        from sklearn.preprocessing import LabelEncoder, StandardScaler
    except ImportError:
        print("\n  ! TF.js export skipped — install: pip install tensorflowjs")
        return

    le = LabelEncoder()
    le.fit(classes)
    y_enc = le.transform(y_train)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_train)

    n_classes = len(classes)
    n_features = X_train.shape[1]

    # Build model
    inp = tf.keras.Input(shape=(n_features,), name="landmarks")
    x = tf.keras.layers.Dense(256, activation="relu")(inp)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.Dropout(0.3)(x)
    x = tf.keras.layers.Dense(128, activation="relu")(x)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.Dropout(0.2)(x)
    x = tf.keras.layers.Dense(64, activation="relu")(x)
    out = tf.keras.layers.Dense(n_classes, activation="softmax", name="predictions")(x)

    keras_model = tf.keras.Model(inp, out)
    keras_model.compile(optimizer="adam",
                        loss="sparse_categorical_crossentropy",
                        metrics=["accuracy"])

    print("\n  Training Keras model for TF.js export...")
    keras_model.fit(X_scaled, y_enc, epochs=80, batch_size=32,
                    validation_split=0.15, verbose=0,
                    callbacks=[tf.keras.callbacks.EarlyStopping(patience=10, restore_best_weights=True)])

    out_path = out_dir / "tfjs_model"
    out_path.mkdir(parents=True, exist_ok=True)
    tfjs.converters.save_keras_model(keras_model, str(out_path))

    # Save scaler params and label map for the browser
    meta = {
        "classes": list(classes),
        "scaler_mean": scaler.mean_.tolist(),
        "scaler_std": scaler.scale_.tolist(),
        "n_features": int(n_features),
        "n_classes": int(n_classes),
        "created": datetime.now().isoformat(),
    }
    with open(out_path / "model_meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"  TF.js model saved to: {out_path}")
    return out_path


# ── Pickle Export ─────────────────────────────────────────────────────────────

def export_pickle(model, classes, out_dir):
    import pickle
    out_path = out_dir / "asl_model.pkl"
    with open(out_path, "wb") as f:
        pickle.dump({"model": model, "classes": list(classes)}, f)
    print(f"  Pickle saved to: {out_path}")


# ── JSON Lightweight Export ───────────────────────────────────────────────────

def export_knn_json(model, classes, out_dir):
    """
    Export KNN training data as a compact JSON that the browser can load
    and run inference with (no pip/tensorflow required).
    """
    from sklearn.neighbors import KNeighborsClassifier
    from sklearn.preprocessing import StandardScaler

    # Re-fit a scaler
    scaler = StandardScaler()

    if hasattr(model, "named_steps"):
        # It's a pipeline — extract components
        inner_model = model.named_steps.get("knn") or model.named_steps.get("svc") or list(model.named_steps.values())[-1]
    else:
        inner_model = model

    # If KNN, save training vectors
    if isinstance(inner_model, KNeighborsClassifier):
        X_train = inner_model._fit_X.tolist()
        y_train = [classes[i] for i in inner_model._y]
        export = {
            "type": "knn",
            "k": inner_model.n_neighbors,
            "classes": list(classes),
            "X": X_train,
            "y": y_train,
            "created": datetime.now().isoformat(),
        }
        out_path = out_dir / "asl_knn_model.json"
        with open(out_path, "w") as f:
            json.dump(export, f)
        print(f"  KNN JSON saved to: {out_path} ({len(X_train)} vectors, {len(classes)} classes)")
        return out_path
    else:
        print("  ! KNN JSON export only supported for KNN models")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="VisualAI ASL Training Pipeline")
    parser.add_argument("--data",     type=str, required=True,  help="Path to recorded JSON dataset")
    parser.add_argument("--model",    type=str, default="all",  help="Model: knn | svm | rf | mlp | all | tfjs")
    parser.add_argument("--test",     type=float, default=0.2,  help="Test split ratio (default: 0.2)")
    parser.add_argument("--out",      type=str, default=None,   help="Output directory for model files")
    parser.add_argument("--knn-k",    type=int, default=5,      help="KNN: number of neighbours (default: 5)")
    args = parser.parse_args()

    from sklearn.model_selection import train_test_split

    # ── Load ──
    json_path = pathlib.Path(args.data)
    if not json_path.exists():
        print(f"Error: file not found: {json_path}")
        sys.exit(1)

    out_dir = pathlib.Path(args.out) if args.out else json_path.parent / "trained_models"
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n  VisualAI ASL Training Pipeline")
    print(f"  {'='*40}")

    X, y = load_dataset(json_path)
    classes = np.unique(y)

    if len(X) < 5:
        print(f"\n  ERROR: Only {len(X)} samples — need at least 5 per class to train.")
        print("  Record more samples using the Recorder page, then export again.")
        sys.exit(1)

    # Warn if very few samples
    for cls in classes:
        cnt = np.sum(y == cls)
        if cnt < 5:
            print(f"  WARNING: Letter '{cls}' has only {cnt} samples — consider recording more.")

    # ── Split ──
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=args.test, stratify=y, random_state=42)
    print(f"\n  Train: {len(X_train)}  |  Test: {len(X_test)}")

    # ── Train ──
    best_model, best_acc, best_name = None, 0, ""
    models_to_train = {
        "all":  ["knn", "svm", "rf", "mlp"],
        "knn":  ["knn"],
        "svm":  ["svm"],
        "rf":   ["rf"],
        "mlp":  ["mlp"],
        "tfjs": ["mlp"],
    }.get(args.model.lower(), ["knn"])

    trainer_map = {
        "knn": lambda: train_knn(X_train, y_train, k=args.knn_k),
        "svm": lambda: train_svm(X_train, y_train),
        "rf":  lambda: train_rf(X_train, y_train),
        "mlp": lambda: train_mlp(X_train, y_train),
    }

    for name in models_to_train:
        print(f"\n  Training {name.upper()}...")
        try:
            m = trainer_map[name]()
            acc = evaluate(name.upper(), m, X_test, y_test)
            if acc > best_acc:
                best_acc, best_model, best_name = acc, m, name.upper()
        except Exception as e:
            print(f"  ! {name} failed: {e}")

    # ── Export ──
    print(f"\n  {'='*40}")
    print(f"  Best model: {best_name}  ({best_acc*100:.1f}% accuracy)")
    print(f"  Exporting to: {out_dir}")

    if best_model:
        export_pickle(best_model, classes, out_dir)
        export_knn_json(
            train_knn(X, y, k=args.knn_k),  # re-train on ALL data for deployment
            classes, out_dir
        )

    if args.model.lower() == "tfjs":
        export_tfjs(best_model, X, y, classes, out_dir)

    # ── Summary JSON ──
    summary = {
        "best_model": best_name,
        "accuracy_pct": round(best_acc * 100, 2),
        "total_samples": int(len(X)),
        "classes": list(classes),
        "feature_dims": int(X.shape[1]),
        "created": datetime.now().isoformat(),
    }
    with open(out_dir / "training_summary.json", "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\n  Summary saved.")

    print(f"""
  ╔══════════════════════════════════════════╗
  ║  Training Complete!                      ║
  ║  Best: {best_name:<10} {best_acc*100:>6.1f}% accuracy       ║
  ║  Output: {str(out_dir)[:32]:<32} ║
  ╚══════════════════════════════════════════╝

  Next steps:
    1. Copy trained_models/asl_knn_model.json → frontend/public/
    2. Run: python train_model.py --data ... --model tfjs
       to export a TensorFlow.js neural network
    3. The app will auto-detect and use the trained model
""")


if __name__ == "__main__":
    main()
