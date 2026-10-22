// Pure pixel preprocessing/output validation. No network or filename-based prediction path.
export function validateManifest(m) {
  if (
    !m ||
    m.runtime !== "onnx" ||
    m.layout !== "NCHW" ||
    m.resize !== "stretch" ||
    !/^[a-f0-9]{64}$/.test(m.sha256) ||
    !m.modelVersionId ||
    !m.cropId ||
    !m.license ||
    !m.evaluationReference ||
    !Number.isInteger(m.width) ||
    !Number.isInteger(m.height) ||
    m.width < 32 ||
    m.width > 512 ||
    m.height < 32 ||
    m.height > 512 ||
    !Array.isArray(m.classes) ||
    m.classes.length < 2 ||
    m.classes.length > 200 ||
    new Set(m.classes).size !== m.classes.length ||
    m.classes.some((x) => typeof x !== "string" || !x || x.length > 200) ||
    !Array.isArray(m.mean) ||
    !Array.isArray(m.std) ||
    m.mean.length !== 3 ||
    m.std.length !== 3 ||
    !m.mean.every(Number.isFinite) ||
    !m.std.every((x) => Number.isFinite(x) && x > 0) ||
    !["logits", "probabilities"].includes(m.output)
  ) {
    throw new Error("MODEL_MANIFEST_INVALID");
  }
  return m;
}

export function pixelsToTensor(rgba, manifest) {
  const m = validateManifest(manifest),
    size = m.width * m.height;
  if (rgba.length !== size * 4) throw new Error("IMAGE_SHAPE_INVALID");
  const values = new Float32Array(size * 3);
  for (let i = 0; i < size; i++)
    for (let channel = 0; channel < 3; channel++) {
      const index = channel * size + i;
      values[index] =
        (rgba[i * 4 + channel] / 255 - m.mean[channel]) / m.std[channel];
      if (!Number.isFinite(values[index]))
        throw new Error("MODEL_PREPROCESSING_INVALID");
    }
  return values;
}

export function predictionFromOutput(values, manifest) {
  const m = validateManifest(manifest);
  if (
    values.length !== m.classes.length ||
    !Array.from(values).every(Number.isFinite)
  )
    throw new Error("MODEL_OUTPUT_INVALID");
  let scores = Array.from(values);
  if (m.output === "logits") {
    const max = Math.max(...scores);
    scores = scores.map((x) => Math.exp(x - max));
    const sum = scores.reduce((a, b) => a + b, 0);
    scores = scores.map((x) => x / sum);
  } else if (
    scores.some((x) => x < 0 || x > 1) ||
    Math.abs(scores.reduce((a, b) => a + b, 0) - 1) > 0.001
  )
    throw new Error("MODEL_OUTPUT_INVALID");
  const top = Math.max(...scores);
  // Abstain on a tie for first place: picking the first class would present a coin flip as a result.
  // null means "no prediction"; the capture is then saved without one, like a missing model.
  if (scores.filter((x) => Math.abs(x - top) <= 1e-6).length > 1) return null;
  const index = scores.indexOf(top);
  return {
    modelVersionId: m.modelVersionId,
    modelSha256: m.sha256,
    label: m.classes[index],
    score: scores[index],
  };
}
