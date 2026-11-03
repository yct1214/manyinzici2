/*
 * 寓言迷途：遊戲程式
 * 路由：#/start  #/shelf  #/book/卷號/步驟  #/finale/題序  #/library/分頁  #/cert
 * 教師版：網址加 ?teacher=1
 */
(function () {
  "use strict";

  var KEY = "yuyan-mitu-v1";
  var TEACHER = /[?&]teacher=1(&|$)/.test(location.search);
  var app = document.getElementById("app");
  var live = document.getElementById("live");

  /* ================= 存檔 ================= */
  function fresh() { return { name: "", font: 0, visited: false, ans: {}, reflect: {}, done: {}, finale: false }; }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === "object") {
        var f = fresh();
        Object.keys(f).forEach(function (k) { if (!(k in s)) s[k] = f[k]; });
        return s;
      }
    } catch (e) { /* 讀取失敗就重新開始 */ }
    return fresh();
  }
  var store = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* 私密瀏覽等情況 */ } }

  /* ================= 工具 ================= */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function plain(s) { return String(s || "").replace(/[［］{}]/g, ""); }
  function announce(t) { live.textContent = ""; setTimeout(function () { live.textContent = t; }, 40); }

  // 美術圖像
  var IMG = {
    boy: "img/boy.jpg", curator: "img/curator.jpg",
    boyFace: "img/boy-face.jpg", curatorFace: "img/curator-face.jpg",
    card: function (id) { return "img/card" + id + ".jpg"; },
    thumb: function (id) { return "img/thumb" + id + ".jpg"; }
  };
  // 人物頭像（裝飾用，旁邊已有文字說明，所以 alt 留空）
  function face(who, cls) {
    return '<img class="who ' + who + (cls ? " " + cls : "") + '" src="' + (who === "boy" ? IMG.boyFace : IMG.curatorFace) + '" width="200" height="200" alt="">';
  }

  // 句子：［字］→ 朱紅框；fixed＝已修補
  function sentHtml(s, fixed) {
    return esc(s).replace(/［([^］]*)］/g, function (_, w) {
      return '<span class="tgt' + (fixed ? " fixed" : "") + '">' + w + "</span>";
    });
  }
  // 原文：朱紅框＋可點擊的註釋
  function origHtml(text, notes, fixed, used) {
    var terms = Object.keys(notes || {}).sort(function (a, b) { return b.length - a.length; });
    used = used || {};
    return text.split(/(［[^］]*］)/).map(function (p) {
      if (/^［/.test(p)) return sentHtml(p, fixed);
      var h = esc(p);
      if (!terms.length) return h;
      var re = new RegExp(terms.map(reEsc).join("|"), "g");
      return h.replace(re, function (m) {
        if (used[m]) return m;
        used[m] = true;
        return '<button type="button" class="note-term" data-note="' + esc(m) + '" data-mean="' + esc(notes[m]) + '">' + m + "</button>";
      });
    }).join("");
  }
  function trHtml(tr) { return esc(tr).replace(/\{([^}]*)\}/g, '<span class="m">$1</span>'); }
  function trSub(tr, sub) { return esc(tr).replace(/\{([^}]*)\}/g, function () { return '<span class="bad">' + esc(sub) + "</span>"; }); }

  /* ================= 資料索引 ================= */
  var QS = {};    // 題號 → 題目
  var QLOC = {};  // 題號 → { book, step }
  function stepsOf(b) {
    if (b._steps) return b._steps;
    var s = [{ kind: "intro", qs: [] }];
    b.segs.forEach(function (g, i) { s.push({ kind: "seg", seg: g, qs: g.qs, n: i }); });
    s.push({ kind: "trans", qs: [b.trans] });
    s.push({ kind: "reflect", qs: [] });
    s.push({ kind: "ext", qs: b.ext });
    s.push({ kind: "mark", qs: [] });
    b._steps = s;
    return s;
  }
  BOOKS.forEach(function (b) {
    stepsOf(b).forEach(function (st, si) {
      st.qs.forEach(function (q) { QS[q.id] = q; QLOC[q.id] = { book: b.id, step: si }; });
    });
  });
  FINALE.forEach(function (q, i) { QS[q.id] = q; QLOC[q.id] = { book: "F", step: i }; });

  function bookById(id) { return BOOKS.filter(function (b) { return b.id === id; })[0]; }
  function ruleOf(w) { return RULES.filter(function (r) { return r.w === w; })[0]; }
  function correctOpt(q) { return q.options.filter(function (o) { return o.ok; })[0]; }

  /* ================= 進度與星數 ================= */
  function rec(id) { return store.ans[id]; }
  function qDone(id) { var r = rec(id); return !!(r && (r.done || r.skip)); }
  function stepDone(b, st) {
    if (st.kind === "intro") return true;
    if (st.kind === "reflect") return !!store.reflect[b.id];
    if (st.kind === "mark") return !!store.done[b.id];
    if (st.kind === "seg" && st.seg.predict && !qDone(st.seg.predict.id)) return false;
    return st.qs.every(function (q) { return qDone(q.id); });
  }
  function firstTodo(b) {
    var s = stepsOf(b);
    for (var i = 1; i < s.length; i++) if (!stepDone(b, s[i])) return i;
    return s.length - 1;
  }
  function started(b) {
    if (store.reflect[b.id] || store.done[b.id]) return true;
    return Object.keys(QLOC).some(function (id) { return QLOC[id].book === b.id && rec(id); });
  }
  function star(q) { var r = rec(q.id); return r && r.done && r.ok ? 1 : 0; }
  function bookStars(b) {
    var got = 0, max = 0;
    b.segs.forEach(function (g) { g.qs.forEach(function (q) { max++; got += star(q); }); });
    max++; got += star(b.trans);
    max++; if (b.ext.every(function (q) { return star(q); })) got++;
    return { got: got, max: max };
  }
  function finaleStars() {
    var got = 0;
    FINALE.forEach(function (q) { got += star(q); });
    return { got: got, max: FINALE.length };
  }
  function allBooksDone() { return BOOKS.every(function (b) { return store.done[b.id]; }); }
  function finaleTodo() {
    for (var i = 0; i < FINALE.length; i++) if (!qDone(FINALE[i].id)) return i;
    return FINALE.length;
  }
  function starText(s) { return "★ " + s.got + " / " + s.max; }

  /* ================= 題目卡 ================= */
  var ui = { order: {}, mode: {}, hint: {}, fixed: null };

  function orderOf(q) {
    if (!ui.order[q.id]) ui.order[q.id] = shuffle(q.options.map(function (_, i) { return i; }));
    return ui.order[q.id];
  }
  function qTag(q, label) {
    var h = '<p class="qtag">' + esc(label || ("題 " + q.id)) + (q.word ? " · " + esc(q.word) : "");
    if (q.review) h += '<span class="tag">重溫</span>';
    if (q.optional) h += '<span class="tag">選做</span>';
    if (TEACHER) h += '<span class="tag">教師：' + esc(correctOpt(q).t) + "</span>";
    return h + "</p>";
  }
  function qHead(q, label, fixed) {
    var h = qTag(q, label);
    if (q.context) h += '<p class="muted">' + esc(q.context) + "</p>";
    h += '<p class="qsent">' + sentHtml(q.sentence, fixed) + "</p>";
    if (q.src) h += '<p class="src">' + esc(q.src) + "</p>";
    if (q.given) h += '<p class="given">語譯：' + esc(q.given) + "</p>";
    return h;
  }
  function hintBox(q) {
    var r = ruleOf(q.word);
    return '<div class="hintbox">' + face("curator") + '<div><b>館長提示：</b>' + esc(q.hint) +
      (r ? '<p class="rule">口訣（' + esc(r.w) + "）：" + esc(r.r) + "</p>" : "") + "</div></div>";
  }
  function absurdHtml(q, o) {
    if (o.ab) return esc(o.ab);
    if (q.tr) return "把「" + esc(o.sub || o.t) + "」代入語譯：「" + trSub(q.tr, o.sub || o.t) + "」意思說得通嗎？";
    return "這個意思放進句子裏說不通。";
  }

  function qCard(q, label) {
    var r = rec(q.id) || { tries: 0, wrong: [] };
    var id = "q-" + q.id;
    var isLong = q.options.some(function (o) { return o.t.length > 12; });

    // 已完成
    if (r.done || r.skip) {
      var good = r.done && r.ok; // 一次答對才亮金光
      var h = '<section class="qcard with-who done' + (good ? " good" : "") + (ui.fixed === q.id ? " fixed-anim" : "") + '" id="' + id + '" tabindex="-1">' +
        face("boy") + '<div class="qbody">' + qHead(q, label, true);
      h += '<div class="result">';
      if (r.skip) {
        h += '<p class="muted">已略過（選做題）。</p><button type="button" class="btn small" data-act="unskip" data-q="' + q.id + '">回來做這題</button>';
      } else {
        if (r.ok) h += '<p class="okmark">✔ 修補成功：' + esc(correctOpt(q).t) + "</p>";
        else if (r.miss) h += '<p class="ansmark">答案：' + esc(correctOpt(q).t) + "（已記入藏書閣的錯題）</p>";
        else h += '<p class="okmark">✔ 第二次修補成功：' + esc(correctOpt(q).t) + "</p>";
        h += "<p>" + esc(q.reason) + "</p>";
        if (q.tr && !isLong) h += '<p class="tr">語譯：' + trHtml(q.tr) + "</p>";
      }
      return h + "</div></div></section>";
    }

    // 平行時空
    if (ui.mode[q.id] === "parallel" && r.tries > 0) {
      var o = q.options[r.wrong[r.wrong.length - 1]];
      return '<section class="qcard with-who parallel" id="' + id + '" tabindex="-1">' +
        face("boy") + '<div class="qbody">' +
        '<p class="pt-title">平行時空</p>' +
        '<p class="qsent">' + sentHtml(q.sentence) + "</p>" +
        '<p class="absurd">你選了「' + esc(o.t) + "」：" + absurdHtml(q, o) + "</p>" +
        hintBox(q) +
        '<div class="qtools"><button type="button" class="btn primary" data-act="back" data-q="' + q.id + '">回到正軌，再選一次</button></div>' +
        "</div></section>";
    }

    // 作答
    var h2 = '<section class="qcard with-who" id="' + id + '" tabindex="-1">' + face("boy") + '<div class="qbody">' + qHead(q, label, false);
    h2 += '<p class="qprompt">' + esc(q.prompt || ("這個「" + q.word + "」是什麼意思？")) + "</p>";
    h2 += '<div class="opts' + (isLong ? " long" : "") + '">';
    orderOf(q).forEach(function (oi, k) {
      var o = q.options[oi];
      var off = r.wrong.indexOf(oi) >= 0;
      h2 += '<button type="button" class="opt' + (q.fill ? " fill" : "") + (TEACHER && o.ok ? " answer-mark" : "") + '" data-act="pick" data-q="' + q.id + '" data-i="' + oi + '"' + (off ? " disabled" : "") + ">" +
        '<span class="k">' + (k + 1) + "</span>" + esc(o.t) + "</button>";
    });
    h2 += "</div>";
    h2 += '<div class="qtools"><button type="button" class="btn small ghost hint-btn" data-act="hint" data-q="' + q.id + '" aria-expanded="' + (ui.hint[q.id] ? "true" : "false") + '">' +
      '<img class="mini" src="' + IMG.curatorFace + '" width="200" height="200" alt="">' + (ui.hint[q.id] ? "收起館長提示" : "館長提示") + "</button>";
    if (q.optional) h2 += '<button type="button" class="btn small ghost" data-act="skip" data-q="' + q.id + '">略過（選做）</button>';
    h2 += "</div>";
    if (ui.hint[q.id]) h2 += hintBox(q);
    return h2 + "</div></section>";
  }

  function pick(qid, oi) {
    var q = QS[qid], o = q.options[oi];
    var r = rec(qid) || (store.ans[qid] = { tries: 0, wrong: [] });
    if (r.done || r.skip) return;
    if (o.ok) {
      r.done = true;
      r.ok = r.tries === 0;
      ui.fixed = qid;
      announce((r.ok ? "修補成功。" : "這次對了。") + plain(q.reason));
    } else {
      if (r.tries === 0) r.pick = o.t;
      r.tries++;
      r.wrong.push(oi);
      if (r.tries === 1) {
        ui.mode[qid] = "parallel";
        announce("進入平行時空。" + plain(o.ab || ""));
      } else {
        r.done = true; r.ok = false; r.miss = true;
        announce("答案是" + correctOpt(q).t + "。" + plain(q.reason));
      }
    }
    save();
    render();
    focusEl("q-" + qid);
  }

  /* ================= 開始畫面 ================= */
  function renderStart() {
    var has = Object.keys(store.ans).length > 0;
    return '<div class="hero">' +
      '<h1 class="hero-title">寓言迷途</h1>' +
      '<div class="cast">' +
      '<figure class="portrait"><img src="' + IMG.curator + '" width="520" height="775" alt="館長老夫子：白鬚老人，頭戴文士巾，手持竹簡，站在藏書閣的書架前"><figcaption>館長老夫子</figcaption></figure>' +
      '<figure class="portrait"><img src="' + IMG.boy + '" width="520" height="775" alt="書僮：束髮少年，抱着線裝書和卷軸"><figcaption>書僮（你）</figcaption></figure>' +
      "</div>" +
      '<div class="lead sheet speech">' + face("curator") + '<div><p><span class="speaker">館長老夫子：</span>小書僮，你來得正好！昨夜一條墨蟲鑽進藏書閣，咬壞了六卷寓言。被咬過的虛詞失去了意思，故事全都亂了套。</p>' +
      "<p>請你逐卷修補：讀懂人物說的話，選出虛詞的意思，故事就會回到正軌；選錯了，故事會掉進「平行時空」，你得想辦法把它拉回來。</p>" +
      "<p class=\"small muted\">本遊戲溫習「矣、則、乎、何、何如」，並重溫「乃、因、為、莫、焉」。紀錄只存在這部裝置的瀏覽器內。</p></div></div>" +
      '<label class="field">你的名稱（選填，可填班別學號）<input id="name-input" maxlength="20" autocomplete="off" value="' + esc(store.name) + '"></label>' +
      '<div class="row" style="justify-content:center">' +
      '<button type="button" class="btn primary" data-act="start">' + (has ? "繼續修書" : "開始修書") + "</button>" +
      (has ? '<button type="button" class="btn ghost" data-act="clear">清除紀錄</button>' : "") +
      "</div></div>";
  }

  /* ================= 書架 ================= */
  function renderShelf() {
    var h = "<h1>書架</h1>";
    h += '<p class="muted">六卷可按任何次序修補，建議由第一卷開始。六卷都修好後，終章才會開放。' + (TEACHER ? "（教師版：全部開放）" : "") + "</p>";
    h += '<div class="shelf">';
    BOOKS.forEach(function (b) {
      var done = store.done[b.id];
      var st = started(b);
      var step = done ? stepsOf(b).length - 1 : (st ? firstTodo(b) : 0);
      h += '<a class="scroll' + (done ? " done" : "") + '" href="#/book/' + b.id + "/" + step + '">' +
        (done ? '<img class="mark-thumb" src="' + IMG.thumb(b.id) + '" width="160" height="238" alt="已得書簽">' : "") +
        '<span class="no">第' + "一二三四五六".charAt(Number(b.id) - 1) + "卷</span>" +
        '<span class="name">' + esc(b.title) + "</span>" +
        '<span class="words">' + esc(b.words) + "</span>" +
        '<span class="status">' + (done ? "已修好" : (st ? "修補中" : "未開始")) + '　<span class="stars">' + starText(bookStars(b)) + "</span></span></a>";
    });
    var open = allBooksDone() || TEACHER;
    var fdone = store.finale;
    h += '<a class="scroll finale' + (open ? "" : " locked") + (fdone ? " done" : "") + '" href="' + (open ? "#/finale/" + Math.min(finaleTodo(), FINALE.length - 1) : "#/shelf") + '"' + (open ? "" : ' aria-disabled="true"') + ">" +
      '<span class="no">終章</span><span class="name">墨蟲王之卷</span>' +
      '<span class="words">兩組虛詞混合</span>' +
      '<span class="status">' + (open ? (fdone ? "已修好" : "已開放") : "六卷修好後開放") + '　<span class="stars">' + starText(finaleStars()) + "</span></span></a>";
    h += "</div>";
    if (store.finale || TEACHER) h += '<p class="actions"><a class="btn" href="#/cert">查看修書官證書</a></p>';
    return h;
  }

  /* ================= 書卷 ================= */
  var NEXT_LABEL = { seg: "下一段", trans: "讀完了，進入卷末", reflect: "下一步：寓意反思", ext: "下一步：延伸卷", mark: "完成本卷" };

  function bookHead(b, si) {
    var s = stepsOf(b);
    var h = '<div class="book-head"><h1>第' + "一二三四五六".charAt(Number(b.id) - 1) + "卷　" + esc(b.title) + "</h1>" +
      '<span class="meta"><span class="stars">' + starText(bookStars(b)) + "</span>　" + (si) + " / " + (s.length - 1) + "</span></div>";
    if (TEACHER) {
      h += '<nav class="teacher-nav" aria-label="教師跳轉">教師跳轉：';
      s.forEach(function (st, i) {
        var lab = st.kind === "intro" ? "卷首" : st.kind === "seg" ? "段" + (st.n + 1) : { trans: "語譯", reflect: "反思", ext: "延伸", mark: "書簽" }[st.kind];
        h += '<a href="#/book/' + b.id + "/" + i + '"' + (i === si ? ' aria-current="page"' : "") + ">" + lab + "</a>";
      });
      h += "</nav>";
    }
    return h;
  }

  function navRow(b, si, ready) {
    var s = stepsOf(b);
    var h = '<div class="actions row spread">';
    h += si > 1 ? '<a class="btn ghost" href="#/book/' + b.id + "/" + (si - 1) + '">上一步</a>' : "<span></span>";
    if (si < s.length - 1) {
      var lab = NEXT_LABEL[s[si + 1].kind];
      h += ready ? '<a class="btn primary" href="#/book/' + b.id + "/" + (si + 1) + '">' + lab + "</a>"
                 : '<button type="button" class="btn primary" disabled>完成本段題目後繼續</button>';
    }
    return h + "</div>";
  }

  function renderBook(b, si) {
    var s = stepsOf(b);
    var st = s[si];
    var h = bookHead(b, si);

    if (st.kind === "intro") {
      h += '<figure class="cover"><img src="' + esc(b.art) + '" alt=""></figure>';
      h += '<div class="sheet"><p style="font-size:1.15rem">' + esc(b.intro) + "</p>" +
        '<p class="muted small">出處：' + esc(b.source) + (b.srcNote ? "（" + esc(b.srcNote) + "）" : "") + "</p>" +
        "<p>本卷要修補的虛詞：<b>" + esc(b.words) + "</b></p></div>";
      h += '<div class="actions"><a class="btn primary" href="#/book/' + b.id + '/1">打開書卷</a></div>';
      return h;
    }

    if (st.kind === "seg") return h + renderSeg(b, st, si);

    if (st.kind === "trans") {
      h += "<h2>卷末一：語譯</h2>";
      h += qCard(b.trans, "卷末語譯題");
      return h + navRow(b, si, stepDone(b, st));
    }

    if (st.kind === "reflect") {
      var saved = store.reflect[b.id] || {};
      h += "<h2>卷末二：寓意反思</h2>";
      h += '<div class="sheet"><p style="font-size:1.1rem"><b>' + esc(b.reflect.q) + "</b></p>" +
        '<p class="muted small">這一題沒有標準答案，也不計分。選一個最接近你的想法，或者寫下自己的看法。</p>' +
        '<div class="reflect-opts" role="radiogroup">';
      b.reflect.options.concat(["我有另一個看法"]).forEach(function (op, i) {
        h += '<label><input type="radio" name="rf" value="' + esc(op) + '"' + (saved.pick === op ? " checked" : "") + "> " + esc(op) + "</label>";
        void i;
      });
      h += "</div>" +
        '<label for="rf-text">寫下你的想法或例子（選填，寫了「另一個看法」就要寫）：</label>' +
        '<textarea id="rf-text" maxlength="300">' + esc(saved.text || "") + "</textarea>" +
        '<p id="rf-msg" class="small" role="alert"></p>' +
        '<div class="actions"><button type="button" class="btn primary" data-act="save-reflect" data-b="' + b.id + '">收進書卷</button></div></div>';
      return h + navRow(b, si, stepDone(b, st));
    }

    if (st.kind === "ext") {
      h += "<h2>卷末三：延伸卷（一字多義）</h2>";
      h += '<p class="muted">同一個字，在別的句子裏可能有別的意思。兩題都第一次答對，可以多得一顆星。</p>';
      for (var i = 0; i < b.ext.length; i++) {
        h += qCard(b.ext[i], "延伸卷 " + (i + 1));
        if (!qDone(b.ext[i].id)) break;
      }
      return h + navRow(b, si, stepDone(b, st));
    }

    // 書簽
    if (!store.done[b.id]) { store.done[b.id] = true; save(); }
    var bs = bookStars(b);
    h += '<div class="sheet speech">' + face("curator") + '<p><span class="speaker">館長老夫子：</span>' +
      "這一卷修好了！墨蟲留下的破洞都補上，這枚「" + esc(b.title) + "」書簽送給你。</p></div>";
    h += '<figure class="bookmark-card"><img src="' + IMG.card(b.id) + '" width="784" height="1168" alt="「' + esc(b.title) + '」書簽：故事插圖、標題和原文">' +
      '<figcaption><span class="stars">' + starText(bs) + "</span></figcaption></figure>";
    h += '<div class="sheet"><p class="muted small">全文語譯</p><p>' + esc(b.full) + "</p></div>";
    h += '<div class="actions row" style="justify-content:center">' +
      '<a class="btn primary" href="#/shelf">回到書架</a>' +
      '<a class="btn" href="#/library/books">到藏書閣看全文</a>' +
      '<button type="button" class="btn ghost" data-act="redo-book" data-b="' + b.id + '">重修此卷</button></div>';
    if (allBooksDone() && !store.finale) h += '<p class="center"><b>六卷都修好了！終章「墨蟲王之卷」已經開放。</b> <a class="btn small" href="#/finale/0">前往終章</a></p>';
    return h;
  }

  function renderSeg(b, st, si) {
    var g = st.seg;
    var used = {};
    var h = "";
    h += '<p class="narr">' + esc(g.narr) + "</p>";

    var segReady = st.qs.every(function (q) { return qDone(q.id); });

    if (g.pre) h += '<p class="orig">' + origHtml(g.pre, g.notes, false, used) + "</p>";
    if (g.predict) {
      var pr = rec(g.predict.id);
      if (!pr) {
        h += '<section class="qcard predict" id="q-' + g.predict.id + '" tabindex="-1"><p class="qtag">預測（不計分）</p>' +
          '<p class="qprompt">' + esc(g.predict.q) + '</p><div class="opts long">';
        g.predict.options.forEach(function (op, i) {
          h += '<button type="button" class="opt kai" data-act="predict" data-p="' + g.predict.id + '" data-b="' + b.id + '" data-i="' + i + '"><span class="k">' + (i + 1) + "</span>" + esc(op) + "</button>";
        });
        h += "</div></section>";
        h += '<p class="note-bar" id="note-bar">點擊有底線的字詞，可以看註釋。</p>';
        return h + navRow(b, si, false);
      }
      h += '<p class="trline">你猜：' + esc(g.predict.options[pr.pick]) + "　" +
        (pr.pick === g.predict.answer ? "猜對了！" : "塞翁這次說的是另一句。") + esc(g.predict.after) + "</p>";
    }

    h += '<p class="orig">' + origHtml(g.text, g.notes, segReady && st.qs.length > 0, used) + "</p>";
    if (g.textNote) h += '<p class="text-note">' + esc(g.textNote) + "</p>";
    h += '<p class="note-bar" id="note-bar" aria-live="polite">' + (Object.keys(g.notes || {}).length ? "點擊有底線的字詞，可以看註釋。" : "") + "</p>";

    for (var i = 0; i < st.qs.length; i++) {
      h += qCard(st.qs[i]);
      if (!qDone(st.qs[i].id)) break;
    }
    return h + navRow(b, si, stepDone(b, st));
  }

  /* ================= 終章 ================= */
  function renderFinale(i) {
    var n = FINALE.length;
    var todo = finaleTodo();
    var h = '<div class="book-head"><h1>終章　墨蟲王之卷</h1><span class="meta"><span class="stars">' + starText(finaleStars()) + "</span>　" + Math.min(todo, n) + " / " + n + "</span></div>";
    if (TEACHER) {
      h += '<nav class="teacher-nav" aria-label="教師跳轉">教師跳轉：';
      FINALE.forEach(function (q, k) { h += '<a href="#/finale/' + k + '"' + (k === i ? ' aria-current="page"' : "") + ">" + esc(q.id) + "</a>"; });
      h += "</nav>";
    }
    h += '<p class="muted">墨蟲王躲在這卷書裏，兩組虛詞都混在一起了。每修好一題，書上就退去一片墨點。答錯時，系統會把你選的意思代入語譯，讓你看看通不通。</p>';
    h += '<div class="blots" aria-label="剩下 ' + (n - FINALE.filter(function (q) { return qDone(q.id); }).length) + ' 片墨點">';
    FINALE.forEach(function (q) { h += '<span class="blot' + (qDone(q.id) ? " gone" : "") + '"></span>'; });
    h += "</div>";

    if (todo >= n && !store.finale) { store.finale = true; save(); }

    var q = FINALE[i];
    h += qCard(q, "終章第 " + (i + 1) + " 題" + (q.fill ? "（填字）" : ""));
    h += '<div class="actions row spread">';
    h += i > 0 ? '<a class="btn ghost" href="#/finale/' + (i - 1) + '">上一題</a>' : "<span></span>";
    if (i < n - 1) {
      h += qDone(q.id) ? '<a class="btn primary" href="#/finale/' + (i + 1) + '">下一題</a>' : '<button type="button" class="btn primary" disabled>完成本題後繼續</button>';
    } else if (qDone(q.id) && todo >= n) {
      h += '<a class="btn primary" href="#/cert">墨蟲王逃走了！領取證書</a>';
    }
    return h + "</div>";
  }

  /* ================= 藏書閣 ================= */
  var TABS = [["books", "書卷"], ["wrong", "錯題"], ["reflect", "反思紀錄"], ["rules", "口訣表"]];

  function bookTitleOf(qid) {
    var loc = QLOC[qid];
    return loc.book === "F" ? "終章" : bookById(loc.book).title;
  }

  function renderLibrary(tab) {
    if (!TABS.some(function (t) { return t[0] === tab; })) tab = "books";
    var h = "<h1>藏書閣</h1>";
    h += '<nav class="tabs" aria-label="藏書閣分頁">';
    TABS.forEach(function (t) { h += '<a href="#/library/' + t[0] + '"' + (t[0] === tab ? ' aria-current="page"' : "") + ">" + t[1] + "</a>"; });
    h += "</nav>";
    h += '<div class="actions no-print"><button type="button" class="btn" data-act="print">列印／存成 PDF</button></div>';
    h += '<p class="small muted">' + esc(store.name ? "書僮：" + store.name + "　" : "") + "列印日期：" + new Date().toLocaleDateString("zh-HK") + "</p>";

    if (tab === "books") {
      BOOKS.forEach(function (b) {
        h += '<section class="sheet lib-book"><h2>第' + "一二三四五六".charAt(Number(b.id) - 1) + "卷　" + esc(b.title) + '　<span class="small muted">' + esc(b.source) + "</span></h2>";
        if (!store.done[b.id] && !TEACHER) { h += '<p class="muted">修好這一卷後，就可以在這裏看全文。</p></section>'; return; }
        var text = b.segs.map(function (g) { return (g.pre || "") + g.text; }).join("");
        h += '<p class="orig sm">' + sentHtml(text) + "</p>";
        h += '<table><thead><tr><th>句子</th><th>意思</th></tr></thead><tbody>';
        stepsOf(b).forEach(function (st) {
          if (st.kind !== "seg") return;
          st.qs.forEach(function (q) { h += '<tr><td class="kai">' + sentHtml(q.sentence) + "</td><td>" + esc(correctOpt(q).t) + "</td></tr>"; });
        });
        b.ext.forEach(function (q) { h += '<tr><td class="kai">' + sentHtml(q.sentence) + '<br><span class="small muted">' + esc(q.src) + "</span></td><td>" + esc(correctOpt(q).t) + "</td></tr>"; });
        h += "</tbody></table>";
        h += '<p><b>全文語譯：</b>' + esc(b.full) + "</p></section>";
      });
    }

    if (tab === "wrong") {
      var miss = Object.keys(store.ans).filter(function (id) { return QS[id] && store.ans[id].miss; });
      if (!miss.length) h += '<p class="sheet">暫時沒有錯題。兩次都選錯的題目，會記在這裏。</p>';
      else {
        h += '<table><thead><tr><th>卷</th><th>句子</th><th>你第一次的選擇</th><th>答案及理由</th><th class="no-print"></th></tr></thead><tbody>';
        miss.forEach(function (id) {
          var q = QS[id], r = store.ans[id];
          h += "<tr><td>" + esc(bookTitleOf(id)) + "</td>" +
            '<td class="kai">' + sentHtml(q.sentence) + "</td>" +
            "<td>" + esc(r.pick || "") + "</td>" +
            "<td><b>" + esc(correctOpt(q).t) + "</b><br>" + esc(q.reason) + "</td>" +
            '<td class="no-print"><button type="button" class="btn small" data-act="redo-q" data-q="' + id + '">重做</button></td></tr>';
        });
        h += "</tbody></table>";
      }
    }

    if (tab === "reflect") {
      BOOKS.forEach(function (b) {
        var r = store.reflect[b.id];
        h += '<section class="sheet"><h2>' + esc(b.title) + "</h2><p><b>" + esc(b.reflect.q) + "</b></p>" +
          (r ? "<p>我的想法：" + esc(r.pick || "") + "</p>" + (r.text ? "<p>" + esc(r.text) + "</p>" : "") : '<p class="muted">還沒有作答。</p>') + "</section>";
      });
    }

    if (tab === "rules") {
      h += '<table><thead><tr><th style="width:5em">字</th><th>口訣</th></tr></thead><tbody>';
      RULES.forEach(function (r) { h += '<tr><td class="kai">' + esc(r.w) + (r.review ? '<br><span class="small muted">重溫</span>' : "") + "</td><td>" + esc(r.r) + "</td></tr>"; });
      h += "</tbody></table>";
    }
    return h;
  }

  /* ================= 證書 ================= */
  function renderCert() {
    if (!store.finale && !TEACHER) return '<p class="sheet">完成終章後，就可以在這裏領取證書。</p><p><a class="btn" href="#/shelf">回到書架</a></p>';
    var got = 0, max = 0;
    BOOKS.forEach(function (b) { var s = bookStars(b); got += s.got; max += s.max; });
    var f = finaleStars(); got += f.got; max += f.max;
    return '<div class="cert"><h1>修書官</h1>' +
      '<p><span class="cert-name">' + esc(store.name || "小書僮") + "</span></p>" +
      "<p>修好了藏書閣的六卷寓言，並趕走了墨蟲王。<br>能辨「矣、則、乎、何、何如」，兼通「乃、因、為、莫、焉」。</p>" +
      '<p>共得 <span class="stars">★ ' + got + " / " + max + "</span></p>" +
      "<p>" + new Date().toLocaleDateString("zh-HK", { year: "numeric", month: "long", day: "numeric" }) + "</p>" +
      '<span class="seal">藏書閣印</span></div>' +
      '<div class="actions row no-print" style="justify-content:center"><button type="button" class="btn primary" data-act="print">列印證書</button><a class="btn" href="#/shelf">回到書架</a></div>';
  }

  /* ================= 路由 ================= */
  function parse() {
    var p = location.hash.replace(/^#\/?/, "").split("/").map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    return p;
  }
  function go(h) { if (location.hash === h) render(); else location.hash = h; }

  function render() {
    var p = parse();
    var page = p[0] || "start"; // 打開網站一律先到書僮的開始畫面
    var html;
    if (page === "start") html = renderStart();
    else if (page === "book") {
      var b = bookById(p[1]);
      if (!b) return go("#/shelf");
      var max = stepsOf(b).length - 1;
      var si = parseInt(p[2], 10);
      if (isNaN(si) || si < 0) si = 0;
      if (si > max) si = max;
      if (!TEACHER && si > firstTodo(b)) return go("#/book/" + b.id + "/" + firstTodo(b));
      html = renderBook(b, si);
    } else if (page === "finale") {
      if (!allBooksDone() && !TEACHER) return go("#/shelf");
      var i = parseInt(p[1], 10);
      if (isNaN(i) || i < 0) i = 0;
      if (i > FINALE.length - 1) i = FINALE.length - 1;
      var todo = Math.min(finaleTodo(), FINALE.length - 1);
      if (!TEACHER && i > todo) return go("#/finale/" + todo);
      html = renderFinale(i);
    } else if (page === "library") html = renderLibrary(p[1] || "books");
    else if (page === "cert") html = renderCert();
    else html = renderShelf();
    app.innerHTML = html;
    updateChip();
  }

  function onRoute() {
    ui.fixed = null;
    render();
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
  }

  function focusEl(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function updateChip() {
    document.getElementById("name-chip").textContent = store.name ? "書僮：" + store.name : "書僮";
  }
  function applyFont() {
    document.documentElement.setAttribute("data-font", String(store.font || 0));
    Array.prototype.forEach.call(document.querySelectorAll(".font-ctrl button"), function (b) {
      b.setAttribute("aria-pressed", String(Number(b.getAttribute("data-font")) === (store.font || 0)));
    });
  }

  /* ================= 事件 ================= */
  app.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act], .note-term");
    if (!t) return;

    if (t.classList.contains("note-term")) {
      var bar = document.getElementById("note-bar");
      if (bar) bar.innerHTML = "<b>" + esc(t.getAttribute("data-note")) + "</b>：" + esc(t.getAttribute("data-mean"));
      return;
    }

    var act = t.getAttribute("data-act");
    var qid = t.getAttribute("data-q");

    if (act === "pick") return pick(qid, Number(t.getAttribute("data-i")));

    if (act === "back") {
      ui.mode[qid] = "ask";
      render();
      focusEl("q-" + qid);
      return;
    }
    if (act === "hint") {
      ui.hint[qid] = !ui.hint[qid];
      render();
      var btn = document.querySelector('[data-act="hint"][data-q="' + qid + '"]');
      if (btn) btn.focus();
      return;
    }
    if (act === "skip") {
      store.ans[qid] = { tries: 0, wrong: [], skip: true };
      save(); render(); focusEl("q-" + qid);
      return;
    }
    if (act === "unskip") {
      delete store.ans[qid];
      save(); render(); focusEl("q-" + qid);
      return;
    }
    if (act === "predict") {
      var pid = t.getAttribute("data-p");
      store.ans[pid] = { done: true, pick: Number(t.getAttribute("data-i")) };
      save(); render();
      return;
    }
    if (act === "save-reflect") {
      var bid = t.getAttribute("data-b");
      var sel = document.querySelector('input[name="rf"]:checked');
      var txt = document.getElementById("rf-text").value.trim();
      var msg = document.getElementById("rf-msg");
      if (!sel && !txt) { msg.textContent = "請選一個想法，或寫下你的看法。"; return; }
      if (sel && sel.value === "我有另一個看法" && !txt) { msg.textContent = "你選了「我有另一個看法」，請把它寫下來。"; return; }
      store.reflect[bid] = { pick: sel ? sel.value : "", text: txt };
      save();
      var b = bookById(bid);
      go("#/book/" + bid + "/" + (stepsOf(b).length - 2));
      return;
    }
    if (act === "redo-book") {
      var rb = bookById(t.getAttribute("data-b"));
      if (!confirm("重修「" + rb.title + "」？這一卷的作答紀錄會清除，星數以重修的結果計算。反思紀錄會保留。")) return;
      Object.keys(QLOC).forEach(function (id) { if (QLOC[id].book === rb.id) { delete store.ans[id]; delete ui.order[id]; delete ui.mode[id]; } });
      rb.segs.forEach(function (g) { if (g.predict) delete store.ans[g.predict.id]; });
      delete store.done[rb.id];
      save();
      go("#/book/" + rb.id + "/1");
      return;
    }
    if (act === "redo-q") {
      var loc = QLOC[qid];
      delete store.ans[qid]; delete ui.order[qid]; delete ui.mode[qid];
      save();
      go(loc.book === "F" ? "#/finale/" + loc.step : "#/book/" + loc.book + "/" + loc.step);
      return;
    }
    if (act === "print") { window.print(); return; }
    if (act === "start") {
      var inp = document.getElementById("name-input");
      store.name = inp ? inp.value.trim().slice(0, 20) : store.name;
      store.visited = true;
      save();
      go("#/shelf");
      return;
    }
    if (act === "clear") {
      if (!confirm("清除這部裝置上的全部修書紀錄（包括星數、錯題和反思）？清除後不能復原。")) return;
      var font = store.font;
      store = fresh();
      store.font = font;
      ui = { order: {}, mode: {}, hint: {}, fixed: null };
      save();
      render();
      return;
    }
  });

  // 數字鍵 1–4 選答案
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    var k = Number(e.key);
    if (!(k >= 1 && k <= 4)) return;
    var card = app.querySelector(".qcard:not(.done):not(.parallel)");
    if (!card) return;
    var opts = card.querySelectorAll(".opt");
    var o = opts[k - 1];
    if (o && !o.disabled) { e.preventDefault(); o.click(); }
  });

  document.querySelector(".font-ctrl").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-font]");
    if (!b) return;
    store.font = Number(b.getAttribute("data-font"));
    save();
    applyFont();
  });

  window.addEventListener("hashchange", onRoute);
  applyFont();
  onRoute();
})();
