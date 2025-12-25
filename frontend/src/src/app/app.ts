import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoginSignup } from './login-signup/login-signup';
import {TopBar} from './top-bar/top-bar';
import {UsersPanel} from './users-panel/users-panel';
import { UserInfo } from './user-info/user-info';
import { MedGraph } from './med-graph/med-graph';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoginSignup, TopBar, UsersPanel, UserInfo, MedGraph],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('gp-frontend');
}
