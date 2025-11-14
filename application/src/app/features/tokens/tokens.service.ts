import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { LlmProvider, TokensResponse } from './tokens.types';

@Injectable({ providedIn: 'root' })
export class TokensService {
  private readonly http = inject(HttpClient);

  loadTokens(provider?: LlmProvider): Observable<TokensResponse> {
    let params = new HttpParams();
    if (provider) {
      params = params.set('llmProvider', provider);
    }
    return this.http.get<TokensResponse>('/api/tokens', { params });
  }
}

