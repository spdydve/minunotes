type OtpEmailInput = {
  email: string;
  otp: string;
};

export function createOtpEmailSender(options: {
  fromEmail?: string;
  environment?: string;
  send: (input: { to: string; from: string; subject: string; html: string; text: string }) => Promise<unknown>;
  log?: Pick<Console, 'info'>;
}) {
  return async ({ email, otp }: OtpEmailInput) => {
    if (!options.fromEmail) {
      if (options.environment === 'local') {
        options.log?.info(
          '[AUTH OTP] Local email delivery is disabled; inspect the verification table for development.'
        );
        return;
      }
      throw new Error('SES_FROM_EMAIL is required outside local development');
    }

    await options.send({
      to: email,
      from: options.fromEmail,
      subject: 'Your MinuNotes login code',
      html: `<p>Your MinuNotes verification code is: <strong>${otp}</strong></p><p>This code will expire soon.</p>`,
      text: `Your MinuNotes verification code is: ${otp}\n\nThis code will expire soon.`,
    });
  };
}
