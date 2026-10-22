import { loadOnnxRuntime } from "./onnx-runtime.mjs";
import { File } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { decode } from "jpeg-js";
import { sha256 } from "./store";
import {
  validateManifest,
  pixelsToTensor,
  predictionFromOutput,
} from "./inference.mjs";

export type ModelManifest = {
  modelVersionId: string;
  modelId: string;
  version: string;
  sha256: string;
  cropId: string;
  license: string;
  evaluationReference: string;
  runtime: "onnx";
  width: number;
  height: number;
  classes: string[];
  mean: number[];
  std: number[];
  layout: "NCHW";
  output: "logits" | "probabilities";
  resize: "stretch";
};
// Deliberately empty: no licensed/evaluated weights are available in this checkout.
// Populate through a reviewed application release; never download arbitrary model URLs.
export const installedModels: { manifest: ModelManifest; uri: string }[] = [];

export async function inferLocal(
  imageUri: string,
  model: { manifest: ModelManifest; uri: string },
  cropId: string,
) {
  const m = validateManifest(model.manifest);
  if (m.cropId !== cropId) throw new Error("CROP_NOT_SUPPORTED");
  const file = new File(model.uri);
  if (!file.exists || file.size <= 0 || file.size > 100 * 1024 * 1024)
    throw new Error("MODEL_NOT_AVAILABLE");
  const bytes = await file.bytes();
  if ((await sha256(bytes)) !== m.sha256)
    throw new Error("MODEL_HASH_MISMATCH");
  // Loaded lazily so a build without the native module still boots (see onnx-runtime.mjs).
  const { InferenceSession, Tensor } = loadOnnxRuntime(
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- deliberate lazy load
    () => require("onnxruntime-react-native"),
  );
  // Native session creation must succeed before any result can be returned.
  const session = await InferenceSession.create(bytes);
  let resized: { uri: string } | null = null;
  try {
    if (session.inputNames.length !== 1 || session.outputNames.length !== 1)
      throw new Error("MODEL_TENSOR_CONTRACT_INVALID");
    resized = await manipulateAsync(
      imageUri,
      [{ resize: { width: m.width, height: m.height } }],
      { compress: 1, format: SaveFormat.JPEG },
    );
    const decoded = decode(await new File(resized.uri).bytes(), {
      useTArray: true,
      maxResolutionInMP: 1,
      maxMemoryUsageInMB: 32,
    });
    if (decoded.width !== m.width || decoded.height !== m.height)
      throw new Error("IMAGE_SHAPE_INVALID");
    const tensor = new Tensor("float32", pixelsToTensor(decoded.data, m), [
      1,
      3,
      m.height,
      m.width,
    ]);
    const output = await session.run({ [session.inputNames[0]]: tensor });
    const values = output[session.outputNames[0]];
    if (
      values.type !== "float32" ||
      values.dims.length !== 2 ||
      values.dims[0] !== 1 ||
      values.dims[1] !== m.classes.length
    )
      throw new Error("MODEL_OUTPUT_INVALID");
    return predictionFromOutput(values.data as Float32Array, m);
  } finally {
    await session.release();
    if (resized) {
      const temp = new File(resized.uri);
      if (temp.exists) temp.delete();
    }
  }
}
