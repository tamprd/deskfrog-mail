function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const env = {
  get supabaseUrl() { return req("NEXT_PUBLIC_SUPABASE_URL"); },
  get supabaseAnonKey() { return req("NEXT_PUBLIC_SUPABASE_ANON_KEY"); },
  get serviceRoleKey() { return req("SUPABASE_SERVICE_ROLE_KEY"); },
  get appUrl() { return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""); },
  get cronSecret() { return req("CRON_SECRET"); },
  get awsRegion() { return process.env.AWS_REGION ?? "ap-southeast-2"; },
  get sesConfigurationSet() { return process.env.SES_CONFIGURATION_SET || undefined; },
  get sharedSendingDomain() { return req("SHARED_SENDING_DOMAIN"); },
  get sesMaxPerSecond() { return Number(process.env.SES_MAX_PER_SECOND ?? 14); },
};
