import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-chatgpt',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chatgpt.html',
  styleUrl: './chatgpt.css',
})
export class ChatGPT implements OnInit {
  constructor(private router: Router) {}

  ngOnInit(): void {
    // Redirect to ChatGPT
    //   window.open('https://chatgpt.com', '_blank');
    window.open('https://bws.taild935b3.ts.net/Clinical_Assistant', '_blank');

    // Navigate back to dashboard
    this.router.navigate(['/dashboard']);
  }
}
