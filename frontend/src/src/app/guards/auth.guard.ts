import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth/auth.service';
import { map, take } from 'rxjs/operators';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.checkAuthStatus().pipe(
    take(1),
    map(response => {
      if (response.authenticated) {
        return true;
      } else {
        router.navigate(['/login']);
        return false;
      }
    })
  );
};
