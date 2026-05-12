```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    console.log("API HIT");
    console.log("KEY EXISTS:", !!process.env.RESEND_API_KEY);

    const result = await resend.emails.send({
      from: 'Saarthi <contact@saarthilife.com>',
      to: 'healwithsaarthi@gmail.com',
      subject: 'TEST EMAIL',
      html: `
        <h1>Resend Test</h1>
        <p>If you see this, Resend works.</p>
      `,
    });

    console.log("EMAIL RESULT:", result);

    return res.status(200).json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error("FULL ERROR:");
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Unknown error",
      error,
    });
  }
}
```
