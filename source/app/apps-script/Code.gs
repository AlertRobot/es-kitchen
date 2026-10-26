/**
 * Peckish backup: receives backups from the phone app and keeps them in this spreadsheet,
 * one tab per table. Each household's rows are replaced on every backup; other households' rows are left alone.
 *
 * Setup (once, in the Google account that should own the backup):
 *   1. Create a Google Sheet, then Extensions > Apps Script. Paste this file into Code.gs and save.
 *   2. Run "setup" (toolbar). Allow access when Google asks. The log shows the backup key.
 *   3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Deploy, and copy the /exec web address.
 *   4. Paste the web address into WEB_APP_URL below, save, and run "connectLink". Open the link it logs on a phone
 *      (or type the address and key into the app: Settings > Backup & restore). Both phones share the connection.
 *
 * Security: every request must carry the backup key, which lives only in this script's properties and in the
 * household's settings in the app. To change it, run "newKey" and reconnect the app.
 */

var SHEET_ID = ""; // the backup spreadsheet's id (from its address); leave blank when the script is opened from the sheet's Extensions menu
var WEB_APP_URL = ""; // optional: paste the /exec address here, then run connectLink()
var APP_URL = "https://alertrobot.github.io/es-kitchen/";

// Tab order and the first column that identifies a household (or "library" for the shared recipe library).
var TABLES = [
  "Households", "Accounts", "People", "Weeks", "BreakfastLunch", "Shopping", "Pantry", "Settings",
  "Ratings", "MyRecipes", "PriceOverrides", "Shops", "Recipes", "Ingredients", "Docs"
];
var LOG_TAB = "BackupLog";
var README_TAB = "About";

// ---------- run these from the editor ----------
function setup() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty("APP_KEY");
  if (!key) { key = makeKey_(); props.setProperty("APP_KEY", key); }
  var ss = ss_();
  about_(ss);
  TABLES.forEach(function (t) { sheet_(ss, t); });
  var log = sheet_(ss, LOG_TAB);
  if (log.getLastRow() === 0) { log.appendRow(["backed_up_at", "household_id", "household", "by", "tables", "rows", "seconds"]); log.setFrozenRows(1); log.getRange(1, 1, 1, 7).setFontWeight("bold"); }
  var blank = ss.getSheetByName("Sheet1"); if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);
  Logger.log("Backup key: " + key);
  Logger.log("Next: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone). Then paste the /exec address into WEB_APP_URL and run connectLink.");
}
function newKey() {
  var key = makeKey_();
  PropertiesService.getScriptProperties().setProperty("APP_KEY", key);
  Logger.log("New backup key: " + key + "  (reconnect the app with it)");
}
function connectLink() {
  var key = PropertiesService.getScriptProperties().getProperty("APP_KEY");
  var url = WEB_APP_URL || (ScriptApp.getService().getUrl() || "");
  if (!key) throw new Error("Run setup first.");
  if (!/\/exec$/.test(url)) throw new Error("Paste your web app address (ending /exec) into WEB_APP_URL at the top, save, and run again.");
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify({ u: url, k: key }));
  Logger.log("Open this link on a phone that's signed in to Peckish:\n" + APP_URL + "#backup=" + payload);
}

// ---------- web endpoints ----------
function doGet(e) {
  return json_({ ok: true, app: "Peckish backup", note: "Nothing to see here. The app sends backups with POST." });
}
function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (x) {}
  try {
    checkKey_(body.key);
    var ss = ss_();
    if (body.action === "ping") return json_({ ok: true, sheetUrl: ss.getUrl(), sheetName: ss.getName() });
    if (body.action === "restore") return json_(restore_(ss, String(body.hid || "")));
    if (body.action === "recipe") return json_(recipe_(body)); // Recipes.gs
    if (body.action !== "backup") throw new Error("Unknown action");
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try { return json_(backup_(ss, body)); } finally { lock.releaseLock(); }
  } catch (err) { return json_({ ok: false, error: String((err && err.message) || err) }); }
}

