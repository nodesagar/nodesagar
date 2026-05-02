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

function buildGrid(apiWeeks) {
  // Build count lookup from API data
  const countMap = {};
  for (const week of apiWeeks) {
    for (const day of week.contributionDays) {
      countMap[day.date] = day.contributionCount;
    }
  }

  // Jan 1 2026 is a Thursday (getDay()=4)
  // Grid starts on the Sunday before Jan 1
  const yearStart = new Date(2026, 0, 1);   // local time, no timezone shift
  const yearEnd   = new Date(2026, 11, 31);

  // Rewind to the Sunday on or before Jan 1
  const gridStart = new Date(yearStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  // Advance to the Saturday on or after Dec 31
  const gridEnd = new Date(yearEnd);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

  const weeks = [];
  let cur = new Date(gridStart);

  while (cur <= gridEnd) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const y  = cur.getFullYear();
      const mo = String(cur.getMonth() + 1).padStart(2, "0");
      const da = String(cur.getDate()).padStart(2, "0");
      const dateStr = `${y}-${mo}-${da}`;
      const inYear  = cur >= yearStart && cur <= yearEnd;
      week.push({
        date: dateStr,
        weekday: d,           // d=0 Sunday ... d=6 Saturday, always correct here
        count: inYear ? (countMap[dateStr] ?? 0) : null,
      });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
}

function getColor(count) {
  if (count === null) return "transparent";
  if (count === 0)    return "#ebedf0";
  if (count <= 3)     return "#9be9a8";
  if (count <= 6)     return "#40c463";
  if (count <= 9)     return "#30a14e";
  return "#216e39";
}

function buildSVG(weeks) {
  const CELL = 10, GAP = 2, STEP = CELL + GAP;
  const TOP_PAD = 24, LEFT_PAD = 28;

  const W = LEFT_PAD + weeks.length * STEP + 10;
  const H = TOP_PAD + 7 * STEP + 10;

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let monthLabels = "";
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const visible = week.filter(d => d.count !== null);
    if (!visible.length) return;
    const m = parseInt(visible[0].date.split("-")[1], 10) - 1;
    if (m !== lastMonth) {
      monthLabels += `<text x="${LEFT_PAD + wi * STEP}" y="14" fill="#57606a" font-size="10" font-family="'Segoe UI',sans-serif">${MONTHS[m]}</text>`;
      lastMonth = m;
    }
  });

  const dayLabels = [["Mon", 1], ["Wed", 3], ["Fri", 5]].map(([label, row]) => {
    const y = TOP_PAD + row * STEP + CELL - 2;
    return `<text x="0" y="${y}" fill="#57606a" font-size="10" font-family="'Segoe UI',sans-serif">${label}</text>`;
  }).join("");

  let cells = "";
  weeks.forEach((week, wi) => {
    week.forEach((day) => {
      if (day.count === null) return;
      const x  = LEFT_PAD + wi * STEP;
      const cy = TOP_PAD + day.weekday * STEP;
      cells += `<rect x="${x}" y="${cy}" width="${CELL}" height="${CELL}" rx="2" ry="2" fill="${getColor(day.count)}"><title>${day.date}: ${day.count}</title></rect>`;
    });
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
  <rect width="${W}" height="${H}" fill="#0d1117" rx="6"/>
  ${monthLabels}
  ${dayLabels}
  ${cells}
</svg>`;
}

(async () => {
  const apiWeeks = await fetchContributions();
  const grid = buildGrid(apiWeeks);
  const svg  = buildSVG(grid);
  fs.writeFileSync("contribution-chart.svg", svg);
  console.log(`Done. ${grid.length} weeks written.`);
})();
