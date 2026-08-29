(() => {
  "use strict";

  const SETTINGS_KEY = "pomodorous-settings-v1";
  const PROGRESS_KEY = "pomodorous-progress-v1";
  const TASKS_KEY = "pomodorous-tasks-v1";
  const RING_CIRCUMFERENCE = 2 * Math.PI * 196;
  const MODES = ["focus", "short", "long"];
  const MODE_NAMES = { focus: "Focus", short: "Short break", long: "Long break" };
  const DEFAULT_SETTINGS = {
    focus: 25,
    short: 5,
    long: 15,
    sessionsPerCycle: 4,
    autoStart: false,
    sound: true
  };

  const elements = {
    display: document.getElementById("timer-display"),
    status: document.getElementById("timer-status"),
    announcer: document.getElementById("announcer"),
    progressRing: document.getElementById("progress-ring-value"),
    timerPanel: document.getElementById("timer-panel"),
    toggle: document.getElementById("toggle-timer"),
    toggleLabel: document.getElementById("toggle-label"),
    reset: document.getElementById("reset-timer"),
    skip: document.getElementById("skip-timer"),
    modeTabs: [...document.querySelectorAll(".mode-tab")],
    sessionLabel: document.getElementById("session-label"),
    sessionDots: document.getElementById("session-dots"),
    focusSetup: document.getElementById("focus-setup"),
    activeTaskName: document.getElementById("active-task-name"),
    focusLengthValue: document.getElementById("focus-length-value"),
    decreaseFocus: document.getElementById("decrease-focus"),
    increaseFocus: document.getElementById("increase-focus"),
    settingsTrigger: document.getElementById("settings-trigger"),
    settingsDialog: document.getElementById("settings-dialog"),
    settingsForm: document.getElementById("settings-form"),
    closeSettings: document.getElementById("close-settings"),
    cancelSettings: document.getElementById("cancel-settings"),
    focusInput: document.getElementById("focus-minutes"),
    shortInput: document.getElementById("short-minutes"),
    longInput: document.getElementById("long-minutes"),
    sessionsPerCycleInput: document.getElementById("sessions-per-cycle"),
    autoStartInput: document.getElementById("auto-start"),
    soundInput: document.getElementById("sound-enabled"),
    taskForm: document.getElementById("task-form"),
    taskInput: document.getElementById("task-input"),
    taskList: document.getElementById("task-list"),
    taskEmpty: document.getElementById("task-empty"),
    taskTotal: document.getElementById("task-total"),
    weekTotal: document.getElementById("week-total"),
    weekChart: document.getElementById("week-chart")
  };

  const clampInteger = (value, fallback, min, max) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  };

  const localDateKey = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const sanitizeDailyMap = value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 120);
    const cutoffKey = localDateKey(cutoff);
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, amount]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= cutoffKey && Number(amount) > 0)
        .map(([key, amount]) => [key, Math.max(0, Number(amount) || 0)])
    );
  };

  const loadSettings = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (!stored) return { ...DEFAULT_SETTINGS };
      return {
        focus: clampInteger(stored.focus, DEFAULT_SETTINGS.focus, 1, 120),
        short: clampInteger(stored.short, DEFAULT_SETTINGS.short, 1, 60),
        long: clampInteger(stored.long, DEFAULT_SETTINGS.long, 1, 90),
        sessionsPerCycle: clampInteger(stored.sessionsPerCycle, DEFAULT_SETTINGS.sessionsPerCycle, 1, 8),
        autoStart: Boolean(stored.autoStart),
        sound: stored.sound !== false
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  };

  const loadProgress = sessionsPerCycle => {
    try {
      const stored = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null");
      return {
        completedFocus: clampInteger(stored?.completedFocus, 0, 0, sessionsPerCycle),
        dailySessions: sanitizeDailyMap(stored?.dailySessions)
      };
    } catch {
      return { completedFocus: 0, dailySessions: {} };
    }
  };

  const loadTaskData = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(TASKS_KEY) || "null");
      if (!stored || !Array.isArray(stored.tasks)) return { tasks: [], activeTaskId: null };
      const tasks = stored.tasks
        .filter(task => task && typeof task.title === "string" && task.title.trim())
        .slice(0, 50)
        .map(task => ({
          id: String(task.id || ""),
          title: task.title.trim().slice(0, 80),
          elapsedMs: Math.max(0, Number(task.elapsedMs) || 0),
          dailyMs: sanitizeDailyMap(task.dailyMs)
        }))
        .filter(task => task.id);
      const activeTaskId = tasks.some(task => task.id === stored.activeTaskId)
        ? stored.activeTaskId
        : tasks[0]?.id || null;
      return { tasks, activeTaskId };
    } catch {
      return { tasks: [], activeTaskId: null };
    }
  };

  let settings = loadSettings();
  const loadedProgress = loadProgress(settings.sessionsPerCycle);
  const loadedTaskData = loadTaskData();
  let tasks = loadedTaskData.tasks;
  let activeTaskId = loadedTaskData.activeTaskId;
  let dailySessions = loadedProgress.dailySessions;
  let lastTasksPersistAt = 0;
  let lastRenderedTaskSignature = "";
  let audioContext = null;

  const state = {
    mode: "focus",
    isRunning: false,
    totalMs: settings.focus * 60_000,
    remainingMs: settings.focus * 60_000,
    endAt: null,
    lastAccrualAt: null,
    completedFocus: loadedProgress.completedFocus
  };

  const durationFor = mode => settings[mode] * 60_000;
  const getActiveTask = () => tasks.find(task => task.id === activeTaskId) || null;

  const formatTime = milliseconds => {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const formatStudyTime = milliseconds => {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const totalMinutes = Math.floor(totalSeconds / 60);
    if (totalMinutes < 60) return `${totalMinutes}m`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  };

  const formatSummaryTime = milliseconds => {
    if (Math.max(0, milliseconds) < 60_000) {
      return `${Math.floor(Math.max(0, milliseconds) / 1000)}s`;
    }
    const totalMinutes = Math.floor(Math.max(0, milliseconds) / 60_000);
    if (totalMinutes < 60) return `${totalMinutes}m`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  };

  const persistTasks = () => {
    localStorage.setItem(TASKS_KEY, JSON.stringify({ tasks, activeTaskId }));
    lastTasksPersistAt = Date.now();
  };

  const persistProgress = () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ completedFocus: state.completedFocus, dailySessions }));
  };

  const getRecentDays = () => Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return {
      date,
      key: localDateKey(date),
      shortLabel: new Intl.DateTimeFormat("en", { weekday: "narrow" }).format(date),
      fullLabel: new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" }).format(date)
    };
  });

  const totalForDay = key => tasks.reduce((sum, task) => sum + (task.dailyMs[key] || 0), 0);

  const renderWeekChart = () => {
    const days = getRecentDays();
    const values = days.map(day => totalForDay(day.key));
    const maxValue = Math.max(...values, 1);
    const weekTotal = values.reduce((sum, value) => sum + value, 0);
    elements.weekTotal.textContent = formatSummaryTime(weekTotal);
    elements.weekChart.replaceChildren();

    days.forEach((day, index) => {
      const column = document.createElement("div");
      column.className = "week-day";
      column.title = `${day.fullLabel}: ${formatStudyTime(values[index])}`;
      const track = document.createElement("span");
      track.className = "week-bar-track";
      const bar = document.createElement("span");
      bar.className = "week-bar";
      const percentage = values[index] > 0 ? Math.max(8, (values[index] / maxValue) * 100) : 0;
      bar.style.height = `${percentage}%`;
      track.append(bar);
      const label = document.createElement("span");
      label.className = "week-label";
      label.textContent = day.shortLabel;
      column.append(track, label);
      elements.weekChart.append(column);
    });

    elements.weekChart.setAttribute("aria-label", `${formatStudyTime(weekTotal)} studied in the last 7 days`);
  };

  const updateTaskTimes = (force = false) => {
    const todayKey = localDateKey();
    const taskSignature = tasks
      .map(task => `${Math.floor(task.elapsedMs / 1000)}:${Math.floor((task.dailyMs[todayKey] || 0) / 1000)}`)
      .join("|");
    if (!force && taskSignature === lastRenderedTaskSignature) return;
    lastRenderedTaskSignature = taskSignature;
    elements.taskTotal.textContent = `${formatSummaryTime(totalForDay(todayKey))} today`;

    elements.taskList.querySelectorAll(".task-row").forEach(row => {
      const task = tasks.find(item => item.id === row.dataset.taskId);
      if (!task) return;
      const time = row.querySelector(".task-time");
      time.textContent = formatStudyTime(task.elapsedMs);
      time.title = `${formatStudyTime(task.dailyMs[todayKey] || 0)} today`;
    });
    renderWeekChart();
  };

  const renderTasks = () => {
    elements.taskList.replaceChildren();
    elements.taskEmpty.hidden = tasks.length > 0;

    tasks.forEach(task => {
      const row = document.createElement("li");
      row.className = "task-row";
      row.dataset.taskId = task.id;
      row.classList.toggle("is-active", task.id === activeTaskId);

      const selectButton = document.createElement("button");
      selectButton.className = "task-select";
      selectButton.type = "button";
      selectButton.dataset.action = "select";
      selectButton.setAttribute("aria-pressed", String(task.id === activeTaskId));
      selectButton.setAttribute("aria-label", `Work on ${task.title}`);

      const indicator = document.createElement("span");
      indicator.className = "task-indicator";
      indicator.setAttribute("aria-hidden", "true");
      const title = document.createElement("span");
      title.className = "task-title";
      title.textContent = task.title;
      const time = document.createElement("span");
      time.className = "task-time";
      time.textContent = formatStudyTime(task.elapsedMs);
      selectButton.append(indicator, title, time);

      const removeButton = document.createElement("button");
      removeButton.className = "task-remove";
      removeButton.type = "button";
      removeButton.dataset.action = "remove";
      removeButton.setAttribute("aria-label", `Delete ${task.title}`);
      removeButton.title = "Delete task";
      removeButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17"></path></svg>';

      row.append(selectButton, removeButton);
      elements.taskList.append(row);
    });
    updateTaskTimes(true);
    updateDisplay();
  };

  const accrueTaskTime = (now = Date.now()) => {
    if (!state.isRunning || state.lastAccrualAt === null) return;
    const elapsedMs = Math.min(Math.max(0, now - state.lastAccrualAt), Math.max(0, state.remainingMs));
    state.lastAccrualAt = now;
    if (state.mode !== "focus" || elapsedMs === 0) return;
    const activeTask = getActiveTask();
    if (!activeTask) return;

    const todayKey = localDateKey(new Date(now));
    activeTask.elapsedMs += elapsedMs;
    activeTask.dailyMs[todayKey] = (activeTask.dailyMs[todayKey] || 0) + elapsedMs;
    updateTaskTimes();
    if (now - lastTasksPersistAt >= 4000) persistTasks();
  };

  const announce = message => {
    elements.announcer.textContent = "";
    window.setTimeout(() => { elements.announcer.textContent = message; }, 20);
  };

  const renderSessionDots = () => {
    if (elements.sessionDots.children.length === settings.sessionsPerCycle) return;
    elements.sessionDots.replaceChildren();
    for (let index = 0; index < settings.sessionsPerCycle; index += 1) {
      elements.sessionDots.append(document.createElement("span"));
    }
  };

  const updateSessionProgress = () => {
    renderSessionDots();
    const cycleComplete = state.completedFocus >= settings.sessionsPerCycle;
    const sessionNumber = Math.min(state.completedFocus + 1, settings.sessionsPerCycle);
    elements.sessionLabel.textContent = cycleComplete
      ? "Cycle complete"
      : `Session ${sessionNumber} of ${settings.sessionsPerCycle}`;
    [...elements.sessionDots.children].forEach((dot, index) => {
      dot.classList.toggle("is-complete", index < state.completedFocus);
      dot.classList.toggle("is-current", !cycleComplete && index === sessionNumber - 1);
    });
  };

  const updateModeTabs = () => {
    elements.modeTabs.forEach(tab => {
      const isActive = tab.dataset.mode === state.mode;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });
    elements.timerPanel.setAttribute("aria-labelledby", `tab-${state.mode}`);
    elements.focusSetup.hidden = state.mode !== "focus";
  };

  const updateDisplay = () => {
    const formatted = formatTime(state.remainingMs);
    const progress = state.totalMs > 0 ? Math.min(1, Math.max(0, 1 - state.remainingMs / state.totalMs)) : 0;
    const activeTask = getActiveTask();
    const needsTask = state.mode === "focus" && !activeTask;
    elements.display.textContent = formatted;
    elements.progressRing.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - (progress || 0.004)));
    elements.toggle.classList.toggle("is-running", state.isRunning);
    elements.toggle.disabled = needsTask;
    elements.toggleLabel.textContent = state.isRunning ? "Pause" : "Start";
    elements.toggle.setAttribute("aria-label", needsTask
      ? "Select a task before starting"
      : state.isRunning ? "Pause timer" : "Start timer");
    elements.status.textContent = needsTask
      ? "Select a task before starting the focus timer"
      : `${MODE_NAMES[state.mode]} timer ${state.isRunning ? "running" : "paused"}, ${formatted} remaining`;
    elements.activeTaskName.textContent = activeTask?.title || "Select a task to begin";
    elements.focusLengthValue.textContent = `${settings.focus} min`;
    elements.decreaseFocus.disabled = state.isRunning || settings.focus <= 5;
    elements.increaseFocus.disabled = state.isRunning || settings.focus >= 120;
    document.title = `${formatted}${state.isRunning ? " ·" : " —"} Pomodorous`;
  };

  const render = () => {
    updateDisplay();
    updateModeTabs();
    updateSessionProgress();
  };

  const syncRemainingTime = (now = Date.now()) => {
    if (state.isRunning && state.endAt !== null) state.remainingMs = Math.max(0, state.endAt - now);
  };

  const primeAudio = () => {
    if (!settings.sound) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") audioContext.resume();
    } catch {
      audioContext = null;
    }
  };

  const playChime = () => {
    if (!settings.sound) return;
    primeAudio();
    if (!audioContext) return;
    const now = audioContext.currentTime;
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);
    gain.connect(audioContext.destination);
    [523.25, 659.25].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.13);
      oscillator.connect(gain);
      oscillator.start(now + index * 0.13);
      oscillator.stop(now + 1.2);
    });
  };

  const stopTimer = () => {
    const now = Date.now();
    accrueTaskTime(now);
    syncRemainingTime(now);
    state.isRunning = false;
    state.endAt = null;
    state.lastAccrualAt = null;
    persistTasks();
  };

  const startTimer = () => {
    if (state.mode === "focus" && !getActiveTask()) {
      announce("Select a task before starting");
      return;
    }
    if (state.remainingMs <= 0) state.remainingMs = state.totalMs;
    primeAudio();
    const now = Date.now();
    state.isRunning = true;
    state.endAt = now + state.remainingMs;
    state.lastAccrualAt = now;
    const activeTask = getActiveTask();
    const taskMessage = state.mode === "focus" && activeTask ? ` for ${activeTask.title}` : "";
    announce(`${MODE_NAMES[state.mode]} timer started${taskMessage}`);
    updateDisplay();
  };

  const pauseTimer = () => {
    stopTimer();
    announce(`${MODE_NAMES[state.mode]} timer paused at ${formatTime(state.remainingMs)}`);
    updateDisplay();
  };

  const toggleTimer = () => state.isRunning ? pauseTimer() : startTimer();

  const setMode = (mode, options = {}) => {
    if (!MODES.includes(mode)) return;
    stopTimer();
    if (mode === "focus" && state.completedFocus >= settings.sessionsPerCycle) {
      state.completedFocus = 0;
      persistProgress();
    }
    state.mode = mode;
    state.totalMs = durationFor(mode);
    state.remainingMs = state.totalMs;
    render();
    if (options.announce !== false) announce(`${MODE_NAMES[mode]} set for ${settings[mode]} minutes`);
    if (options.start) startTimer();
  };

  const resetTimer = () => {
    stopTimer();
    state.totalMs = durationFor(state.mode);
    state.remainingMs = state.totalMs;
    announce(`${MODE_NAMES[state.mode]} timer reset`);
    updateDisplay();
  };

  const recordCompletedFocus = () => {
    const todayKey = localDateKey();
    dailySessions[todayKey] = (dailySessions[todayKey] || 0) + 1;
  };

  const nextModeAfterCompletion = (completedMode, creditFocus) => {
    if (completedMode === "focus") {
      if (creditFocus) {
        state.completedFocus = Math.min(settings.sessionsPerCycle, state.completedFocus + 1);
        recordCompletedFocus();
        persistProgress();
      }
      return state.completedFocus >= settings.sessionsPerCycle ? "long" : "short";
    }
    if (completedMode === "long") {
      state.completedFocus = 0;
      persistProgress();
    }
    return "focus";
  };

  const finishSession = ({ chime = true, skipped = false } = {}) => {
    const completedMode = state.mode;
    stopTimer();
    state.remainingMs = 0;
    updateDisplay();
    if (chime) playChime();
    const nextMode = nextModeAfterCompletion(completedMode, !skipped && completedMode === "focus");
    const completionMessage = skipped
      ? `${MODE_NAMES[completedMode]} skipped. ${MODE_NAMES[nextMode]} is ready.`
      : `${MODE_NAMES[completedMode]} complete. ${MODE_NAMES[nextMode]} is ready.`;
    window.setTimeout(() => {
      setMode(nextMode, { announce: false, start: settings.autoStart });
      announce(completionMessage);
    }, skipped ? 0 : 450);
  };

  const tick = () => {
    if (!state.isRunning) return;
    const now = Date.now();
    accrueTaskTime(now);
    syncRemainingTime(now);
    if (state.remainingMs <= 0) {
      finishSession();
      return;
    }
    updateDisplay();
  };

  const createTaskId = () => window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const selectTask = taskId => {
    if (!tasks.some(task => task.id === taskId) || taskId === activeTaskId) return;
    const now = Date.now();
    accrueTaskTime(now);
    activeTaskId = taskId;
    state.lastAccrualAt = state.isRunning ? now : null;
    persistTasks();
    renderTasks();
    announce(`${getActiveTask().title} selected`);
  };

  const removeTask = taskId => {
    const task = tasks.find(item => item.id === taskId);
    if (!task) return;
    const now = Date.now();
    accrueTaskTime(now);
    syncRemainingTime(now);
    tasks = tasks.filter(item => item.id !== taskId);
    if (activeTaskId === taskId) activeTaskId = tasks[0]?.id || null;
    if (state.isRunning && state.mode === "focus" && !activeTaskId) {
      state.isRunning = false;
      state.endAt = null;
      state.lastAccrualAt = null;
    } else {
      state.lastAccrualAt = state.isRunning ? now : null;
    }
    persistTasks();
    renderTasks();
    announce(`${task.title} deleted`);
  };

  const adjustFocusMinutes = delta => {
    if (state.isRunning || state.mode !== "focus") return;
    const next = clampInteger(settings.focus + delta, settings.focus, 5, 120);
    if (next === settings.focus) return;
    settings.focus = next;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    state.totalMs = durationFor("focus");
    state.remainingMs = state.totalMs;
    render();
    announce(`Focus length set to ${next} minutes`);
  };

  const openSettings = () => {
    stopTimer();
    updateDisplay();
    elements.focusInput.value = settings.focus;
    elements.shortInput.value = settings.short;
    elements.longInput.value = settings.long;
    elements.sessionsPerCycleInput.value = settings.sessionsPerCycle;
    elements.autoStartInput.checked = settings.autoStart;
    elements.soundInput.checked = settings.sound;
    elements.settingsDialog.showModal();
  };

  const closeSettings = () => elements.settingsDialog.close();

  const saveSettings = event => {
    event.preventDefault();
    if (!elements.settingsForm.reportValidity()) return;
    settings = {
      focus: clampInteger(elements.focusInput.value, settings.focus, 1, 120),
      short: clampInteger(elements.shortInput.value, settings.short, 1, 60),
      long: clampInteger(elements.longInput.value, settings.long, 1, 90),
      sessionsPerCycle: clampInteger(elements.sessionsPerCycleInput.value, settings.sessionsPerCycle, 1, 8),
      autoStart: elements.autoStartInput.checked,
      sound: elements.soundInput.checked
    };
    state.completedFocus = Math.min(state.completedFocus, settings.sessionsPerCycle);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    persistProgress();
    state.totalMs = durationFor(state.mode);
    state.remainingMs = state.totalMs;
    state.isRunning = false;
    state.endAt = null;
    state.lastAccrualAt = null;
    closeSettings();
    render();
    announce("Timer settings saved");
  };

  elements.taskForm.addEventListener("submit", event => {
    event.preventDefault();
    const title = elements.taskInput.value.trim();
    if (!title) return;
    const now = Date.now();
    accrueTaskTime(now);
    const task = { id: createTaskId(), title: title.slice(0, 80), elapsedMs: 0, dailyMs: {} };
    tasks.push(task);
    activeTaskId = task.id;
    state.lastAccrualAt = state.isRunning ? now : null;
    elements.taskInput.value = "";
    persistTasks();
    renderTasks();
    elements.taskInput.focus();
    announce(`${task.title} added and selected`);
  });

  elements.taskList.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    const row = button?.closest(".task-row");
    if (!button || !row) return;
    if (button.dataset.action === "select") selectTask(row.dataset.taskId);
    if (button.dataset.action === "remove") removeTask(row.dataset.taskId);
  });

  elements.decreaseFocus.addEventListener("click", () => adjustFocusMinutes(-5));
  elements.increaseFocus.addEventListener("click", () => adjustFocusMinutes(5));
  elements.toggle.addEventListener("click", toggleTimer);
  elements.reset.addEventListener("click", resetTimer);
  elements.skip.addEventListener("click", () => finishSession({ chime: false, skipped: true }));

  elements.modeTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (index + direction + elements.modeTabs.length) % elements.modeTabs.length;
      elements.modeTabs[nextIndex].focus();
      setMode(elements.modeTabs[nextIndex].dataset.mode);
    });
  });

  elements.settingsTrigger.addEventListener("click", openSettings);
  elements.closeSettings.addEventListener("click", closeSettings);
  elements.cancelSettings.addEventListener("click", closeSettings);
  elements.settingsForm.addEventListener("submit", saveSettings);
  elements.settingsDialog.addEventListener("click", event => {
    if (event.target === elements.settingsDialog) closeSettings();
  });

  document.addEventListener("keydown", event => {
    const target = event.target;
    const isEditing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if (isEditing || elements.settingsDialog.open) return;
    if (event.code === "Space") {
      event.preventDefault();
      toggleTimer();
    }
    if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      resetTimer();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tick();
  });

  window.addEventListener("beforeunload", () => {
    accrueTaskTime();
    persistTasks();
    persistProgress();
  });

  window.setInterval(tick, 250);
  renderTasks();
  render();
})();