// ---------- backup ----------
function backup_(ss, body) {
  var t0 = Date.now();
  var hid = String(body.hid || "");
  if (!hid) throw new Error("No household id");
  var tables = body.tables || {}, total = 0, names = [];
  TABLES.forEach(function (name) {
    var tb = tables[name]; if (!tb || !tb.cols) return;
    var owner = (tb.rows.length && String(tb.rows[0][0]) === "library") ? "library" : hid;
    writeTable_(sheet_(ss, name), tb.cols, tb.rows, owner);
    total += tb.rows.length; names.push(name);
  });
  var secs = Math.round((Date.now() - t0) / 100) / 10;
  sheet_(ss, LOG_TAB).appendRow([body.at || new Date().toISOString(), hid, body.household || "", body.by || "", names.join(", "), total, secs]);
  trimLog_(ss);
  SpreadsheetApp.flush();
  return { ok: true, rows: total, tables: names.length, seconds: secs, sheetUrl: ss.getUrl() };
}
// Replace this owner's rows; keep everyone else's.
function writeTable_(sh, cols, rows, owner) {
  var last = sh.getLastRow(), width = Math.max(cols.length, sh.getLastColumn() || 0);
  var keep = [];
  if (last > 1) {
    var cur = sh.getRange(2, 1, last - 1, width).getValues();
    keep = cur.filter(function (r) { return String(r[0]) !== owner && String(r[0]) !== ""; });
  }
  var all = keep.map(function (r) { return pad_(r.slice(0, cols.length), cols.length); }).concat(rows.map(function (r) { return pad_(r.map(cell_), cols.length); }));
  sh.clearContents();
  sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight("bold");
  sh.setFrozenRows(1);
  if (all.length) {
    var rng = sh.getRange(2, 1, all.length, cols.length);
    rng.setNumberFormat("@"); // keep ids, dates and codes exactly as sent
    rng.setValues(all);
  }
  var extra = sh.getMaxColumns() - cols.length; if (extra > 0) sh.deleteColumns(cols.length + 1, extra);
}
function cell_(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") v = JSON.stringify(v);
  v = String(v);
  if (v.length > 49000) v = v.slice(0, 49000);
  // text that starts like a formula (a name or note typed as "=...") stays text: the apostrophe isn't part of the value
  return /^[=+\-@]/.test(v) && !/^[+-]?\d/.test(v) ? "'" + v : v;
}
function pad_(r, n) { while (r.length < n) r.push(""); return r; }
function trimLog_(ss) { var sh = ss.getSheetByName(LOG_TAB); var n = sh.getLastRow(); if (n > 1001) sh.deleteRows(2, n - 1001); }

// ---------- restore: put the raw records back together ----------
function restore_(ss, hid) {
  if (!hid) throw new Error("No household id");
  var sh = ss.getSheetByName("Docs");
  if (!sh || sh.getLastRow() < 2) throw new Error("There's no backup in the sheet yet.");
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
  var parts = {}, at = "";
  vals.forEach(function (r) {
    if (String(r[0]) !== hid) return;
    var path = String(r[1]); (parts[path] = parts[path] || []).push({ k: Number(r[2]), s: String(r[4]) }); at = String(r[5] || at);
  });
  var docs = Object.keys(parts).map(function (path) {
    var s = parts[path].sort(function (a, b) { return a.k - b.k; }).map(function (x) { return x.s; }).join("");
    return { path: path, data: JSON.parse(s) };
  });
  if (!docs.length) throw new Error("This household isn't in the backup sheet.");
  var by = "", log = ss.getSheetByName(LOG_TAB);
  if (log && log.getLastRow() > 1) { var lv = log.getRange(2, 1, log.getLastRow() - 1, 4).getValues(); for (var i = lv.length - 1; i >= 0; i--) if (String(lv[i][1]) === hid) { by = String(lv[i][3]); break; } }
  return { ok: true, docs: docs, at: at, by: by };
}

// ---------- helpers ----------
function ss_() { return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }
function checkKey_(k) {
  var key = PropertiesService.getScriptProperties().getProperty("APP_KEY");
  if (!key || !k || String(k) !== key) throw new Error("Wrong backup key. Reconnect the app in Settings > Backup & restore.");
}
function makeKey_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ""); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function about_(ss) {
  var sh = sheet_(ss, README_TAB);
  if (sh.getLastRow() > 0) return;
  var lines = [
    ["Peckish backup"],
    ["This spreadsheet is filled in by the Peckish app (" + APP_URL + "). Don't edit the tabs by hand: each backup replaces a household's rows."],
    ["The app backs up once a day and whenever a week is locked in. You can also tap Settings > Backup & restore > Back up now."],
    [""],
    ["Tabs"],
    ["Households: each household (name, invite code, members)"],
    ["Accounts: each person's sign-in account and email"],
    ["People: who eats, won't eat / dislikes / likes, portions and calorie targets"],
    ["Weeks: every planned dinner, one row per day"],
    ["BreakfastLunch: planned breakfasts and lunches per person"],
    ["Shopping: this week's and next week's list with prices, and what's been ticked"],
    ["Pantry: staples and whether you have them"],
    ["Settings: shop, budget, planning style, equipment, treat nights"],
    ["Ratings: star ratings per recipe and person"],
    ["MyRecipes: recipes you've added or edited"],
    ["PriceOverrides: prices you've changed"],
    ["Shops: food shops you've logged paying for (in Peckish or Budgie)"],
    ["Recipes and Ingredients: the full built-in recipe library with ingredients, method, nutrition and supermarket prices"],
    ["Docs: the raw records, used by the app to restore a household exactly"],
    ["BackupLog: when each backup ran"]
  ];
  sh.getRange(1, 1, lines.length, 1).setValues(lines);
  sh.getRange(1, 1).setFontSize(16).setFontWeight("bold");
  sh.getRange(5, 1).setFontWeight("bold");
  sh.setColumnWidth(1, 900);
}
