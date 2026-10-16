# awesomeprojects.tech

Free subdomains for your projects: `yourname.awesomeprojects.tech`.

Open a pull request with one small JSON file. When it's merged, the DNS record goes live automatically, usually within a few minutes.

## Get a subdomain

1. Fork this repo.
2. Create `domains/<name>.json` (copy [`example.json`](example.json)):

   ```json
   {
     "owner": { "github": "your-github-username" },
     "description": "My portfolio site",
     "records": { "CNAME": "your-github-username.github.io" }
   }
   ```

3. Open a pull request. A check validates your file and tells you what to fix.
4. When a maintainer merges it, DNS updates automatically.

**Changing or removing it:** edit or delete your file in a new PR. Only the GitHub account in `owner.github` can do that.

### Records you can use

| Type    | Format                                                  | Example |
|---------|---------------------------------------------------------|---------|
| `CNAME` | a hostname (can't be combined with other records)       | `"CNAME": "you.github.io"` |
| `A`     | list of public IPv4 addresses                           | `"A": ["76.76.21.21"]` |
| `AAAA`  | list of public IPv6 addresses                           | `"AAAA": ["2606:4700::1"]` |
| `TXT`   | a string or a list of strings                           | `"TXT": "google-site-verification=…"` |
| `MX`    | list of hostnames, or `{ "host", "priority" }` objects  | `"MX": [{ "host": "mx1.example.com", "priority": 10 }]` |

`NS` records (handing the name to another DNS server) and wildcards aren't offered.

### Verification records (Vercel, GitHub Pages, email)

Records *under* your name go in their own files and must have the same owner, for example:

- `domains/_vercel.alice.json` → `_vercel.alice.awesomeprojects.tech`
- `domains/_github-pages-challenge-alice.alice.json`
- `domains/s1._domainkey.alice.json` (DKIM)

They don't count toward your limit.

### Hosting quick reference

- **GitHub Pages:** `"CNAME": "<user>.github.io"`, then set the custom domain in your repo's Pages settings.
- **Vercel:** `"CNAME": "cname.vercel-dns.com"`, then add the domain in your Vercel project.
- **Netlify:** `"CNAME": "<site>.netlify.app"`.

## Rules

- At most **3** subdomains per GitHub account.
- Names: lowercase `a-z`, `0-9` and `-`, 1–63 characters. Some names are [reserved](reserved.json).
- It has to be a real project. No phishing, malware, spam, adult content, impersonation or anything illegal.
- Don't leave it dangling: if the site behind your record goes away, delete your file. Dangling records can be taken over by someone else.
- We can remove any subdomain at any time, without notice, for any reason.

**Report abuse:** open an issue, or for anything sensitive email `abuse@awesomeprojects.tech` *(set this up before launch)*.

---

## For maintainers

### How it works

- `domains/*.json` is the source of truth. [`dnsconfig.js`](dnsconfig.js) turns it into records for [DNSControl](https://docs.dnscontrol.org).
- **Pull requests** ([`validate.yml`](.github/workflows/validate.yml)) run **main's** copy of [`scripts/validate.js`](scripts/validate.js) against the PR's files, so a PR can't weaken the rules it's checked against. It runs on `pull_request` (never `pull_request_target`), so forks get no secrets. It checks names, record values (public IPs only, no CNAMEs back into the zone), ownership (`owner.github` must be the PR author, and edits or deletes must come from the existing owner), the per-account limit, and that only `domains/` changed.
- **Merges to main** ([`deploy.yml`](.github/workflows/deploy.yml)) run `dnscontrol preview` and then `push`. The deploy refuses to delete more than 10 records at once unless you run it by hand with `allow_mass_delete`.
- The root (`@`) and every name in `reserved.json` are **ignored** by DNSControl. Manage those (your own site, `www`, mail) by hand in the Cloudflare dashboard; automation never touches them. **Anything else** in the zone that isn't in `domains/` is deleted on the next deploy.
- Maintainers (the repo owner, via `MAINTAINERS`) skip the ownership and limit checks, so they can remove abusive entries.

### One-time setup

1. **Cloudflare DNS.** Add `awesomeprojects.tech` to Cloudflare and switch the registrar's nameservers to Cloudflare's. Before the first deploy, look at the records Cloudflare imported: any that aren't on the root or a reserved name would be deleted, so add them to `reserved.json` (or `domains/`) first.
2. **API token.** Cloudflare → My Profile → API Tokens → Create Token → *Edit zone DNS* template, with **Zone Resources** set to **only** `awesomeprojects.tech`.
3. **Repo secret.** Settings → Secrets and variables → Actions → `CLOUDFLARE_API_TOKEN`.
4. **Protect `main`.** Settings → Rules: require a pull request, require the *Validate request* check, require Code Owners review, and block force pushes. Turn on "Require approval for all outside collaborators" for Actions (Settings → Actions → General).
5. **First deploy.** Run *Deploy DNS* by hand (Actions → Deploy DNS → Run workflow) and read the preview.
6. **Later: the Public Suffix List.** Once the project is established, apply to the [PSL](https://github.com/publicsuffix/list) so browsers isolate cookies between subdomains. Until then, don't put anything with logins on the root domain.

### Local checks

```bash
npm test                 # validator unit tests
node scripts/validate.js # validate domains/
dnscontrol check         # validate dnsconfig.js (brew install dnscontrol)
```
