import { Module } from '@nestjs/common';
import { UserControllerImpl } from './user.controller';
import { UserService } from './user.service';
import { UserBaseController } from '../generated/controllers/user.controller';

@Module({
  controllers: [UserBaseController],
  providers: [
    UserService,
    UserControllerImpl,
    {
      provide: 'UserController',
      useExisting: UserControllerImpl,
    },
  ],
})
export class UserModule {}
