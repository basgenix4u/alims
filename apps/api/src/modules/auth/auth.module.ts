import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CookieService } from './cookie.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/**
 * TokenService is exported because JwtAuthGuard (registered globally) needs
 * it to verify access tokens.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, CookieService],
  exports: [AuthService, TokenService, PasswordService],
})
export class AuthModule {}
