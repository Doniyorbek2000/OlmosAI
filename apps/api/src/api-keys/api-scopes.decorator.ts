import { SetMetadata } from '@nestjs/common';

export const API_SCOPES_KEY = 'api_scopes';

/**
 * Declares the scopes an endpoint requires when called with an API key. UI
 * (JWT/session) requests are not scope-limited.
 */
export const ApiScopes = (...scopes: string[]) => SetMetadata(API_SCOPES_KEY, scopes);
