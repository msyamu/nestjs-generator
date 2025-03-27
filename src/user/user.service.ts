import { Injectable, Logger } from '@nestjs/common';
import { User } from '../generated/openapi';

@Injectable()
export class UserService {
  listUsers(limit: number, page: number, sort?: string): User[] {
    Logger.log(`Listing users with limit ${limit}, page ${page}, sort ${sort}`);
    return [
      {
        id: 1,
        name: 'John Doe',
      },
      {
        id: 2,
        name: 'Jane Doe',
      },
    ]
  }

  createUser(body: User): User {
    Logger.log(`Creating user with body ${JSON.stringify(body)}`);
    return body;
  }
}
