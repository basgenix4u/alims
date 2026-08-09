import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CookieService } from './cookie.service';
import { PasswordService } from './password.service';
import { SecretCipherService } from './secret-cipher.service';
import { TokenService } from './token.service';
import { TotpService } from './totp.service';

/**
 * TokenService is exported because JwtAuthGuard (registered globally) needs
 * it to verify access tokens, and StepUpGuard needs it to verify step-up
 * assertions — host modules applying @RequireStepUp() must import AuthModule.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, CookieService, TotpService, SecretCipherService],
  exports: [AuthService, TokenService, PasswordService],
})
export class AuthModule {}
