import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Login } from './login/login';
import {TopBar} from './top-bar/top-bar';
import {UsersPanel} from './users-panel/users-panel';
import { UserInfo } from './user-info/user-info';
import { MedGraph } from './med-graph/med-graph';
import { Dashboard } from './dashboard/dashboard';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Login, TopBar, UsersPanel, UserInfo, MedGraph, Dashboard],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('gp-frontend');
}
