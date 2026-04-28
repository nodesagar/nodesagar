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

  const { rows, totalPRs, totalIssues } = buildTable(user.pullRequests, user.issues);
  const today = new Date().toISOString().split("T")[0];

  const block = `<!-- STATS:START -->
**open source →**

| Repository | ⭐ | Merged PRs | Reviews | Issues |
|---|---|---|---|---|
${rows}

**Totals:** ${totalPRs} merged PRs · ${totalIssues} issues &nbsp;·&nbsp; *updated ${today}*
<!-- STATS:END -->`;

  let readme = fs.readFileSync("README.md", "utf8");

  if (readme.includes("<!-- STATS:START -->")) {
    readme = readme.replace(/<!-- STATS:START -->[\s\S]*?<!-- STATS:END -->/m, block);
  } else {
    readme = readme.replace(/\n---\n\n<sub>/, `\n---\n\n${block}\n\n---\n\n<sub>`);
  }

  fs.writeFileSync("README.md", readme);
  console.log("Done.");
}

main().catch(err => { console.error(err); process.exit(1); });
