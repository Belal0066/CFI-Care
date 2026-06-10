import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

function shouldRedirectToGatewayError(error: HttpErrorResponse): boolean {
  return error.status === 0 || error.status >= 500;
}

export const gatewayErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        shouldRedirectToGatewayError(error) &&
        !router.url.startsWith('/error/')
      ) {
        router.navigate(['/error', error.status || 0], {
          queryParams: { from: req.urlWithParams },
          replaceUrl: true,
        });
      }

      return throwError(() => error);
    })
  );
};
