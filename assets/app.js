/* =========================================================
   app.js — 설정 UI, 상태 저장, 미리보기, PNG 내보내기
   ========================================================= */
(function () {
  'use strict';

  var STORAGE_KEY = 'calendar-wallpaper-state-v1';
  var PREVIEW_MAX_W = 1600;   // 미리보기는 이 폭 이하로 축소해 그린다

  var SIZES = [
    { label: 'FHD 1920 × 1080 (가장 많이 씀)', w: 1920, h: 1080 },
    { label: 'QHD 2560 × 1440', w: 2560, h: 1440 },
    { label: '4K UHD 3840 × 2160', w: 3840, h: 2160 },
    { label: 'HD 1366 × 768 (노트북)', w: 1366, h: 768 },
    { label: '맥북 16" 3456 × 2234', w: 3456, h: 2234 },
    { label: '맥북 13/14" 2560 × 1600', w: 2560, h: 1600 },
    { label: '울트라와이드 3440 × 1440', w: 3440, h: 1440 },
    { label: '아이패드 2048 × 2732', w: 2048, h: 2732 },
    { label: '스마트폰 1179 × 2556', w: 1179, h: 2556 },
    { label: '직접 입력', w: 0, h: 0 }
  ];

  var now = new Date();

  function defaults() {
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      weekStart: 0,
      width: 1920,
      height: 1080,
      theme: 'ivory',
      layout: 'right',
      font: 'sans',
      lang: 'ko',
      grid: 'plain',
      highlightToday: true,
      colorWeekend: true,
      showAdjacent: false,
      showTodo: true,
      showMemo: true,
      todoTitle: '',
      memoTitle: '',
      todos: [],
      events: {},
      bgImage: null,
      bgDim: 0.35,
      footer: ''
    };
  }

  var state = defaults();
  var lastCells = [];
  var canvas = document.getElementById('preview-canvas');
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 저장 / 복원 ---------- */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* 용량 초과(배경 이미지 등) 시 무시 */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      Object.keys(defaults()).forEach(function (k) {
        if (saved[k] !== undefined && saved[k] !== null) state[k] = saved[k];
      });
    } catch (e) { /* 손상된 값은 무시 */ }
  }

  /* ---------- 배경 이미지 ---------- */

  function applyBgImage(dataUrl, done) {
    if (!dataUrl) { state._bgImageEl = null; state.bgImage = null; if (done) done(); return; }
    var img = new Image();
    img.onload = function () {
      state._bgImageEl = img;
      state.bgImage = dataUrl;
      if (done) done();
    };
    img.onerror = function () { state._bgImageEl = null; if (done) done(); };
    img.src = dataUrl;
  }

  /* ---------- 컨트롤 초기화 ---------- */

  function buildStaticOptions() {
    var y, i;

    var selYear = $('sel-year');
    for (y = now.getFullYear() - 3; y <= now.getFullYear() + 6; y++) {
      selYear.appendChild(new Option(y + '년', y));
    }

    var selMonth = $('sel-month');
    for (i = 1; i <= 12; i++) selMonth.appendChild(new Option(i + '월', i));

    var selSize = $('sel-size');
    SIZES.forEach(function (s, idx) { selSize.appendChild(new Option(s.label, idx)); });

    var swatches = $('swatches');
    Object.keys(window.CalendarThemes).forEach(function (key) {
      var t = window.CalendarThemes[key];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.theme = key;
      b.title = t.label;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', t.label);
      b.style.background = typeof t.bg === 'string'
        ? t.bg
        : 'linear-gradient(135deg,' + t.bg.from + ',' + t.bg.to + ')';
      b.addEventListener('click', function () {
        state.theme = key;
        syncControls();
        update();
      });
      swatches.appendChild(b);
    });
  }

  function rebuildEventDays() {
    var sel = $('sel-eventday');
    var keep = sel.value;
    var last = new Date(state.year, state.month, 0).getDate();
    sel.innerHTML = '';
    for (var d = 1; d <= last; d++) sel.appendChild(new Option(d + '일', d));
    if (keep && Number(keep) <= last) sel.value = keep;
  }

  function eventKey(day) {
    return state.year + '-' + state.month + '-' + day;
  }

  function renderEventList() {
    var ul = $('event-list');
    ul.innerHTML = '';
    var days = Object.keys(state.events)
      .filter(function (k) { return k.indexOf(state.year + '-' + state.month + '-') === 0; })
      .map(function (k) { return Number(k.split('-')[2]); })
      .sort(function (a, b) { return a - b; });

    days.forEach(function (day) {
      var li = document.createElement('li');
      var d = document.createElement('span');
      d.className = 'day';
      d.textContent = day + '일';
      var t = document.createElement('span');
      t.className = 'txt';
      t.textContent = state.events[eventKey(day)];
      var del = document.createElement('button');
      del.type = 'button';
      del.textContent = '삭제';
      del.addEventListener('click', function () {
        delete state.events[eventKey(day)];
        renderEventList();
        update();
      });
      li.appendChild(d); li.appendChild(t); li.appendChild(del);
      ul.appendChild(li);
    });
  }

  /* 상태 -> 컨트롤 값 반영 */
  function syncControls() {
    $('sel-year').value = state.year;
    $('sel-month').value = state.month;
    $('sel-weekstart').value = state.weekStart;
    $('sel-layout').value = state.layout;
    $('sel-font').value = state.font;
    $('sel-lang').value = state.lang;
    $('ck-today').checked = state.highlightToday;
    $('ck-weekend').checked = state.colorWeekend;
    $('ck-adjacent').checked = state.showAdjacent;
    $('ck-lines').checked = state.grid === 'lines';
    $('ck-todo').checked = state.showTodo;
    $('ck-memo').checked = state.showMemo;
    $('in-todotitle').value = state.todoTitle;
    $('ta-todos').value = state.todos.join('\n');
    $('in-dim').value = Math.round(state.bgDim * 100);
    $('in-footer').value = state.footer;

    var idx = -1;
    SIZES.forEach(function (s, i) {
      if (s.w === state.width && s.h === state.height) idx = i;
    });
    if (idx === -1) idx = SIZES.length - 1;   // 직접 입력
    $('sel-size').value = idx;
    $('custom-size').hidden = idx !== SIZES.length - 1;
    $('in-w').value = state.width;
    $('in-h').value = state.height;

    Array.prototype.forEach.call(document.querySelectorAll('.swatch'), function (b) {
      b.setAttribute('aria-checked', String(b.dataset.theme === state.theme));
    });
  }

  /* ---------- 미리보기 ---------- */

  function update() {
    var scale = Math.min(1, PREVIEW_MAX_W / state.width);
    var result = window.CalendarRenderer.render(canvas, state, scale);
    lastCells = result.cells;
    $('preview-size').textContent = state.width + ' × ' + state.height + ' px';
    save();
  }

  /* 미리보기 클릭 -> 해당 날짜 일정 입력 */
  function onCanvasClick(ev) {
    var rect = canvas.getBoundingClientRect();
    var fx = state.width / rect.width;
    var fy = state.height / rect.height;
    var x = (ev.clientX - rect.left) * fx;
    var y = (ev.clientY - rect.top) * fy;

    for (var i = 0; i < lastCells.length; i++) {
      var c = lastCells[i];
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
        $('sel-eventday').value = c.day;
        var input = $('in-eventtext');
        input.value = state.events[eventKey(c.day)] || '';
        input.focus();
        input.select();
        return;
      }
    }
  }

  /* ---------- 내보내기 ---------- */

  function download() {
    var out = document.createElement('canvas');
    window.CalendarRenderer.render(out, state, 1);

    var name = 'calendar-' + state.year + '-' +
               ('0' + state.month).slice(-2) + '-' +
               state.width + 'x' + state.height + '.png';

    var finish = function (url, revoke) {
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (revoke) setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    };

    if (out.toBlob) {
      out.toBlob(function (blob) {
        if (blob) finish(URL.createObjectURL(blob), true);
        else finish(out.toDataURL('image/png'), false);
      }, 'image/png');
    } else {
      finish(out.toDataURL('image/png'), false);
    }
  }

  /* ---------- 이벤트 연결 ---------- */

  function shiftMonth(delta) {
    var m = state.month + delta;
    var y = state.year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    state.month = m;
    state.year = y;
    rebuildEventDays();
    renderEventList();
    syncControls();
    update();
  }

  function bind() {
    $('btn-prev').addEventListener('click', function () { shiftMonth(-1); });
    $('btn-next').addEventListener('click', function () { shiftMonth(1); });
    $('btn-today').addEventListener('click', function () {
      var t = new Date();
      state.year = t.getFullYear();
      state.month = t.getMonth() + 1;
      rebuildEventDays(); renderEventList(); syncControls(); update();
    });

    $('sel-year').addEventListener('change', function () {
      state.year = Number(this.value); rebuildEventDays(); renderEventList(); update();
    });
    $('sel-month').addEventListener('change', function () {
      state.month = Number(this.value); rebuildEventDays(); renderEventList(); update();
    });
    $('sel-weekstart').addEventListener('change', function () {
      state.weekStart = Number(this.value); update();
    });

    $('sel-size').addEventListener('change', function () {
      var idx = Number(this.value);
      var custom = idx === SIZES.length - 1;
      $('custom-size').hidden = !custom;
      if (!custom) {
        state.width = SIZES[idx].w;
        state.height = SIZES[idx].h;
        $('in-w').value = state.width;
        $('in-h').value = state.height;
      }
      update();
    });

    function readCustomSize() {
      var w = Math.max(320, Math.min(8000, Number($('in-w').value) || 1920));
      var h = Math.max(320, Math.min(8000, Number($('in-h').value) || 1080));
      state.width = w; state.height = h;
      update();
    }
    $('in-w').addEventListener('change', readCustomSize);
    $('in-h').addEventListener('change', readCustomSize);

    $('sel-layout').addEventListener('change', function () { state.layout = this.value; update(); });
    $('sel-font').addEventListener('change', function () { state.font = this.value; update(); });
    $('sel-lang').addEventListener('change', function () { state.lang = this.value; update(); });

    $('ck-today').addEventListener('change', function () { state.highlightToday = this.checked; update(); });
    $('ck-weekend').addEventListener('change', function () { state.colorWeekend = this.checked; update(); });
    $('ck-adjacent').addEventListener('change', function () { state.showAdjacent = this.checked; update(); });
    $('ck-lines').addEventListener('change', function () { state.grid = this.checked ? 'lines' : 'plain'; update(); });
    $('ck-todo').addEventListener('change', function () { state.showTodo = this.checked; update(); });
    $('ck-memo').addEventListener('change', function () { state.showMemo = this.checked; update(); });

    $('in-todotitle').addEventListener('input', function () { state.todoTitle = this.value; update(); });
    $('ta-todos').addEventListener('input', function () {
      state.todos = this.value.split('\n');
      update();
    });
    $('in-footer').addEventListener('input', function () { state.footer = this.value; update(); });

    $('btn-addevent').addEventListener('click', function () {
      var day = Number($('sel-eventday').value);
      var text = $('in-eventtext').value.trim();
      if (!day) return;
      if (text) state.events[eventKey(day)] = text;
      else delete state.events[eventKey(day)];
      $('in-eventtext').value = '';
      renderEventList();
      update();
    });
    $('in-eventtext').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('btn-addevent').click(); }
    });

    $('in-bg').addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { applyBgImage(reader.result, update); };
      reader.readAsDataURL(file);
    });
    $('btn-clearbg').addEventListener('click', function () {
      $('in-bg').value = '';
      applyBgImage(null, update);
    });
    $('in-dim').addEventListener('input', function () {
      state.bgDim = Number(this.value) / 100;
      update();
    });

    $('btn-download').addEventListener('click', download);
    $('btn-reset').addEventListener('click', function () {
      if (!window.confirm('모든 설정을 처음 상태로 되돌릴까요?')) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      state = defaults();
      $('in-bg').value = '';
      rebuildEventDays(); renderEventList(); syncControls(); update();
    });

    canvas.addEventListener('click', onCanvasClick);

    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'ArrowLeft') shiftMonth(-1);
      else if (e.key === 'ArrowRight') shiftMonth(1);
    });
  }

  /* ---------- 시작 ---------- */

  function init() {
    buildStaticOptions();
    load();
    rebuildEventDays();
    renderEventList();
    syncControls();
    bind();

    if (state.bgImage) applyBgImage(state.bgImage, update);
    else update();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
