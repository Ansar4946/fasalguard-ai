export type MessageAuthor = "farmer" | "expert" | "assistant" | "system";
export type DeliveryStatus = "sending" | "sent" | "failed";

export interface ChatMessage {
  id: string; author: MessageAuthor; text: string; createdAt: string;
  status: DeliveryStatus; attachmentLabel?: string;
}

export interface ConsultationThread {
  id: string; farmerName: string; caseId: string; crop: string; district: string;
  disease: string; confidence: number; priority: "urgent" | "high" | "normal";
  unread: number; messages: ChatMessage[];
}

export interface FarmAssistantContext {
  farmName: string; fieldName: string; crop: string; growthStage: string;
  healthScore: number; risk: string; activeAlerts: number; weather: string;
}
