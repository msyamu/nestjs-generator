import { Injectable, Logger } from '@nestjs/common';
import { Login } from '../generated/openapi';

@Injectable()
export class AuthService {
  login(body: Login): void {
    Logger.log(`Logging in with username ${JSON.stringify(body)}`);
  }
  logout(): void {
    Logger.log(`Logging out`);
  }
}
