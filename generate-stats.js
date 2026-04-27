// .github/scripts/generate-stats.js
// Fetches your public OSS contributions and patches the README stats section.

const { graphql } = require("@octokit/graphql");
const fs = require("fs");

const USERNAME = process.env.GH_USERNAME || "nodesagar";
const TOKEN = process.env.GH_TOKEN;

const gql = graphql.defaults({
  headers: { authorization: `token ${TOKEN}` },
});

async function getContributions() {
  const { user } = await gql(`
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          totalCommitContributions
          totalPullRequestContributions
          totalIssueContributions
          totalRepositoryContributions
          contributionCalendar {
            totalContributions
          }
        }
        pullRequests(states: MERGED, first: 100, orderBy: {field: CREATED_AT, direction: DESC}) {
          totalCount
          nodes {
            repository {
              nameWithOwner
              stargazerCount
              url
            }
          }
        }
        issues(first: 100, orderBy: {field: CREATED_AT, direction: DESC}) {
          nodes {
            repository {
              nameWithOwner
              stargazerCount
              url
            }
          }
        }
      }
    }
  `, { login: USERNAME });

  return user;
}

async function getStreakData() {
  // Uses the public streak-stats API for streak numbers
  const res = await fetch(`https://streak-stats.demolab.com/?user=${USERNAME}&type=json`);
  if (!res.ok) return { currentStreak: "—", longestStreak: "—", totalContributions: "—" };
  const data = await res.json();
  return {
    currentStreak: data.currentStreak?.length ?? "—",
    longestStreak: data.longestStreak?.length ?? "—",
    longestStreakStart: data.longestStreak?.start ?? "",
    longestStreakEnd: data.longestStreak?.end ?? "",
    totalContributions: data.totalContributions?.value ?? "—",
    firstContributionDate: data.firstContribution ?? "",
  };
}

function buildRepoTable(prs, issues) {
  // Aggregate repos
  const repos = {};

  for (const pr of prs.nodes) {
    const { nameWithOwner, stargazerCount, url } = pr.repository;
    // skip own repos
    if (nameWithOwner.startsWith(`${USERNAME}/`)) continue;
    if (!repos[nameWithOwner]) repos[nameWithOwner] = { stars: stargazerCount, mergedPRs: 0, reviews: 0, issues: 0, url };
    repos[nameWithOwner].mergedPRs++;
  }

  for (const issue of issues.nodes) {
    const { nameWithOwner, stargazerCount, url } = issue.repository;
    if (nameWithOwner.startsWith(`${USERNAME}/`)) continue;
    if (!repos[nameWithOwner]) repos[nameWithOwner] = { stars: stargazerCount, mergedPRs: 0, reviews: 0, issues: 0, url };
    repos[nameWithOwner].issues++;
  }

  // Sort by stars desc
  const sorted = Object.entries(repos).sort((a, b) => b[1].stars - a[1].stars).slice(0, 10);

  const totalPRs = sorted.reduce((s, [, v]) => s + v.mergedPRs, 0);
  const totalIssues = sorted.reduce((s, [, v]) => s + v.issues, 0);

  const rows = sorted
    .map(([name, v]) => `| [${name}](${v.url}) | ${v.stars.toLocaleString()} | ${v.mergedPRs} | ${v.reviews} | ${v.issues} |`)
    .join("\n");

  return { rows, totalPRs, totalIssues };
}

async function main() {
  console.log("Fetching contribution data...");
  const [user, streak] = await Promise.all([getContributions(), getStreakData()]);

  const { rows, totalPRs, totalIssues } = buildRepoTable(user.pullRequests, user.issues);

  const today = new Date().toISOString().split("T")[0];
  const firstDate = streak.firstContributionDate ? streak.firstContributionDate.split("T")[0] : "";
  const totalStr = streak.totalContributions.toLocaleString?.() ?? streak.totalContributions;

  const statsBlock = `<!-- STATS:START -->
## 📊 My Stats

| ${totalStr} | ${streak.currentStreak} | ${streak.longestStreak} |
|:---:|:---:|:---:|
| **Total Contributions** | **Current Streak** | **Longest Streak** |
| ${firstDate} – Present | | ${streak.longestStreakStart} – ${streak.longestStreakEnd} |

### 🌱 OSS Contributions (Last 12 Months)

| Repository | ⭐ | Merged PRs | Reviews | Issues |
|---|---|---|---|---|
${rows}

**Totals (all public OSS):** ${totalPRs} merged PRs · ${totalIssues} issues

*Last updated: ${today}*
<!-- STATS:END -->`;

  // Read and patch README
  let readme = fs.readFileSync("README.md", "utf8");

  if (readme.includes("<!-- STATS:START -->")) {
    readme = readme.replace(/<!-- STATS:START -->[\s\S]*?<!-- STATS:END -->/m, statsBlock);
  } else {
    // Inject before the final <sub> line
    readme = readme.replace(/\n---\n\n<sub>/, `\n---\n\n${statsBlock}\n\n---\n\n<sub>`);
  }

  fs.writeFileSync("README.md", readme);
  console.log("README.md updated successfully.");
}

main().catch(console.error);
