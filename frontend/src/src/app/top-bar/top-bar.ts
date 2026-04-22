import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-top-bar',
  imports: [],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.css'
})
export class TopBar {
  constructor(private router: Router) {}

  logout() {
    // 🔧 BACKEND PLACEHOLDER: clear auth token/session here
    this.router.navigate(['/login']);
  }
}