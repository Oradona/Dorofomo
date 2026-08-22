const focusInput = document.getElementById("focusMinutes");
const restInput = document.getElementById("restMinutes");
const modeLabel = document.getElementById("modeLabel");
const noticeText = document.getElementById("noticeText");
const timerDisplay = document.getElementById("timerDisplay");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");

const asmrType = document.getElementById("asmrType");
const asmrVolume = document.getElementById("asmrVolume");

const xpText = document.getElementById("xpText");
const xpBar = document.getElementById("xpBar");

const friendName = document.getElementById("friendName");
const friendXp = document.getElementById("friendXp");
const addFriendBtn = document.getElementById("addFriendBtn");
const friendList = document.getElementById("friendList");
const rankingList = document.getElementById("rankingList");

const STORAGE_KEY = "dorofomo-state-v1";

let timerId = null;
let isFocusMode = true;
let activeFocusSessionMinutes = clampMinutes(focusInput.value, 1, 180, 25);
let timeLeftSeconds = activeFocusSessionMinutes * 60;

let state = {
  xp: 0,
  friends: [],
};

let audioCtx;
let asmrNodes = [];
let currentGainNode = null;

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.xp === "number") state.xp = Math.max(0, parsed.xp);
    if (Array.isArray(parsed.friends)) {
      state.friends = parsed.friends
        .filter(
          (friend) =>
            friend &&
            typeof friend.name === "string" &&
            Number.isFinite(friend.xp) &&
            friend.name.trim().length > 0
        )
        .map((friend) => ({
          name: friend.name.trim().slice(0, 20),
          xp: Math.max(0, Math.floor(friend.xp)),
        }))
        .slice(0, 100);
    }
  } catch {
    // ignore broken storage
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clampMinutes(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function levelFromXp(xp) {
  return Math.floor(xp / 100) + 1;
}

function updateXpUI() {
  const xp = state.xp;
  const level = levelFromXp(xp);
  const progress = xp % 100;
  xpText.textContent = `XP: ${xp} / 레벨: ${level}`;
  xpBar.style.width = `${progress}%`;
}

function renderFriends() {
  friendList.innerHTML = "";
  if (!state.friends.length) {
    const li = document.createElement("li");
    li.textContent = "아직 친구가 없습니다.";
    friendList.appendChild(li);
    return;
  }

  state.friends.forEach((friend, index) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${friend.name} (XP ${friend.xp}) `;
    const removeButton = document.createElement("button");
    removeButton.className = "secondary";
    removeButton.setAttribute("data-remove", String(index));
    removeButton.textContent = "삭제";
    li.append(label, removeButton);
    friendList.appendChild(li);
  });
}

function renderRanking() {
  rankingList.innerHTML = "";
  const ranking = [
    { name: "나", xp: state.xp },
    ...state.friends.map((f) => ({ name: f.name, xp: f.xp })),
  ].sort((a, b) => b.xp - a.xp);

  ranking.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = `${entry.name} - XP ${entry.xp} (Lv.${levelFromXp(entry.xp)})`;
    rankingList.appendChild(li);
  });
}

function updateTimerUI() {
  modeLabel.textContent = `현재 모드: ${isFocusMode ? "집중" : "휴식"}`;
  timerDisplay.textContent = formatTime(timeLeftSeconds);
}

function notify(message) {
  noticeText.textContent = message;
}

function setTimeFromInputs() {
  const focusM = clampMinutes(focusInput.value, 1, 180, 25);
  const restM = clampMinutes(restInput.value, 1, 60, 5);
  focusInput.value = String(focusM);
  restInput.value = String(restM);
  timeLeftSeconds = (isFocusMode ? focusM : restM) * 60;
  updateTimerUI();
}

function addXpForSession() {
  const gained = activeFocusSessionMinutes * 10;
  state.xp += gained;
  saveState();
  updateXpUI();
  renderRanking();
}

function tick() {
  timeLeftSeconds -= 1;
  if (timeLeftSeconds <= 0) {
    pauseTimer();
    if (isFocusMode) {
      addXpForSession();
      notify("집중 세션 완료! XP를 획득했습니다.");
    } else {
      notify("휴식 시간 완료! 다시 집중을 시작하세요.");
    }

    isFocusMode = !isFocusMode;
    const nextMin = isFocusMode
      ? clampMinutes(focusInput.value, 1, 180, 25)
      : clampMinutes(restInput.value, 1, 60, 5);
    timeLeftSeconds = nextMin * 60;
    updateTimerUI();
    return;
  }
  updateTimerUI();
}

function startTimer() {
  if (timerId) return;
  if (isFocusMode) {
    const configuredFocusMinutes = clampMinutes(focusInput.value, 1, 180, 25);
    if (timeLeftSeconds === configuredFocusMinutes * 60) {
      activeFocusSessionMinutes = configuredFocusMinutes;
    }
  }
  timerId = setInterval(tick, 1000);
}

function pauseTimer() {
  if (!timerId) return;
  clearInterval(timerId);
  timerId = null;
}

function resetTimer() {
  pauseTimer();
  isFocusMode = true;
  setTimeFromInputs();
  notify("");
}

function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function clearAsmrNodes() {
  asmrNodes.forEach((node) => {
    try {
      node.stop?.();
    } catch {
      // no-op
    }
    try {
      node.disconnect?.();
    } catch {
      // no-op
    }
  });
  asmrNodes = [];
  currentGainNode = null;
}

function createNoise(type = "white") {
  const bufferSize = audioCtx.sampleRate * 2;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const output = buffer.getChannelData(0);

  let lastOut = 0;
  for (let i = 0; i < bufferSize; i += 1) {
    const white = Math.random() * 2 - 1;
    if (type === "rain") {
      lastOut = (lastOut + 0.02 * white) / 1.02;
      output[i] = lastOut * 3.5;
    } else {
      output[i] = white;
    }
  }

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

function playAsmr(selectedType) {
  if (selectedType === "off") {
    clearAsmrNodes();
    return;
  }

  ensureAudioContext();
  clearAsmrNodes();

  const gain = audioCtx.createGain();
  gain.gain.value = Number(asmrVolume.value) / 100;
  gain.connect(audioCtx.destination);
  currentGainNode = gain;

  if (selectedType === "tone") {
    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 432;
    osc.connect(gain);
    osc.start();
    asmrNodes.push(osc, gain);
    return;
  }

  const noise = createNoise(selectedType);
  noise.connect(gain);
  noise.start();
  asmrNodes.push(noise, gain);
}

focusInput.addEventListener("change", setTimeFromInputs);
restInput.addEventListener("change", setTimeFromInputs);

startBtn.addEventListener("click", () => {
  ensureAudioContext();
  startTimer();
});

pauseBtn.addEventListener("click", pauseTimer);
resetBtn.addEventListener("click", resetTimer);

asmrType.addEventListener("change", () => {
  playAsmr(asmrType.value);
});

asmrVolume.addEventListener("input", () => {
  if (!audioCtx || !currentGainNode) return;
  currentGainNode.gain.setTargetAtTime(
    Number(asmrVolume.value) / 100,
    audioCtx.currentTime,
    0.01
  );
});

addFriendBtn.addEventListener("click", () => {
  const name = friendName.value.trim().slice(0, 20);
  const xp = Math.min(99999, Math.max(0, Math.floor(Number(friendXp.value) || 0)));
  if (!name) return;

  const existing = state.friends.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.name = name;
    existing.xp = xp;
    notify(`${name} 정보가 업데이트되었습니다.`);
  } else {
    if (state.friends.length >= 100) {
      notify("친구는 최대 100명까지 추가할 수 있습니다.");
      return;
    }
    state.friends.push({ name, xp });
    notify(`${name} 친구가 추가되었습니다.`);
  }

  friendName.value = "";
  friendXp.value = "0";
  saveState();
  renderFriends();
  renderRanking();
});

friendList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const rawIndex = target.getAttribute("data-remove");
  if (rawIndex === null) return;
  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0 || index >= state.friends.length) return;
  state.friends.splice(index, 1);
  saveState();
  renderFriends();
  renderRanking();
});

loadState();
updateXpUI();
renderFriends();
renderRanking();
updateTimerUI();
