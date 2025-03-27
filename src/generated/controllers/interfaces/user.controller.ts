import { User } from '@openapi';

export interface UserController {
  listUsers(
    limit: number,
    page: number,
    sort?: string,
  ): Promise<User[]>;
  createUser(
    currentUserId: number,
    body: User,
  ): Promise<User>;
}
