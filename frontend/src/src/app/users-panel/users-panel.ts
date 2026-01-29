import { Component } from '@angular/core';
import { Users } from '../users/users';

@Component({
  selector: 'app-users-panel',
  standalone: true,
  imports: [Users],
  templateUrl: './users-panel.html',
  styleUrl: './users-panel.css',
})
export class UsersPanel {}
