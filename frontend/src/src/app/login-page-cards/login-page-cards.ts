import { Component, Input  } from '@angular/core';

@Component({
  selector: 'app-login-page-cards',
  imports: [],
  templateUrl: './login-page-cards.html',
  styleUrl: './login-page-cards.css'
})
export class LoginPageCards {
  @Input() icon!: string;
  @Input() title!: string;
  @Input() description!: string;
}
