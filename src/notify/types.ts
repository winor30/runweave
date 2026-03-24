export interface NotifyEvent {
  type: "completed" | "failed" | "needs_input";
  workflow: string;
  sessionId: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface Notifier {
  send(event: NotifyEvent): Promise<void>;
}
