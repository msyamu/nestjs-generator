import { Request, Response } from 'express';
import { Injectable } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from '../generated/controllers/interfaces/auth.controller';
import { Login } from '../generated/openapi';

@Injectable()
export class AuthControllerImpl implements AuthController {
  constructor(private readonly authService: AuthService) {}

  async login(
    _request: Request,
    _response: Response,
    body: Login,
  ): Promise<void> {
    return this.authService.login(body);
  }
}
