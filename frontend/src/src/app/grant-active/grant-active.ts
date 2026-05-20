import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HandshakeService } from '../services/handshake/handshake.service';
import { Grant } from '../models/grant.model';

interface GrantItem extends Grant {
  revoking: boolean;
  revoked: boolean;
}

@Component({
  selector: 'app-grant-active',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './grant-active.html',
  styleUrl: './grant-active.css',
})
export class GrantActiveComponent implements OnInit {
  items: GrantItem[] = [];
  loading = true;
  error: string | null = null;

  constructor(private handshake: HandshakeService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.error = null;
    this.handshake.getActiveGrants().subscribe({
      next: ({ grants }) => {
        this.items = grants.map((g) => ({ ...g, revoking: false, revoked: false }));
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load active grants.';
        this.loading = false;
      },
    });
  }

  revoke(item: GrantItem) {
    if (item.revoking) return;
    item.revoking = true;
    this.handshake.revokeGrant(item.practitionerId).subscribe({
      next: () => {
        item.revoked = true;
        item.revoking = false;
      },
      error: () => {
        item.revoking = false;
      },
    });
  }

  minutesRemaining(expiresAt: string): number {
    return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 60000));
  }

  get activeCount(): number {
    return this.items.filter((i) => !i.revoked).length;
  }
}
