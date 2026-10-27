# Tracker record format (v1)

The "Paste from Claude" button accepts one or more records in this format. Each record creates a new application or updates an existing one, matched by `id`. Nothing is changed until you review the preview and press **Apply changes**.

## Shape

```
JOBTRACKER v1
{ ...one JSON object... }
```

- The `JOBTRACKER v1` header line is recommended. Several records can be pasted at once, each with its own header.
- Code fences (```` ``` ````) around the block are ignored, so a record copied from a chat works as is.
- Dates are `YYYY-MM-DD`.

## Fields

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string, **required** | Stable ID for the application, e.g. `crytek-development-director`. Lowercase, hyphens. Must stay the same for every record about the same job. |
| `action` | `"create"` or `"update"` | Optional. With `"update"`, the app refuses the record if the ID does not exist yet. |
| `company` | string | Required when creating. |
| `role` | string | |
| `location` | string | |
| `source` | string | e.g. `Direct`, `LinkedIn`, `Referral: Name`, `Recruiter: Name` |
| `jdUrl` | string | `http(s)` link to the job post. |
| `priority` | `High`, `Medium`, `Low` | Defaults to Medium. |
| `salary` | string | Salary band, free text. |
| `notes` | string | Scope of the role, reporting line, team size. |
| `stage` | `Lead`, `Applied`, `Screening`, `Interviewing`, `Offer`, `Closed` | New records start in Lead unless set. |
| `closedReason` | `Won`, `Rejected`, `Withdrew`, `Ghosted` | Required when `stage` is `Closed`. |
| `closedNote` | string | Optional. |
| `contacts` | array of `{ name, title, company, type, email, lang }` | Matched to existing contacts by name (and company). New people are added to the global contacts list. `type`: Recruiter, Hiring manager, Introducer, Network, Other. `lang`: e.g. EN, FR. |
| `tailoring` | `{ resume: [string], cover: [string] }` | Adjustments made for this job. Appended, duplicates ignored. |
| `documents` | array of `{ kind, name, url }` | `kind`: Resume, Cover letter, Interview prep, Job description, Other. |
| `log` | `{ date, type, text }` or an array of them | Timeline entries. `type`: Email, Call, Interview, Application, Note. |
| `next` | `{ text, due }` or `null` | Replaces the current next action. `null` clears it. |

Fields left out are not touched on an update.

## Automatic behaviour

- Moving to **Applied** with no next action set (and no `next` in the record) creates "Follow up on application", due in 7 days.
- Moving to **Closed** clears the next action.
- Every stage change is logged on the timeline.

## Examples

**New job description parsed**

```
JOBTRACKER v1
{
  "id": "example-studio-head-of-production",
  "action": "create",
  "company": "Example Studio",
  "role": "Head of Production",
  "location": "Hong Kong",
  "source": "LinkedIn",
  "jdUrl": "https://example.com/jobs/123",
  "priority": "High",
  "notes": "Leads three production teams, reports to the CEO",
  "contacts": [{ "name": "Jane Doe", "title": "Talent Partner", "type": "Recruiter", "lang": "EN" }],
  "log": { "date": "2026-10-27", "type": "Note", "text": "Job description reviewed" },
  "next": { "text": "Tailor resume and cover letter", "due": "2026-10-29" }
}
```

**Resume adjustments**

```
JOBTRACKER v1
{
  "id": "example-studio-head-of-production",
  "action": "update",
  "tailoring": { "resume": ["Lead the summary with LiveOps delivery results", "Move PMP and PMI-ACP into the header"] }
}
```

**Applied**

```
JOBTRACKER v1
{
  "id": "example-studio-head-of-production",
  "action": "update",
  "stage": "Applied",
  "log": { "date": "2026-10-30", "type": "Application", "text": "Applied via company careers page" },
  "next": { "text": "Follow up on application", "due": "2026-11-06" }
}
```

**Closed**

```
JOBTRACKER v1
{ "id": "example-studio-head-of-production", "action": "update", "stage": "Closed", "closedReason": "Rejected", "closedNote": "Role filled internally" }
```
