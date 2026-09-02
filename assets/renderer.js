/* =========================================================
   renderer.js — 캔버스에 달력 배경화면을 그린다.

   외부 공개 API
     CalendarRenderer.render(canvas, state, scale) -> { cells: [...] }
       cells: [{ day, x, y, w, h }]  (논리 좌표계 = state.width x state.height)
   ========================================================= */
(function (global) {
  'use strict';

  var SANS = "'Pretendard','Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic'," +
             "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
  var SERIF = "'Iowan Old Style','Apple Garamond','Nanum Myeongjo',Georgia," +
              "'Times New Roman',serif";

  var WEEKDAYS = {
    ko: ['일', '월', '화', '수', '목', '금', '토'],
    en: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  };
  var MONTHS_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
                   'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

  /* ---------- 작은 유틸 ---------- */

  function font(size, weight, family) {
    return (weight || 400) + ' ' + Math.round(size) + 'px ' + (family || SANS);
  }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /* 자간(letter-spacing)을 흉내내어 한 줄을 그린다. align: left|center|right */
  function trackedText(ctx, text, x, y, spacing, align) {
    var chars = String(text).split('');
    var total = 0, i;
    for (i = 0; i < chars.length; i++) {
      total += ctx.measureText(chars[i]).width + (i < chars.length - 1 ? spacing : 0);
    }
    var cx = x;
    if (align === 'center') cx = x - total / 2;
    else if (align === 'right') cx = x - total;

    var prevAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    for (i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], cx, y);
      cx += ctx.measureText(chars[i]).width + spacing;
    }
    ctx.textAlign = prevAlign;
    return total;
  }

  /* 폭에 맞춰 줄바꿈. 최대 maxLines 줄, 넘치면 말줄임 */
  function wrapLines(ctx, text, maxWidth, maxLines) {
    var out = [];
    var rest = String(text).trim();
    if (!rest) return out;

    while (rest.length && out.length < maxLines) {
      var lo = 1, hi = rest.length, fit = 1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (ctx.measureText(rest.slice(0, mid)).width <= maxWidth) { fit = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      // 마지막 줄인데 남는 글자가 있으면 말줄임 처리
      if (out.length === maxLines - 1 && fit < rest.length) {
        var cut = fit;
        while (cut > 1 && ctx.measureText(rest.slice(0, cut) + '…').width > maxWidth) cut--;
        out.push(rest.slice(0, cut) + '…');
        return out;
      }
      // 되도록 공백에서 끊는다
      var slice = rest.slice(0, fit);
      if (fit < rest.length) {
        var sp = slice.lastIndexOf(' ');
        if (sp > fit * 0.5) { slice = slice.slice(0, sp); fit = sp + 1; }
      }
      out.push(slice.trim());
      rest = rest.slice(fit).trim();
    }
    return out;
  }

  /* #rrggbb 의 상대 밝기(0~1) */
  function luminance(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }

  function hexToRgba(hex, alpha) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  /* ---------- 배경 ---------- */

  function paintBackground(ctx, W, H, theme, state) {
    if (typeof theme.bg === 'string') {
      ctx.fillStyle = theme.bg;
    } else {
      var rad = (theme.bg.angle || 135) * Math.PI / 180;
      var len = Math.abs(W * Math.cos(rad)) + Math.abs(H * Math.sin(rad));
      var cx = W / 2, cy = H / 2;
      var dx = Math.cos(rad) * len / 2, dy = Math.sin(rad) * len / 2;
      var g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      g.addColorStop(0, theme.bg.from);
      g.addColorStop(1, theme.bg.to);
      ctx.fillStyle = g;
    }
    ctx.fillRect(0, 0, W, H);

    var img = state._bgImageEl;
    if (img && img.width) {
      // cover 방식으로 채우기
      var scale = Math.max(W / img.width, H / img.height);
      var dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);

      // 글자 가독성을 위한 스크림(어둡게/밝게)
      var dim = Math.max(0, Math.min(1, state.bgDim));
      if (dim > 0) {
        var base = (typeof theme.bg === 'string') ? theme.bg : theme.bg.to;
        ctx.fillStyle = hexToRgba(base, dim);
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  /* ---------- 제목(연/월) ---------- */

  function drawTitle(ctx, box, state, theme) {
    var titleFamily = state.font === 'serif' ? SERIF : SANS;
    var align = box.align || 'left';
    var x = align === 'left' ? box.x : (align === 'center' ? box.x + box.w / 2 : box.x + box.w);
    var unit = box.h;

    // 상단 라벨: 연도 + 영문 월 이름
    ctx.fillStyle = theme.sub;
    ctx.font = font(unit * 0.15, 500, SANS);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    var label = state.year + '   ' + MONTHS_EN[state.month - 1];
    trackedText(ctx, label, x, box.y + unit * 0.18, unit * 0.05, align);

    // 큰 월 표기
    var big = state.lang === 'ko' ? (state.month + '월') : MONTHS_EN[state.month - 1];
    var size = unit * (state.lang === 'ko' ? 0.62 : 0.42);
    ctx.font = font(size, state.font === 'serif' ? 500 : 300, titleFamily);
    while (ctx.measureText(big).width > box.w && size > 12) {
      size *= 0.94;
      ctx.font = font(size, state.font === 'serif' ? 500 : 300, titleFamily);
    }
    ctx.fillStyle = theme.ink;
    ctx.textAlign = align === 'center' ? 'center' : (align === 'right' ? 'right' : 'left');
    ctx.fillText(big, x, box.y + unit * 0.80);
    ctx.textAlign = 'left';

    // 강조 밑줄
    var lineW = Math.max(unit * 0.5, ctx.measureText(big).width * 0.28);
    var lx = align === 'center' ? x - lineW / 2 : (align === 'right' ? x - lineW : x);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(lx, box.y + unit * 0.99, lineW, Math.max(2, unit * 0.022));
  }

  /* ---------- 날짜 격자 ---------- */

  function drawGrid(ctx, box, state, theme, cells) {
    var first = new Date(state.year, state.month - 1, 1);
    var daysInMonth = new Date(state.year, state.month, 0).getDate();
    var prevMonthDays = new Date(state.year, state.month - 1, 0).getDate();
    var offset = (first.getDay() - state.weekStart + 7) % 7;
    var rows = Math.ceil((offset + daysInMonth) / 7);

    var colW = box.w / 7;
    var headerH = Math.min(box.h * 0.12, colW * 0.5);
    var rowH = (box.h - headerH) / rows;

    var today = new Date();
    var isThisMonth = today.getFullYear() === state.year && (today.getMonth() + 1) === state.month;

    var padX = colW * 0.1;

    // 요일 헤더 (날짜 숫자와 같은 왼쪽 기준선)
    var names = WEEKDAYS[state.lang];
    ctx.textBaseline = 'middle';
    ctx.font = font(headerH * 0.42, 600, SANS);
    for (var c = 0; c < 7; c++) {
      var dow = (state.weekStart + c) % 7;
      ctx.fillStyle = theme.sub;
      if (state.colorWeekend) {
        if (dow === 0) ctx.fillStyle = hexToRgba(theme.sunday, 0.85);
        else if (dow === 6) ctx.fillStyle = hexToRgba(theme.saturday, 0.85);
      }
      trackedText(ctx, names[dow], box.x + colW * c + padX, box.y + headerH * 0.55,
                  headerH * 0.08, 'left');
    }

    // 헤더 아래 구분선
    ctx.fillStyle = hexToRgba(theme.line, 0.9);
    ctx.fillRect(box.x, box.y + headerH, box.w, Math.max(1, box.h * 0.0022));

    var numSize = Math.min(rowH * 0.32, colW * 0.34);
    var evtSize = Math.max(numSize * 0.42, Math.min(rowH * 0.15, colW * 0.14));

    for (var i = 0; i < rows * 7; i++) {
      var r = Math.floor(i / 7), col = i % 7;
      var cx = box.x + col * colW;
      var cy = box.y + headerH + r * rowH;
      var dayNum = i - offset + 1;
      var dow2 = (state.weekStart + col) % 7;

      var inMonth = dayNum >= 1 && dayNum <= daysInMonth;
      var shownNum = inMonth ? dayNum
                    : (dayNum < 1 ? prevMonthDays + dayNum : dayNum - daysInMonth);

      if (!inMonth && !state.showAdjacent) continue;

      // 행 구분선(격자 스타일일 때만 촘촘하게)
      if (state.grid === 'lines' && r > 0 && col === 0) {
        ctx.fillStyle = hexToRgba(theme.line, 0.55);
        ctx.fillRect(box.x, cy, box.w, Math.max(1, box.h * 0.0014));
      }

      var color = theme.ink;
      if (state.colorWeekend && dow2 === 0) color = theme.sunday;
      else if (state.colorWeekend && dow2 === 6) color = theme.saturday;
      if (!inMonth) color = hexToRgba(theme.sub, 0.45);

      var numX = cx + padX;
      var numY = cy + rowH * 0.28;

      // 오늘 강조
      if (inMonth && state.highlightToday && isThisMonth && today.getDate() === dayNum) {
        var d = numSize * 1.7;
        ctx.fillStyle = theme.todayBg;
        roundRect(ctx, numX - d * 0.28, numY - d / 2, d, d, d / 2);
        ctx.fill();
        color = theme.todayInk;
      }

      ctx.fillStyle = color;
      ctx.font = font(numSize, state.font === 'serif' ? 500 : 400,
                      state.font === 'serif' ? SERIF : SANS);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(shownNum), numX, numY);

      if (inMonth) {
        cells.push({ day: dayNum, x: cx, y: cy, w: colW, h: rowH });

        // 일정 텍스트
        var key = state.year + '-' + state.month + '-' + dayNum;
        var text = state.events[key];
        if (text) {
          ctx.font = font(evtSize, 500, SANS);
          var lines = wrapLines(ctx, text, colW - padX * 2, 2);
          var ty = numY + numSize * 0.95 + evtSize * 0.75;
          ctx.fillStyle = theme.accent;
          for (var l = 0; l < lines.length; l++) {
            ctx.fillText(lines[l], numX, ty + l * evtSize * 1.25);
          }
        }
      }
    }
  }

  /* ---------- 사이드 패널(할 일 / 메모) ---------- */

  function drawPanel(ctx, box, state, theme) {
    var y = box.y;
    var titleSize = Math.min(box.w * 0.09, box.h * 0.055);
    var itemSize = titleSize * 0.82;

    function heading(text) {
      ctx.fillStyle = theme.accent;
      ctx.font = font(titleSize, 700, SANS);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      trackedText(ctx, text, box.x, y, titleSize * 0.12, 'left');
      y += titleSize * 0.55;
      ctx.fillStyle = hexToRgba(theme.line, 0.9);
      ctx.fillRect(box.x, y, box.w, Math.max(1, titleSize * 0.045));
      y += titleSize * 1.05;
    }

    // 뒤쪽 빈 줄은 버리고, 중간의 빈 줄은 여백으로 남긴다
    var todos = state.todos.map(function (t) { return String(t === undefined ? '' : t); });
    while (todos.length && todos[todos.length - 1].trim() === '') todos.pop();
    if (state.showTodo) {
      heading(state.todoTitle || (state.lang === 'ko' ? '할 일' : 'TO DO'));

      var boxSize = itemSize * 0.82;
      var lineGap = itemSize * 2.0;
      var maxItems = Math.max(0, Math.floor((box.h * 0.55 - (y - box.y)) / lineGap));
      var count = Math.min(todos.length > 0 ? todos.length : 6, maxItems);

      for (var i = 0; i < count; i++) {
        var text = todos[i] || '';
        // 체크박스
        ctx.strokeStyle = hexToRgba(theme.sub, 0.7);
        ctx.lineWidth = Math.max(1, itemSize * 0.06);
        roundRect(ctx, box.x, y - boxSize * 0.75, boxSize, boxSize, boxSize * 0.22);
        ctx.stroke();

        if (text) {
          ctx.fillStyle = theme.ink;
          ctx.font = font(itemSize, 400, SANS);
          var lines = wrapLines(ctx, text, box.w - boxSize * 1.8, 1);
          ctx.fillText(lines[0] || '', box.x + boxSize * 1.6, y);
        }
        y += lineGap;
      }
      y += titleSize * 0.6;
    }

    if (state.showMemo) {
      heading(state.memoTitle || (state.lang === 'ko' ? '메모' : 'MEMO'));
      var gap = itemSize * 1.9;
      ctx.fillStyle = hexToRgba(theme.line, 0.75);
      while (y < box.y + box.h) {
        ctx.fillRect(box.x, y, box.w, Math.max(1, itemSize * 0.045));
        y += gap;
      }
    }
  }

  /* ---------- 레이아웃 & 진입점 ---------- */

  function layout(W, H, state) {
    var portrait = (W / H) < 1.05;
    var pad = Math.round(Math.min(W, H) * (portrait ? 0.09 : 0.075));
    var gap = Math.round(W * 0.035);
    var inner = { x: pad, y: pad, w: W - pad * 2, h: H - pad * 2 };
    var usePanel = state.showTodo || state.showMemo;

    if (portrait || state.layout === 'center' || !usePanel) {
      var titleH = Math.min(inner.h * 0.2, inner.w * 0.28);
      var align = state.layout === 'center' ? 'center' : (state.layout === 'right' ? 'right' : 'left');
      var calW = portrait ? inner.w : Math.min(inner.w, inner.h * 1.5);
      var calX = align === 'center' ? inner.x + (inner.w - calW) / 2
               : (align === 'right' ? inner.x + inner.w - calW : inner.x);
      var gridBox = {
        x: calX,
        y: inner.y + titleH + inner.h * 0.05,
        w: calW,
        h: inner.h - titleH - inner.h * 0.05
      };
      // 세로형에서는 아래쪽에 할 일 목록을 배치
      var panelBox = null;
      if (portrait && usePanel) {
        gridBox.h = inner.h * 0.5;
        panelBox = {
          x: inner.x,
          y: gridBox.y + gridBox.h + inner.h * 0.06,
          w: inner.w,
          h: inner.y + inner.h - (gridBox.y + gridBox.h + inner.h * 0.06)
        };
      }
      return {
        title: { x: calX, y: inner.y, w: calW, h: titleH, align: align },
        grid: gridBox,
        panel: panelBox
      };
    }

    // 가로형: 한쪽에 제목+패널, 반대쪽에 달력
    var panelW = (inner.w - gap) * 0.30;
    var calW2 = inner.w - gap - panelW;
    var panelX, calX2, titleAlign;
    if (state.layout === 'left') {           // 달력 왼쪽 / 패널 오른쪽
      calX2 = inner.x;
      panelX = inner.x + calW2 + gap;
      titleAlign = 'left';
    } else {                                  // 기본: 달력 오른쪽 / 패널 왼쪽
      panelX = inner.x;
      calX2 = inner.x + panelW + gap;
      titleAlign = 'left';
    }
    var titleH2 = Math.min(inner.h * 0.26, inner.w * 0.16);
    return {
      title: { x: panelX, y: inner.y, w: panelW, h: titleH2, align: titleAlign },
      grid: { x: calX2, y: inner.y, w: calW2, h: inner.h },
      panel: {
        x: panelX,
        y: inner.y + titleH2 + inner.h * 0.09,
        w: panelW,
        h: inner.h - titleH2 - inner.h * 0.09
      }
    };
  }

  function render(canvas, state, scale) {
    var W = state.width, H = state.height;
    var s = scale || 1;
    canvas.width = Math.round(W * s);
    canvas.height = Math.round(H * s);

    var ctx = canvas.getContext('2d');
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var theme = global.CalendarThemes[state.theme] || global.CalendarThemes.ivory;
    paintBackground(ctx, W, H, theme, state);

    // 사진 위에 올릴 때는 옅은 그림자로 글자를 또렷하게
    if (state._bgImageEl) {
      var dark = luminance(theme.ink) < 0.5;
      ctx.shadowColor = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = Math.min(W, H) * 0.008;
    }

    var L = layout(W, H, state);
    var cells = [];

    drawTitle(ctx, L.title, state, theme);
    drawGrid(ctx, L.grid, state, theme, cells);
    if (L.panel) drawPanel(ctx, L.panel, state, theme);

    if (state.footer) {
      ctx.fillStyle = hexToRgba(theme.sub, 0.8);
      ctx.shadowBlur = ctx.shadowBlur * 0.5;
      ctx.font = font(Math.min(H, W) * 0.016, 400, SANS);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(state.footer, W / 2, H - Math.min(W, H) * 0.03);
      ctx.textAlign = 'left';
    }

    return { cells: cells };
  }

  global.CalendarRenderer = { render: render };
})(window);
