import nodemailer, { Transporter } from 'nodemailer';
import { Resend } from 'resend';
import { ENV } from '../config/env';

let cachedResendClient: Resend | null = null;
let mockTransporter: Transporter | null = null;

/**
 * Allows automated test suites to inject a mock transporter without sending real emails.
 */
export const setMockTransporter = (transporter: Transporter | null) => {
  mockTransporter = transporter;
};

export const getMockTransporter = (): Transporter | null => mockTransporter;

/**
 * Returns a Resend client instance dynamically using the latest environment configuration.
 */
export const getResendClient = (apiKeyOverride?: string): Resend | null => {
  const apiKey = apiKeyOverride || ENV.RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!cachedResendClient) {
    cachedResendClient = new Resend(apiKey);
  }
  return cachedResendClient;
};

const getCleanCredentials = () => {
  const rawUser = (ENV.SMTP_USER || process.env.SMTP_USER || '').replace(/['"]/g, '').trim();
  const angleMatch = rawUser.match(/<([^>]+)>/);
  const userCandidate = angleMatch ? angleMatch[1].trim() : rawUser;
  const emailRegexMatch = userCandidate.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const cleanUser = (emailRegexMatch ? emailRegexMatch[1] : userCandidate)
    .trim()
    .replace(/@gamil\.com$/i, '@gmail.com');

  const cleanPass = (ENV.SMTP_PASS || process.env.SMTP_PASS || '').replace(/\s+/g, '').replace(/['"]/g, '').trim();
  const isGmail =
    (ENV.SMTP_HOST || process.env.SMTP_HOST || '').toLowerCase().includes('gmail') ||
    cleanUser.toLowerCase().includes('gmail');
  return { cleanUser, cleanPass, isGmail };
};

export const getPrimaryTransporter = (): Transporter | null => {
  if (mockTransporter) return mockTransporter;

  const { cleanUser, cleanPass, isGmail } = getCleanCredentials();
  if (!cleanUser || !cleanPass) return null;

  const port = Number(ENV.SMTP_PORT || process.env.SMTP_PORT) || 465;
  const isSecure = port === 465;
  const host = isGmail ? 'smtp.gmail.com' : (ENV.SMTP_HOST || process.env.SMTP_HOST || 'smtp.gmail.com');

  return nodemailer.createTransport({
    host,
    port,
    secure: isSecure,
    requireTLS: !isSecure,
    auth: { user: cleanUser, pass: cleanPass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
};

export const getFallbackTlsTransporter = (): Transporter | null => {
  if (mockTransporter) return mockTransporter;

  const { cleanUser, cleanPass, isGmail } = getCleanCredentials();
  if (!cleanUser || !cleanPass) return null;

  const primaryPort = Number(ENV.SMTP_PORT || process.env.SMTP_PORT) || 465;
  const fallbackPort = primaryPort === 465 ? 587 : 465;
  const isSecure = fallbackPort === 465;
  const host = isGmail ? 'smtp.gmail.com' : (ENV.SMTP_HOST || process.env.SMTP_HOST || 'smtp.gmail.com');

  return nodemailer.createTransport({
    host,
    port: fallbackPort,
    secure: isSecure,
    requireTLS: !isSecure,
    auth: { user: cleanUser, pass: cleanPass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
};

export interface ISendOtpEmailOptions {
  to: string;
  name?: string;
  otp: string;
  expiresInMinutes?: number;
}

export interface ISendWelcomeEmailOptions {
  to: string;
  name?: string;
  specialization?: string;
  loginUrl?: string;
}

const escapeHtml = (str: string): string =>
  str.replace(/[&<>'"]/g, (tag) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));

/**
 * Robust Email Dispatcher:
 * 1. Prioritizes Mock Transporter in test environments if injected
 * 2. Prioritizes Resend via HTTPS (Port 443) - immune to cloud hosting SMTP firewall blocks (Render Free Tier, etc.)
 * 3. Tries Brevo (Sendinblue) via HTTPS (Port 443)
 * 4. Tries Primary SMTP Transporter (Port 465 SSL or configured port)
 * 5. Falls back to Secondary SMTP Transporter (Port 587 STARTTLS)
 */
const dispatchEmail = async ({
  to,
  subject,
  html,
  text = '',
  contextTag = 'General',
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  contextTag?: string;
}): Promise<{ success: boolean; messageId?: string; devPreview?: boolean; error?: string }> => {
  if (!to || typeof to !== 'string' || !to.includes('@')) {
    console.warn(`[Email Service] Invalid recipient address provided: "${to}"`);
    return { success: false, error: `Invalid recipient address: "${to}"` };
  }

  // 0. Mock Transporter (Unit tests)
  if (mockTransporter) {
    try {
      const info = await mockTransporter.sendMail({
        from: ENV.EMAIL_FROM || 'DocPresc <noreply@docpresc.com>',
        to,
        subject,
        html,
        text,
      });
      return { success: true, messageId: info?.messageId || 'mock-msg-id-123' };
    } catch (err: any) {
      console.error(`[Email Service] Mock transporter simulated failure:`, err.message);
      return { success: false, error: err.message };
    }
  }

  let lastError = '';

  // 1. Resend API via HTTPS (Port 443) - immune to cloud hosting SMTP firewall blocks
  const resendApiKey = ENV.RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const client = getResendClient(resendApiKey);
      if (client) {
        // Resend requires verified domains or onboarding@resend.dev during testing.
        // If EMAIL_FROM contains a public domain like @gmail.com or @yahoo.com,
        // using it directly will fail with "Domain not verified".
        // In that case, use onboarding@resend.dev with the configured display name.
        let fromAddress = ENV.EMAIL_FROM || process.env.EMAIL_FROM || 'DocPresc <onboarding@resend.dev>';
        const isPublicWebmail = /@(gmail|yahoo|hotmail|outlook)\.com/i.test(fromAddress);
        if (isPublicWebmail || !fromAddress.includes('@')) {
          const nameMatch = fromAddress.match(/^([^<]+)/);
          const displayName = nameMatch ? nameMatch[1].trim() : 'DocPresc';
          fromAddress = `${displayName} <onboarding@resend.dev>`;
        }

        const response = await client.emails.send({
          from: fromAddress,
          to,
          subject,
          html,
          text,
        });

        if (response.error) {
          const errMsg = response.error.message || JSON.stringify(response.error);
          if (errMsg.includes('You can only send testing emails to your own email address')) {
            lastError = 'In Resend free test mode, emails can only be sent to the account owner (7232.badhan@gmail.com). To send to any recipient, add BREVO_API_KEY to Render or verify your domain in Resend.';
          } else {
            lastError = errMsg;
          }
          console.error(`[Email Service] Resend API error sending ${contextTag} to ${to}:`, response.error);
        } else if (response.data?.id) {
          console.log(`[Email Service] Sent ${contextTag} email via Resend to ${to} (Message ID: ${response.data.id})`);
          return { success: true, messageId: response.data.id };
        }
      }
    } catch (error: any) {
      lastError = error.message;
      console.error(`[Email Service] Exception sending ${contextTag} via Resend:`, error.message);
    }
  }

  // 2. Brevo (Sendinblue) HTTPS API (Port 443 - works on Render without custom domain restrictions)
  const brevoApiKey = ENV.BREVO_API_KEY || process.env.BREVO_API_KEY;
  if (brevoApiKey) {
    try {
      const { cleanUser } = getCleanCredentials();
      const rawFrom = ENV.EMAIL_FROM || process.env.EMAIL_FROM || '';
      const fromNameMatch = rawFrom.match(/^([^<]+)<([^>]+)>/);
      const senderName = fromNameMatch ? fromNameMatch[1].trim() : 'DocPresc';
      const senderEmail = fromNameMatch ? fromNameMatch[2].trim() : (cleanUser || 'onboarding@resend.dev');

      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoApiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: to }],
          subject,
          htmlContent: html,
          textContent: text,
        }),
      });

      const brevoData: any = await brevoRes.json();
      if (brevoRes.ok && brevoData.messageId) {
        console.log(`[Email Service] Sent ${contextTag} email via Brevo to ${to} (Message ID: ${brevoData.messageId})`);
        return { success: true, messageId: brevoData.messageId };
      } else {
        lastError = brevoData?.message || JSON.stringify(brevoData);
        console.error(`[Email Service] Brevo API error for ${to}:`, brevoData);
      }
    } catch (error: any) {
      lastError = error.message;
      console.error(`[Email Service] Exception sending ${contextTag} via Brevo:`, error.message);
    }
  }

  // 3. Primary SMTP Transporter (Port 465 SSL or configured port)
  const primaryTransporter = getPrimaryTransporter();
  if (primaryTransporter) {
    try {
      const { cleanUser } = getCleanCredentials();
      const fromAddress = cleanUser ? `Doc Presc <${cleanUser}>` : (ENV.EMAIL_FROM || process.env.EMAIL_FROM || 'DocPresc <noreply@docpresc.com>');
      const info = await primaryTransporter.sendMail({
        from: fromAddress,
        to,
        subject,
        html,
        text,
      });

      console.log(`[Email Service] Sent ${contextTag} email via Primary SMTP to ${to} (Message ID: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      const code = error.code || error.message || 'UNKNOWN';
      const isNetworkTimeout = ['ETIMEDOUT', 'ECONNREFUSED', 'ESOCKETTIMEDOUT', 'ENOTFOUND'].includes(error.code);
      if (isNetworkTimeout) {
        console.error(
          `[Email Service] Primary SMTP network connection failed (${code}). Cloud firewalls (e.g. Render Free Tier) block ports 25, 465, and 587. Attempting fallback port...`
        );
      } else {
        console.error(`[Email Service] Primary SMTP failed for ${contextTag} (${code}): ${error.message}`);
      }
    }
  }

  // 4. Fallback TLS SMTP Transporter (Port 587 STARTTLS)
  const fallbackTransporter = getFallbackTlsTransporter();
  if (fallbackTransporter) {
    try {
      const { cleanUser } = getCleanCredentials();
      const fromAddress = cleanUser ? `Doc Presc <${cleanUser}>` : (ENV.EMAIL_FROM || process.env.EMAIL_FROM || 'DocPresc <noreply@docpresc.com>');
      const info = await fallbackTransporter.sendMail({
        from: fromAddress,
        to,
        subject,
        html,
        text,
      });

      console.log(`[Email Service] Sent ${contextTag} email via Fallback SMTP to ${to} (Message ID: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      const code = error.code || error.message || 'UNKNOWN';
      const isNetworkTimeout = ['ETIMEDOUT', 'ECONNREFUSED', 'ESOCKETTIMEDOUT', 'ENOTFOUND'].includes(error.code);
      if (isNetworkTimeout) {
        console.error(
          `[Email Service] Fallback SMTP connection failed (${code}). Both SMTP ports are blocked on this host. For free cloud hosting, configure RESEND_API_KEY (HTTPS port 443).`
        );
      } else {
        console.error(`[Email Service] Fallback TLS SMTP failed for ${contextTag} (${code}): ${error.message}`);
      }
    }
  }

  // If all email providers failed, log diagnostic warning
  console.warn(`[Email Service] Outbound delivery failed for ${to} (${contextTag}). No working email provider responded.`);
  return { success: false, error: lastError || 'Outbound delivery failed. No working email provider responded.' };
};

/**
 * Public generic transactional email dispatcher
 */
export const sendEmail = async (options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  contextTag?: string;
}): Promise<{ success: boolean; messageId?: string; devPreview?: boolean; error?: string }> => {
  return dispatchEmail({
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text || '',
    contextTag: options.contextTag || 'General',
  });
};

export const sendPasswordResetOtpEmail = async ({
  to,
  name,
  otp,
  expiresInMinutes = 10,
}: ISendOtpEmailOptions): Promise<{ success: boolean; messageId?: string; devPreview?: boolean; error?: string }> => {
  const recipientName = escapeHtml(name || 'Doctor');
  const subject = `Your DocPresc Password Reset OTP: ${otp}`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px 0; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #008ba3 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0 0; font-size: 13px; color: #cbd5e1; }
    .body { padding: 32px 28px; }
    .greeting { font-size: 16px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }
    .message { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
    .otp-box { background: #f0fdfa; border: 2px dashed #008ba3; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .otp-code { font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #008ba3; font-family: 'Courier New', Courier, monospace; margin: 8px 0; }
    .otp-expiry { font-size: 12px; color: #64748b; font-weight: 600; }
    .warning-box { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 6px; font-size: 12px; color: #92400e; margin: 24px 0; line-height: 1.5; }
    .footer { background: #f8fafc; padding: 20px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>DocPresc</h1>
      <p>Doctor Digital Prescription Management Platform</p>
    </div>
    <div class="body">
      <div class="greeting">Hello ${recipientName},</div>
      <p class="message">
        We received a request to reset the password for your DocPresc account. Use the 6-digit One-Time Password (OTP) below to complete your password reset:
      </p>

      <div class="otp-box">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #0f766e; font-weight: 700;">Password Reset OTP</div>
        <div class="otp-code">${otp}</div>
        <div class="otp-expiry">⏱ Valid for ${expiresInMinutes} minutes only</div>
      </div>

      <div class="warning-box">
        <strong>Security Notice:</strong> Never share this OTP with anyone. DocPresc support staff will never ask you for your verification code.
      </div>

      <p class="message" style="font-size: 12px; color: #64748b; margin-bottom: 0;">
        If you did not initiate this request, you can safely disregard this email. Your password will remain unchanged.
      </p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} DocPresc &bull; High-Performance Clinical Management System
    </div>
  </div>
</body>
</html>
`;

  const textContent = `
DocPresc Password Reset OTP
----------------------------------------
Hello ${recipientName},

Your 6-digit password reset OTP is: ${otp}

This OTP will expire in ${expiresInMinutes} minutes.

Security Notice: Never share this OTP with anyone.
If you did not request a password reset, you can safely ignore this email.
`;

  return dispatchEmail({
    to,
    subject,
    html: htmlContent,
    text: textContent,
    contextTag: 'Password Reset OTP',
  });
};

/**
 * Dispatch an onboarding Welcome Email when a new doctor registers
 */
export const sendWelcomeEmail = async ({
  to,
  name,
  specialization,
  loginUrl = 'https://doc-presc.vercel.app/login',
}: ISendWelcomeEmailOptions): Promise<{ success: boolean; messageId?: string; devPreview?: boolean; error?: string }> => {
  const recipientName = escapeHtml(name || 'Doctor');
  const specText = specialization ? escapeHtml(specialization) : 'Physician';
  const subject = `Welcome to DocPresc, Dr. ${recipientName}!`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px 0; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #008ba3 100%); padding: 36px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
    .header p { margin: 8px 0 0 0; font-size: 14px; color: #cbd5e1; }
    .body { padding: 32px 28px; }
    .greeting { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
    .intro { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
    
    .account-card { background: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 10px; padding: 18px 20px; margin: 20px 0; }
    .account-card-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #0f766e; margin-bottom: 10px; }
    .account-row { display: flex; justify-content: space-between; font-size: 13px; color: #334155; margin-bottom: 6px; }
    .account-row:last-child { margin-bottom: 0; }
    .account-label { color: #64748b; font-weight: 500; }
    .account-value { font-weight: 600; color: #0f172a; }

    .feature-grid { margin: 24px 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; }
    .feature-item { margin-bottom: 16px; }
    .feature-item:last-child { margin-bottom: 0; }
    .feature-title { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 3px; }
    .feature-desc { font-size: 13px; color: #64748b; line-height: 1.5; margin: 0; }

    .cta-container { text-align: center; margin: 32px 0; }
    .cta-button { display: inline-block; background: #008ba3; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0, 139, 163, 0.25); }
    
    .tips-box { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 18px; border-radius: 6px; font-size: 13px; color: #92400e; margin: 24px 0; line-height: 1.5; }
    
    .footer { background: #f8fafc; padding: 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; line-height: 1.5; }
    .footer a { color: #008ba3; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to DocPresc</h1>
      <p>High-Performance Digital Prescription & Practice Management</p>
    </div>
    <div class="body">
      <div class="greeting">Dear Dr. ${recipientName},</div>
      <p class="intro">
        Welcome to <strong>DocPresc</strong>! Your doctor account has been successfully registered. You now have immediate access to our digital prescription pad, patient record history, and chamber management suite.
      </p>
      <div style="background: #e0f2fe; border-left: 4px solid #008ba3; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px; font-size: 13px; color: #0e7490; font-weight: 500; line-height: 1.5;">
        🌟 DocPresc-এ আপনাকে স্বাগতম! আপনার অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে। এখন আপনি ডিজিটাল প্রেসক্রিপশন তৈরি, চেম্বার শিডিউল এবং পেশেন্ট রেকর্ড নিরাপদে পরিচালনা করতে পারবেন।
      </div>

      <div class="account-card">
        <div class="account-card-title">Account Summary</div>
        <div class="account-row"><span class="account-label">Doctor Name:</span> <span class="account-value">Dr. ${recipientName}</span></div>
        <div class="account-row"><span class="account-label">Specialization:</span> <span class="account-value">${specText}</span></div>
        <div class="account-row"><span class="account-label">Registered Email:</span> <span class="account-value">${escapeHtml(to)}</span></div>
        <div class="account-row"><span class="account-label">Account Status:</span> <span class="account-value" style="color: #16a34a;">● Active</span></div>
      </div>

      <div class="feature-grid">
        <div class="feature-item">
          <div class="feature-title">⚡ High-Speed Digital Prescriptions</div>
          <p class="feature-desc">Search thousands of branded and generic medicines with dosage auto-complete, vitals, and complaints.</p>
        </div>
        <div class="feature-item">
          <div class="feature-title">🏥 Chamber & Schedule Organization</div>
          <p class="feature-desc">Organize clinic chambers, appointment schedules, and custom prescription headers.</p>
        </div>
        <div class="feature-item">
          <div class="feature-title">📋 Comprehensive Patient History</div>
          <p class="feature-desc">Securely access previous prescriptions, consultations, and medical records on any device.</p>
        </div>
      </div>

      <div class="cta-container">
        <a href="${escapeHtml(loginUrl)}" class="cta-button" target="_blank">Access Your Doctor Portal →</a>
      </div>

      <div class="tips-box">
        💡 <strong>Quick Pro-Tip:</strong> Before generating your first prescription, visit <strong>Doctor Settings</strong> to configure your prescription pad header, footer, and digital signature.
      </div>

      <p class="intro" style="font-size: 13px; color: #64748b; margin-bottom: 0;">
        If you have any questions or need help configuring your account, reply to this email or visit our help center.
      </p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} DocPresc • High-Performance Clinical Management System<br>
      This email was sent to ${escapeHtml(to)} because an account was registered on <a href="https://doc-presc.vercel.app">DocPresc</a>.
    </div>
  </div>
</body>
</html>
`;

  const textContent = `
Welcome to DocPresc!
========================================
Dear Dr. ${recipientName},

Welcome to DocPresc! Your doctor account has been successfully created.

Your Account Details:
- Name: Dr. ${recipientName}
- Specialization: ${specText}
- Email: ${to}
- Status: Active

Key Platform Features:
1. Fast, beautiful digital prescriptions with generic medicine search.
2. Chamber and appointment schedule management.
3. Secure patient records and consultation history.

Login to your doctor portal:
${loginUrl}

Best regards,
The DocPresc Team
`;

  return dispatchEmail({
    to,
    subject,
    html: htmlContent,
    text: textContent,
    contextTag: 'Welcome',
  });
};

/**
 * Validates active email configuration and tests SMTP connectivity if configured.
 * Does not block server startup or throw uncaught exceptions.
 */
export const verifyEmailConfiguration = async (): Promise<{
  configured: boolean;
  provider: 'resend' | 'brevo' | 'smtp' | 'none';
  smtpVerified?: boolean;
  details: string;
}> => {
  const resendApiKey = ENV.RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (resendApiKey) {
    console.log('[Email Service] ✅ Resend provider configured via HTTPS API (Port 443).');
    return { configured: true, provider: 'resend', details: 'Resend API (HTTPS Port 443)' };
  }

  const brevoApiKey = ENV.BREVO_API_KEY || process.env.BREVO_API_KEY;
  if (brevoApiKey) {
    console.log('[Email Service] ✅ Brevo provider configured via HTTPS API (Port 443).');
    return { configured: true, provider: 'brevo', details: 'Brevo API (HTTPS Port 443)' };
  }

  const { cleanUser, cleanPass, isGmail } = getCleanCredentials();
  if (cleanUser && cleanPass) {
    const primary = getPrimaryTransporter();
    if (primary) {
      try {
        await primary.verify();
        const host = isGmail ? 'smtp.gmail.com' : (ENV.SMTP_HOST || 'smtp.gmail.com');
        const port = Number(ENV.SMTP_PORT) || 465;
        console.log(`[Email Service] ✅ SMTP connection verified with ${host}:${port} (${cleanUser})`);
        return { configured: true, provider: 'smtp', smtpVerified: true, details: `SMTP (${cleanUser}) verified` };
      } catch (err: any) {
        const isTimeout = ['ETIMEDOUT', 'ECONNREFUSED', 'ESOCKETTIMEDOUT'].includes(err.code);
        if (isTimeout) {
          console.warn(
            `[Email Service] ⚠️ SMTP connection to ${ENV.SMTP_HOST || 'smtp.gmail.com'}:${ENV.SMTP_PORT || 465} timed out (${err.code}). Notice: On free cloud hosting tiers (like Render Free Plan), outbound SMTP ports (25, 465, 587) are blocked by cloud firewalls. To enable email delivery on Render, add RESEND_API_KEY (HTTPS port 443) or BREVO_API_KEY to your Render environment variables.`
          );
        } else {
          console.warn(`[Email Service] ⚠️ SMTP verification failed (${err.code || err.message}). Please verify SMTP credentials.`);
        }
        return { configured: true, provider: 'smtp', smtpVerified: false, details: `SMTP verification failed: ${err.message}` };
      }
    }
  }

  console.warn('[Email Service] ⚠️ No email provider configured. Please set SMTP_USER & SMTP_PASS, RESEND_API_KEY, or BREVO_API_KEY.');
  return { configured: false, provider: 'none', details: 'No email credentials configured' };
};

export const testSmtpDiagnostics = async (targetEmail?: string) => {
  const { cleanUser, cleanPass } = getCleanCredentials();
  const info: any = {
    env: {
      host: ENV.SMTP_HOST || '(empty)',
      port: ENV.SMTP_PORT,
      user: cleanUser || '(empty)',
      passProvided: !!cleanPass,
      passLength: cleanPass ? cleanPass.length : 0,
      resendKeyProvided: !!(ENV.RESEND_API_KEY || process.env.RESEND_API_KEY),
      brevoKeyProvided: !!(ENV.BREVO_API_KEY || process.env.BREVO_API_KEY),
      emailFrom: ENV.EMAIL_FROM,
      nodeEnv: ENV.NODE_ENV,
    },
    results: {},
  };

  // Test Resend API if configured
  const resendApiKey = ENV.RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (resendApiKey) {
    const client = getResendClient(resendApiKey);
    if (client && targetEmail) {
      try {
        let fromAddress = ENV.EMAIL_FROM || 'DocPresc <onboarding@resend.dev>';
        const isPublicWebmail = /@(gmail|yahoo|hotmail|outlook)\.com/i.test(fromAddress);
        if (isPublicWebmail || !fromAddress.includes('@')) {
          const nameMatch = fromAddress.match(/^([^<]+)/);
          const displayName = nameMatch ? nameMatch[1].trim() : 'DocPresc';
          fromAddress = `${displayName} <onboarding@resend.dev>`;
        }

        const resendRes = await client.emails.send({
          from: fromAddress,
          to: targetEmail,
          subject: 'DocPresc Diagnostic Test',
          html: '<p>Testing Resend delivery probe</p>',
        });
        if (resendRes.error) {
          info.results.resend = { error: resendRes.error.message, statusCode: (resendRes.error as any).statusCode || (resendRes.error as any).status };
        } else {
          info.results.resend = { success: true, messageId: resendRes.data?.id };
        }
      } catch (e: any) {
        info.results.resend = { error: e.message };
      }
    } else {
      info.results.resend = 'KEY_CONFIGURED';
    }
  }

  // Test Brevo API if configured
  const brevoApiKey = ENV.BREVO_API_KEY || process.env.BREVO_API_KEY;
  if (brevoApiKey) {
    if (targetEmail) {
      try {
        const senderEmail = cleanUser || 'onboarding@resend.dev';
        const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': brevoApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'DocPresc', email: senderEmail },
            to: [{ email: targetEmail }],
            subject: 'DocPresc Brevo Diagnostic Probe',
            htmlContent: '<p>Testing Brevo delivery probe</p>',
          }),
        });
        const brevoData: any = await brevoRes.json();
        if (brevoRes.ok && brevoData.messageId) {
          info.results.brevo = { success: true, messageId: brevoData.messageId };
        } else {
          info.results.brevo = { error: brevoData };
        }
      } catch (e: any) {
        info.results.brevo = { error: e.message };
      }
    } else {
      info.results.brevo = 'KEY_CONFIGURED';
    }
  }

  // Test Primary SMTP
  try {
    const t1 = getPrimaryTransporter();
    if (t1) {
      await t1.verify();
      info.results.primary_smtp = 'SUCCESS';
    } else {
      info.results.primary_smtp = 'Transporter null';
    }
  } catch (e: any) {
    info.results.primary_smtp = { error: e.message, code: e.code };
  }

  // Test Fallback TLS
  try {
    const t2 = getFallbackTlsTransporter();
    if (t2) {
      await t2.verify();
      info.results.port_587_tls = 'SUCCESS';
    } else {
      info.results.port_587_tls = 'Transporter null';
    }
  } catch (e: any) {
    info.results.port_587_tls = { error: e.message, code: e.code };
  }

  return info;
};
