"use client";

import { useState } from "react";
import { AssistantChat } from "@/components/conversations/assistant-chat";
import { FarmerAssistant } from "@/components/conversations/farmer-assistant";

/** A voice transcript only fills the question box; the farmer must press Ask to send it. */
export function AssistantWorkspace() {
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  return (
    <div className="space-y-6">
      <AssistantChat prefill={prefill} />
      <FarmerAssistant
        onTranscript={(text) => setPrefill((current) => ({ text, nonce: (current?.nonce ?? 0) + 1 }))}
      />
    </div>
  );
}
