export type LlmProvider = 'stackspot' | 'openai';

export interface ConfigResponse {
  llmProvider: LlmProvider;
  port?: number;
  lastUpdated?: string | null;
  openai: {
    configured: boolean;
    apiKeyPreview?: string | null;
  };
  stackspot: {
    configured: boolean;
    clientIdPreview?: string | null;
    realm?: string;
    proxy?: StackspotProxySummary;
  };
}

export interface StackspotProxySummary {
  enabled: boolean;
  http?: ProxyEndpointSummary;
  https?: ProxyEndpointSummary & { tunnel?: boolean };
  noProxy?: string[];
  strategy?: string;
}

export interface ProxyEndpointSummary {
  host?: string;
  port?: number | null;
  username?: string;
  hasPassword?: boolean;
}

export interface SaveConfigRequest {
  llmProvider: LlmProvider;
  port?: number | null;
  openaiApiKey?: string;
  stackspotClientId?: string;
  stackspotClientSecret?: string;
  stackspotRealm?: string;
  stackspotProxy?: StackspotProxyPayload | null;
}

export interface ConfigRequest extends SaveConfigRequest {}

export interface StackspotProxyPayload {
  enabled: boolean;
  http?: ProxyEndpointPayload;
  https?: ProxyEndpointPayload & { tunnel?: boolean };
  noProxy?: string[] | string;
  strategy?: string;
}

export interface ProxyEndpointPayload {
  host?: string;
  port?: number | string | null;
  username?: string;
  password?: string;
  clearPassword?: boolean;
}

export interface SaveConfigResponse {
  success: boolean;
  message: string;
  llmProvider: LlmProvider;
  credentialPreview?: string;
  error?: string;
}

