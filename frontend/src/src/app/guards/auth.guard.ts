import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth/auth.service';
import { map, take } from 'rxjs/operators';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.ensureSessionInitializedIfAuth().pipe(
    take(1),
    map(ok => {
      if (ok) {
        return true;
      } else {
        router.navigate(['/oauth2/start?rd=/dashboard']);
        return false;
      }
    })
  );
};
