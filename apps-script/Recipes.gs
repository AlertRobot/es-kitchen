/**
 * Peckish recipe import. Add this as a second file (Recipes.gs) in the same Apps Script project as Code.gs.
 *
 * - A web link: reads the recipe the page publishes for search engines (most recipe sites do). Pages without it,
 *   and photos of cookbook pages, are read by Google Gemini.
 * - Gemini needs a free API key: aistudio.google.com > Get API key (any Google account). In this project:
 *   Project Settings > Script properties > Add: GEMINI_KEY = your key. Optional: GEMINI_MODEL (default gemini-flash-latest).
 * - Code.gs's doPost sends { action: "recipe" } here (one line: see the "recipe" line in doPost).
 */
var RECIPE_PROMPT_ = "Read the recipe and return JSON with: title; servings (a number); time (total minutes, a number); " +
  "cuisine (one of Italian, British, American, Mexican, Middle Eastern, Indian, Asian); ingredients (an array of strings, one per ingredient, " +
  "each with its amount and unit as written, e.g. \"200g chicken breast, diced\"); steps (an array of strings, the method in order, one step each, " +
  "in British English). If there's more than one recipe, use the main one. If there's no recipe, return {\"error\": \"No recipe found\"}.";
var RECIPE_SCHEMA_ = { type: "OBJECT", properties: { title: { type: "STRING" }, servings: { type: "INTEGER" }, time: { type: "INTEGER" }, cuisine: { type: "STRING" },
  ingredients: { type: "ARRAY", items: { type: "STRING" } }, steps: { type: "ARRAY", items: { type: "STRING" } }, error: { type: "STRING" } } };

function recipe_(body) {
  if (body.url) return recipeFromUrl_(String(body.url));
  if (body.image) return recipeFromImage_(String(body.image), String(body.mime || "image/jpeg"));
  return { ok: false, error: "Send a link or a photo." };
}
function recipeFromUrl_(url) {
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: "That isn't a web link." };
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { "User-Agent": "Mozilla/5.0 (compatible; Peckish recipe import)" } });
  if (res.getResponseCode() >= 400) return { ok: false, error: "That page didn't open (" + res.getResponseCode() + ")." };
  var html = res.getContentText();
  var r = jsonLdRecipe_(html);
  if (r) { r.source = url; return { ok: true, recipe: r, via: "page" }; }
  var text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").slice(0, 30000);
  var g = gemini_([{ text: RECIPE_PROMPT_ + "\n\nThe page's text:\n" + text }]);
  if (g.ok) g.recipe.source = url;
  return g;
}
function recipeFromImage_(b64, mime) {
  var g = gemini_([{ text: RECIPE_PROMPT_ + " The photo is a page from a cookbook." }, { inline_data: { mime_type: mime, data: b64 } }]);
  if (g.ok) g.recipe.source = "Cookbook photo";
  return g;
}
// schema.org Recipe in <script type="application/ld+json">
function jsonLdRecipe_(html) {
  var re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi, m, found = null;
  function walk(o) {
    if (!o || found) return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (typeof o !== "object") return;
    var t = o["@type"]; if (t === "Recipe" || (Array.isArray(t) && t.indexOf("Recipe") >= 0)) { found = o; return; }
    if (o["@graph"]) walk(o["@graph"]);
  }
  while ((m = re.exec(html)) && !found) { try { walk(JSON.parse(m[1].trim())); } catch (e) { /* skip broken blocks */ } }
  if (!found) return null;
  var steps = [];
  function addSteps(x) {
    if (!x) return;
    if (typeof x === "string") { x.split(/\n+/).forEach(function (s) { s = clean_(s); if (s) steps.push(s); }); return; }
    if (Array.isArray(x)) { x.forEach(addSteps); return; }
    if (x.itemListElement) { addSteps(x.itemListElement); return; }
    if (x.text) steps.push(clean_(x.text)); else if (x.name) steps.push(clean_(x.name));
  }
  addSteps(found.recipeInstructions);
  var cuisine = found.recipeCuisine; if (Array.isArray(cuisine)) cuisine = cuisine[0];
  return { title: clean_(found.name || ""), servings: firstNumber_(found.recipeYield), time: minutes_(found.totalTime) || (minutes_(found.prepTime) + minutes_(found.cookTime)) || 30,
    cuisine: cuisine || "", ingredients: (found.recipeIngredient || found.ingredients || []).map(clean_).filter(String), steps: steps.filter(String) };
}
function clean_(s) { return String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function firstNumber_(y) { if (Array.isArray(y)) y = y[0]; var m = String(y || "").match(/\d+/); return m ? Number(m[0]) : 2; }
function minutes_(iso) { var m = String(iso || "").match(/P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/); return m ? (Number(m[1] || 0) * 60 + Number(m[2] || 0)) : 0; }
function gemini_(parts) {
  var props = PropertiesService.getScriptProperties(), key = props.getProperty("GEMINI_KEY");
  if (!key) return { ok: false, error: "Photo reading isn't set up yet: add a GEMINI_KEY script property (see the top of Recipes.gs)." };
  var models = [props.getProperty("GEMINI_MODEL") || "gemini-flash-latest", "gemini-2.5-flash"];
  for (var i = 0; i < models.length; i++) {
    var res = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models/" + models[i] + ":generateContent", {
      method: "post", contentType: "application/json", headers: { "x-goog-api-key": key }, muteHttpExceptions: true,
      payload: JSON.stringify({ contents: [{ parts: parts }], generationConfig: { responseMimeType: "application/json", responseSchema: RECIPE_SCHEMA_, temperature: 0.2 } })
    });
    var code = res.getResponseCode();
    if (code === 404) continue;
    if (code === 429) return { ok: false, error: "Gemini's free allowance is used up for the moment. Try again in a minute." };
    if (code >= 400) return { ok: false, error: "Gemini said no (" + code + "): " + res.getContentText().slice(0, 200) };
    try {
      var j = JSON.parse(res.getContentText()), txt = j.candidates[0].content.parts[0].text, r = JSON.parse(txt);
      if (r.error && !(r.ingredients || []).length) return { ok: false, error: "Couldn't find a recipe there: " + r.error };
      return { ok: true, recipe: r, via: "gemini" };
    } catch (e) { return { ok: false, error: "Couldn't read Gemini's answer. Try a clearer photo." }; }
  }
  return { ok: false, error: "No Gemini model answered. Set GEMINI_MODEL to a current model name." };
}
// Run once from the editor after adding this file, to allow it to open web pages; the log shows what it read.
function testRecipe() { Logger.log(JSON.stringify(recipeFromUrl_("https://www.bbcgoodfood.com/recipes/easy-chicken-curry")).slice(0, 800)); }
