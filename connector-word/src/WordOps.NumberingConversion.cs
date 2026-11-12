using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// MathType's equation numbering → MathBlocks numbering (one scheme per document): MathType's
    /// chapter/section breaks become MathBlocks markers, its numbers become MathBlocks number fields
    /// keeping their bookmark (ZEqnNum…), so every reference keeps pointing at its equation. The app
    /// plans it (numberingConversion.ts: keep the numbers, or renumber to chapter.section.equation);
    /// this side reads the document (scanNumbering) and writes the plan (convertNumbering).
    /// </summary>
    internal sealed partial class WordOps
    {
        /// <summary>
        /// In document order: MathType breaks and numbers (with what each number shows and its bookmark),
        /// MathBlocks markers and numbers already there, and headings (level, text, Word's own number).
        /// </summary>
        public Dictionary<string, object> ScanNumbering(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var clock = Stopwatch.StartNew();
            var items = new List<Dictionary<string, object>>();
            bool hidden = doc.Bookmarks.ShowHidden;
            doc.Bookmarks.ShowHidden = true;
            try
            {
                foreach (Word.Field f in doc.Fields)
                {
                    string code;
                    int start;
                    try
                    {
                        code = f.Code.Text ?? "";
                        start = f.Code.Start - 1;
                    }
                    catch (COMException)
                    {
                        continue;
                    }
                    var para = doc.Range(start, start).Paragraphs[1].Range;
                    if (code.Contains("MTEditEquationSection"))
                    {
                        var label = "";
                        label = ButtonDisplay(f);
                        items.Add(new Dictionary<string, object> { ["type"] = "mtBreak", ["start"] = start, ["paraStart"] = para.Start, ["label"] = label, ["code"] = NestedCodes(f) });
                    }
                    else if (code.Contains("MTPlaceRef"))
                    {
                        string bookmark = null;
                        foreach (Word.Bookmark bm in para.Bookmarks)
                            if (bm.Name.StartsWith(MathTypeBookmarkPrefix, StringComparison.Ordinal) && (bookmark == null || bm.Name.Length < bookmark.Length)) bookmark = bm.Name;
                        var nested = NestedCodes(f);
                        items.Add(new Dictionary<string, object>
                        {
                            ["type"] = "mtNumber",
                            ["start"] = start,
                            ["paraStart"] = para.Start,
                            ["text"] = ButtonDisplay(f),
                            ["bookmark"] = bookmark ?? "",
                            ["code"] = nested,
                            ["snippet"] = Snippet(para),
                        });
                    }
                    else if (code.Contains("MBEquationSection"))
                    {
                        var m = MarkerLabel.Match(code);
                        if (m.Success) items.Add(new Dictionary<string, object> { ["type"] = "mbMarker", ["start"] = start, ["paraStart"] = para.Start, ["chapter"] = int.Parse(m.Groups[2].Value), ["appendix"] = m.Groups[1].Value == "Appendix", ["section"] = m.Groups[3].Success ? int.Parse(m.Groups[3].Value) : 0 });
                    }
                    else if (code.Contains("MBPlaceRef"))
                    {
                        items.Add(new Dictionary<string, object> { ["type"] = "mbNumber", ["start"] = start, ["paraStart"] = para.Start, ["text"] = ButtonDisplay(f), ["snippet"] = Snippet(para) });
                    }
                }
            }
            finally
            {
                doc.Bookmarks.ShowHidden = hidden;
            }
            // Headings (outline levels 1–3): where sections start, and their numbers.
            foreach (Word.Paragraph para in doc.Paragraphs)
            {
                int level;
                try { level = (int)para.OutlineLevel; } catch (COMException) { continue; }
                if (level < 1 || level > 3) continue;
                var r = para.Range;
                var list = "";
                try { list = r.ListFormat.ListString ?? ""; } catch (COMException) { }
                items.Add(new Dictionary<string, object> { ["type"] = "heading", ["start"] = r.Start, ["paraStart"] = r.Start, ["after"] = r.End, ["level"] = level, ["text"] = (r.Text ?? "").Trim(), ["list"] = list });
            }
            items.Sort((a, b) => Convert.ToInt32(a["start"]).CompareTo(Convert.ToInt32(b["start"])));
            Log.Info("scanNumbering in " + doc.Name + ": " + items.Count + " item(s), " + clock.ElapsedMilliseconds + " ms");
            return new Dictionary<string, object> { ["name"] = doc.Name, ["fullName"] = doc.FullName, ["items"] = items };
        }

        /// <summary>The codes of the fields nested in a field (MathType's SEQ counters).</summary>
        private static List<object> NestedCodes(Word.Field f)
        {
            var list = new List<object>();
            try
            {
                foreach (Word.Field inner in f.Code.Fields) list.Add((inner.Code.Text ?? "").Trim());
            }
            catch (COMException)
            {
            }
            return list;
        }

        private static string Snippet(Word.Range para)
        {
            var t = DisplayText(para.Text ?? "").Replace("\r", " ").Replace("\a", " ").Replace("\t", " ").Trim();
            return t.Length > 80 ? t.Substring(0, 80) + "…" : t;
        }

        /// <summary>
        /// Writes the plan (last position first) as one undo step: breaks replaced by markers, markers
        /// inserted, numbers replaced by MathBlocks number fields under the same bookmark; then every number
        /// and reference is updated. Returns what each bookmark shows afterwards.
        /// </summary>
        public Dictionary<string, object> ConvertNumbering(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var fmt = NumberFields.NumberFormat.From(p.TryGetValue("format", out var fo) && fo is Dictionary<string, object> fd ? fd : new Dictionary<string, object>());
            if (!p.TryGetValue("items", out var raw) || !(raw is IEnumerable list)) throw new RpcException(Rpc.InvalidParams, "Missing items");
            var items = new List<Dictionary<string, object>>();
            foreach (var o in list) if (o is Dictionary<string, object> d) items.Add(d);
            items.Sort((a, b) => Rpc.GetInt(b, "start").CompareTo(Rpc.GetInt(a, "start")));
            var clock = Stopwatch.StartNew();
            return InOneUndo("Convert MathType numbering", () =>
            {
                var problems = new List<object>();
                var bookmarks = new List<string>();
                // MathType bookmark (ZEqnNum…) → the MathBlocks bookmark of the same number (_MBEq_…).
                var aliases = new Dictionary<string, string>();
                bool screen = _app.ScreenUpdating;
                bool hidden = doc.Bookmarks.ShowHidden;
                try
                {
                    _app.ScreenUpdating = false;
                    doc.Bookmarks.ShowHidden = true;
                    foreach (var item in items)
                    {
                        var kind = Rpc.GetString(item, "kind");
                        int start = Rpc.GetInt(item, "start");
                        try
                        {
                            switch (kind)
                            {
                                case "replaceBreak":
                                {
                                    var f = FieldAt(doc, start, "MTEditEquationSection");
                                    if (f == null) { problems.Add("MathType break not found at " + start); break; }
                                    int pos = f.Code.Start - 1;
                                    f.Delete();
                                    InsertInline(doc, doc.Range(pos, pos), NumberFields.Package(MarkerRuns(Rpc.GetInt(item, "chapter", 1), Rpc.GetInt(item, "section", 0), Rpc.GetBool(item, "appendix"), true)));
                                    break;
                                }
                                case "insertMarker":
                                {
                                    // Its own hidden paragraph (as MathType's breaks): nothing is added to the heading or
                                    // to the paragraph after it (which may be a pasted \mbnumbering line).
                                    doc.Range(start, start).InsertParagraphBefore();
                                    InsertInline(doc, doc.Range(start, start), NumberFields.Package(MarkerRuns(Rpc.GetInt(item, "chapter", 1), Rpc.GetInt(item, "section", 0), Rpc.GetBool(item, "appendix"), true)));
                                    var mp = doc.Range(start, start).Paragraphs[1];
                                    mp.Range.Font.Hidden = 1;
                                    break;
                                }
                                case "replaceNumber":
                                {
                                    var f = FieldAt(doc, start, "MTPlaceRef");
                                    if (f == null) { problems.Add("MathType number not found at " + start); break; }
                                    // The number gets a MathBlocks bookmark; MathType's stays on the same text as an
                                    // alias until its references point at the MathBlocks one (checked below).
                                    var mt = Rpc.GetString(item, "bookmark");
                                    var name = BookmarkPrefix + RandomId(12);
                                    while (doc.Bookmarks.Exists(name)) name = BookmarkPrefix + RandomId(12);
                                    int pos = f.Code.Start - 1;
                                    if (!string.IsNullOrEmpty(mt) && doc.Bookmarks.Exists(mt)) doc.Bookmarks[mt].Delete();
                                    if (!string.IsNullOrEmpty(mt) && doc.Bookmarks.Exists(mt + "N")) doc.Bookmarks[mt + "N"].Delete();
                                    f.Delete();
                                    InsertInline(doc, doc.Range(pos, pos), NumberFields.Package(NumberFields.NumberRuns(fmt, name, NumberOnlyName(name), Rpc.GetBool(item, "appendix"))));
                                    if (!string.IsNullOrEmpty(mt))
                                    {
                                        doc.Bookmarks.Add(mt, doc.Bookmarks[name].Range);
                                        if (doc.Bookmarks.Exists(NumberOnlyName(name))) doc.Bookmarks.Add(mt + "N", doc.Bookmarks[NumberOnlyName(name)].Range);
                                        aliases[mt] = name;
                                    }
                                    bookmarks.Add(name);
                                    break;
                                }
                                default:
                                    problems.Add("unknown item " + kind);
                                    break;
                            }
                        }
                        catch (Exception ex)
                        {
                            problems.Add(kind + " at " + start + ": " + ex.Message);
                            Log.Error("convertNumbering " + kind + " at " + start, ex);
                        }
                        CheckOperationUndo("after " + kind + " at " + start);
                    }
                    UpdateNumberFields(doc);
                    var refs = ConvertMathTypeReferences(doc, aliases, problems);
                    var updated = UpdateNumberFields(doc);
                    // Every converted reference must show what its equation's number shows; then MathType's
                    // bookmarks are no longer needed (else they stay, and the mismatches are reported).
                    var refMismatches = VerifyReferences(doc, refs);
                    int aliasesRemoved = 0;
                    if (refMismatches.Count == 0)
                    {
                        foreach (var mt in aliases.Keys)
                            foreach (var n in new[] { mt, mt + "N" })
                                if (doc.Bookmarks.Exists(n)) { doc.Bookmarks[n].Delete(); aliasesRemoved++; }
                    }
                    var shows = new Dictionary<string, object>();
                    foreach (var name in bookmarks)
                        if (doc.Bookmarks.Exists(name)) shows[name] = (doc.Bookmarks[name].Range.Text ?? "").Replace("\t", "").Trim();
                    // Keyed by MathType's bookmark too (the plan knows those).
                    foreach (var kv in aliases)
                        if (doc.Bookmarks.Exists(kv.Value)) shows[kv.Key] = (doc.Bookmarks[kv.Value].Range.Text ?? "").Replace("\t", "").Trim();
                    var leftovers = MathTypeNumberingLeft(doc);
                    Log.Info("convertNumbering in " + doc.Name + ": " + items.Count + " item(s), " + problems.Count + " problem(s), " + clock.ElapsedMilliseconds + " ms");
                    var aliasMap = new Dictionary<string, object>();
                    foreach (var kv in aliases) aliasMap[kv.Key] = kv.Value;
                    return new Dictionary<string, object>
                    {
                        ["problems"] = problems, ["shows"] = shows, ["ms"] = clock.ElapsedMilliseconds, ["broken"] = updated["broken"],
                        ["aliases"] = aliasMap, ["referencesConverted"] = refs.Count, ["referenceMismatches"] = refMismatches,
                        ["aliasesRemoved"] = aliasesRemoved, ["leftovers"] = leftovers,
                    };
                }
                finally
                {
                    doc.Bookmarks.ShowHidden = hidden;
                    _app.ScreenUpdating = screen;
                }
            });
        }

        private static readonly System.Text.RegularExpressions.Regex MathTypeRef = new System.Text.RegularExpressions.Regex(@"^\s*GOTOBUTTON\s+(ZEqnNum\d+)(N?)\b");

        /// <summary>
        /// MathType's references (GOTOBUTTON ZEqnNum… + REF ZEqnNum…) → MathBlocks references to the
        /// _MBEq_ bookmark of the same number (one reference mechanism). Last first, so positions hold.
        /// Returns the converted references' targets in document order.
        /// </summary>
        private List<string> ConvertMathTypeReferences(Word.Document doc, Dictionary<string, string> aliases, List<object> problems)
        {
            var found = new List<(int pos, string target, string mt)>();
            foreach (Word.Field f in doc.Fields)
            {
                try
                {
                    var m = MathTypeRef.Match(f.Code.Text ?? "");
                    if (!m.Success) continue;
                    if (!aliases.TryGetValue(m.Groups[1].Value, out var mb))
                    {
                        problems.Add("reference to " + m.Groups[1].Value + " left as MathType's: its equation was not converted (" + Snippet(f.Code.Paragraphs[1].Range) + ")");
                        continue;
                    }
                    found.Add((f.Code.Start - 1, m.Groups[2].Value == "N" ? NumberOnlyName(mb) : mb, m.Groups[1].Value));
                }
                catch (COMException)
                {
                }
            }
            found.Sort((a, b) => b.pos.CompareTo(a.pos));
            var targets = new List<string>();
            foreach (var r in found)
            {
                try
                {
                    var f = FieldAt(doc, r.pos, "GOTOBUTTON " + r.mt);
                    if (f == null) continue;
                    int pos = f.Code.Start - 1;
                    f.Delete();
                    InsertReferenceFields(doc, doc.Range(pos, pos), r.target);
                    targets.Add(r.target);
                }
                catch (Exception ex)
                {
                    problems.Add("reference to " + r.mt + ": " + ex.Message);
                }
            }
            targets.Reverse();
            return targets;
        }

        /// <summary>References (to these bookmarks) that do not show what their bookmark shows.</summary>
        private static List<object> VerifyReferences(Word.Document doc, List<string> targets)
        {
            var bad = new List<object>();
            var wanted = new HashSet<string>(targets);
            string Norm(string t) => System.Text.RegularExpressions.Regex.Replace(t ?? "", @"\s", "");
            foreach (Word.Field f in doc.Fields)
            {
                try
                {
                    var m = System.Text.RegularExpressions.Regex.Match(f.Code.Text ?? "", @"^\s*GOTOBUTTON\s+(\S+)");
                    if (!m.Success || !wanted.Contains(m.Groups[1].Value)) continue;
                    var name = m.Groups[1].Value;
                    var expect = doc.Bookmarks.Exists(name) ? Norm(doc.Bookmarks[name].Range.Text) : "(no bookmark)";
                    var shows = Norm(ButtonDisplay(f));
                    if (shows != expect) bad.Add(new Dictionary<string, object> { ["bookmark"] = name, ["expected"] = expect, ["shows"] = shows, ["snippet"] = Snippet(f.Code.Paragraphs[1].Range) });
                }
                catch (COMException)
                {
                }
            }
            return bad;
        }

        /// <summary>MathType numbering fields still in the document (each with where it is).</summary>
        private static List<object> MathTypeNumberingLeft(Word.Document doc)
        {
            var left = new List<object>();
            foreach (Word.Field f in doc.Fields)
            {
                try
                {
                    var code = (f.Code.Text ?? "").Trim();
                    if (!System.Text.RegularExpressions.Regex.IsMatch(code, @"\bSEQ\s+MT(Eqn|Sec|Chap)\b|MTEditEquationSection|MTPlaceRef")) continue;
                    left.Add(new Dictionary<string, object> { ["code"] = code.Length > 80 ? code.Substring(0, 80) + "…" : code, ["snippet"] = Snippet(f.Code.Paragraphs[1].Range), ["start"] = f.Code.Start - 1 });
                }
                catch (COMException)
                {
                }
            }
            return left;
        }

        /// <summary>The top-level field of this kind that starts at (or right around) a position.</summary>
        private static Word.Field FieldAt(Word.Document doc, int start, string codePart)
        {
            var para = doc.Range(start, start).Paragraphs[1].Range;
            Word.Field best = null;
            int bestDistance = int.MaxValue;
            foreach (Word.Field f in para.Fields)
            {
                try
                {
                    if (!(f.Code.Text ?? "").Contains(codePart)) continue;
                    int d = Math.Abs(f.Code.Start - 1 - start);
                    if (d < bestDistance)
                    {
                        best = f;
                        bestDistance = d;
                    }
                }
                catch (COMException)
                {
                }
            }
            return best;
        }
    }
}
