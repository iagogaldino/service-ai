import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AgentJsonConfig,
  AgentsHierarchy,
  AgentsSummary,
} from './agents.types';

@Injectable({ providedIn: 'root' })
export class AgentsService {
  constructor(private readonly http: HttpClient) {}

  fetchSummary(): Promise<AgentsSummary> {
    return firstValueFrom(this.http.get<AgentsSummary>('/api/agents'));
  }

  fetchHierarchy(): Promise<AgentsHierarchy> {
    return firstValueFrom(this.http.get<AgentsHierarchy>('/api/agents/config'));
  }

  createAgent(groupId: string, payload: AgentJsonConfig): Promise<AgentJsonConfig> {
    return firstValueFrom(
      this.http.post<AgentJsonConfig>(`/api/agents/groups/${encodeURIComponent(groupId)}/agents`, payload),
    );
  }

  updateAgent(
    groupId: string,
    agentName: string,
    payload: AgentJsonConfig,
  ): Promise<AgentJsonConfig> {
    return firstValueFrom(
      this.http.put<AgentJsonConfig>(
        `/api/agents/groups/${encodeURIComponent(groupId)}/agents/${encodeURIComponent(agentName)}`,
        payload,
      ),
    );
  }

  deleteAgent(groupId: string, agentName: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(
        `/api/agents/groups/${encodeURIComponent(groupId)}/agents/${encodeURIComponent(agentName)}`,
      ),
    );
  }

  upsertOrchestrator(groupId: string, payload: AgentJsonConfig): Promise<AgentJsonConfig> {
    return firstValueFrom(
      this.http.put<AgentJsonConfig>(
        `/api/agents/groups/${encodeURIComponent(groupId)}/orchestrator`,
        payload,
      ),
    );
  }

  deleteOrchestrator(groupId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(
        `/api/agents/groups/${encodeURIComponent(groupId)}/orchestrator`,
      ),
    );
  }

  upsertFallback(payload: AgentJsonConfig): Promise<AgentJsonConfig> {
    return firstValueFrom(
      this.http.put<AgentJsonConfig>('/api/agents/fallback', payload),
    );
  }
}

