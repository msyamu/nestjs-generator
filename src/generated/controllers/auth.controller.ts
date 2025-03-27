import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { Login } from '@openapi';
import { Request, Response } from 'express';
import { Auth } from '../../decorators/auth';
import { AuthController } from './interfaces/auth.controller';

@Controller('/auths')
export class AuthBaseController {
  constructor(
    @Inject('AuthController')
    private readonly authController: AuthController,
  ) {}

  @Post('login')
  @HttpCode(204)
  @Auth(false)
  async login(
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: Login,
  ): Promise<void> {
    return this.authController.login(
      request,
      response,
      body,
    );
  }
}
