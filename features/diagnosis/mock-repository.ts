import type { DiagnosisRepository, DiagnosisResult, ScanSession } from "./types";

const demoResult: DiagnosisResult = {
  id: "diagnosis-demo-001",
  condition: "Cotton leaf rust",
  scientificName: "AI-suspected fungal leaf disease",
  confidence: 0.92,
  severity: "moderate",
  reviewStatus: "ai_suspected",
  symptoms: ["Yellow-orange spots", "Leaf curling", "Irregular lesions", "Orange pustules"],
  explanation: "The image contains patterns that resemble a fungal leaf condition. Similar symptoms may also be caused by nutrient stress or another pathogen, so this is not a confirmed diagnosis.",
  alternatives: [{ condition: "Nutrient stress", confidence: 0.18 }, { condition: "Bacterial leaf spot", confidence: 0.11 }],
  immediateActions: ["Isolate and mark affected plants", "Inspect nearby leaves on both sides", "Avoid applying treatment until the action plan is reviewed", "Request expert verification if symptoms are spreading"],
  createdAt: "2026-08-01T08:30:00.000Z",
};

const memory = new Map<string, ScanSession>();

export const mockDiagnosisRepository: DiagnosisRepository = {
  async getSession(id) { return memory.get(id) ?? null; },
  async saveSession(session) { memory.set(session.id, session); return session; },
  async analyze() { return demoResult; },
};

export const initialScanSession: ScanSession = {
  id: "demo-scan",
  farmId: null,
  fieldId: null,
  crop: null,
  images: [],
  step: "field",
  progress: 0,
  result: null,
  updatedAt: "2026-08-01T08:00:00.000Z",
};
