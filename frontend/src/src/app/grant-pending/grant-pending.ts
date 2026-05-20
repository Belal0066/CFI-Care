import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HandshakeService } from '../services/handshake/handshake.service';
import { PendingGrant } from '../models/grant.model';

interface PendingItem extends PendingGrant {
  responding: boolean;
  durationMinutes: number;
  done: boolean;
  result: 'approved' | 'denied' | null;
}

@Component({
  selector: 'app-grant-pending',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './grant-pending.html',
  styleUrl: './grant-pending.css',
})
export class GrantPendingComponent implements OnInit {
  items: PendingItem[] = [];
  loading = true;
  error: string | null = null;

  constructor(private handshake: HandshakeService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.error = null;
    this.handshake.getPendingGrants().subscribe({
      next: ({ pending }) => {
        this.items = pending.map((p) => ({
          ...p,
          responding: false,
          durationMinutes: 60,
          done: false,
          result: null,
        }));
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load pending requests.';
        this.loading = false;
      },
    });
  }

  approve(item: PendingItem) {
    if (item.responding || item.durationMinutes < 1) return;
    item.responding = true;
    this.handshake.respondToGrant(item.handshakeId, true, item.durationMinutes).subscribe({
      next: () => {
        item.done = true;
        item.result = 'approved';
        item.responding = false;
      },
      error: () => {
        item.responding = false;
      },
    });
  }

  deny(item: PendingItem) {
    if (item.responding) return;
    item.responding = true;
    this.handshake.respondToGrant(item.handshakeId, false).subscribe({
      next: () => {
        item.done = true;
        item.result = 'denied';
        item.responding = false;
      },
      error: () => {
        item.responding = false;
      },
    });
  }

  get pendingCount(): number {
    return this.items.filter((i) => !i.done).length;
  }
}
