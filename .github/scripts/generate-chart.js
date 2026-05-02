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
                weekday
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

function extendToFullYear(apiWeeks) {
  // Get the last date the API returned
  const lastWeek = apiWeeks[apiWeeks.length - 1];
  const lastDay = lastWeek.contributionDays[lastWeek.contributionDays.length - 1];
  let lastDate = new Date(lastDay.date + "T12:00:00");

  const yearEnd = new Date("2026-12-31T12:00:00");

  if (lastDate >= yearEnd) return apiWeeks;

  const extraWeeks = [];
  let current = new Date(lastDate);
  current.setDate(current.getDate() + 1);

  while (current <= yearEnd) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const y = current.getFullYear();
      const mo = String(current.getMonth() + 1).padStart(2, "0");
      const da = String(current.getDate()).padStart(2, "0");
      const dateStr = `${y}-${mo}-${da}`;
      const inYear = current <= yearEnd;
      week.push({
        date: dateStr,
        contributionCount: inYear ? 0 : null,
        weekday: d,
      });
      current.setDate(current.getDate() + 1);
    }
    extraWeeks.push({ contributionDays: week });
  }

  return [...apiWeeks, ...extraWeeks];
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
    const m = parseInt(days[0].date.split("-")[1], 10) - 1;
    if (m !== lastMonth) {
      const x = LEFT_PAD + wi * STEP;
      monthLabels += `<text x="${x}" y="14" fill="#57606a" font-size="10" font-family="'Segoe UI',sans-serif">${months[m]}</text>`;
      lastMonth = m;
    }
  });

  const dayLabels = ["Mon", "Wed", "Fri"].map((label, i) => {
    const row = i === 0 ? 1 : i === 1 ? 3 : 5;
    const y = TOP_PAD + row * STEP + CELL - 2;
    return `<text x="0" y="${y}" fill="#57606a" font-size="10" font-family="'Segoe UI',sans-serif">${label}</text>`;
  }).join("");

  let cells = "";
  weeks.forEach((week, wi) => {
    week.contributionDays.forEach((day, dayIndex) => {
      if (day.contributionCount === null) return;
      // dayIndex from API: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
      const row = day.weekday !== undefined ? day.weekday : dayIndex;
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
  const weeks = extendToFullYear(apiWeeks);
  const svg = buildSVG(weeks);
  fs.writeFileSync("contribution-chart.svg", svg);
  console.log(`Done. ${weeks.length} weeks written.`);
})();
