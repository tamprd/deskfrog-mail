# Sign-in emails (Supabase → Authentication → Emails → Templates)

Paste each file into the matching template tab, with this subject:

- **Confirm signup** — subject `Confirm your email · Desk Frog Mail` — body `1-confirm-signup.html`
- **Reset password** — subject `Reset your Desk Frog Mail password` — body `2-reset-password.html`
- **Change email address** — subject `Confirm your new email · Desk Frog Mail` — body `3-change-email.html`
- **Magic link** — subject `Your Desk Frog Mail sign-in link` — body `4-magic-link.html`

SMTP (Authentication → Emails → SMTP Settings): host `email-smtp.ap-southeast-2.amazonaws.com`, port `587`, sender `hello@send.deskfrogmail.com`, name `Desk Frog Mail`, username/password from SES → SMTP settings → Create SMTP credentials.
