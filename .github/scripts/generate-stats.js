// .github/scripts/generate-stats.js
const { graphql } = require("@octokit/graphql");
const fs = require("fs");

const USERNAME = process.env.GH_USERNAME || "nodesagar";

const gql = graphql.defaults({
  headers: { authorization: `token ${process.env.GH_TOKEN}` },
});

async function getData() {
  const { user } = await gql(`
    query($login: String!) {
      user(login: $login) {
        createdAt
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
        pullRequests(states: MERGED, first: 100, orderBy: {field: CREATED_AT, direction: DESC}) {
          nodes {
            repository { nameWithOwner stargazerCount url }
          }
        }
        issues(first: 100, orderBy: {field: CREATED_AT, direction: DESC}) {
          nodes {
            repository { nameWithOwner stargazerCount url }
          }
        }
      }
    }
  `, { login: USERNAME });
  return user;
}

function calcStreaks(weeks) {
  const days = weeks
    .flatMap(w => w.contributionDays)
    .sort((a, b) => a.date.localeCompare(b.date));

  const active = new Set(days.filter(d => d.contributionCount > 0).map(d => d.date));

  // Longest streak
  let longest = 0, tempLen = 0, tempStart = "", longestStart = "", longestEnd = "";
  for (const day of days) {
    if (active.has(day.date)) {
      if (tempLen === 0) tempStart = day.date;
      tempLen++;
      if (tempLen > longest) {
        longest = tempLen;
        longestStart = tempStart;
        longestEnd = day.date;
      }
    } else {
      tempLen = 0;
    }
  }

  // Current streak (walk backwards from today)
  let current = 0;
  let check = new Date();
  for (let i = 0; i < 365; i++) {
    const d = check.toISOString().split("T")[0];
    if (active.has(d)) {
      current++;
      check = new Date(check.getTime() - 86400000);
    } else if (i === 0) {
      // no contribution today, start checking from yesterday
      check = new Date(check.getTime() - 86400000);
    } else {
      break;
    }
  }

  return { current, longest, longestStart, longestEnd };
}

function buildTable(prs, issues) {
  const repos = {};

  for (const { repository: r } of prs.nodes) {
    if (r.nameWithOwner.startsWith(`${USERNAME}/`)) continue;
    repos[r.nameWithOwner] ??= { stars: r.stargazerCount, mergedPRs: 0, reviews: 0, issues: 0, url: r.url };
    repos[r.nameWithOwner].mergedPRs++;
  }

  for (const { repository: r } of issues.nodes) {
    if (r.nameWithOwner.startsWith(`${USERNAME}/`)) continue;
    repos[r.nameWithOwner] ??= { stars: r.stargazerCount, mergedPRs: 0, reviews: 0, issues: 0, url: r.url };
    repos[r.nameWithOwner].issues++;
  }

  const sorted = Object.entries(repos)
    .sort((a, b) => b[1].stars - a[1].stars)
    .slice(0, 10);

  const totalPRs = sorted.reduce((s, [, v]) => s + v.mergedPRs, 0);
  const totalIssues = sorted.reduce((s, [, v]) => s + v.issues, 0);
  const rows = sorted
    .map(([name, v]) => `| [${name}](${v.url}) | ${v.stars.toLocaleString()} | ${v.mergedPRs} | ${v.reviews} | ${v.issues} |`)
    .join("\n");

  return { rows, totalPRs, totalIssues };
}

async function main() {
  console.log("Fetching GitHub data...");
  const user = await getData();

  const calendar = user.contributionsCollection.contributionCalendar;
  const total = calendar.totalContributions.toLocaleString();
  const joinDate = user.createdAt.split("T")[0];
  const { current, longest, longestStart, longestEnd } = calcStreaks(calendar.weeks);
  const { rows, totalPRs, totalIssues } = buildTable(user.pullRequests, user.issues);
  const today = new Date().toISOString().split("T")[0];

  const block = `<!-- STATS:START -->
## 📊 My Stats

| ${total} | ${current} | ${longest} |
|:---:|:---:|:---:|
| **Total Contributions** | **Current Streak** | **Longest Streak** |
| ${joinDate} – Present | | ${longestStart} – ${longestEnd} |

### 🌱 OSS Contributions (Last 12 Months)

| Repository | ⭐ | Merged PRs | Reviews | Issues |
|---|---|---|---|---|
${rows}

**Totals (all public OSS):** ${totalPRs} merged PRs · ${totalIssues} issues

*Last updated: ${today}*
<!-- STATS:END -->`;

  let readme = fs.readFileSync("README.md", "utf8");

  if (readme.includes("<!-- STATS:START -->")) {
    readme = readme.replace(/<!-- STATS:START -->[\s\S]*?<!-- STATS:END -->/m, block);
  } else {
    readme = readme.replace(/\n---\n\n<sub>/, `\n---\n\n${block}\n\n---\n\n<sub>`);
  }

  fs.writeFileSync("README.md", readme);
  console.log("README.md patched successfully.");
}

main().catch(err => { console.error(err); process.exit(1); });
