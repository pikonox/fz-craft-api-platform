/**
 * Firebase doesn't vouch for GitHub email addresses (its tokens say email_verified: false), and
 * anyone can add an unverified address to a GitHub account. So we ask GitHub ourselves, with the
 * user's own OAuth token from the sign-in, which of their emails are verified.
 */
export class NoVerifiedEmailError extends Error {
  constructor() {
    super("GitHub account has no verified email");
  }
}

type GithubEmail = { email: string; primary: boolean; verified: boolean };

export async function githubVerifiedEmail(accessToken: string, expectedId: string, fetchImpl: typeof fetch = fetch): Promise<{ email: string; login: string; name: string | null }> {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "fz-craft-auth" };
  const get = (path: string) => fetchImpl(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(10_000) });
  const [userRes, emailsRes] = await Promise.all([get("/user"), get("/user/emails")]);
  if (!userRes.ok) throw new Error(`GitHub /user returned ${userRes.status}`);
  const user = (await userRes.json()) as { id: number | string; login: string; name: string | null };
  // The token must belong to the same GitHub account Firebase signed in
  if (String(user.id) !== expectedId) throw new Error("GitHub token is for a different account");
  if (!emailsRes.ok) throw new Error(`GitHub /user/emails returned ${emailsRes.status}`);
  const emails = (await emailsRes.json()) as GithubEmail[];
  const usable = (e: GithubEmail) => e.verified && !/@users\.noreply\.github\.com$/i.test(e.email);
  const pick = emails.find((e) => e.primary && usable(e)) ?? emails.find(usable);
  if (!pick) throw new NoVerifiedEmailError();
  return { email: pick.email.trim().toLowerCase(), login: user.login, name: user.name };
}
