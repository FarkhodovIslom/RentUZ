export interface SendOtpParams {
  to: string;
  code: string;
  purpose: 'REGISTRATION' | 'LOGIN' | 'RESET';
}

/**
 * SMS provider abstraction (0_Phase.md §2). The console driver is dev-only;
 * a real provider (Eskiz / Play Mobile) is a pre-launch item — production
 * startup warns when SMS_PROVIDER=console.
 */
export interface SmsSender {
  send(params: SendOtpParams): Promise<void>;
}

/** Nest DI token for the SmsSender interface. */
export const SMS_SENDER = Symbol('SMS_SENDER');

export class ConsoleSmsSender implements SmsSender {
  async send({ to, code, purpose }: SendOtpParams): Promise<void> {
    // AUTH_OTP_DEV_MODE is startup-asserted false in production, so this line
    // can never leak codes there.
    console.log(`[sms:console] TO=${to} PURPOSE=${purpose} CODE=${code}`);
  }
}
