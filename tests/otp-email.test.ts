import { describe, expect, it, vi } from 'vitest';
import { createOtpEmailSender } from '../src/api/lib/otp-email';

describe('OTP email sender', () => {
  it('never logs an OTP when local delivery is disabled', async () => {
    const info = vi.fn();
    const send = vi.fn();
    const sender = createOtpEmailSender({ environment: 'local', send, log: { info } });

    await sender({ email: 'person@example.com', otp: '123456' });

    expect(send).not.toHaveBeenCalled();
    expect(JSON.stringify(info.mock.calls)).not.toContain('123456');
  });

  it('throws outside local when the sender identity is missing', async () => {
    const sender = createOtpEmailSender({ environment: 'production', send: vi.fn() });
    await expect(sender({ email: 'person@example.com', otp: '123456' })).rejects.toThrow('SES_FROM_EMAIL');
  });

  it('propagates email delivery failures', async () => {
    const sender = createOtpEmailSender({
      environment: 'production',
      fromEmail: 'MinuNotes <notes@example.com>',
      send: vi.fn().mockRejectedValue(new Error('SES unavailable')),
    });
    await expect(sender({ email: 'person@example.com', otp: '123456' })).rejects.toThrow('SES unavailable');
  });
});
