export const CLARIFICATION_REQUEST = "clarification_request" as const;
export const CLARIFICATION_RESPONSE = "clarification_response" as const;

export type ClarificationEventType =
  | typeof CLARIFICATION_REQUEST
  | typeof CLARIFICATION_RESPONSE
  | "clarification_status"
  | "clarification_update";

export type ClarificationStatus = "paused_for_clarification" | "resumed";

export interface ClarificationRequestMessage {
  type: typeof CLARIFICATION_REQUEST;
  requestId: string;
  message: string;
  expected_fields?: string[];
  payload?: Record<string, any>;
  status?: ClarificationStatus;
  session_id?: string;
  atom_id?: string;
}

export interface ClarificationResponseMessage {
  type: typeof CLARIFICATION_RESPONSE;
  requestId: string;
  message: string;
  values?: Record<string, any>;
  session_id?: string;
  chat_id?: string;
}

export interface ClarificationStatusUpdate {
  type: "clarification_status" | "clarification_update";
  requestId: string;
  session_id?: string;
  atom_id?: string;
  status: ClarificationStatus;
  message?: string;
}

export type ClarificationMessage =
  | ClarificationRequestMessage
  | ClarificationResponseMessage
  | ClarificationStatusUpdate;
