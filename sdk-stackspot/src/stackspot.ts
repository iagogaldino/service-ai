/**
 * Cliente principal do StackSpot SDK
 * 
 * Interface similar ao OpenAI SDK
 */

import { StackSpotClient } from './client';
import { StackSpotConfig } from './types';
import { Assistants } from './resources/assistants';
import { Threads } from './resources/threads';

export class StackSpot {
  private client: StackSpotClient;
  public beta: {
    assistants: Assistants;
    threads: Threads;
  };

  constructor(config: StackSpotConfig) {
    this.client = new StackSpotClient(config);
    
    // Inicializa namespaces
    this.beta = {
      assistants: new Assistants(this.client),
      threads: new Threads(this.client),
    };
  }

  /**
   * Obtém o cliente HTTP interno (para uso avançado)
   */
  getClient(): StackSpotClient {
    return this.client;
  }
}
