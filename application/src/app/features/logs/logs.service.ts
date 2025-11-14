import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { LogsResponse, LlmProvider } from './logs.types';

@Injectable({ providedIn: 'root' })
export class LogsService {
  private readonly http = inject(HttpClient);

  loadLogs(provider?: LlmProvider): Observable<LogsResponse> {
    let params = new HttpParams();
    if (provider) {
      params = params.set('llmProvider', provider);
    }
    return this.http.get<LogsResponse>('/api/logs', { params });
  }
}

