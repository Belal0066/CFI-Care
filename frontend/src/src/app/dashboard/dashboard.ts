import { Component } from '@angular/core';
import { TopBar } from "../top-bar/top-bar";
import { UsersPanel } from "../users-panel/users-panel";
import { UserInfo } from "../user-info/user-info";

@Component({
  selector: 'app-dashboard',
  imports: [TopBar, UsersPanel, UserInfo],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard {

}
