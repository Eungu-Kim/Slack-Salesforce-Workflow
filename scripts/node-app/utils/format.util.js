// Null 방지
function safe(value) {
  return value && String(value).trim() ? value : "-";
}

// CreatedDate 한국 기준 시간 + yyyy-mm-dd / hh:mm 포맷 설정
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
