import nodemailer, { Transporter } from 'nodemailer';
import { Resend } from 'resend';
import { ENV } from '../config/env';

let cachedResendClient: Resend | null = null;
let mockTransporter: Transporter | null = null;
let cachedPrimaryTransporter: Transporter | null = null;
let cachedFallbackTransporter: Transporter | null = null;

/**
 * Allows automated test suites to inject a mock transporter without sending real emails.
 */
export const setMockTransporter = (transporter: Transporter | null) => {
  mockTransporter = transporter;
  clearTransporterCache();
};

export const getMockTransporter = (): Transporter | null => mockTransporter;

export const clearTransporterCache = () => {
  cachedPrimaryTransporter = null;
  cachedFallbackTransporter = null;
  cachedResendClient = null;
};

/**
 * Sanitizes and masks email addresses for production-safe logs.
 * Example: 'doctor.test@gmail.com' -> 'do*********@gmail.com'
 */
export const maskEmail = (emailStr: string): string => {
  if (!emailStr || typeof emailStr !== 'string' || !emailStr.includes('@')) {
    return '***';
  }
  const [local, domain] = emailStr.split('@');
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  const visibleStart = local.slice(0, 2);
  const visibleEnd = local.slice(-1);
  const maskedLength = Math.max(3, local.length - 3);
  return `${visibleStart}${'*'.repeat(maskedLength)}${visibleEnd}@${domain}`;
};

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

/**
 * Normalizes and extracts clean SMTP credentials from environment variables.
 */
