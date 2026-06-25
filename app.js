/* ================================================================
   app.js — 기자 미팅 메모 대시보드
   구글 시트 Apps Script 웹앱 URL을 아래에 입력하세요.
   ================================================================ */

const APPS_SCRIPT_URL = "여기에_앱스스크립트_웹앱_URL_입력";

/* ── 색상 / 분류 ─────────────────────────────────────── */
const COLORS = ["av-blue", "av-teal", "av-amber", "av-coral", "av-purple"];
const KARLY_CLASS = {
  "매우 애용": "karly-high",
  "보통": "karly-mid",
  "가끔": "karly-low",
  "미이용": "karly-no",
};

/* ── 상태 ────────────────────────────────────────────── */
let data = [];
let filters = { karly: "all", coffee: "all" };
let editId = null;
let isSaving = false;

/* ── 초기화 ──────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  initFilters();
  initContentTextarea();
  loadData();
  // 3분마다 자동 동기화
  setInterval(loadData, 3 * 60 * 1000);
});

/* ── 구글 시트에서 데이터 불러오기 ──────────────────── */
async function loadData() {
  setSyncStatus("동기화 중...");
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=getAll`, { cache: "no-store" });
    if (!res.ok) throw new Error("Network error");
    const json = await res.json();
    if (json.status !== "ok") throw new Error(json.message || "Unknown error");
    data = json.data;
    renderCards();
    setSyncStatus(`${fmtTime(new Date())} 동기화됨`);
  } catch (e) {
    console.error(e);
    setSyncStatus("동기화 실패 — 재시도하려면 새로고침");
  }
}

/* ── 구글 시트에 데이터 저장 ─────────────────────────── */
async function pushRow(row) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error("Save failed");
  const json = await res.json();
  if (json.status !== "ok") throw new Error(json.message || "Save error");
  return json;
}

/* ── 유틸 ────────────────────────────────────────────── */
function getColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % COLORS.length;
  return COLORS[h];
}

function fmtDate(d) {
  if (!d) return "";
  const p = d.split("-");
  return `${p[0]}.${+p[1]}.${+p[2]}`;
}

function fmtTime(d) {
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function setSyncStatus(msg) {
  const el = document.getElementById("syncText");
  if (el) el.textContent = msg;
}

/* ── 필터 초기화 ─────────────────────────────────────── */
function initFilters() {
  document.querySelectorAll("#karlyFilter .chip").forEach((c) =>
    c.addEventListener("click", () => {
      document.querySelectorAll("#karlyFilter .chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      filters.karly = c.dataset.val;
      renderCards();
    })
  );
  document.querySelectorAll("#coffeeFilter .chip").forEach((c) =>
    c.addEventListener("click", () => {
      document.querySelectorAll("#coffeeFilter .chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      filters.coffee = c.dataset.val;
      renderCards();
    })
  );
}

/* ── 카드 렌더 ───────────────────────────────────────── */
function getFiltered() {
  const q = document.getElementById("searchInput").value.toLowerCase();
  return data.filter((j) => {
    if (filters.karly !== "all" && j.karly !== filters.karly) return false;
    if (filters.coffee !== "all" && j.coffee !== filters.coffee) return false;
    if (q && !j.name.includes(q) && !j.media.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderCards() {
  const filtered = getFiltered();
  const list = document.getElementById("cardList");

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-msg">조건에 맞는 기자가 없습니다</div>`;
    return;
  }

  list.innerHTML = filtered
    .map((j) => {
      const col = getColor(j.name);
      const content = Array.isArray(j.content) ? j.content : [];
      const memoHtml = content.length
        ? content.map((m) => `<div class="memo-item">${escHtml(m)}</div>`).join("")
        : `<div class="memo-empty">아직 내용이 없습니다</div>`;

      const karlyTag = j.karly
        ? `<span class="meta-tag ${KARLY_CLASS[j.karly] || ""}">컬리 ${j.karly}</span>`
        : "";

      const locationParts = [j.area, j.place].filter(Boolean).join(" · ");
      const coffeeStr = j.coffee ? ` (커피 ${j.coffee})` : "";
      const locationTag = locationParts
        ? `<span class="meta-tag"><i class="ti ti-map-pin" style="font-size:10px;margin-right:2px" aria-hidden="true"></i>${locationParts}${coffeeStr}</span>`
        : "";

      const attendees = Array.isArray(j.attendees) ? j.attendees : [];
      const attendeesTag = attendees.length
        ? `<span class="meta-tag"><i class="ti ti-users" style="font-size:10px;margin-right:2px" aria-hidden="true"></i>${attendees.join(", ")}</span>`
        : "";

      return `<div class="jcard">
        <div class="jcard-header">
          <div class="jcard-left">
            <div class="avatar ${col}">${j.name[0]}</div>
            <div>
              <div class="jcard-name">${escHtml(j.name)}</div>
              <div class="jcard-sub">${escHtml(j.media)} · ${fmtDate(j.date)}</div>
            </div>
          </div>
          <div class="jcard-meta">${locationTag}${attendeesTag}${karlyTag}</div>
        </div>
        <div class="divider"></div>
        <div class="memo-list">${memoHtml}</div>
        <button class="edit-btn" onclick="openModal('${j.id}')">
          <i class="ti ti-pencil" style="font-size:11px" aria-hidden="true"></i> 수정
        </button>
      </div>`;
    })
    .join("");
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ── 모달 열기 ───────────────────────────────────────── */
function openModal(id) {
  editId = id;
  const f = id ? data.find((d) => d.id == id) : null;
  document.getElementById("modalTitle").textContent = f ? "미팅 메모 수정" : "새 미팅 메모";
  document.getElementById("f_date").value = f ? f.date : new Date().toISOString().slice(0, 10);
  document.getElementById("f_media").value = f ? f.media : "";
  document.getElementById("f_name").value = f ? f.name : "";
  document.getElementById("f_area").value = f ? f.area : "";
  document.getElementById("f_place").value = f ? f.place : "";

  setRadio("f_coffee", f ? f.coffee : null);
  setRadio("f_karly", f ? f.karly : null);
  setChecks("f_attendees", f ? f.attendees : []);

  const ta = document.getElementById("f_content");
  const lines = f && Array.isArray(f.content) && f.content.length
    ? f.content.map((c) => "• " + c).join("\n")
    : "• ";
  ta.value = lines;

  updateOtherInput();
  renderAreaSuggestions();
  document.getElementById("overlay").classList.add("open");
  setTimeout(() => ta.setSelectionRange(ta.value.length, ta.value.length), 50);
}

