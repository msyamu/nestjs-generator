import { Request, Response } from 'express';
import { Controller, Injectable, Logger, Post, Session } from '@nestjs/common';
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

// Additional controller for using special decorators
@Controller('/auths')
export class AdditionalAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('logout')
  async logout(@Session() session: Record<string, any>): Promise<void> {
    Logger.log(`Logging out with session: ${JSON.stringify(session)}`);
    return this.authService.logout();
  }
}
