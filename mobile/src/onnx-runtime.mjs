// Lazy, guarded access to the native ONNX runtime. onnxruntime-react-native calls
// NativeModules.Onnxruntime.install() while it is imported, which throws when the native module is
// not linked into the build. Importing it at app start therefore crashed the whole app. It is now
// loaded only when on-device inference is attempted, and failure is reported as a stable error code.
export function loadOnnxRuntime(requireRuntime) {
  try {
    const runtime = requireRuntime();
    if (!runtime?.InferenceSession || !runtime?.Tensor) throw new Error("incomplete");
    return runtime;
  } catch {
    throw new Error("NATIVE_RUNTIME_UNAVAILABLE");
  }
}