function closeModal() {
  document.getElementById("overlay").classList.remove("open");
  editId = null;
}

/* ── 폼 헬퍼 ─────────────────────────────────────────── */
function setRadio(groupId, val) {
  document.querySelectorAll(`#${groupId} .radio-opt`).forEach((o) => {
    o.classList.toggle("active", o.dataset.val === val);
    o.onclick = () => {
      document.querySelectorAll(`#${groupId} .radio-opt`).forEach((x) => x.classList.remove("active"));
      o.classList.add("active");
    };
  });
}

function setChecks(groupId, vals) {
  const arr = Array.isArray(vals) ? vals : [];
  document.querySelectorAll(`#${groupId} .check-opt`).forEach((o) => {
    o.classList.toggle("active", arr.includes(o.dataset.val));
    o.onclick = () => {
      o.classList.toggle("active");
      if (o.dataset.val === "__기타__") updateOtherInput();
    };
  });
}

function updateOtherInput() {
  const active = [...document.querySelectorAll("#f_attendees .check-opt.active")].map((o) => o.dataset.val);
  document.getElementById("f_attendees_other").style.display = active.includes("__기타__") ? "block" : "none";
}

function getRecentAreas() {
  const seen = new Set();
  const result = [];
  [...data].reverse().forEach((d) => {
    if (d.area && !seen.has(d.area)) { seen.add(d.area); result.push(d.area); }
  });
  return result.slice(0, 5);
}

function renderAreaSuggestions() {
  const q = document.getElementById("f_area").value.toLowerCase();
  const recent = getRecentAreas().filter((a) => !q || a.toLowerCase().includes(q));
  document.getElementById("areaSuggestions").innerHTML = recent
    .map((a) => `<span class="suggestion-chip" onclick="pickArea('${a}')">${a}</span>`)
    .join("");
}

function pickArea(a) {
  document.getElementById("f_area").value = a;
  renderAreaSuggestions();
}

/* ── 내용 textarea 엔터 처리 ─────────────────────────── */
function initContentTextarea() {
  const ta = document.getElementById("f_content");
  ta.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const after = ta.value.slice(pos);
    ta.value = before + "\n• " + after;
    ta.selectionStart = ta.selectionEnd = pos + 3;
  });
  ta.addEventListener("focus", () => {
    if (ta.value === "") ta.value = "• ";
  });
}

/* ── 저장 ────────────────────────────────────────────── */
async function saveEntry() {
  if (isSaving) return;

  const date = document.getElementById("f_date").value;
  const media = document.getElementById("f_media").value.trim();
  const name = document.getElementById("f_name").value.trim();
  if (!date || !media || !name) { alert("날짜, 매체명, 기자명은 필수입니다."); return; }

  const coffee = document.querySelector("#f_coffee .radio-opt.active")?.dataset.val || "";
  const karly = document.querySelector("#f_karly .radio-opt.active")?.dataset.val || "";
  const area = document.getElementById("f_area").value.trim();
  const place = document.getElementById("f_place").value.trim();

  const rawAttendees = [...document.querySelectorAll("#f_attendees .check-opt.active")]
    .map((o) => o.dataset.val)
    .filter((v) => v !== "__기타__");
  const other = document.getElementById("f_attendees_other").value.trim();
  if (other) rawAttendees.push(other);

  const rawContent = document.getElementById("f_content").value;
  const content = rawContent.split("\n").map((l) => l.replace(/^[•·\-]\s*/, "").trim()).filter(Boolean);

  const row = { id: editId || null, date, media, name, attendees: rawAttendees, area, place, coffee, karly, content };

  isSaving = true;
  document.querySelector(".btn-save").textContent = "저장 중...";
  try {
    const res = await pushRow(row);
    // 서버에서 받은 id로 로컬 데이터 갱신
    if (editId) {
      const idx = data.findIndex((d) => d.id == editId);
      if (idx >= 0) data[idx] = { ...data[idx], ...row, id: res.id || editId };
    } else {
      data.push({ ...row, id: res.id });
    }
    closeModal();
    renderCards();
    setSyncStatus(`${fmtTime(new Date())} 저장됨`);
  } catch (e) {
    alert("저장에 실패했습니다. 인터넷 연결을 확인해 주세요.\n" + e.message);
  } finally {
    isSaving = false;
    document.querySelector(".btn-save").textContent = "저장";
  }
}

/* ── ESC 키로 모달 닫기 ──────────────────────────────── */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});
