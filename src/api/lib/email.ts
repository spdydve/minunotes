import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

const ses = new SESv2Client({ region: process.env.SES_REGION || process.env.AWS_REGION || "us-east-1" });

export async function sendEmail(input: {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}) {
  const result = await ses.send(new SendEmailCommand({
    Destination: { ToAddresses: [input.to] },
    FromEmailAddress: input.from,
    Content: {
      Simple: {
        Subject: { Data: input.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: input.html, Charset: "UTF-8" },
          Text: { Data: input.text, Charset: "UTF-8" },
        },
      },
    },
  }));

  return { messageId: result.MessageId };
}
