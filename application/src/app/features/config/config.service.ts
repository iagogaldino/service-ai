import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  SaveConfigRequest,
  ConfigResponse,
  SaveConfigResponse,
} from './config.types';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly http = inject(HttpClient);

  loadConfig(): Observable<ConfigResponse> {
    return this.http.get<ConfigResponse>('/api/config');
  }

  saveConfig(payload: SaveConfigRequest): Observable<SaveConfigResponse> {
    return this.http.post<SaveConfigResponse>('/api/config', payload);
  }
}

