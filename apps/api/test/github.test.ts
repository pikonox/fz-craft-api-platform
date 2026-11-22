import { describe, expect, it } from "vitest";
import { NoVerifiedEmailError, githubVerifiedEmail } from "../src/lib/github";

/** A fake api.github.com answering /user and /user/emails. */
function fakeGithub(user: object, emails: object[], status = 200) {
  return (async (url: string | URL) => {
    const path = new URL(String(url)).pathname;
    const body = path === "/user" ? user : path === "/user/emails" ? emails : {};
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

describe("GitHub verified email", () => {
  it("uses the primary verified email", async () => {
    const f = fakeGithub({ id: 42, login: "ali", name: "Ali" }, [
      { email: "old@example.com", primary: false, verified: true },
      { email: "Ali@Example.com", primary: true, verified: true },
    ]);
    expect(await githubVerifiedEmail("tok", "42", f)).toEqual({ email: "ali@example.com", login: "ali", name: "Ali" });
  });

  it("never uses an unverified address, even the primary one", async () => {
    const f = fakeGithub({ id: 42, login: "ali", name: null }, [
      { email: "victim@example.com", primary: true, verified: false },
      { email: "me@example.com", primary: false, verified: true },
    ]);
    expect((await githubVerifiedEmail("tok", "42", f)).email).toBe("me@example.com");
  });

  it("fails when no usable verified email exists (noreply addresses don't count)", async () => {
    const f = fakeGithub({ id: 42, login: "ali", name: null }, [
      { email: "victim@example.com", primary: true, verified: false },
      { email: "42+ali@users.noreply.github.com", primary: false, verified: true },
    ]);
    await expect(githubVerifiedEmail("tok", "42", f)).rejects.toBeInstanceOf(NoVerifiedEmailError);
  });

  it("rejects a GitHub token that belongs to a different account than Firebase signed in", async () => {
    const f = fakeGithub({ id: 999, login: "someone", name: null }, [{ email: "x@example.com", primary: true, verified: true }]);
    await expect(githubVerifiedEmail("tok", "42", f)).rejects.toThrow(/different account/);
  });

  it("rejects a token GitHub doesn't accept", async () => {
    await expect(githubVerifiedEmail("bad", "42", fakeGithub({}, [], 401))).rejects.toThrow(/401/);
  });
});
