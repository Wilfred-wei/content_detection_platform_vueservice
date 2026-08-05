export type ServiceState = "ready" | "not_configured" | "busy" | "failed";
export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface ConversationSession {
  id: string;
  status: "idle" | "busy" | "failed";
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  error?: string;
}

export interface PublicConfig {
  provider: string;
  model: string;
  providerReady: boolean;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
