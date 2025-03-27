import { Login } from '@openapi';
import { Request, Response } from 'express';

export interface AuthController {
  login(
    request: Request,
    response: Response,
    body: Login,
  ): Promise<void>;
}
