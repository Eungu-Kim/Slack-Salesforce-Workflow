function safe(value) {
  return value && String(value).trim() ? value : "-";
}

function formatDate(isoString) {
  if (!isoString) return "-";

  const date = new Date(isoString);
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const map = {};
  parts.forEach((p) => {
    if (p.type !== "literal") {
      map[p.type] = p.value;
    }
  });

  return `${map.year}-${map.month}-${map.day} / ${map.hour}:${map.minute}`;
}

module.exports = {
  safe,
  formatDate
};
