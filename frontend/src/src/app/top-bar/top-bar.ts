import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth/auth.service';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.css',
})
export class TopBar {
  constructor(private router: Router, private authService: AuthService) {}

  logout(): void {
    localStorage.clear();
    this.authService.logout().subscribe(() => {
      this.router.navigate(['/login']);
    });
    // this.router.navigate(['/login']);
  }

  logoutAll(): void {
    localStorage.clear();
    this.authService.logoutAll().subscribe({
      next: () => {
        // If there's no redirect URL
        this.router.navigate(['/login']);
      },
      error: () => {
        this.router.navigate(['/login']);
      }
    });
  }
}
