import { Module } from '@nestjs/common';
import { AuthControllerImpl } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthBaseController } from '../generated/controllers/auth.controller';

@Module({
  controllers: [AuthBaseController],
  providers: [
    AuthService,
    AuthControllerImpl,
    {
      provide: 'AuthController',
      useExisting: AuthControllerImpl,
    },
  ],
})
export class AuthModule {}