export const getCleanCredentials = () => {
  const rawUser = (ENV.SMTP_USER || process.env.SMTP_USER || '').replace(/['"]/g, '').trim();
  const angleMatch = rawUser.match(/<([^>]+)>/);
  const userCandidate = angleMatch ? angleMatch[1].trim() : rawUser;
  const emailRegexMatch = userCandidate.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const cleanUser = (emailRegexMatch ? emailRegexMatch[1] : userCandidate)
    .trim()
    .replace(/@gamil\.com$/i, '@gmail.com');

  // Strip spaces from password (commonly pasted with spaces from Gmail 16-character App Password)
  const cleanPass = (ENV.SMTP_PASS || process.env.SMTP_PASS || '').replace(/\s+/g, '').replace(/['"]/g, '').trim();

  const hostConfig = (ENV.SMTP_HOST || process.env.SMTP_HOST || '').toLowerCase();
  const isGmail = hostConfig.includes('gmail') || cleanUser.toLowerCase().includes('gmail');

  return { cleanUser, cleanPass, isGmail };
};

/**
 * Determines the effective sender address based on the active provider and credentials.
 */
export const getSenderAddress = (provider: 'smtp' | 'resend' | 'brevo' = 'smtp'): string => {
  const { cleanUser, isGmail } = getCleanCredentials();
  const rawFrom = (ENV.EMAIL_FROM || process.env.EMAIL_FROM || '').trim();

  // Extract display name if present: "Doc Presc <someone@...>" -> "Doc Presc"
  const nameMatch = rawFrom.match(/^([^<]+)/);
  const displayName = nameMatch ? nameMatch[1].trim() : 'Doc Presc';

  if (provider === 'smtp') {
    // For Gmail SMTP, envelope sender MUST match the authenticated Gmail account
    if (isGmail && cleanUser) {
      return `${displayName} <${cleanUser}>`;
    }
    if (rawFrom.includes('@')) {
      return rawFrom;
    }
    return cleanUser ? `${displayName} <${cleanUser}>` : 'Doc Presc <noreply@docpresc.com>';
  }

  if (provider === 'resend') {
    // Resend requires verified domains or onboarding@resend.dev during testing.
    // If EMAIL_FROM contains a public domain like @gmail.com or @yahoo.com,
    // using it directly fails with "Domain not verified".
    const isPublicWebmail = /@(gmail|yahoo|hotmail|outlook)\.com/i.test(rawFrom);
    if (isPublicWebmail || !rawFrom.includes('@')) {
      return `${displayName} <onboarding@resend.dev>`;
    }
    return rawFrom;
  }

  // Brevo
  return rawFrom || (cleanUser ? `${displayName} <${cleanUser}>` : 'Doc Presc <noreply@docpresc.com>');
};

/**
 * Categorizes errors from email providers into standard production error categories.
 */
export const categorizeEmailError = (err: any): {
  code: string;
  category: 'AUTHENTICATION' | 'CONNECTION_TIMEOUT' | 'DNS' | 'TLS' | 'REJECTED' | 'RATE_LIMIT' | 'UNKNOWN';
  message: string;
} => {
  const errMsg = err?.message || String(err);
  const errCode = String(err?.code || err?.responseCode || err?.statusCode || '');

  if (
    errCode === '535' ||
    errCode === 'EAUTH' ||
    /535|invalid login|username and password not accepted|bad credentials/i.test(errMsg)
  ) {
    return {
      code: 'SMTP_AUTH_FAILED',
      category: 'AUTHENTICATION',
      message: 'SMTP authentication failed. Verify Gmail App Password and ensure 2-Step Verification is active.',
    };
  }

  if (
    ['ETIMEDOUT', 'ECONNREFUSED', 'ESOCKETTIMEDOUT', 'EHOSTUNREACH'].includes(errCode) ||
    /timed? ?out|connection refused/i.test(errMsg)
  ) {
    return {
      code: 'SMTP_CONNECTION_TIMEOUT',
      category: 'CONNECTION_TIMEOUT',
      message: `SMTP connection timed out or was refused (${errCode || 'ETIMEDOUT'}). Cloud hosting firewall may be blocking outbound port.`,
    };
  }

  if (errCode === 'ENOTFOUND' || /getaddrinfo/i.test(errMsg)) {
    return {
      code: 'SMTP_DNS_ERROR',
      category: 'DNS',
      message: 'DNS resolution failed for SMTP host.',
    };
  }

  if (
    ['CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT'].includes(errCode) ||
    /tls|ssl|handshake|certificate/i.test(errMsg)
  ) {
    return {
      code: 'SMTP_TLS_ERROR',
      category: 'TLS',
      message: 'TLS/SSL handshake or certificate verification failed.',
    };
  }

  if (['550', '553', '554'].includes(errCode) || /recipient rejected|sender rejected/i.test(errMsg)) {
    return {
      code: 'SMTP_RECIPIENT_REJECTED',
      category: 'REJECTED',
      message: 'Email address was rejected by SMTP server.',
    };
  }

  if (errCode === '429' || /rate limit|too many requests/i.test(errMsg)) {
    return {
      code: 'EMAIL_RATE_LIMIT_EXCEEDED',
      category: 'RATE_LIMIT',
      message: 'Email delivery rate limit exceeded.',
    };
  }

  return {
    code: errCode || 'EMAIL_DELIVERY_FAILED',
    category: 'UNKNOWN',
    message: errMsg || 'Unknown email delivery error occurred.',
  };
};

/**
 * Returns Primary SMTP Transporter (Port 465 SSL by default).
 * Reuses cached instance with connection pooling.
 */
export const getPrimaryTransporter = (): Transporter | null => {
  if (mockTransporter) return mockTransporter;

  if (cachedPrimaryTransporter) return cachedPrimaryTransporter;

  const { cleanUser, cleanPass, isGmail } = getCleanCredentials();
  if (!cleanUser || !cleanPass) return null;

  const port = Number(ENV.SMTP_PORT || process.env.SMTP_PORT) || 465;
  const isSecure = port === 465;
  const host = isGmail ? 'smtp.gmail.com' : (ENV.SMTP_HOST || process.env.SMTP_HOST || 'smtp.gmail.com');

  cachedPrimaryTransporter = nodemailer.createTransport({
    host,
    port,
    secure: isSecure,
    requireTLS: !isSecure,
    auth: { user: cleanUser, pass: cleanPass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  return cachedPrimaryTransporter;
};

/**
 * Returns Fallback TLS SMTP Transporter (Port 587 STARTTLS).
 * Reuses cached instance.
 */
export const getFallbackTlsTransporter = (): Transporter | null => {
  if (mockTransporter) return mockTransporter;

  if (cachedFallbackTransporter) return cachedFallbackTransporter;

  const { cleanUser, cleanPass, isGmail } = getCleanCredentials();
  if (!cleanUser || !cleanPass) return null;

  const primaryPort = Number(ENV.SMTP_PORT || process.env.SMTP_PORT) || 465;
  const fallbackPort = primaryPort === 465 ? 587 : 465;
  const isSecure = fallbackPort === 465;
  const host = isGmail ? 'smtp.gmail.com' : (ENV.SMTP_HOST || process.env.SMTP_HOST || 'smtp.gmail.com');

  cachedFallbackTransporter = nodemailer.createTransport({
    host,
    port: fallbackPort,
    secure: isSecure,
    requireTLS: !isSecure,
    auth: { user: cleanUser, pass: cleanPass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return cachedFallbackTransporter;
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

export interface IEmailDispatchResult {
  success: boolean;
  messageId?: string;
  provider?: string;
  error?: string;
  code?: string;
}

const escapeHtml = (str: string): string =>
  str.replace(/[&<>'"]/g, (tag) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));

/**
 * Resolves the primary email provider based on explicit configuration and available credentials.
 * Priority rules:
 * 1. Mock transporter if injected (tests)
 * 2. Explicit EMAIL_PROVIDER setting ('smtp' | 'gmail' | 'resend' | 'brevo')
 * 3. If EMAIL_PROVIDER is 'auto' or not set:
 *    - Prefers 'smtp' if SMTP_USER and SMTP_PASS are configured
 *    - Falls back to 'brevo' if BREVO_API_KEY is configured
 *    - Falls back to 'resend' if RESEND_API_KEY is configured
 */
export const resolveEmailProvider = (): 'mock' | 'smtp' | 'resend' | 'brevo' | 'none' => {
  if (mockTransporter) return 'mock';

  const configuredProvider = (ENV.EMAIL_PROVIDER || process.env.EMAIL_PROVIDER || 'smtp').trim().toLowerCase();

  if (configuredProvider === 'smtp' || configuredProvider === 'gmail') {
    return 'smtp';
  }
  if (configuredProvider === 'resend') {
    return 'resend';
  }
  if (configuredProvider === 'brevo') {
    return 'brevo';
  }

  // Auto-detection mode (in serverless, prefer HTTPS APIs over raw SMTP)
  const isServerless = Boolean(process.env.VERCEL);
  if (isServerless) {
    if (ENV.RESEND_API_KEY || process.env.RESEND_API_KEY) {
      return 'resend';
    }
    if (ENV.BREVO_API_KEY || process.env.BREVO_API_KEY) {
      return 'brevo';
    }
    const { cleanUser, cleanPass } = getCleanCredentials();
    if (cleanUser && cleanPass) {
      return 'smtp';
    }
  } else {
    const { cleanUser, cleanPass } = getCleanCredentials();
    if (cleanUser && cleanPass) {
      return 'smtp';
    }
    if (ENV.BREVO_API_KEY || process.env.BREVO_API_KEY) {
      return 'brevo';
    }
    if (ENV.RESEND_API_KEY || process.env.RESEND_API_KEY) {
      return 'resend';
    }
  }

  return 'none';
};

/**
 * Sends email via Gmail / Standard SMTP.
 * Tries Primary Port (465 SSL), and automatically falls back to Port 587 STARTTLS
 * upon network connection / timeout failures.
 */
const sendViaSmtp = async ({
  to,
  subject,
  html,
  text,
  contextTag,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
  contextTag: string;
}): Promise<IEmailDispatchResult> => {
  const { cleanUser } = getCleanCredentials();
  const primaryTransporter = getPrimaryTransporter();

  if (!primaryTransporter || !cleanUser) {
    const errorMsg = 'SMTP credentials missing: SMTP_USER and SMTP_PASS must be configured.';
    console.warn(`[Email Service] ❌ [${contextTag}] ${errorMsg}`);
    return { success: false, error: errorMsg, code: 'SMTP_CONFIG_MISSING', provider: 'smtp' };
  }

  const fromAddress = getSenderAddress('smtp');
  const port = Number(ENV.SMTP_PORT || process.env.SMTP_PORT) || 465;

  console.log(`[Email Service] [${contextTag}] Provider: SMTP (port ${port}) | Recipient: ${maskEmail(to)} | Stage: Connecting...`);

  try {
    const info = await primaryTransporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
      text,
    });

    console.log(`[Email Service] ✅ [${contextTag}] Sent successfully via Primary SMTP (port ${port}) to ${maskEmail(to)} (Message ID: ${info.messageId})`);
    return { success: true, messageId: info.messageId, provider: 'smtp' };
  } catch (error: any) {
    const cat = categorizeEmailError(error);
    console.error(`[Email Service] ❌ [${contextTag}] Primary SMTP (port ${port}) failed (${cat.code}): ${cat.message}`);

    // If network connection timed out on Port 465, attempt Fallback Port 587 STARTTLS
    if (cat.category === 'CONNECTION_TIMEOUT' || cat.category === 'TLS') {
      console.log(`[Email Service] [${contextTag}] Attempting Fallback SMTP (port 587 STARTTLS) for ${maskEmail(to)}...`);
      const fallbackTransporter = getFallbackTlsTransporter();
      if (fallbackTransporter) {
        try {
          const fallbackInfo = await fallbackTransporter.sendMail({
            from: fromAddress,
            to,
            subject,
            html,
            text,
          });

          console.log(`[Email Service] ✅ [${contextTag}] Sent successfully via Fallback SMTP (port 587) to ${maskEmail(to)} (Message ID: ${fallbackInfo.messageId})`);
          return { success: true, messageId: fallbackInfo.messageId, provider: 'smtp_fallback' };
        } catch (fallbackError: any) {
          const fallbackCat = categorizeEmailError(fallbackError);
          console.error(`[Email Service] ❌ [${contextTag}] Fallback SMTP (port 587) also failed (${fallbackCat.code}): ${fallbackCat.message}`);
          return { success: false, error: fallbackCat.message, code: fallbackCat.code, provider: 'smtp' };
        }
      }
    }

    return { success: false, error: cat.message, code: cat.code, provider: 'smtp' };
  }
};

/**
 * Sends email via Resend HTTPS API (Port 443).
 */
const sendViaResend = async ({
  to,
  subject,
  html,
  text,
  contextTag,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
  contextTag: string;
}): Promise<IEmailDispatchResult> => {
  const resendApiKey = ENV.RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return { success: false, error: 'RESEND_API_KEY is missing.', code: 'RESEND_CONFIG_MISSING', provider: 'resend' };
  }

  try {
    const client = getResendClient(resendApiKey);
    if (!client) {
      return { success: false, error: 'Failed to initialize Resend client.', code: 'RESEND_INIT_FAILED', provider: 'resend' };
    }

    const fromAddress = getSenderAddress('resend');
    console.log(`[Email Service] [${contextTag}] Provider: Resend (HTTPS 443) | From: ${fromAddress} | Recipient: ${maskEmail(to)} | Stage: Dispatching...`);

    const response = await client.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
      text,
    });

    if (response.error) {
      const errMsg = response.error.message || JSON.stringify(response.error);
      console.error(`[Email Service] ❌ [${contextTag}] Resend API error for ${maskEmail(to)}:`, response.error);

      let userMsg = errMsg;
      if (errMsg.includes('You can only send testing emails to your own email address')) {
        userMsg = 'Resend free tier requires a verified custom domain to send to external recipients. Please configure EMAIL_PROVIDER=smtp with Gmail App Password.';
      }

      return { success: false, error: userMsg, code: 'RESEND_API_ERROR', provider: 'resend' };
    }

    if (response.data?.id) {
      console.log(`[Email Service] ✅ [${contextTag}] Sent successfully via Resend to ${maskEmail(to)} (Message ID: ${response.data.id})`);
      return { success: true, messageId: response.data.id, provider: 'resend' };
    }

    return { success: false, error: 'No response data from Resend API.', code: 'RESEND_EMPTY_RESPONSE', provider: 'resend' };
  } catch (error: any) {
    console.error(`[Email Service] ❌ [${contextTag}] Exception sending via Resend:`, error.message);
    return { success: false, error: error.message, code: 'RESEND_EXCEPTION', provider: 'resend' };
  }
};

/**
 * Sends email via Brevo (Sendinblue) HTTPS API (Port 443).
 */
const sendViaBrevo = async ({
  to,
  subject,
  html,
  text,
  contextTag,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
  contextTag: string;
}): Promise<IEmailDispatchResult> => {
  const brevoApiKey = ENV.BREVO_API_KEY || process.env.BREVO_API_KEY;
  if (!brevoApiKey) {
    return { success: false, error: 'BREVO_API_KEY is missing.', code: 'BREVO_CONFIG_MISSING', provider: 'brevo' };
  }

  try {
    const { cleanUser } = getCleanCredentials();
    const rawFrom = ENV.EMAIL_FROM || process.env.EMAIL_FROM || '';
    const fromNameMatch = rawFrom.match(/^([^<]+)<([^>]+)>/);
    const senderName = fromNameMatch ? fromNameMatch[1].trim() : 'Doc Presc';
    const senderEmail = fromNameMatch ? fromNameMatch[2].trim() : (cleanUser || 'noreply@docpresc.com');

    console.log(`[Email Service] [${contextTag}] Provider: Brevo (HTTPS 443) | Recipient: ${maskEmail(to)} | Stage: Dispatching...`);

    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
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
      console.log(`[Email Service] ✅ [${contextTag}] Sent successfully via Brevo to ${maskEmail(to)} (Message ID: ${brevoData.messageId})`);
      return { success: true, messageId: brevoData.messageId, provider: 'brevo' };
    }

    const errMsg = brevoData?.message || JSON.stringify(brevoData);
    console.error(`[Email Service] ❌ [${contextTag}] Brevo API error for ${maskEmail(to)}:`, brevoData);
    return { success: false, error: errMsg, code: 'BREVO_API_ERROR', provider: 'brevo' };
  } catch (error: any) {
    console.error(`[Email Service] ❌ [${contextTag}] Exception sending via Brevo:`, error.message);
    return { success: false, error: error.message, code: 'BREVO_EXCEPTION', provider: 'brevo' };
  }
};

/**
 * Master Centralized Email Dispatcher:
 * 1. Validates recipient address
 * 2. If test mock is active, dispatches via mock
 * 3. Resolves selected provider according to EMAIL_PROVIDER setting
 * 4. Dispatches email via selected provider
 * 5. If SMTP fails and ENABLE_EMAIL_FALLBACK is deliberately true, attempts configured secondary API
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
}): Promise<IEmailDispatchResult> => {
  if (!to || typeof to !== 'string' || !to.includes('@')) {
    console.warn(`[Email Service] Invalid recipient address provided: "${to}"`);
    return { success: false, error: `Invalid recipient address: "${to}"`, code: 'INVALID_RECIPIENT' };
  }

  // Mock Transporter for Unit Tests
  if (mockTransporter) {
    try {
      const fromAddress = getSenderAddress('smtp');
      const info = await mockTransporter.sendMail({
        from: fromAddress,
        to,
        subject,
        html,
        text,
      });
      console.log(`[Email Service] ✅ [${contextTag}] Mock transporter sent email to ${maskEmail(to)} (Message ID: ${info?.messageId})`);
      return { success: true, messageId: info?.messageId || 'mock-msg-id-123', provider: 'mock' };
    } catch (err: any) {
      console.error(`[Email Service] ❌ [${contextTag}] Mock transporter simulated failure:`, err.message);
      return { success: false, error: err.message, code: err.code || 'MOCK_FAILURE', provider: 'mock' };
    }
  }

  const provider = resolveEmailProvider();

  if (provider === 'smtp') {
    const smtpResult = await sendViaSmtp({ to, subject, html, text, contextTag });
    if (smtpResult.success) {
      return smtpResult;
    }

    // Optional API fallback only if explicitly enabled
    if (ENV.ENABLE_EMAIL_FALLBACK) {
      if (ENV.BREVO_API_KEY || process.env.BREVO_API_KEY) {
        console.log(`[Email Service] [${contextTag}] Fallback enabled: Attempting Brevo API...`);
        const brevoResult = await sendViaBrevo({ to, subject, html, text, contextTag });
        if (brevoResult.success) return brevoResult;
      } else if (ENV.RESEND_API_KEY || process.env.RESEND_API_KEY) {
        console.log(`[Email Service] [${contextTag}] Fallback enabled: Attempting Resend API...`);
        const resendResult = await sendViaResend({ to, subject, html, text, contextTag });
        if (resendResult.success) return resendResult;
      }
    }

    return smtpResult;
  }

  if (provider === 'resend') {
    const resendResult = await sendViaResend({ to, subject, html, text, contextTag });
    if (resendResult.success) return resendResult;

    if (ENV.ENABLE_EMAIL_FALLBACK) {
      if (ENV.BREVO_API_KEY || process.env.BREVO_API_KEY) {
        console.log(`[Email Service] [${contextTag}] Fallback enabled: Attempting Brevo API...`);
        const brevoResult = await sendViaBrevo({ to, subject, html, text, contextTag });
        if (brevoResult.success) return brevoResult;
      }
      const { cleanUser, cleanPass } = getCleanCredentials();
      if (cleanUser && cleanPass) {
        console.log(`[Email Service] [${contextTag}] Fallback enabled: Attempting SMTP...`);
        const smtpResult = await sendViaSmtp({ to, subject, html, text, contextTag });
        if (smtpResult.success) return smtpResult;
      }
    }
    return resendResult;
  }

  if (provider === 'brevo') {
    const brevoResult = await sendViaBrevo({ to, subject, html, text, contextTag });
    if (brevoResult.success) return brevoResult;

    if (ENV.ENABLE_EMAIL_FALLBACK) {
      if (ENV.RESEND_API_KEY || process.env.RESEND_API_KEY) {
        console.log(`[Email Service] [${contextTag}] Fallback enabled: Attempting Resend API...`);
        const resendResult = await sendViaResend({ to, subject, html, text, contextTag });
        if (resendResult.success) return resendResult;
      }
      const { cleanUser, cleanPass } = getCleanCredentials();
      if (cleanUser && cleanPass) {
        console.log(`[Email Service] [${contextTag}] Fallback enabled: Attempting SMTP...`);
        const smtpResult = await sendViaSmtp({ to, subject, html, text, contextTag });
        if (smtpResult.success) return smtpResult;
      }
    }
    return brevoResult;
  }

  console.warn(`[Email Service] ⚠️ [${contextTag}] No email provider configured. Please configure SMTP_USER/SMTP_PASS, RESEND_API_KEY, or BREVO_API_KEY.`);
  return {
    success: false,
    error: 'No working email provider configured. Please configure SMTP credentials, RESEND_API_KEY, or BREVO_API_KEY.',
    code: 'NO_PROVIDER_CONFIGURED',
    provider: 'none',
  };
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
}): Promise<IEmailDispatchResult> => {
  return dispatchEmail({
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text || '',
    contextTag: options.contextTag || 'General',
  });
};

/**
 * Dispatches a high-security Password Reset OTP email.
 */
export const sendPasswordResetOtpEmail = async ({
  to,
  name,
  otp,
  expiresInMinutes = 10,
}: ISendOtpEmailOptions): Promise<IEmailDispatchResult> => {
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
      <div class="greeting">Hello Dr. ${recipientName},</div>
      <p class="message">
        We received a request to reset the password for your DocPresc doctor account. Use the 6-digit verification code below to proceed:
      </p>

      <div class="otp-box">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #0f766e; font-weight: 700;">Password Reset OTP</div>
        <div class="otp-code">${otp}</div>
        <div class="otp-expiry">⏱ Valid for ${expiresInMinutes} minutes only</div>
      </div>

      <div class="warning-box">
        <strong>Security Notice:</strong> Never share this code with anyone. DocPresc support personnel will never ask for your verification code or password.
      </div>

      <p class="message" style="font-size: 12px; color: #64748b; margin-bottom: 0;">
        If you did not initiate this password reset request, you can safely ignore this email. Your password will remain unchanged.
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
Hello Dr. ${recipientName},

Your 6-digit password reset OTP is: ${otp}

This OTP is valid for ${expiresInMinutes} minutes only.

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
 * Dispatches an onboarding Welcome Email when a doctor successfully registers.
 */
export const sendWelcomeEmail = async ({
  to,
  name,
  specialization,
  loginUrl = 'https://doc-presc.vercel.app/login',
}: ISendWelcomeEmailOptions): Promise<IEmailDispatchResult> => {
  const recipientName = escapeHtml(name || 'Doctor');
  const specText = specialization ? escapeHtml(specialization) : 'Physician';
  const cleanLoginUrl = escapeHtml(loginUrl);
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
        Welcome to <strong>DocPresc</strong>! Your doctor account has been successfully created. You now have immediate access to our digital prescription pad, patient record history, and chamber management suite.
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
        <a href="${cleanLoginUrl}" class="cta-button" target="_blank">Access Your Doctor Portal →</a>
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
 * Validates active email configuration and tests SMTP connectivity.
 * Runs on server initialization as a diagnostic check without blocking startup.
 */
export const verifyEmailConfiguration = async (): Promise<{
  configured: boolean;
  provider: 'resend' | 'brevo' | 'smtp' | 'none';
  smtpVerified?: boolean;
  details: string;
}> => {
  const provider = resolveEmailProvider();

  if (provider === 'smtp') {
    const { cleanUser, cleanPass, isGmail } = getCleanCredentials();
    if (!cleanUser || !cleanPass) {
      console.warn('[Email Service] ⚠️ EMAIL_PROVIDER is set to "smtp", but SMTP_USER or SMTP_PASS is missing in environment variables.');
      return { configured: false, provider: 'smtp', smtpVerified: false, details: 'Missing SMTP credentials' };
    }

    const host = isGmail ? 'smtp.gmail.com' : (ENV.SMTP_HOST || 'smtp.gmail.com');
    const port = Number(ENV.SMTP_PORT) || 465;

    console.log(`[Email Service] Testing diagnostic SMTP verification with ${host}:${port} (${maskEmail(cleanUser)})...`);
    const primary = getPrimaryTransporter();
    if (primary) {
      try {
        await primary.verify();
        console.log(`[Email Service] ✅ Gmail SMTP authenticated and connection verified with ${host}:${port} for ${cleanUser}`);
        return { configured: true, provider: 'smtp', smtpVerified: true, details: `SMTP (${cleanUser}) verified on port ${port}` };
      } catch (err: any) {
        const cat = categorizeEmailError(err);
        if (cat.category === 'AUTHENTICATION') {
          console.warn(`[Email Service] ❌ SMTP Authentication failed (535): Invalid username or Gmail App Password. Ensure 2-Step Verification is active and a 16-character App Password is used.`);
        } else if (cat.category === 'CONNECTION_TIMEOUT') {
          console.warn(`[Email Service] ⚠️ SMTP connection to ${host}:${port} timed out (${cat.code}). Attempting diagnostic check on fallback port 587...`);
          const fallback = getFallbackTlsTransporter();
          if (fallback) {
            try {
              await fallback.verify();
              console.log(`[Email Service] ✅ Fallback SMTP verified on port 587.`);
              return { configured: true, provider: 'smtp', smtpVerified: true, details: 'Fallback SMTP verified on port 587' };
            } catch (fallbackErr: any) {
              console.warn(`[Email Service] ⚠️ Fallback SMTP verification also timed out on port 587: ${fallbackErr.message}`);
            }
          }
        } else {
          console.warn(`[Email Service] ⚠️ SMTP verification notice (${cat.code}): ${cat.message}`);
        }
        return { configured: true, provider: 'smtp', smtpVerified: false, details: `SMTP check notice: ${cat.message}` };
      }
    }
  }

  if (provider === 'resend') {
    const resendApiKey = ENV.RESEND_API_KEY || process.env.RESEND_API_KEY;
    if (resendApiKey) {
      console.log('[Email Service] ✅ Resend provider configured via HTTPS API (Port 443).');
      return { configured: true, provider: 'resend', details: 'Resend API (HTTPS Port 443)' };
    }
  }

  if (provider === 'brevo') {
    const brevoApiKey = ENV.BREVO_API_KEY || process.env.BREVO_API_KEY;
    if (brevoApiKey) {
      console.log('[Email Service] ✅ Brevo provider configured via HTTPS API (Port 443).');
      return { configured: true, provider: 'brevo', details: 'Brevo API (HTTPS Port 443)' };
    }
  }

  console.warn('[Email Service] ⚠️ No email provider credentials configured.');
  return { configured: false, provider: 'none', details: 'No email credentials configured' };
};

/**
 * Diagnostic helper for `/api/health/email-diagnostic` endpoint.
 */
export const testSmtpDiagnostics = async (targetEmail?: string) => {
  const { cleanUser, cleanPass } = getCleanCredentials();
  const info: any = {
    selectedProvider: resolveEmailProvider(),
    env: {
      emailProvider: ENV.EMAIL_PROVIDER,
      host: ENV.SMTP_HOST || '(empty)',
      port: ENV.SMTP_PORT,
      user: cleanUser ? maskEmail(cleanUser) : '(empty)',
      passProvided: !!cleanPass,
      passLength: cleanPass ? cleanPass.length : 0,
      resendKeyProvided: !!(ENV.RESEND_API_KEY || process.env.RESEND_API_KEY),
      brevoKeyProvided: !!(ENV.BREVO_API_KEY || process.env.BREVO_API_KEY),
      emailFrom: ENV.EMAIL_FROM,
      nodeEnv: ENV.NODE_ENV,
    },
    results: {},
  };

  // Test Primary SMTP
  try {
    const t1 = getPrimaryTransporter();
    if (t1) {
      await t1.verify();
      info.results.primary_smtp = 'SUCCESS';
    } else {
      info.results.primary_smtp = 'Transporter null (missing credentials)';
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
