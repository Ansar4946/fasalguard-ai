import type { ConsultationThread, FarmAssistantContext } from "./types";

export const consultationThreads: ConsultationThread[] = [
  { id: "consult-1", farmerName: "Ahmed Khan", caseId: "FG-8821", crop: "Cotton", district: "Multan", disease: "Cotton leaf curl", confidence: .86, priority: "urgent", unread: 2, messages: [
    { id: "m1", author: "farmer", text: "Assalam-o-Alaikum. The leaf curling is spreading in my North Field. Should I spray today?", createdAt: "2026-08-01T08:05:00Z", status: "sent" },
    { id: "m2", author: "system", text: "AI screening and three crop images were shared with this consultation.", createdAt: "2026-08-01T08:06:00Z", status: "sent", attachmentLabel: "Case FG-8821" },
    { id: "m3", author: "expert", text: "Wa-Alaikum-Salam. Please avoid spraying until we verify the cause. Inspect ten nearby plants and tell me whether whiteflies are visible under the leaves.", createdAt: "2026-08-01T08:12:00Z", status: "sent" },
    { id: "m4", author: "farmer", text: "I checked. Whiteflies are visible on several plants and the symptoms are mainly in one section.", createdAt: "2026-08-01T08:18:00Z", status: "sent" },
  ]},
  { id: "consult-2", farmerName: "Zainab Bibi", caseId: "FG-8816", crop: "Rice", district: "Sahiwal", disease: "Nutrient stress", confidence: .64, priority: "high", unread: 1, messages: [{ id:"m5",author:"farmer",text:"The lower leaves remain pale after irrigation.",createdAt:"2026-08-01T07:20:00Z",status:"sent" }] },
  { id: "consult-3", farmerName: "Malik Bashir", caseId: "FG-8819", crop: "Wheat", district: "Khanewal", disease: "Leaf rust", confidence: .78, priority: "normal", unread: 0, messages: [{ id:"m6",author:"expert",text:"Please upload a close image of the orange spots.",createdAt:"2026-07-31T15:00:00Z",status:"sent" }] },
];

export const assistantContext: FarmAssistantContext = { farmName:"Green Valley Farm", fieldName:"North Field", crop:"Cotton", growthStage:"Flowering", healthScore:72, risk:"High cotton leaf curl risk", activeAlerts:2, weather:"Partly cloudy · 24°C" };
