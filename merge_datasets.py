import json

# Load existing synthetic dataset
with open('dataset/asl_landmark_dataset.json', 'r') as f:
    existing = json.load(f)

# Load recorded dataset
with open('dataset/asl_recorded_dataset (2).json', 'r') as f:
    recorded = json.load(f)

# Merge samples
merged_samples = existing['samples'] + recorded['samples']

# Update meta
merged_meta = existing['meta']
merged_meta['name'] = 'Merged ASL Dataset (Synthetic + Recorded)'
merged_meta['total_samples'] = len(merged_samples)
merged_meta['description'] = 'Combined synthetic and real recorded samples for ASL recognition'

# Create merged dataset
merged = {
    'meta': merged_meta,
    'samples': merged_samples
}

# Save merged dataset
with open('dataset/merged_asl_dataset.json', 'w') as f:
    json.dump(merged, f, indent=2)

print(f"Merged dataset saved with {len(merged_samples)} total samples")