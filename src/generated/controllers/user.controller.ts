import { Body, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { User } from '@openapi';
import { Auth } from '../../decorators/auth';
import { UserController } from './interfaces/user.controller';

@Controller('/users')
export class UserBaseController {
  constructor(
    @Inject('UserController')
    private readonly userController: UserController,
  ) {}

  @Get()
  async listUsers(
    @Query('limit') limit: number,
    @Query('page') page: number,
    @Query('sort') sort?: string,
  ): Promise<User[]> {
    return this.userController.listUsers(
      limit,
      page,
      sort,
    );
  }
  @Post()
  @HttpCode(201)
  async createUser(
    @Auth.UserId() currentUserId: number,
    @Body() body: User,
  ): Promise<User> {
    return this.userController.createUser(
      currentUserId,
      body,
    );
  }
}
