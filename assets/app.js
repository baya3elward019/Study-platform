(function () {
  "use strict";
  var TRACK = window.SAHABA_TRACKS[0], QS = window.SAHABA_QUESTIONS, CARDS = window.SAHABA_CARDS || [], QM = {}, CM = {};
  QS.forEach(function (q) { QM[q.id] = q; });
  CARDS.forEach(function (c) { CM[c.id] = c; });
  var SECS = [], SM = {};
  TRACK.domains.forEach(function (d) { d.sections.forEach(function (s) { s.dom = d; SECS.push(s); SM[s.id] = s; }); });
  var KEY = "sahaba.v1", STEPS = [1, 3, 7, 16, 35];
  var LOG_TRACKS = ["AZ-104", "AZ-500", "SOC L1", "IAM", "إلكترونيات / IoT"];
  var LOG_KINDS = ["لاب", "درس", "فيديو", "ملاحظة"];
  var app = document.getElementById("app"), root = document.documentElement;
  root.lang = "ar"; root.dir = "rtl";

  /* ---------- state ---------- */
  function blank() { return { q: {}, c: {}, obj: {}, log: [], days: {}, exams: [], flag: {}, note: {}, set: { goal: 20, examDate: "", theme: "" } }; }
  function merge(o) { var b = blank(), s = Object.assign(b, o); s.set = Object.assign(blank().set, o.set || {}); return s; }
  function load() {
    try { var o = JSON.parse(localStorage.getItem(KEY)); if (o && typeof o === "object") return merge(o); } catch (e) {}
    return blank();
  }
  var S = load(), memOnly = false;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { memOnly = true; } }

  /* ---------- helpers ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function dstr(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function day(n) { var d = new Date(); d.setDate(d.getDate() + (n || 0)); return dstr(d); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pct(x) { return Math.round(x * 100); }
  function st(id) { return S.q[id]; }
  function mastery(qs) { if (!qs.length) return 0; var t = 0; qs.forEach(function (q) { var s = st(q.id); if (s) t += Math.min(s.box, 4) / 4; }); return t / qs.length; }
  function inSec(id) { return QS.filter(function (q) { return q.s === id; }); }
  function inDom(id) { return QS.filter(function (q) { return q.s.split(".")[0] === id; }); }
  function dueList() { var t = day(); return QS.filter(function (q) { var s = st(q.id); return s && s.due <= t; }); }
  function newList() { return QS.filter(function (q) { return !st(q.id); }); }
  function weakQ(q) { var s = st(q.id); return s && s.wrong && s.box < 3; }
  function streak() { var n = 0, i = S.days[day()] ? 0 : -1; while (S.days[day(i)]) { n++; i--; } return n; }
  function bump(map, id, ok) {
    var s = map[id] || { box: 0, right: 0, wrong: 0 };
    if (ok) { s.box = Math.min(s.box + 1, 5); s.right++; s.due = day(STEPS[s.box - 1]); }
    else { s.box = 0; s.wrong++; s.due = day(1); }
    s.last = day(); map[id] = s;
    S.days[day()] = (S.days[day()] || 0) + 1;
    save();
  }
  function status(q) {
    var s = st(q.id);
    if (!s) return ["new", "جديد", "new"];
    if (s.box >= 3) return ["mastered", "متقن", "good"];
    if (s.due <= day()) return ["due", "مستحق", "due"];
    if (s.wrong) return ["weak", "محتاج شغل", "bad"];
    return ["learning", "بيتثبّت", ""];
  }
  var flash = "";

  /* ---------- theme ---------- */
  var THEMES = ["", "light", "dark"], TNAME = { "": "تلقائي", light: "فاتح", dark: "غامق" }, hostTheme = root.getAttribute("data-theme");
  function applyTheme() {
    var t = S.set.theme, b = document.getElementById("theme");
    if (t) root.setAttribute("data-theme", t); else if (hostTheme) root.setAttribute("data-theme", hostTheme); else root.removeAttribute("data-theme");
    if (b) b.textContent = "المظهر: " + TNAME[t || ""];
  }
  var tb = document.getElementById("theme");
  if (tb) tb.addEventListener("click", function () { S.set.theme = THEMES[(THEMES.indexOf(S.set.theme || "") + 1) % 3]; save(); applyTheme(); });
  applyTheme();

  /* ---------- question session ---------- */
  var ses = null, tick = null, cs = null;
  function mkItem(q) {
    var idx = q.o.map(function (_, i) { return i; });
    return { id: q.id, perm: shuffle(idx), sel: q.t === "yn" ? q.o.map(function () { return null; }) : [], done: false, ok: false };
  }
  function anyAns(it) { return it.sel.some(function (v) { return v !== null && v !== undefined; }); }
  function fullAns(it, q) { return q.t === "yn" ? it.sel.every(function (v) { return v === 0 || v === 1; }) : it.sel.length > 0; }
  function start(qs, mode, title, minutes) {
    if (!qs.length) { flash = "مفيش أسئلة مطابقة للاختيار ده."; render(); return; }
    cs = null;
    ses = { mode: mode, title: title, items: shuffle(qs).map(mkItem), i: 0, right: 0, n: qs.length, retry: {} };
    if (mode === "exam") {
      ses.end = Date.now() + minutes * 60000;
      tick = setInterval(function () {
        var el = document.getElementById("timer"); if (!ses || ses.fin) return;
        var left = ses.end - Date.now();
        if (left <= 0) { finishExam(); return; }
        if (el) { el.textContent = fmtT(left); el.classList.toggle("low", left < 300000); }
      }, 1000);
    }
    render(); window.scrollTo(0, 0);
  }
  function stop() { if (tick) clearInterval(tick); tick = null; ses = null; cs = null; }
  function fmtT(ms) { var s = Math.max(0, Math.round(ms / 1000)); return p2(Math.floor(s / 60)) + ":" + p2(s % 60); }
  function isRight(q, it) {
    if (q.t === "order") return it.sel.length === q.o.length && it.sel.every(function (v, i) { return v === i; });
    if (q.t === "yn") return it.sel.every(function (v, i) { return v === q.a[i]; });
    return q.a.slice().sort().join() === it.sel.slice().sort().join();
  }
  function grade(giveUp) {
    var it = ses.items[ses.i], q = QM[it.id];
    it.ok = !giveUp && isRight(q, it); it.done = true; it.gaveUp = !!giveUp;
    if (!it.again) { bump(S.q, q.id, it.ok); if (it.ok) ses.right++; }
    if (!it.ok && !it.again && !ses.retry[q.id]) { ses.retry[q.id] = 1; var r = mkItem(q); r.again = true; ses.items.push(r); }
    render();
  }
  function finishExam() {
    if (tick) clearInterval(tick); tick = null;
    var by = {};
    ses.items.forEach(function (it) {
      var q = QM[it.id]; it.ok = isRight(q, it); it.done = true; bump(S.q, q.id, it.ok);
      var d = q.s.split(".")[0]; by[d] = by[d] || [0, 0]; by[d][1]++; if (it.ok) { by[d][0]++; ses.right++; }
    });
    ses.fin = true; ses.by = by;
    S.exams.unshift({ d: day(), right: ses.right, n: ses.n, by: by }); S.exams = S.exams.slice(0, 20); save();
    render(); window.scrollTo(0, 0);
  }

  /* ---------- question markup ---------- */
  function qHtml(it, reveal) {
    var q = QM[it.id], sec = SM[q.s], locked = it.done || reveal, h = "", fl = !!S.flag[q.id];
    h += '<div class="q en" lang="en" dir="ltr"><div class="qtop"><div class="meta">' + esc(TRACK.name) + " · " + esc(q.s) + " " + esc(sec.name) + "</div>";
    h += '<button class="flag' + (fl ? " on" : "") + '" data-act="flag" data-id="' + q.id + '" aria-pressed="' + fl + '" title="علّم السؤال للرجوع ليه (F)">⚑ ' + (fl ? "متعلّم" : "علّم") + "</button></div>";
    h += '<div class="stem">' + esc(q.q) + "</div>";
    if (q.c) h += "<pre>" + esc(q.c) + "</pre>";
    if (q.t === "multi") h += '<div class="small muted">Select ' + q.a.length + " answers.</div>";
    if (q.t === "order") h += '<div class="small muted">Click the steps in the order they should be performed. Click a chosen step to remove it.</div>';
    if (q.t === "yn") {
      h += '<div class="yn">';
      it.perm.forEach(function (oi) {
        var v = it.sel[oi];
        h += '<div class="ynr"><span>' + esc(q.o[oi]) + '</span><div class="ynb">';
        [1, 0].forEach(function (val) {
          var cls = "yb";
          if (locked) { if (q.a[oi] === val) cls += " ok"; else if (v === val) cls += " no"; }
          else if (v === val) cls += " sel";
          h += '<button class="' + cls + '" data-act="yn" data-o="' + oi + '" data-v="' + val + '"' + (locked ? " disabled" : "") + ">" + (val ? "Yes" : "No") + "</button>";
        });
        h += "</div></div>";
      });
      h += "</div>";
    } else {
      h += '<div class="opts">';
      it.perm.forEach(function (oi, k) {
        var cls = "opt", key = String.fromCharCode(65 + k), pos = it.sel.indexOf(oi);
        if (q.t === "order") { if (pos > -1) { cls += " sel"; key = pos + 1; } else key = "·"; }
        else if (pos > -1) cls += " sel";
        if (locked) {
          if (q.t === "order") { key = oi + 1; cls = "opt" + (pos === oi ? " ok" : (it.gaveUp || pos < 0 ? "" : " no")); }
          else if (q.a.indexOf(oi) > -1) cls = "opt ok";
          else if (pos > -1) cls = "opt no";
        }
        h += '<button class="' + cls + '" data-act="pick" data-o="' + oi + '"' + (locked ? " disabled" : "") + '><span class="k">' + key + "</span><span>" + esc(q.o[oi]) + "</span></button>";
      });
      h += "</div>";
    }
    if (locked) {
      h += '<div class="exp" dir="rtl" lang="ar">';
      h += '<div class="verdict ' + (it.ok ? "ok" : "no") + '">' + (it.ok ? "إجابة صحيحة" : it.gaveUp ? "الإجابة الصحيحة متعلّمة بالأخضر" : "إجابة غلط") + "</div>";
      if (q.t === "order") h += '<p class="small muted">الأرقام بتوضّح الترتيب الصحيح.</p>';
      h += "<p>" + esc(q.e) + "</p>";
      h += '<p class="small"><a href="' + esc(sec.ref) + '" target="_blank" rel="noopener">راجع القسم ده على Microsoft Learn</a></p>';
      h += '<label class="f" for="note-' + q.id + '">ملاحظتك على السؤال (بتتحفظ لوحدها)<textarea class="note" id="note-' + q.id + '" data-note="' + q.id + '" placeholder="اكتب بكلامك ليه غلطت أو إيه اللي لازم تفتكره">' + esc(S.note[q.id] || "") + "</textarea></label></div>";
    }
    return h + "</div>";
  }

  function vSession() {
    var h = "";
    if (ses.fin) return vExamResult();
    if (ses.i >= ses.items.length) {
      h += '<section><div class="today"><div><h1>خلصت الجلسة</h1><p class="muted">جاوبت صح على <span class="num">' + ses.right + '</span> من <span class="num">' + ses.n + "</span> من أول محاولة. اللي غلطت فيه هيرجعلك بكرة.</p></div>";
      h += '<div class="row act"><button class="btn primary" data-act="exit">رجوع للرئيسية</button></div></div></section>';
      return h;
    }
    var it = ses.items[ses.i], q = QM[it.id], exam = ses.mode === "exam", total = ses.items.length;
    h += '<section><div class="sess-top"><h2>' + esc(ses.title) + '</h2><div class="row">';
    if (exam) h += '<span class="timer" id="timer">' + fmtT(ses.end - Date.now()) + "</span>";
    h += '<span class="num muted small">' + (ses.i + 1) + " / " + total + "</span>";
    h += '<button class="btn ghost" data-act="' + (exam ? "askEnd" : "exit") + '">' + (exam ? "تسليم الامتحان" : "إنهاء") + "</button></div></div>";
    h += '<div class="prog"><i style="width:' + pct(ses.i / total) + '%"></i></div>';
    if (ses.confirmEnd) h += '<div class="card"><p>لسه فيه <span class="num">' + ses.items.filter(function (x) { return !anyAns(x); }).length + '</span> سؤال من غير إجابة. تسلّم دلوقتي؟</p><div class="row"><button class="btn primary" data-act="finish">سلّم</button><button class="btn" data-act="noEnd">كمّل الامتحان</button></div></div>';
    if (it.again && !it.done) h += '<p class="small muted">السؤال ده غلطت فيه من شوية. جرّبه تاني.</p>';
    h += qHtml(it, false);
    h += '<div class="row act">';
    if (exam) {
      h += '<button class="btn" data-act="prev"' + (ses.i === 0 ? " disabled" : "") + ">السابق</button>";
      h += ses.i < total - 1 ? '<button class="btn primary" data-act="nextE">التالي</button>' : '<button class="btn primary" data-act="askEnd">تسليم الامتحان</button>';
      h += '<button class="btn' + (it.mark ? " marked" : "") + '" data-act="mark">' + (it.mark ? "شيل علامة المراجعة" : "ارجعله قبل التسليم") + "</button>";
    } else if (!it.done) {
      h += '<button class="btn primary" data-act="check"' + (fullAns(it, q) ? "" : " disabled") + ">تأكيد الإجابة</button>";
      h += '<button class="btn" data-act="giveup">مش عارف، ورّيني الإجابة</button>';
    } else h += '<button class="btn primary" data-act="next">التالي</button>';
    h += "</div>";
    if (exam) {
      h += '<div class="dots">';
      ses.items.forEach(function (x, i) { h += '<button data-act="goto" data-i="' + i + '" class="' + (anyAns(x) ? "ans" : "") + (x.mark ? " mk" : "") + (i === ses.i ? " cur" : "") + '">' + (i + 1) + "</button>"; });
      h += "</div>";
    } else h += '<p class="small muted kbd">اختصارات: الأرقام للاختيار، Enter للتأكيد والتالي، F للعلامة.</p>';
    return h + "</section>";
  }

  function vExamResult() {
    var sc = pct(ses.right / ses.n), h = "";
    h += '<section><div class="today"><div><p class="muted small">نتيجة الامتحان التجريبي</p><div class="score">' + sc + "%</div>";
    h += '<p class="muted"><span class="num">' + ses.right + " / " + ses.n + "</span> · " + (sc >= 70 ? "فوق خط الـ 70%" : "تحت خط الـ 70%") + "</p></div>";
    h += '<button class="btn primary" data-act="exit">رجوع للرئيسية</button></div>';
    h += '<p class="small muted">الامتحان الحقيقي بيتصحّح على مقياس من 1000 والنجاح من 700، فالنسبة دي مؤشر تقريبي بس.</p></section>';
    h += '<section><h2>النتيجة حسب المحور</h2><div class="list">';
    TRACK.domains.forEach(function (d) {
      var b = ses.by[d.id]; if (!b) return;
      h += '<div class="item"><div class="t en">' + esc(d.name) + '</div><span class="num small">' + b[0] + " / " + b[1] + '</span><div class="meter"><i style="width:' + pct(b[0] / b[1]) + '%"></i></div></div>';
    });
    h += "</div></section><section><h2>مراجعة الإجابات</h2>";
    ses.items.forEach(function (it) { h += qHtml(it, true); });
    return h + "</section>";
  }

  /* ---------- flashcards ---------- */
  function cDue() { var t = day(); return CARDS.filter(function (c) { var s = S.c[c.id]; return s && s.due <= t; }); }
  function cNew() { return CARDS.filter(function (c) { return !S.c[c.id]; }); }
  function startCards(list) {
    if (!list.length) { flash = "مفيش بطاقات مستحقة دلوقتي."; render(); return; }
    ses = null; cs = { items: shuffle(list).map(function (c) { return c.id; }), i: 0, show: false, right: 0 };
    render(); window.scrollTo(0, 0);
  }
  function vCardSession() {
    var n = cs.items.length, h = "";
    if (cs.i >= n) return '<section><div class="today"><div><h1>خلصت البطاقات</h1><p class="muted">عرفت <span class="num">' + cs.right + '</span> من <span class="num">' + n + '</span>.</p></div><div class="row act"><button class="btn primary" data-act="exit">رجوع</button></div></div></section>';
    var c = CM[cs.items[cs.i]];
    h += '<section><div class="sess-top"><h2>بطاقات سريعة</h2><div class="row"><span class="num muted small">' + (cs.i + 1) + " / " + n + '</span><button class="btn ghost" data-act="exit">إنهاء</button></div></div>';
    h += '<div class="prog"><i style="width:' + pct(cs.i / n) + '%"></i></div>';
    h += '<div class="fc"><div class="meta en">' + esc(c.s) + " " + esc(SM[c.s].name) + '</div><p class="front">' + esc(c.f) + "</p>";
    if (cs.show) h += '<p class="back">' + esc(c.b) + "</p>";
    h += '</div><div class="row act">';
    h += cs.show ? '<button class="btn primary" data-act="cOk">كنت عارفها</button><button class="btn" data-act="cNo">مكنتش عارفها</button>' : '<button class="btn primary" data-act="cShow">اقلب البطاقة</button>';
    return h + "</div></section>";
  }
  function vCards() {
    var d = cDue(), nw = cNew(), h = "";
    h += '<section><div class="today"><div><h1>بطاقات سريعة</h1><div class="counts"><span class="chip due"><span class="num">' + d.length + '</span> مستحق</span><span class="chip new"><span class="num">' + nw.length + '</span> جديد</span><span class="chip"><span class="num">' + CARDS.length + "</span> بطاقة</span></div>";
    h += '<p class="muted small">أرقام وحدود وفروق بتتسأل كتير. بتتراجع بنفس جدول المراجعة المتكررة.</p></div><div class="row">';
    h += '<button class="btn primary" data-act="cStart">راجع المستحق والجديد</button><button class="btn" data-act="cAll">كل البطاقات</button></div></div></section>';
    TRACK.domains.forEach(function (dm) {
      var list = CARDS.filter(function (c) { return c.s.split(".")[0] === dm.id; }); if (!list.length) return;
      h += '<section><h3 class="en">' + dm.id + ". " + esc(dm.name) + '</h3><div class="list">';
      list.forEach(function (c) { h += '<details class="cardrow"><summary>' + esc(c.f) + "</summary><p>" + esc(c.b) + "</p></details>"; });
      h += "</div></section>";
    });
    return h;
  }

  /* ---------- views ---------- */
  function heat() {
    var g = S.set.goal || 20, h = '<div class="heat" role="img" aria-label="نشاطك في آخر 12 أسبوع">';
    for (var i = 83; i >= 0; i--) { var d = day(-i), n = S.days[d] || 0; h += '<i class="l' + (!n ? 0 : n < g / 2 ? 1 : n < g ? 2 : 3) + '" title="' + d + " · " + n + '"></i>'; }
    return h + "</div>";
  }
  function vHome() {
    var due = dueList(), nw = newList(), h = "", att = 0, right = 0, mast = 0;
    QS.forEach(function (q) { var s = st(q.id); if (s) { att += s.right + s.wrong; right += s.right; if (s.box >= 3) mast++; } });
    var nNew = Math.min(nw.length, Math.max(0, 15 - due.length), 8), goal = S.set.goal || 20, td = S.days[day()] || 0;
    h += '<section><div class="today"><div><h1>مراجعة النهارده</h1><div class="counts">';
    h += '<span class="chip due"><span class="num">' + due.length + "</span> مستحق</span>";
    h += '<span class="chip new"><span class="num">' + nNew + "</span> جديد</span>";
    h += '<span class="chip"><span class="num">' + nw.length + "</span> لسه ماتفتحش</span>";
    if (cDue().length) h += '<a class="chip due" href="#cards"><span class="num">' + cDue().length + "</span> بطاقة مستحقة</a>";
    h += '</div><div class="goal"><div class="meter wide"><i style="width:' + Math.min(100, pct(td / goal)) + '%"></i></div><span class="small muted">هدف اليوم: <span class="num">' + td + " / " + goal + "</span></span></div>";
    if (S.set.examDate) {
      var left = Math.ceil((new Date(S.set.examDate + "T00:00:00") - new Date(day() + "T00:00:00")) / 86400000);
      if (left > 0) h += '<p class="small muted">فاضل <span class="num">' + left + '</span> يوم على الامتحان. عشان تتقن الباقي محتاج <span class="num">' + Math.ceil((QS.length - mast) / left) + "</span> سؤال جديد يثبت كل يوم.</p>";
      else if (left === 0) h += '<p class="small">الامتحان النهارده. بالتوفيق.</p>';
    }
    h += "</div>";
    h += (due.length + nNew) ? '<div class="row act"><button class="btn primary" data-act="review">ابدأ المراجعة</button></div>' : '<span class="chip good">مفيش حاجة مستحقة النهارده</span>';
    h += "</div>";
    h += '<div class="stats"><div><b>' + streak() + "</b><span>يوم متواصل</span></div><div><b>" + att + "</b><span>إجابة مسجّلة</span></div><div><b>" + (att ? pct(right / att) + "%" : "–") + "</b><span>دقة الإجابات</span></div><div><b>" + mast + "/" + QS.length + "</b><span>سؤال متقن</span></div></div>";
    if (memOnly) h += '<p class="small muted">المتصفح مش سامح بالتخزين هنا، فالتقدم مش هيتحفظ بعد قفل الصفحة. استخدم «بياناتي» عشان تنسخه.</p>';
    h += "</section>";

    h += '<section><div class="head"><h2>خريطة امتحان ' + esc(TRACK.name) + '</h2><span class="small muted">عرض كل محور = وزنه في الامتحان، والتعبئة = إتقانك</span></div><div class="bp">';
    TRACK.domains.forEach(function (d) {
      var m = mastery(inDom(d.id));
      h += '<button data-act="dom" data-d="' + d.id + '" style="flex:' + ((d.w[0] + d.w[1]) / 2) + ' 1 0" title="تدرّب على ' + esc(d.ar) + '"><div class="bar"><div class="fill" style="width:' + pct(m) + '%"></div></div><div class="lab"><b>' + d.w[0] + "–" + d.w[1] + "%</b>" + esc(d.name) + " · " + pct(m) + "%</div></button>";
    });
    h += '</div><p class="small muted">الأوزان من الـ study guide الرسمي، تحديث ' + esc(TRACK.updated) + ".</p></section>";

    h += '<section><div class="head"><h2>نشاطك</h2><span class="small muted">آخر 12 أسبوع، واللون الأغمق = وصلت هدف اليوم</span></div>' + heat() + "</section>";

    var weak = SECS.map(function (s) { var qs = inSec(s.id), seen = qs.filter(function (q) { return st(q.id); }); return { s: s, m: mastery(qs), seen: seen.length, wrong: seen.reduce(function (a, q) { return a + st(q.id).wrong; }, 0) }; })
      .filter(function (x) { return x.seen && x.wrong; }).sort(function (a, b) { return a.m - b.m || b.wrong - a.wrong; }).slice(0, 4);
    h += '<section><h2>نقاط الضعف</h2><div class="list">';
    if (!weak.length) h += '<div class="empty">لما تغلط في أسئلة، الأقسام اللي محتاجة شغل هتظهر هنا بالترتيب.</div>';
    weak.forEach(function (x) {
      h += '<div class="item"><div class="t en"><span class="num muted small">' + x.s.id + "</span> " + esc(x.s.name) + '</div><span class="chip bad"><span class="num">' + x.wrong + '</span> غلطة</span><div class="meter"><i style="width:' + pct(x.m) + '%"></i></div><button class="btn" data-act="sec" data-s="' + x.s.id + '">تدرّب</button></div>';
    });
    h += "</div></section>";
    h += '<section><h2>المسارات</h2><div class="tracks"><span class="chip new">AZ-104 · شغّال</span><span class="chip">AZ-500 · بعده</span><span class="chip">SOC L1 · لاحقاً</span><span class="chip">إلكترونيات / IoT · لاحقاً</span></div></section>';
    return h;
  }

  var openSec = {};
  function vObjectives() {
    var h = '<section><div class="head"><h2>محاور ' + esc(TRACK.name) + '</h2><span class="small muted">علّم على اللي ذاكرته، وتدرّب على كل قسم لوحده</span></div></section>';
    TRACK.domains.forEach(function (d) {
      h += '<section><div class="dom-h"><h3 class="en">' + d.id + ". " + esc(d.name) + '</h3><span class="w">' + d.w[0] + "–" + d.w[1] + "% · " + pct(mastery(inDom(d.id))) + "% إتقان</span></div>";
      d.sections.forEach(function (s) {
        var qs = inSec(s.id), done = s.items.filter(function (_, i) { return S.obj[s.id + ":" + i]; }).length;
        h += '<details class="sec" data-s="' + s.id + '"' + (openSec[s.id] ? " open" : "") + '><summary><span class="t en"><span class="num muted small">' + s.id + "</span> " + esc(s.name) + '</span><span class="chip"><span class="num">' + done + "/" + s.items.length + '</span> اتذاكر</span><div class="meter"><i style="width:' + pct(mastery(qs)) + '%"></i></div></summary><div class="in"><div class="checks">';
        s.items.forEach(function (t, i) {
          var k = s.id + ":" + i;
          h += '<label><input type="checkbox" id="ob-' + k.replace(/[.:]/g, "-") + '" data-ob="' + k + '"' + (S.obj[k] ? " checked" : "") + "><span>" + esc(t) + "</span></label>";
        });
        h += '</div><div class="row"><button class="btn primary" data-act="sec" data-s="' + s.id + '">تدرّب على القسم (' + qs.length + ')</button><a class="small" href="' + esc(s.ref) + '" target="_blank" rel="noopener">Microsoft Learn</a></div></div></details>';
      });
      h += "</section>";
    });
    return h;
  }

  var pr = { n: 0, unseen: false };
  function prep(qs) { if (pr.unseen) qs = qs.filter(function (q) { return !st(q.id); }); qs = shuffle(qs); return pr.n ? qs.slice(0, pr.n) : qs; }
  function vPractice() {
    var wrong = QS.filter(weakQ), flagged = QS.filter(function (q) { return S.flag[q.id]; });
    var h = '<section><h2>تدريب حر</h2><p class="muted">الإجابة والشرح بيظهروا بعد كل سؤال، والنتيجة بتدخل في جدول المراجعة.</p>';
    h += '<div class="card"><div class="fields"><label class="f" for="pr-n">عدد الأسئلة في الجلسة<select id="pr-n" data-pr="n">';
    [[0, "الكل"], [10, "10"], [20, "20"], [40, "40"]].forEach(function (o) { h += '<option value="' + o[0] + '"' + (pr.n === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; });
    h += '</select></label><label class="chk" for="pr-new"><input type="checkbox" id="pr-new" data-pr="unseen"' + (pr.unseen ? " checked" : "") + "> الأسئلة اللي ماتفتحتش بس</label></div></div>";
    h += '<div class="list">';
    h += '<div class="item"><div class="t">كل الأسئلة بترتيب عشوائي</div><span class="num small muted">' + QS.length + '</span><button class="btn primary" data-act="all">ابدأ</button></div>';
    h += '<div class="item"><div class="t">الأسئلة اللي غلطت فيها ولسه متثبتتش</div><span class="num small muted">' + wrong.length + '</span><button class="btn" data-act="wrong"' + (wrong.length ? "" : " disabled") + ">ابدأ</button></div>";
    h += '<div class="item"><div class="t">الأسئلة اللي علّمت عليها ⚑</div><span class="num small muted">' + flagged.length + '</span><button class="btn" data-act="flagged"' + (flagged.length ? "" : " disabled") + ">ابدأ</button></div>";
    TRACK.domains.forEach(function (d) {
      h += '<div class="item"><div class="t en">' + d.id + ". " + esc(d.name) + '</div><span class="num small muted">' + inDom(d.id).length + '</span><button class="btn" data-act="dom" data-d="' + d.id + '">ابدأ</button></div>';
    });
    return h + "</div></section>";
  }

  function vExam() {
    var h = '<section><h2>امتحان تجريبي</h2><p class="muted">الأسئلة بتتوزع على المحاور بنفس أوزان الامتحان، بوقت محدد، والإجابات بتظهر بعد التسليم بس.</p><div class="list">';
    [[20, 35, "قصير"], [40, 70, "متوسط"], [50, 100, "بطول الامتحان الحقيقي تقريباً"]].forEach(function (e) {
      h += '<div class="item"><div class="t">' + e[2] + ': <span class="num">' + e[0] + '</span> سؤال في <span class="num">' + e[1] + '</span> دقيقة</div><button class="btn primary" data-act="exam" data-n="' + e[0] + '" data-m="' + e[1] + '">ابدأ</button></div>';
    });
    h += '</div></section><section><div class="head"><h2>محاولاتك</h2><span class="small muted">أخضر = 70% أو أكتر</span></div>';
    if (S.exams.length > 1) {
      h += '<div class="trend" role="img" aria-label="نتايج آخر الامتحانات">';
      S.exams.slice(0, 12).reverse().forEach(function (e) { var sc = pct(e.right / e.n); h += '<div class="tb" title="' + esc(e.d) + '"><span class="num">' + sc + '</span><i class="' + (sc >= 70 ? "ok" : "no") + '" style="height:' + Math.max(2, sc) + '%"></i></div>'; });
      h += "</div>";
    }
    h += '<div class="list">';
    if (!S.exams.length) h += '<div class="empty">نتايج الامتحانات التجريبية هتتسجل هنا بالتاريخ.</div>';
    S.exams.forEach(function (e) {
      var sc = pct(e.right / e.n);
      h += '<div class="item"><div class="t"><span class="num">' + esc(e.d) + '</span></div><span class="num small muted">' + e.right + " / " + e.n + '</span><span class="chip ' + (sc >= 70 ? "good" : "bad") + '"><span class="num">' + sc + "%</span></span></div>";
    });
    return h + "</div></section>";
  }

  var bank = { q: "", d: "", s: "" };
  function bankRows() {
    var t = bank.q.toLowerCase(), list = QS.filter(function (q) {
      if (bank.d && q.s.split(".")[0] !== bank.d) return false;
      if (bank.s === "flag") { if (!S.flag[q.id]) return false; }
      else if (bank.s === "note") { if (!S.note[q.id]) return false; }
      else if (bank.s === "weak") { if (!weakQ(q)) return false; }
      else if (bank.s && status(q)[0] !== bank.s) return false;
      if (t && (q.q + " " + q.o.join(" ") + " " + q.e + " " + (S.note[q.id] || "")).toLowerCase().indexOf(t) < 0) return false;
      return true;
    }), h = '<p class="small muted"><span class="num">' + list.length + "</span> سؤال" + (list.length > 60 ? "، معروض أول 60" : "") + '</p><div class="list">';
    if (!list.length) h += '<div class="empty">مفيش أسئلة بالفلتر ده.</div>';
    list.slice(0, 60).forEach(function (q) {
      var s = status(q);
      h += '<div class="item"><div class="t en"><span class="num muted small">' + q.s + "</span> " + (S.flag[q.id] ? "⚑ " : "") + '<span class="clip">' + esc(q.q) + "</span>" + (S.note[q.id] ? '<span class="nt" dir="auto">' + esc(S.note[q.id]) + "</span>" : "") + '</div><span class="chip ' + s[2] + '">' + s[1] + '</span><button class="btn" data-act="open" data-id="' + q.id + '">افتح</button></div>';
    });
    return h + "</div>";
  }
  function vBank() {
    var h = '<section><h2>بنك الأسئلة</h2><div class="card"><div class="fields">';
    h += '<label class="f" for="bk-q">بحث في السؤال أو الشرح أو ملاحظاتك<input type="text" id="bk-q" data-bk="q" dir="auto" value="' + esc(bank.q) + '" placeholder="مثال: peering أو SAS"></label>';
    h += '<label class="f" for="bk-d">المحور<select id="bk-d" data-bk="d"><option value="">الكل</option>';
    TRACK.domains.forEach(function (d) { h += '<option value="' + d.id + '"' + (bank.d === d.id ? " selected" : "") + ">" + d.id + ". " + esc(d.ar) + "</option>"; });
    h += '</select></label><label class="f" for="bk-s">الحالة<select id="bk-s" data-bk="s">';
    [["", "الكل"], ["new", "جديد"], ["due", "مستحق"], ["weak", "غلطت فيه"], ["mastered", "متقن"], ["flag", "معلّم ⚑"], ["note", "عليه ملاحظة"]].forEach(function (o) { h += '<option value="' + o[0] + '"' + (bank.s === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; });
    return h + '</select></label></div></div><div id="bk-list">' + bankRows() + "</div></section>";
  }

  function opts(a) { return a.map(function (x) { return "<option>" + esc(x) + "</option>"; }).join(""); }
  function vLog() {
    var h = '<section><h2>عملت إيه</h2><form class="card" id="logform"><div class="fields">';
    h += '<label class="f" for="lg-track">المسار<select id="lg-track">' + opts(LOG_TRACKS) + "</select></label>";
    h += '<label class="f" for="lg-kind">النوع<select id="lg-kind">' + opts(LOG_KINDS) + "</select></label>";
    h += '<label class="f" for="lg-link">لينك (اختياري)<input type="url" id="lg-link" dir="ltr" placeholder="https://"></label></div>';
    h += '<label class="f" for="lg-text">عملت إيه واتعلمت إيه<textarea id="lg-text" required placeholder="مثال: عملت peering بين VNetين وجرّبت إن الاتصال مش transitive"></textarea></label>';
    h += '<div class="row"><button class="btn primary" type="submit">سجّل</button></div></form></section>';
    h += '<section><div class="head"><h2>السجل</h2><span class="small muted num">' + S.log.length + '</span></div><div class="list">';
    if (!S.log.length) h += '<div class="empty">كل لاب أو درس أو فيديو تسجّله هيظهر هنا بتاريخه.</div>';
    S.log.forEach(function (e, i) {
      h += '<div class="log-e"><div class="l1"><span class="num small muted">' + esc(e.d) + '</span><span class="chip new">' + esc(e.track) + '</span><span class="chip">' + esc(e.kind) + '</span><button class="x" data-act="dlog" data-i="' + i + '">امسح</button></div><p>' + esc(e.text) + "</p>";
      if (e.link) h += '<a class="small en" href="' + esc(e.link) + '" target="_blank" rel="noopener">' + esc(e.link) + "</a>";
      h += "</div>";
    });
    return h + "</div></section>";
  }

  var askReset = false, dataMsg = "";
  function vData() {
    var h = '<section><h2>إعدادات المذاكرة</h2><div class="card"><div class="fields">';
    h += '<label class="f" for="set-goal">هدف الإجابات في اليوم<input type="number" id="set-goal" data-set="goal" min="5" max="200" step="5" value="' + (S.set.goal || 20) + '"></label>';
    h += '<label class="f" for="set-date">تاريخ الامتحان (اختياري)<input type="date" id="set-date" data-set="examDate" value="' + esc(S.set.examDate || "") + '"></label></div></div></section>';
    h += '<section><h2>بياناتي</h2><p class="muted">التقدم محفوظ في المتصفح ده بس. عشان تنقله لجهاز تاني أو تاخد نسخة احتياطية، نزّله كملف أو انسخه، واسترجعه في الجهاز التاني.</p>';
    if (dataMsg) h += '<p class="chip good">' + esc(dataMsg) + "</p>";
    h += '<div class="card"><label class="f" for="exp">نسخة من تقدمك<textarea class="code" id="exp" readonly>' + esc(JSON.stringify(S)) + '</textarea></label><div class="row"><button class="btn primary" data-act="download">نزّل كملف</button><button class="btn" data-act="copy">انسخ النص</button></div></div>';
    h += '<div class="card"><label class="f" for="imp-file">استرجع من ملف<input type="file" id="imp-file" accept=".json,application/json"></label><label class="f" for="imp">أو الصق النسخة هنا<textarea class="code" id="imp"></textarea></label><div class="row"><button class="btn" data-act="import">استرجع من النص</button></div></div>';
    h += '<div class="card"><p>مسح كل التقدم والسجل من المتصفح ده.</p><div class="row">';
    h += askReset ? '<button class="btn danger" data-act="reset">أيوه، امسح كل حاجة</button><button class="btn" data-act="noReset">لأ</button>' : '<button class="btn danger" data-act="askReset">امسح التقدم</button>';
    return h + "</div></div></section>";
  }
  function doImport(text) {
    try { var o = JSON.parse(text); if (!o || typeof o.q !== "object") throw 0; S = merge(o); save(); applyTheme(); dataMsg = "تم استرجاع النسخة"; }
    catch (e) { dataMsg = "ده مش ملف نسخة صالح. استخدم الملف أو النص اللي طلع من «نسخة من تقدمك»."; }
    render();
  }

  /* ---------- routing ---------- */
  var VIEWS = { home: vHome, objectives: vObjectives, practice: vPractice, cards: vCards, exam: vExam, bank: vBank, log: vLog, data: vData };
  function view() { var v = location.hash.slice(1); return VIEWS[v] ? v : "home"; }
  function render() {
    var v = view(), h;
    document.querySelectorAll("nav a").forEach(function (a) { if (a.getAttribute("href") === "#" + v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    document.getElementById("nav").hidden = !!(ses && ses.mode === "exam" && !ses.fin);
    h = ses ? vSession() : cs ? vCardSession() : VIEWS[v]();
    if (flash) { h = '<p class="chip due flash">' + esc(flash) + "</p>" + h; flash = ""; }
    app.innerHTML = h;
  }
  window.addEventListener("hashchange", function () { if (ses || cs) stop(); askReset = false; dataMsg = ""; render(); window.scrollTo(0, 0); });

  function examPick(n) {
    var tot = 0, parts = TRACK.domains.map(function (d) { var w = (d.w[0] + d.w[1]) / 2; tot += w; return { d: d, w: w }; }), left = n, out = [];
    parts.forEach(function (p) { p.x = n * p.w / tot; p.k = Math.floor(p.x); left -= p.k; });
    parts.slice().sort(function (a, b) { return (b.x - b.k) - (a.x - a.k); }).forEach(function (p) { if (left > 0) { p.k++; left--; } });
    parts.forEach(function (p) { out = out.concat(shuffle(inDom(p.d.id)).slice(0, p.k)); });
    return out;
  }

  app.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-act]"); if (!b) return;
    var a = b.dataset.act, it = ses && ses.items[ses.i], q = it && QM[it.id];
    switch (a) {
      case "review": { var due = dueList(), nw = newList(); start(due.concat(shuffle(nw).slice(0, Math.min(8, Math.max(0, 15 - due.length)))), "review", "مراجعة النهارده"); break; }
      case "all": start(prep(QS), "practice", "تدريب: كل الأسئلة"); break;
      case "wrong": start(prep(QS.filter(weakQ)), "practice", "تدريب: أخطائي"); break;
      case "flagged": start(prep(QS.filter(function (x) { return S.flag[x.id]; })), "practice", "تدريب: المعلّمة"); break;
      case "dom": start(prep(inDom(b.dataset.d)), "practice", "تدريب: " + TRACK.domains[b.dataset.d - 1].ar); break;
      case "sec": start(inSec(b.dataset.s), "practice", "تدريب: " + b.dataset.s); break;
      case "open": start([QM[b.dataset.id]], "practice", "سؤال من البنك"); break;
      case "exam": start(examPick(+b.dataset.n), "exam", "امتحان تجريبي", +b.dataset.m); break;
      case "pick": {
        var o = +b.dataset.o, k = it.sel.indexOf(o);
        if (q.t === "single") it.sel = [o];
        else if (k > -1) it.sel.splice(k, 1);
        else if (q.t === "order" || it.sel.length < q.a.length) it.sel.push(o);
        render(); break;
      }
      case "yn": it.sel[+b.dataset.o] = +b.dataset.v; render(); break;
      case "flag": { var id = b.dataset.id; if (S.flag[id]) delete S.flag[id]; else S.flag[id] = 1; save(); var y = window.scrollY; render(); window.scrollTo(0, y); break; }
      case "mark": it.mark = !it.mark; render(); break;
      case "check": if (fullAns(it, q)) grade(false); break;
      case "giveup": grade(true); break;
      case "next": ses.i++; render(); window.scrollTo(0, 0); break;
      case "nextE": ses.i++; ses.confirmEnd = false; render(); break;
      case "prev": ses.i--; ses.confirmEnd = false; render(); break;
      case "goto": ses.i = +b.dataset.i; ses.confirmEnd = false; render(); break;
      case "askEnd": ses.confirmEnd = true; render(); window.scrollTo(0, 0); break;
      case "noEnd": ses.confirmEnd = false; render(); break;
      case "finish": finishExam(); break;
      case "exit": { var wasCards = !!cs; stop(); var to = wasCards ? "#cards" : (view() === "bank" ? "#bank" : "#home"); if (location.hash !== to && !(to === "#home" && !location.hash)) location.hash = to; else render(); window.scrollTo(0, 0); break; }
      case "cStart": startCards(cDue().concat(shuffle(cNew()).slice(0, 10))); break;
      case "cAll": startCards(CARDS); break;
      case "cShow": cs.show = true; render(); break;
      case "cOk": case "cNo": bump(S.c, cs.items[cs.i], a === "cOk"); if (a === "cOk") cs.right++; cs.i++; cs.show = false; render(); break;
      case "dlog": S.log.splice(+b.dataset.i, 1); save(); render(); break;
      case "download": {
        try {
          var blob = new Blob([JSON.stringify(S)], { type: "application/json" }), l = document.createElement("a");
          l.href = URL.createObjectURL(blob); l.download = "sahaba-progress-" + day() + ".json"; document.body.appendChild(l); l.click(); l.remove();
        } catch (e) {}
        break;
      }
      case "copy": {
        var t = document.getElementById("exp");
        try { navigator.clipboard.writeText(t.value).then(function () { dataMsg = "اتنسخ"; render(); }, function () { t.select(); }); } catch (e) { t.select(); }
        break;
      }
      case "import": doImport(document.getElementById("imp").value); break;
      case "askReset": askReset = true; render(); break;
      case "noReset": askReset = false; render(); break;
      case "reset": S = blank(); save(); applyTheme(); askReset = false; dataMsg = "اتمسح كل التقدم"; render(); break;
    }
  });
  app.addEventListener("change", function (ev) {
    var t = ev.target, d = t.dataset || {};
    if (d.ob) { if (t.checked) S.obj[d.ob] = 1; else delete S.obj[d.ob]; save(); openSec[d.ob.split(":")[0]] = true; render(); }
    else if (d.pr) { if (d.pr === "n") pr.n = +t.value; else pr.unseen = t.checked; }
    else if (d.set) {
      if (d.set === "goal") S.set.goal = Math.max(5, Math.min(200, +t.value || 20)); else S.set.examDate = t.value;
      save(); dataMsg = "اتحفظ"; render();
    }
    else if (t.id === "imp-file" && t.files && t.files[0]) { var r = new FileReader(); r.onload = function () { doImport(String(r.result)); }; r.readAsText(t.files[0]); }
    else if (d.bk && t.tagName === "SELECT") { bank[d.bk] = t.value; document.getElementById("bk-list").innerHTML = bankRows(); }
  });
  app.addEventListener("input", function (ev) {
    var t = ev.target, d = t.dataset || {};
    if (d.note) { var v = t.value.trim(); if (v) S.note[d.note] = v; else delete S.note[d.note]; save(); }
    else if (d.bk === "q") { bank.q = t.value; document.getElementById("bk-list").innerHTML = bankRows(); }
  });
  app.addEventListener("toggle", function (ev) { var d = ev.target; if (d.dataset && d.dataset.s) openSec[d.dataset.s] = d.open; }, true);
  app.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var g = function (id) { return document.getElementById(id).value.trim(); };
    if (!g("lg-text")) return;
    var link = g("lg-link"); if (link && !/^https?:\/\//i.test(link)) link = "";
    S.log.unshift({ d: day(), track: g("lg-track"), kind: g("lg-kind"), text: g("lg-text"), link: link });
    save(); render();
  });
  document.addEventListener("keydown", function (ev) {
    if ((!ses && !cs) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    var tag = ev.target.tagName; if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
    if (ev.key === "Enter") { var p = app.querySelector(".act .btn.primary:not(:disabled)"); if (p) { ev.preventDefault(); p.click(); } return; }
    if (!ses || ses.fin) return;
    if (ev.key === "f" || ev.key === "F") { var f = app.querySelector(".flag"); if (f) f.click(); return; }
    if (/^[1-9]$/.test(ev.key)) { var os = app.querySelectorAll(".opt:not(:disabled)"); if (os[ev.key - 1]) os[ev.key - 1].click(); }
  });
  render();
})();
