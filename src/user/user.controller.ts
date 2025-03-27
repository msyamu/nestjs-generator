import { Injectable, Logger } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from '../generated/controllers/interfaces/user.controller';
import { User } from '../generated/openapi';

@Injectable()
export class UserControllerImpl implements UserController {
  constructor(private readonly userService: UserService) {}

  async listUsers(limit: number, page: number, sort?: string): Promise<User[]> {
    return this.userService.listUsers(limit, page, sort);
  }

  async createUser(currentUserId: number, body: User): Promise<User> {
    Logger.log(`Creating user with currentUserId ${currentUserId}`);
    return this.userService.createUser(body);
  }
}
