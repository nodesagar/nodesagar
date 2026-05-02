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

function buildFullYearWeeks(apiWeeks) {
  const countMap = {};
  for (const week of apiWeeks) {
    for (const day of week.contributionDays) {
      countMap[day.date] = day.contributionCount;
    }
  }

  const start = new Date(2026, 0, 1);
  const end = new Date(2026, 11, 31);

  const gridStart = new Date(start);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay()); // back to Sunday

  const weeks = [];
  let current = new Date(gridStart);

  while (current <= end || current.getDay() !== 0) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const y = current.getFullYear();
      const mo = String(current.getMonth() + 1).padStart(2, "0");
      const da = String(current.getDate()).padStart(2, "0");
      const dateStr = `${y}-${mo}-${da}`;
      const isIn2026 = current.getFullYear() === 2026 && current >= start && current <= end;
      week.push({
        date: dateStr,
        contributionCount: isIn2026 ? (countMap[dateStr] || 0) : null,
      });
      current.setDate(current.getDate() + 1);
    }
    weeks.push({ contributionDays: week });
  }

  return weeks;
}

function getColor(count) {
  if (count === null) return "transparent";
  if (count === 0) return "#ebedf0";
  if (count <= 3) return "#9be9a8";
  if (count <= 6) return "#40c463";
  if (count <= 9) return "#30a14e";
  return "#216e39";
}

function buildSVG(weeks) {
  const CELL = 10;
  const GAP = 2;
  const STEP = CELL + GAP;
  const TOP_PAD = 24;
  const LEFT_PAD = 28;

  const numWeeks = weeks.length;
  const width = LEFT_PAD + numWeeks * STEP + 10;
  const height = TOP_PAD + 7 * STEP + 10;

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let monthLabels = "";
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const days = week.contributionDays.filter(d => d.contributionCount !== null);
    if (!days.length) return;
    const [, mo] = days[0].date.split("-").map(Number);
    const m = mo - 1;
    if (m !== lastMonth) {
      const x = LEFT_PAD + wi * STEP;
      monthLabels += `<text x="${x}" y="14" fill="#57606a" font-size="10" font-family="'Segoe UI',sans-serif">${months[m]}</text>`;
      lastMonth = m;
    }
  });

  // Sun=row 0 (top), Mon=1, Wed=3, Fri=5, Sat=6 (bottom)
  const dayLabels = ["Mon", "Wed", "Fri"].map((label, i) => {
    const row = i === 0 ? 1 : i === 1 ? 3 : 5;
    const y = TOP_PAD + row * STEP + CELL - 2;
    return `<text x="0" y="${y}" fill="#57606a" font-size="10" font-family="'Segoe UI',sans-serif">${label}</text>`;
  }).join("");

  let cells = "";
  weeks.forEach((week, wi) => {
    week.contributionDays.forEach((day) => {
      if (day.contributionCount === null) return;
      const [y, mo, da] = day.date.split("-").map(Number);
      const dow = new Date(y, mo - 1, da).getDay(); // 0=Sun ... 6=Sat
      const row = dow;
      const x = LEFT_PAD + wi * STEP;
      const cy = TOP_PAD + row * STEP;
      const color = getColor(day.contributionCount);
      cells += `<rect x="${x}" y="${cy}" width="${CELL}" height="${CELL}" rx="2" ry="2" fill="${color}"><title>${day.date}: ${day.contributionCount} contributions</title></rect>`;
    });
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="width:100%;height:auto">
  <rect width="${width}" height="${height}" fill="#0d1117" rx="6"/>
  ${monthLabels}
  ${dayLabels}
  ${cells}
</svg>`;
}

(async () => {
  const apiWeeks = await fetchContributions();
  const weeks = buildFullYearWeeks(apiWeeks);
  const svg = buildSVG(weeks);
  fs.writeFileSync("contribution-chart.svg", svg);
  console.log(`Done. ${weeks.length} weeks written.`);
})();
