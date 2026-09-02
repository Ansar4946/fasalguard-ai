# Crop disease screening

FasalGuard performs **crop image screening**, not laboratory confirmation. Satellite anomalies are
never converted directly into disease labels. A disease-pattern result requires ground-level farmer
images and remains unconfirmed until expert review where policy requires it.

## Runtime flow

1. The client uploads private JPEG, PNG, or WebP evidence through the media abstraction.
2. NestJS verifies ownership, purpose, checksum, dimensions, and decodability.
3. A BullMQ worker performs quality checks for darkness, overexposure, and likely blur.
4. The selected `VisionDiagnosisProvider` screens every submitted image.
5. Per-image probabilities are aggregated and stored with model ID, model version, provider, score,
   alternatives, timestamp, and the private raw provider response.
6. Unknown/unsupported results and low scores are routed to expert review. The stored diagnosis is
   never marked firm from model output alone.

## Providers

### Roboflow

Set `VISION_PROVIDER=roboflow`, credentials, model/version, and
`ROBOFLOW_MODEL_TASK=classification|detection`. Images are base64 encoded server-side and provider
credentials never reach the browser. Classification defaults to `classify.roboflow.com`.

### Self-hosted ONNX

The FastAPI service exposes `/v1/vision/quality`, `/v1/vision/predict`, and
`/v1/vision/models`. A reviewed ONNX artifact and manifest must be mounted under `/models`; see
`services/geospatial-ai/models/README.md`. Missing weights return `MODEL_NOT_CONFIGURED`. The service
does not download or substitute unverified community weights.

## Required evaluation before production

- Split by farm/source/plant rather than random near-duplicate images.
- Maintain a Pakistan field-photo holdout set.
- Report per-class precision, recall, F1, confusion matrix, calibration error, and false negatives.
- Include `UNKNOWN_OR_UNSUPPORTED` and `NOT_COTTON` examples.
- Record expert correction without overwriting the original model prediction.
- Do not display a model softmax value as a clinical probability; the UI calls it a model score.
