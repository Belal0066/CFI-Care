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
