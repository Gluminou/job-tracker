# Job Tracker

A small, private tracker for job applications. It runs entirely in the browser: no account, no server, no build step. Your data stays on your device, unless you connect it to your private sync repo (see Sync between devices below).

## Features

- **Pipeline board**: Lead, Applied, Screening, Interviewing, Offer, Closed. Drag cards between stages on desktop, or use **Move stage** on any device.
- **Fit assessment**: profile fit score, shortlist odds and a short strengths and gaps summary per application, shown on the card.
- **Application page**: details, stage progress, a dated timeline, the next action with a due date, linked contacts, documents and tailoring notes (what you changed in your resume and cover letter for this job).
- **Due list**: overdue, this week and later actions in one place, with one-tap completion.
- **Global contacts**: one record per person (recruiters, hiring managers, introducers, network), linked to as many applications as needed, with preferred language.
- **Close reasons**: Won, Rejected, Withdrew, Ghosted.
- **Paste from Claude**: paste a structured record produced in an AI chat to create or update an application, with a preview before anything changes. See [docs/record-format.md](docs/record-format.md).
- **Export / Import JSON** for backups and for moving data between devices.
- Works on phone and desktop, light and dark mode.

## Use it

Open the GitHub Pages site for this repository, or open `index.html` locally in a browser.

## Deploy your own copy

1. Fork or copy this repository.
2. In **Settings > Pages**, set Source to "Deploy from a branch", branch `main`, folder `/ (root)`.
3. After a minute or two the app is live at `https://<your-username>.github.io/<repo-name>/`.

Every push to `main` redeploys the site. Your data is unaffected because it is not stored in the repository.

## Where your data lives

- Data is saved in the browser's local storage, separately for each browser and device.
- Clearing site data in the browser deletes it. Use **Export JSON** regularly and keep the file somewhere safe. The app reminds you after 7 days without a backup.
- To move data to another device, export on one and **Import** on the other. Import replaces everything on the receiving device.
- Never commit exported files to this repository. `.gitignore` blocks the default export file name as a safeguard.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell |
| `styles.css` | Styles, light and dark |
| `app.js` | All application logic |
| `docs/record-format.md` | Spec for the "Paste from Claude" record |

## License

MIT, see [LICENSE](LICENSE).

## Versions

The app shows its version number and date at the bottom, with a **Check for update** button and a **What's new** list. Release each change with:

```
node tools/release.mjs patch "What changed, in plain words"
```

`patch` for a fix, `minor` for something new on screen, `major` for a rework. The script keeps the page, `version.json` and `changelog.json` in step. The update section itself is `updates.js`, shared by all the apps.

## Sync between devices

`sync.js` (the same file in every Gluminou app) copies this app's data between devices through `data.json` in the private repo **Gluminou/job-tracker-data**: applications, contacts and timeline. Each device connects once with a fine-grained GitHub key that has **Contents: Read and write** on that repo (**Read-only** gives view-only access). Paste the key in the **Sync between devices** section at the bottom of the page. On a computer the apps share one address, so a key entered in one app is offered to the others. Each app can still be disconnected on its own.

Changes from two devices are merged item by item. When both devices changed the same thing, the latest change wins. The repo history keeps every version.
