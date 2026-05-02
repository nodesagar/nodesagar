const fs = require("fs");

const USERNAME = process.env.USERNAME;
const TOKEN = process.env.GITHUB_TOKEN;
const FROM = "2026-01-01T00:00:00Z";
const TO = new Date().toISOString();

async function fetchContributions() {
  const query = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { login: USERNAME, from: FROM, to: TO } }),
  });

  const data = await res.json();

  if (data.errors) {
    console.error("GraphQL errors:", JSON.stringify(data.errors, null, 2));
    process.exit(1);
  }

  return data.data.user.contributionsCollection.contributionCalendar.weeks;
}

function getColor(count) {
  if (count === 0) return "#161b22";
  if (count <= 3) return "#0e4429";
  if (count <= 6) return "#006d32";
  if (count <= 9) return "#26a641";
  return "#39d353";
}

function buildSVG(weeks) {
  const CELL = 13;
  const GAP = 2;
  const STEP = CELL + GAP;
  const TOP_PAD = 30;
  const LEFT_PAD = 32;

  const numWeeks = weeks.length;
  const width = LEFT_PAD + numWeeks * STEP + 10;
  const height = TOP_PAD + 7 * STEP + 10;

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let monthLabels = "";
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const firstDay = new Date(week.contributionDays[0].date);
    const m = firstDay.getMonth();
    if (m !== lastMonth) {
      const x = LEFT_PAD + wi * STEP;
      monthLabels += `<text x="${x}" y="16" fill="#8b949e" font-size="10" font-family="'Segoe UI',sans-serif">${months[m]}</text>`;
      lastMonth = m;
    }
  });

  const dayLabels = ["Mon", "Wed", "Fri"].map((label, i) => {
    const row = i === 0 ? 1 : i === 1 ? 3 : 5;
    const y = TOP_PAD + row * STEP + CELL - 2;
    return `<text x="0" y="${y}" fill="#8b949e" font-size="10" font-family="'Segoe UI',sans-serif">${label}</text>`;
  }).join("");

  let cells = "";
  weeks.forEach((week, wi) => {
    week.contributionDays.forEach((day) => {
      const d = new Date(day.date);
      const dow = d.getDay();
      const row = dow === 0 ? 6 : dow - 1;
      const x = LEFT_PAD + wi * STEP;
      const y = TOP_PAD + row * STEP;
      const color = getColor(day.contributionCount);
      cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" ry="2" fill="${color}"><title>${day.date}: ${day.contributionCount} contributions</title></rect>`;
    });
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#0d1117" rx="6"/>
  ${monthLabels}
  ${dayLabels}
  ${cells}
</svg>`;
}

(async () => {
  const weeks = await fetchContributions();
  const svg = buildSVG(weeks);
  fs.writeFileSync("contribution-chart.svg", svg);
  console.log(`Done. ${weeks.length} weeks written.`);
})();
