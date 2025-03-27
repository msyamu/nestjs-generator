import { Test, TestingModule } from '@nestjs/testing';
import { UserControllerImpl } from './user.controller';
import { UserService } from './user.service';
import { UserBaseController } from '../generated/controllers/user.controller';
import { UserController } from '../generated/controllers/interfaces/user.controller';
import { User } from 'src/generated/openapi';

describe('UserController', () => {
  let userController: UserController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [UserBaseController],
      providers: [
        UserService,
        UserControllerImpl,
        {
          provide: 'UserController',
          useExisting: UserControllerImpl,
        },
      ],
    }).compile();

    userController = app.get<UserController>(UserBaseController);
  });

  describe('root', () => {
    it('should return user', async () => {
      const body: User = {
        id: 1,
        name: 'John Doe',
      }
      const currentUserId = 1;
      const result = await userController.createUser(currentUserId, body);
      expect(result).toEqual(body);
    });
  });
});
