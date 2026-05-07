import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../services/auth/auth.service';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.css',
})
export class TopBar {
  constructor(
    private router: Router,
    private authService: AuthService,
  ) {}

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

  navigateToChatGPT(): void {
    this.router.navigate(['/chatgpt']);
  }

  navigateToAppointments(): void {
    this.router.navigate(['/appointment-test']);
  }

  navigateToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  navigateToPractitionerProfile(): void {
    this.router.navigate(['/practitioner-profile-test']);
  }
}
