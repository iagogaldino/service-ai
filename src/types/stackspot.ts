/**
 * Tipos auxiliares para configurar o proxy do StackSpot
 */

export interface StackSpotProxyEndpoint {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  tunnel?: boolean;
}

export interface StackSpotProxyConfig {
  http?: StackSpotProxyEndpoint;
  https?: StackSpotProxyEndpoint;
  noProxy?: string[];
  strategy?: string;
}

