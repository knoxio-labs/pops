/**
 * Shared *arr base HTTP client for Radarr/Sonarr APIs.
 *
 * Both services share the same API pattern: base URL + /api/v3/ + endpoint,
 * authenticated via X-Api-Key header.
 */
import { ArrApiError, type ArrSystemStatus } from "./types.js";

export class ArrBaseClient {
  protected readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  /** Make an authenticated GET request to the *arr API. */
  protected async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}/api/v3${path}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Api-Key": this.apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new ArrApiError(`${response.status} ${response.statusText} — ${url}`, response.status);
    }

    return (await response.json()) as T;
  }

  /** Make an authenticated POST request to the *arr API. */
  protected async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v3${path}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-Api-Key": this.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new ArrApiError(`${response.status} ${response.statusText} — ${url}`, response.status);
    }

    return (await response.json()) as T;
  }

  /** Make an authenticated PUT request to the *arr API. */
  protected async put<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v3${path}`;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "X-Api-Key": this.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new ArrApiError(`${response.status} ${response.statusText} — ${url}`, response.status);
    }

    return (await response.json()) as T;
  }

  /** Test the connection by fetching system status. */
  async testConnection(): Promise<ArrSystemStatus> {
    return this.get<ArrSystemStatus>("/system/status");
  }
}
