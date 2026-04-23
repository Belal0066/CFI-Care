import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Login } from './login/login';
import {TopBar} from './top-bar/top-bar';
import {UsersPanel} from './users-panel/users-panel';
import { UserInfo } from './user-info/user-info';
import { MedGraph } from './med-graph/med-graph';
import { Dashboard } from './dashboard/dashboard';
import { ChatSection } from './chat-section/chat-section';
import { DoctorProfileComponent } from './doctor-profile/doctor-profile';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Login, TopBar, UsersPanel, UserInfo, MedGraph, 
    Dashboard, ChatSection, DoctorProfileComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('gp-frontend');
}
