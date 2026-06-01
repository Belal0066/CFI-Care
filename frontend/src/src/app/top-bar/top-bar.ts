import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../services/auth/auth.service';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.css',
})
export class TopBar {
  constructor(private authService: AuthService) {}

private openKcAction(kcAction: 'UPDATE_PASSWORD' | 'CONFIGURE_TOTP'): void {
  const currentUser = this.authService.getCurrentUser();
  const loginHint = currentUser?.email?.trim() || '';

  const params = new URLSearchParams();
  params.set('kc_action', kcAction);
  params.set('rd', `/dashboard?kc_action=${encodeURIComponent(kcAction)}`);

  if (loginHint) {
    params.set('login_hint', loginHint);
  }

  window.location.assign(`/auth/start?${params.toString()}`);
}


// private openKcAction(kcAction: 'UPDATE_PASSWORD' | 'CONFIGURE_TOTP'): void {
//   const kcRealm = 'CFI-Care';
//   const kcClientId = 'oauth2-proxy';
//   const rd = `/dashboard?kc_action=${encodeURIComponent(kcAction)}`;
//   const oauth2Callback = `${window.location.origin}/oauth2/callback?rd=${encodeURIComponent(rd)}`;
//   const kcAuthUrl =
//     `${environment.keycloakHost}/realms/${kcRealm}/protocol/openid-connect/auth` +
//     `?response_type=code` +
//     `&client_id=${encodeURIComponent(kcClientId)}` +
//     `&redirect_uri=${encodeURIComponent(oauth2Callback)}` +
//     `&scope=openid` +
//     `&kc_action=${encodeURIComponent(kcAction)}`;

//   window.location.assign(kcAuthUrl);
// }
//  private openKcAction(kcAction: 'UPDATE_PASSWORD' | 'CONFIGURE_TOTP'): void {
//   const rd = `/dashboard?kc_action=${encodeURIComponent(kcAction)}`;
//   window.location.assign(`/oauth2/start?rd=${encodeURIComponent(rd)}`);
// }

openPasswordChange(): void {
  this.openKcAction('UPDATE_PASSWORD');
}

openTOTP(): void {
  this.openKcAction('CONFIGURE_TOTP');
}


  logout(): void {
    localStorage.clear();
    this.authService.logout(); // no subscribe; method redirects browser
  }

  logoutAll(): void {
    localStorage.clear();
    this.authService.logoutAll().subscribe({
      next: () => window.location.assign('/auth/logout'),
      error: () => window.location.assign('/auth/logout'),
    });
  }
}
