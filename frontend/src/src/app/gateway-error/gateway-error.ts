import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-gateway-error',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './gateway-error.html',
  styleUrl: './gateway-error.css',
})
export class GatewayErrorComponent {
  statusCode = 502;
  statusLabel = 'Bad Gateway';
  title = 'Backend unavailable';
  message =
    'The backend did not respond correctly. Try again in a moment or go back to the dashboard.';
  hint = 'A retry may succeed once the backend recovers.';
  sourceUrl = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {
    this.statusCode = Number(this.route.snapshot.paramMap.get('status') ?? 502);
    this.sourceUrl = this.route.snapshot.queryParamMap.get('from') ?? '';
    this.applyCopy(this.statusCode);
  }

  retry(): void {
    this.router.navigate(['/dashboard']);
  }

  logout(): void {
    window.location.assign(this.buildLogoutUrl());
  }

  private buildLogoutUrl(): string {
    const origin = window.location.origin;
    const frontendStart = `${origin}/oauth2/start?rd=%2Fdashboard`;
    const keycloakBase = `${origin}/keycloak`;
    const kcLogout =
      `${keycloakBase}/realms/CFI-Care/protocol/openid-connect/logout` +
      `?post_logout_redirect_uri=${encodeURIComponent(frontendStart)}` +
      `&client_id=oauth2-proxy`;

    return `/oauth2/sign_out?rd=${encodeURIComponent(kcLogout)}`;
  }

  private applyCopy(statusCode: number): void {
    if (statusCode === 0) {
      this.statusLabel = 'Network error';
      this.title = 'Network unavailable';
      this.message =
        'The browser could not reach the backend. Check your connection and try again.';
      this.hint = 'This usually means the request never reached the server.';
      return;
    }

    if (statusCode === 500) {
      this.statusLabel = 'Internal Server Error';
      this.title = 'Something went wrong on the server';
      this.message =
        'The backend returned an unexpected error while processing the request.';
      this.hint = 'Refresh or retry after the server-side issue is resolved.';
      return;
    }

    if (statusCode === 502) {
      this.statusLabel = 'Bad Gateway';
      this.title = 'Backend unavailable';
      this.message =
        'The gateway could not get a valid response from the backend.';
      this.hint = 'This often means a downstream service is down or unreachable.';
      return;
    }

    if (statusCode === 503) {
      this.statusLabel = 'Service Unavailable';
      this.title = 'Service temporarily unavailable';
      this.message =
        'The backend is temporarily unable to handle the request.';
      this.hint = 'Try again in a few moments.';
      return;
    }

    if (statusCode === 504) {
      this.statusLabel = 'Gateway Timeout';
      this.title = 'Request timed out';
      this.message =
        'The backend took too long to respond and the request was stopped.';
      this.hint = 'Try again or check whether a downstream service is slow.';
      return;
    }

    this.statusLabel = `HTTP ${statusCode}`;
    this.title = 'Request failed';
    this.message =
      'The backend could not complete the request. Try again in a moment.';
    this.hint =
      'If this keeps happening, the server or gateway likely needs attention.';
  }
}
