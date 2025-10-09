export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

export interface AtomHandlerContext {
  atomId: string;
  atomType: string;
  atomTitle: string;
  sessionId: string;
  updateAtomSettings: (atomId: string, settings: any) => void;
  setMessages: (updater: (prev: Message[]) => Message[]) => void;
}

export interface AtomHandlerResponse {
  success: boolean;
  messages?: Message[];
  atomSettings?: any;
  error?: string;
}

export interface AtomHandler {
  handleSuccess: (data: any, context: AtomHandlerContext) => Promise<AtomHandlerResponse>;
  handleFailure: (data: any, context: AtomHandlerContext) => Promise<AtomHandlerResponse>;
}

// Enhanced utility interfaces for better type safety
export interface EnvironmentContext {
  client_name: string;
  app_name: string;
  project_name: string;
}

export interface FileNameHelper {
  getFilename: (filePath: string) => string;
  getFullPath: (filename: string, envContext: EnvironmentContext) => string;
}

export interface ResponseProcessor {
  createMessage: (content: string, sender: 'user' | 'ai') => Message;
  processSmartResponse: (data: any) => string;
  handleError: (error: any, context: string) => Message;
}

export interface PerformEndpointConfig {
  endpoint: string;
  method: 'POST' | 'GET';
  headers: Record<string, string>;
  bodyType: 'json' | 'form' | 'urlencoded';
}
