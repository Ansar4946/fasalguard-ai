# Crop vision model artifacts

The vision service never downloads or silently substitutes model weights. Mount a reviewed ONNX
classifier as `cotton-disease.onnx` and its manifest as `cotton-disease.json` (or override the two
`VISION_MODEL_*` environment variables).

Required manifest:

```json
{
  "modelId": "fasalguard-cotton-screening",
  "modelVersion": "1.0.0",
  "inputWidth": 224,
  "inputHeight": 224,
  "classes": [
    "COTTON_HEALTHY",
    "COTTON_LEAF_CURL_SUSPECTED",
    "UNKNOWN_OR_UNSUPPORTED"
  ],
  "mean": [0.485, 0.456, 0.406],
  "std": [0.229, 0.224, 0.225]
}
```

The class order must exactly match the model output. A model must be evaluated on a held-out field
dataset before deployment. Do not copy unverified internet weights into this directory.
