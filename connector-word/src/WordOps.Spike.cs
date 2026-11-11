using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// Embedded-object spike (self-test only): a Classic equation stored as an embedded OLE object
    /// "MathBlocks.Equation.1", as MathType stores its equations. Inserts such objects by every route
    /// Word offers, and reports what Word keeps. Nothing here touches the user's documents: the
    /// self-test calls it in its own test documents.
    /// </summary>
    internal sealed partial class WordOps
    {
        internal const string ObjectProgIdPrefix = "MathBlocks.Equation";

        private static readonly Regex OleEmbedding = new Regex("<pkg:part [^>]*pkg:contentType=\"application/vnd\\.openxmlformats-officedocument\\.oleObject\"[^>]*>\\s*<pkg:binaryData>([^<]*)</pkg:binaryData>", RegexOptions.Compiled);

        /// <summary>
        /// The ProgID of an embedded object. Word may return an empty or different ProgID for a class
        /// that is not registered on the PC (instead of failing), so the object's XML is read as well.
        /// </summary>
        internal static string ProgIdOf(Word.InlineShape s)
        {
            string fromWord = null;
            try
            {
                if (s.Type != Word.WdInlineShapeType.wdInlineShapeEmbeddedOLEObject) return null;
                fromWord = s.OLEFormat.ProgID;
            }
            catch (Exception)
            {
            }
            // Word knows the ProgID (a registered class, e.g. MathType's): that is the answer, no XML read.
            if (!string.IsNullOrEmpty(fromWord)) return fromWord;
            // For a class not registered on the PC Word returns an empty ProgID but the right class name.
            try
            {
                var cls = s.OLEFormat.ClassType;
                if (!string.IsNullOrEmpty(cls) && cls.StartsWith(ObjectProgIdPrefix, StringComparison.Ordinal)) return cls;
            }
            catch (Exception)
            {
            }
            try
            {
                var m = Regex.Match(s.Range.WordOpenXML, "ProgID=\"([^\"]+)\"");
                if (m.Success) return m.Groups[1].Value;
            }
            catch (Exception)
            {
            }
            return fromWord;
        }

        /// <summary>Everything Word says about an in-line shape (spike diagnosis: what did the insertion become?).</summary>
        private static Dictionary<string, object> Describe(Word.InlineShape s)
        {
            var r = new Dictionary<string, object>();
            try { r["type"] = s.Type.ToString(); } catch (Exception ex) { r["type"] = "? " + ex.Message; }
            try { r["oleProgId"] = s.OLEFormat.ProgID; } catch (Exception ex) { r["oleProgId"] = "(" + ex.GetType().Name + ")"; }
            try { r["oleClassType"] = s.OLEFormat.ClassType; } catch (Exception ex) { r["oleClassType"] = "(" + ex.GetType().Name + ")"; }
            r["alt"] = AltOf(s) ?? "";
            r["frame"] = FrameOf(s);
            try
            {
                var xml = s.Range.WordOpenXML;
                var m = Regex.Match(xml, "ProgID=\"([^\"]+)\"");
                r["xmlProgId"] = m.Success ? m.Groups[1].Value : null;
                r["xmlObject"] = xml.Contains("<w:object");
                r["xmlOleObject"] = xml.Contains("<o:OLEObject");
                r["xmlEmbedding"] = OleEmbedding.IsMatch(xml);
                r["xmlPicture"] = xml.Contains("<pic:pic") ? "DrawingML" : xml.Contains("<v:imagedata") ? "VML" : "none";
            }
            catch (Exception ex)
            {
                r["xml"] = "(" + ex.GetType().Name + ")";
            }
            return r;
        }

        internal static bool IsMathBlocksObject(Word.InlineShape s)
        {
            var p = ProgIdOf(s);
            return p != null && p.StartsWith(ObjectProgIdPrefix, StringComparison.Ordinal);
        }

        /// <summary>The MathBlocks object under the selection (a click selects it), or null.</summary>
        internal static Word.InlineShape MathBlocksObjectIn(Word.Selection sel)
        {
            try
            {
                foreach (Word.InlineShape s in sel.Range.InlineShapes)
                    if (IsMathBlocksObject(s)) return s;
            }
            catch (Exception)
            {
            }
            return null;
        }

        /// <summary>What double-click sends to the app for a spike object: its LaTeX from its alt text (read-only spike).</summary>
        internal static Dictionary<string, object> ObjectActivation(Word.InlineShape s)
        {
            var alt = AltOf(s) ?? "";
            var tag = EquationIdentity.AltTag(alt) ?? "";
            var xml = "<pkg:package xmlns:pkg=\"http://schemas.microsoft.com/office/2006/xmlPackage\"><pkg:part pkg:name=\"/word/document.xml\"><pkg:xmlData><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" xmlns:v=\"urn:schemas-microsoft-com:vml\"><w:body><w:p><w:r><w:pict><v:shape alt=\"" + System.Security.SecurityElement.Escape(alt) + "\"/></w:pict></w:r></w:p></w:body></w:document></pkg:xmlData></pkg:part></pkg:package>";
            return new Dictionary<string, object> { ["tag"] = tag, ["flatOpc"] = xml, ["spike"] = true };
        }

        /// <summary>MathBlocks objects with this ID (from their alt text), in document order.</summary>
        internal static List<Word.InlineShape> FindObjects(Word.Document d, string tag)
        {
            var list = new List<Word.InlineShape>();
            foreach (Word.InlineShape s in d.InlineShapes)
            {
                if (!IsMathBlocksObject(s)) continue;
                if (EquationIdentity.AltTag(AltOf(s)) == tag || EmbeddingHolds(s, tag)) list.Add(s);
            }
            return list;
        }

        /// <summary>The ID in a MathBlocks object's own data ("MathBlocks" stream), or null.</summary>
        internal static string ObjectDataTag(Word.InlineShape s)
        {
            try
            {
                return ObjectDataTagXml(s.Range.WordOpenXML);
            }
            catch (Exception)
            {
                return null;
            }
        }

        /// <summary>ObjectDataTag from XML already read.</summary>
        internal static string ObjectDataTagXml(string xml)
        {
            try
            {
                var m = OleEmbedding.Match(xml);
                if (!m.Success) return null;
                var bytes = Convert.FromBase64String(Regex.Replace(m.Groups[1].Value, "\\s+", ""));
                var t = Regex.Match(Encoding.ASCII.GetString(bytes), "\"tag\":\"(mb1\\|[^\"|]+\\|[0-9A-Za-z]+)\"");
                return t.Success ? t.Groups[1].Value : null;
            }
            catch (Exception)
            {
                return null;
            }
        }

        /// <summary>The object's own data holds this ID (when Word drops the alt text of objects).</summary>
        private static bool EmbeddingHolds(Word.InlineShape s, string tag)
        {
            try
            {
                var m = OleEmbedding.Match(s.Range.WordOpenXML);
                if (!m.Success) return false;
                var bytes = Convert.FromBase64String(Regex.Replace(m.Groups[1].Value, "\\s+", ""));
                return Encoding.ASCII.GetString(bytes).Contains("\"tag\":\"" + tag + "\"");
            }
            catch (Exception)
            {
                return false;
            }
        }

        /// <summary>The range of an equation (picture, wrapper) or MathBlocks object with this ID.</summary>
        private static Word.Range RangeOf(Word.Document d, string tag, int preferNotAt = -1)
        {
            var eqs = FindByTag(d, tag);
            var ranges = eqs.Select(e => e.Range).ToList();
            ranges.AddRange(FindObjects(d, tag).Select(s => s.Range));
            if (ranges.Count == 0) throw new RpcException(Rpc.NotFound, "No equation or object " + tag);
            if (preferNotAt >= 0) foreach (var r in ranges) if (r.Start != preferNotAt) return r;
            return ranges.OrderBy(r => r.Start).First();
        }

        /// <summary>A MathBlocks object as Word holds it: kind, frame, lowering, data, what follows it.</summary>
        private Dictionary<string, object> ObjectInfo(Word.Document d, Word.InlineShape s)
        {
            var xml = s.Range.WordOpenXML;
            var r = new Dictionary<string, object>
            {
                ["kind"] = s.Type.ToString(),
                ["progId"] = ProgIdOf(s),
                ["alt"] = AltOf(s) ?? "",
                ["tag"] = EquationIdentity.AltTag(AltOf(s)),
                ["widthPt"] = (double)s.Width,
                ["heightPt"] = (double)s.Height,
                ["positionPt"] = LoweringOf(s) ?? 9999999,
                ["start"] = s.Range.Start,
                ["after"] = s.Range.End,
                ["objectElement"] = xml.Contains("<w:object"),
                ["oleObject"] = xml.Contains("<o:OLEObject"),
                ["vml"] = xml.Contains("<v:imagedata"),
                ["drawingml"] = xml.Contains("<pic:pic"),
                ["emf"] = xml.Contains("image/x-emf"),
                ["wmf"] = xml.Contains("image/x-wmf"),
                ["png"] = xml.Contains("image/png"),
            };
            var m = OleEmbedding.Match(xml);
            r["embedding"] = m.Success ? Regex.Replace(m.Groups[1].Value, "\\s+", "") : null;
            var next = d.Range(s.Range.End, Math.Min(s.Range.End + 1, d.Content.End));
            r["nextText"] = next.Text ?? "";
            r["nextPositionPt"] = (double)next.Font.Position;
            return r;
        }

        /// <summary>Spike operations, called from Smoke.</summary>
        private Dictionary<string, object> SpikeOp(string op, Dictionary<string, object> p)
        {
            var d = _app.ActiveDocument;
            switch (op)
            {
                case "insertRoute":
                    return InsertByRoute(Rpc.GetString(p, "route"), Rpc.GetString(p, "flatOpc"));
                case "objectInfo":
                {
                    var found = FindObjects(d, Rpc.GetString(p, "tag"));
                    var r = new Dictionary<string, object> { ["count"] = found.Count };
                    if (found.Count > 0) foreach (var kv in ObjectInfo(d, found[0])) r[kv.Key] = kv.Value;
                    return r;
                }
                case "objectsInDocument":
                {
                    int n = 0;
                    foreach (Word.InlineShape s in d.InlineShapes) if (IsMathBlocksObject(s)) n++;
                    return new Dictionary<string, object> { ["count"] = n };
                }
                case "delete":
                    RangeOf(d, Rpc.GetString(p, "tag")).Delete();
                    return new Dictionary<string, object> { ["ok"] = true };
                case "redo":
                    return new Dictionary<string, object> { ["ok"] = d.Redo(Math.Max(1, Rpc.GetInt(p, "times"))) };
                case "numberNextTo":
                {
                    // A number like the add-in's next to the object: tab, "(", SEQ field, ")" with a bookmark.
                    var at = RangeOf(d, Rpc.GetString(p, "tag")).End;
                    var r0 = d.Range(at, at);
                    r0.InsertAfter("\t(");
                    var fr = d.Range(r0.End, r0.End);
                    var f = d.Fields.Add(fr, Word.WdFieldType.wdFieldEmpty, "SEQ MBSpike \\* ARABIC", false);
                    var close = d.Range(f.Result.End + 1, f.Result.End + 1);
                    close.InsertAfter(")");
                    var name = "_MBSpike_" + RandomId(8);
                    d.Bookmarks.Add(name, f.Result);
                    f.Update();
                    return new Dictionary<string, object> { ["bookmark"] = name, ["number"] = f.Result.Text ?? "" };
                }
                case "typingProbe":
                {
                    // Which way of resetting the caret's formatting does Word honour for typed text?
                    // For each strategy: caret after the equation (end of its paragraph), apply it, type
                    // one character, read its lowering, undo.
                    var tag = Rpc.GetString(p, "tag");
                    var results = new Dictionary<string, object>();
                    foreach (var strategy in new[] { "none", "position0", "toggle", "reset", "resetToggle" })
                    {
                        try
                        {
                            var r0 = RangeOf(d, tag);
                            var sel = _app.Selection;
                            sel.SetRange(r0.End, r0.End);
                            switch (strategy)
                            {
                                case "position0": sel.Font.Position = 0; break;
                                case "toggle": sel.Font.Position = 1; sel.Font.Position = 0; break;
                                case "reset": sel.Font.Reset(); break;
                                case "resetToggle": sel.Font.Reset(); sel.Font.Position = 1; sel.Font.Position = 0; break;
                            }
                            sel.TypeText("x");
                            var typed = d.Range(sel.Start - 1, sel.Start);
                            results[strategy] = (double)typed.Font.Position;
                            d.Undo(1);
                        }
                        catch (Exception ex)
                        {
                            results[strategy] = ex.GetType().Name + ": " + ex.Message;
                        }
                    }
                    return results;
                }
                case "refResults":
                {
                    // What every REF field pointing at this bookmark shows (nested ones included).
                    var name = Rpc.GetString(p, "bookmark");
                    var list = new List<object>();
                    foreach (Word.Field f in d.Fields)
                    {
                        try
                        {
                            var code = f.Code.Text ?? "";
                            // The REF field itself (GOTOBUTTON's code contains it too, but shows no result of its own).
                            // Exactly this bookmark (ZEqnNum1 is not ZEqnNum1N).
                            var t = code.Trim();
                            if (t.StartsWith("REF ", StringComparison.Ordinal) && t.Substring(4).TrimStart().Split(' ')[0] == name) list.Add((f.Result.Text ?? "").Trim());
                        }
                        catch (Exception)
                        {
                        }
                    }
                    return new Dictionary<string, object> { ["results"] = list };
                }
                case "makeEquationParagraph":
                {
                    // A numbered display equation laid out as MathType does: tab, equation, tab, number,
                    // with a centre tab stop at the middle of the text column and a right one at its end.
                    var flat = Rpc.GetString(p, "flatOpc");
                    var number = p.TryGetValue("number", out var nv) && nv is string ns ? ns : "";
                    var end = d.Content.End - 1;
                    var at = d.Range(end, end);
                    at.InsertParagraphAfter();
                    int start = d.Content.End - 1;
                    d.Range(start, start).InsertXML(RunsOnly(flat));
                    var para = d.Range(start, start).Paragraphs[1];
                    var ps = para.Range.Sections[1].PageSetup;
                    float width = ps.PageWidth - ps.LeftMargin - ps.RightMargin - para.LeftIndent - para.RightIndent;
                    para.Alignment = Word.WdParagraphAlignment.wdAlignParagraphLeft;
                    para.TabStops.ClearAll();
                    // withoutTabs: the state an earlier Convert MathType left (no style, no tab stops).
                    if (!Rpc.GetBool(p, "withoutTabs"))
                    {
                        para.TabStops.Add(width / 2, Word.WdTabAlignment.wdAlignTabCenter);
                        para.TabStops.Add(width, Word.WdTabAlignment.wdAlignTabRight);
                    }
                    d.Range(para.Range.Start, para.Range.Start).InsertBefore("\t");
                    if (Rpc.GetBool(p, "numberField"))
                    {
                        // A number field as MathBlocks writes it: ( SEQ MBEq ).
                        var endAt = para.Range.End - 1;
                        d.Range(endAt, endAt).InsertAfter("\t()");
                        var inside = d.Range(para.Range.End - 2, para.Range.End - 2);
                        d.Fields.Add(inside, Word.WdFieldType.wdFieldEmpty, "SEQ MBEq \\* ARABIC", false).Update();
                    }
                    else d.Range(para.Range.End - 1, para.Range.End - 1).InsertAfter("\t" + number);
                    return new Dictionary<string, object> { ["start"] = para.Range.Start };
                }
                case "openDocx":
                {
                    // A test document the app generated (base64): saved in the test folder, then opened.
                    var path = System.IO.Path.Combine(SmokeFolder ?? System.IO.Path.GetTempPath(), Rpc.GetString(p, "file"));
                    System.IO.File.WriteAllBytes(path, Convert.FromBase64String(Rpc.GetString(p, "base64")));
                    var opened = _app.Documents.Open(path, AddToRecentFiles: false);
                    opened.Activate();
                    return new Dictionary<string, object> { ["name"] = opened.Name, ["fullName"] = opened.FullName };
                }
                case "bookmarkPara":
                {
                    // Where a bookmark's paragraph starts (to measure the number's position there).
                    var name = Rpc.GetString(p, "bookmark");
                    bool hidden = d.Bookmarks.ShowHidden;
                    d.Bookmarks.ShowHidden = true;
                    try
                    {
                        if (!d.Bookmarks.Exists(name)) return new Dictionary<string, object> { ["exists"] = false };
                        return new Dictionary<string, object> { ["exists"] = true, ["start"] = d.Bookmarks[name].Range.Paragraphs[1].Range.Start };
                    }
                    finally
                    {
                        d.Bookmarks.ShowHidden = hidden;
                    }
                }
                case "deleteBookmarkPara":
                {
                    // Deletes the paragraph of a numbered equation (what a user does when an equation goes).
                    var name = Rpc.GetString(p, "bookmark");
                    bool hidden = d.Bookmarks.ShowHidden;
                    d.Bookmarks.ShowHidden = true;
                    try
                    {
                        if (!d.Bookmarks.Exists(name)) return new Dictionary<string, object> { ["deleted"] = false };
                        d.Bookmarks[name].Range.Paragraphs[1].Range.Delete();
                        return new Dictionary<string, object> { ["deleted"] = true };
                    }
                    finally
                    {
                        d.Bookmarks.ShowHidden = hidden;
                    }
                }
                case "staleNumbers":
                {
                    // Equation numbers out of date (as after moving equations), so Update numbers has work.
                    // The shown counter is nested in the number's MACROBUTTON field: every field of the
                    // document's range, nested ones included.
                    int n = 0;
                    foreach (Word.Field f in d.Content.Fields)
                    {
                        var all = new List<Word.Field> { f };
                        try { foreach (Word.Field inner in f.Code.Fields) all.Add(inner); } catch (Exception) { }
                        foreach (var g in all)
                        {
                            string code;
                            try { code = g.Code.Text ?? ""; } catch (Exception) { continue; }
                            if (!code.Contains("SEQ MBEq") || !code.Contains("\\c")) continue;
                            try
                            {
                                g.Result.Text = "9";
                                n++;
                            }
                            catch (Exception)
                            {
                            }
                        }
                    }
                    return new Dictionary<string, object> { ["fields"] = n };
                }
                case "undoProbe":
                {
                    // Which call ends a custom undo record (Repair must be one Ctrl+Z): each runs alone inside
                    // a fresh record; "kept" means Word was still recording afterwards. Nothing is changed.
                    var eq = One(d, Rpc.GetString(p, "tag"));
                    var shape = eq.Picture;
                    var probes = new List<KeyValuePair<string, Action>>
                    {
                        new KeyValuePair<string, Action>("find equations", () => AllEquations(d)),
                        new KeyValuePair<string, Action>("alt text", () => AltOf(shape)),
                        new KeyValuePair<string, Action>("object data ID", () => ObjectDataTag(shape)),
                        new KeyValuePair<string, Action>("equation range WordOpenXML", () => { var x = eq.Range.WordOpenXML; }),
                        new KeyValuePair<string, Action>("picture range WordOpenXML", () => { var x = shape.Range.WordOpenXML; }),
                        new KeyValuePair<string, Action>("paragraph WordOpenXML", () => { var x = eq.Range.Paragraphs[1].Range.WordOpenXML; }),
                        new KeyValuePair<string, Action>("range XML (Word 2003)", () => { var x = eq.Range.get_XML(); }),
                        new KeyValuePair<string, Action>("stored depth", () => DepthOf(shape)),
                        new KeyValuePair<string, Action>("lowering", () => LoweringOf(shape)),
                        new KeyValuePair<string, Action>("inspect for write", () => Inspect(d, eq)),
                        new KeyValuePair<string, Action>("font position read", () => { var x = eq.Range.Font.Position; }),
                        new KeyValuePair<string, Action>("font position set (same value)", () => { var r = shape.Range; var v = r.Font.Position; if (v != 9999999) r.Font.Position = v; }),
                        new KeyValuePair<string, Action>("screen updating off/on", () => { var su = _app.ScreenUpdating; _app.ScreenUpdating = false; _app.ScreenUpdating = su; }),
                        new KeyValuePair<string, Action>("window events", () => System.Windows.Forms.Application.DoEvents()),
                    };
                    var result = new Dictionary<string, object>();
                    var undo = _app.UndoRecord;
                    foreach (var pr in probes)
                    {
                        string state;
                        try
                        {
                            if (undo.IsRecordingCustomRecord) undo.EndCustomRecord();
                            undo.StartCustomRecord("MathBlocks undo probe");
                            pr.Value();
                            state = undo.IsRecordingCustomRecord ? "kept" : "ENDS THE RECORD";
                        }
                        catch (Exception ex)
                        {
                            state = "error: " + ex.Message;
                        }
                        finally
                        {
                            try { if (undo.IsRecordingCustomRecord) undo.EndCustomRecord(); } catch (Exception) { }
                        }
                        result[pr.Key] = state;
                    }
                    return result;
                }
                case "paraInfo":
                {
                    // A paragraph's properties and layout: style, alignment, tab stops; where its first
                    // equation's centre and its number's end fall against the text column.
                    var pos = Rpc.GetInt(p, "pos");
                    var para = d.Range(pos, pos).Paragraphs[1];
                    var pr = para.Range;
                    var r = new Dictionary<string, object>();
                    try { r["style"] = ((Word.Style)para.get_Style()).NameLocal; } catch (Exception) { r["style"] = ""; }
                    r["alignment"] = para.Alignment.ToString();
                    var tabs = new List<object>();
                    foreach (Word.TabStop t in para.TabStops) if (t.CustomTab) tabs.Add(Math.Round(t.Position, 1) + " " + t.Alignment);
                    r["tabs"] = tabs;
                    r["text"] = (pr.Text ?? "").Replace("\u0001", "[eq]");
                    var ps = pr.Sections[1].PageSetup;
                    double left = ps.LeftMargin + para.LeftIndent, right = ps.PageWidth - ps.RightMargin - para.RightIndent;
                    r["textLeft"] = left;
                    r["textRight"] = right;
                    r["textCenter"] = (left + right) / 2;
                    Word.InlineShape eq = null;
                    foreach (Word.InlineShape s in pr.InlineShapes) { eq = s; break; }
                    if (eq != null)
                    {
                        r["equationKind"] = ProgIdOf(eq) ?? eq.Type.ToString();
                        var x = Convert.ToDouble(eq.Range.Information[Word.WdInformation.wdHorizontalPositionRelativeToPage]);
                        r["equationCenter"] = x + eq.Width / 2;
                    }
                    // The paragraph mark sits right after the number: its position is the number's end.
                    var mark = d.Range(pr.End - 1, pr.End - 1);
                    r["numberEnd"] = Convert.ToDouble(mark.Information[Word.WdInformation.wdHorizontalPositionRelativeToPage]);
                    return r;
                }
                case "updateFields":
                    d.Fields.Update();
                    return new Dictionary<string, object> { ["ok"] = true };
                case "bookmarkText":
                {
                    var name = Rpc.GetString(p, "bookmark");
                    bool hidden = d.Bookmarks.ShowHidden;
                    d.Bookmarks.ShowHidden = true;
                    try
                    {
                        return new Dictionary<string, object> { ["exists"] = d.Bookmarks.Exists(name), ["text"] = d.Bookmarks.Exists(name) ? d.Bookmarks[name].Range.Text ?? "" : "" };
                    }
                    finally
                    {
                        d.Bookmarks.ShowHidden = hidden;
                    }
                }
                case "saveCloseReopen":
                {
                    var path = Path.Combine(SmokeFolder ?? Path.GetTempPath(), Rpc.GetString(p, "file"));
                    d.SaveAs2(path, Word.WdSaveFormat.wdFormatXMLDocument);
                    d.Close(Word.WdSaveOptions.wdDoNotSaveChanges);
                    var again = _app.Documents.Open(path);
                    again.Activate();
                    return new Dictionary<string, object> { ["path"] = path, ["name"] = again.Name, ["bytes"] = new FileInfo(path).Length };
                }
                case "savePdf":
                {
                    var path = Path.Combine(SmokeFolder ?? Path.GetTempPath(), Rpc.GetString(p, "file"));
                    d.ExportAsFixedFormat(path, Word.WdExportFormat.wdExportFormatPDF);
                    return new Dictionary<string, object> { ["path"] = path, ["bytes"] = File.Exists(path) ? new FileInfo(path).Length : 0 };
                }
                case "fileSize":
                {
                    var path = Path.Combine(SmokeFolder ?? Path.GetTempPath(), Rpc.GetString(p, "file"));
                    return new Dictionary<string, object> { ["bytes"] = File.Exists(path) ? new FileInfo(path).Length : 0 };
                }
                case "close":
                    d.Close(Word.WdSaveOptions.wdDoNotSaveChanges);
                    return new Dictionary<string, object> { ["ok"] = true };
                default:
                    throw new RpcException(Rpc.InvalidParams, "Unknown self-test operation " + op);
            }
        }

        /// <summary>
        /// Inserts a Flat OPC package at the selection by one of Word's routes, and says whether a
        /// MathBlocks object arrived (and in what form).
        /// - "insertXml": Range.InsertXML (the add-in's normal route);
        /// - "insertFileXml": Range.InsertFile of the package saved as a Word XML file;
        /// - "insertFileDocx": Range.InsertFile of the package written as a .docx;
        /// - "clipboard": the .docx opened hidden, its object copied and pasted (Word's own copy).
        /// </summary>
        private Dictionary<string, object> InsertByRoute(string route, string flatOpc)
        {
            var d = _app.ActiveDocument;
            var sel = _app.Selection;
            int before = 0;
            foreach (Word.InlineShape s in d.InlineShapes) if (IsMathBlocksObject(s)) before++;
            int pictures = d.InlineShapes.Count;
            var r = new Dictionary<string, object> { ["route"] = route };
            var dir = Path.Combine(SmokeFolder ?? Path.GetTempPath(), "routes");
            Directory.CreateDirectory(dir);
            try
            {
                switch (route)
                {
                    case "insertXml":
                        sel.Range.InsertXML(flatOpc);
                        break;
                    case "insertFileXml":
                    {
                        var path = Path.Combine(dir, "object-" + RandomId(6) + ".xml");
                        File.WriteAllText(path, flatOpc, new UTF8Encoding(false));
                        sel.Range.InsertFile(path);
                        break;
                    }
                    case "insertFileDocx":
                    {
                        var path = Path.Combine(dir, "object-" + RandomId(6) + ".docx");
                        File.WriteAllBytes(path, DocxFromFlatOpc(flatOpc));
                        sel.Range.InsertFile(path);
                        break;
                    }
                    case "clipboard":
                    {
                        var path = Path.Combine(dir, "object-" + RandomId(6) + ".docx");
                        File.WriteAllBytes(path, DocxFromFlatOpc(flatOpc));
                        var target = _app.ActiveDocument;
                        var src = _app.Documents.Open(path, ReadOnly: true, AddToRecentFiles: false, Visible: false);
                        try
                        {
                            if (src.InlineShapes.Count == 0) throw new InvalidOperationException("the temporary document holds no object");
                            src.InlineShapes[1].Range.Copy();
                        }
                        finally
                        {
                            src.Close(Word.WdSaveOptions.wdDoNotSaveChanges);
                        }
                        target.Activate();
                        _app.Selection.Paste();
                        break;
                    }
                    default:
                        throw new RpcException(Rpc.InvalidParams, "Unknown route " + route);
                }
            }
            catch (Exception ex) when (!(ex is RpcException))
            {
                r["error"] = ex.GetType().Name + ": " + ex.Message;
                Log.Error("spike: insert by " + route, ex);
            }
            int after = 0;
            foreach (Word.InlineShape s in d.InlineShapes) if (IsMathBlocksObject(s)) after++;
            r["objectsAdded"] = after - before;
            r["picturesAdded"] = d.InlineShapes.Count - pictures;
            // What the insertion became: the in-line shape just before the caret.
            try
            {
                var at = _app.Selection.Start;
                Word.InlineShape last = null;
                foreach (Word.InlineShape s in d.Range(Math.Max(0, at - 3), Math.Min(d.Content.End, at + 1)).InlineShapes) last = s;
                if (last == null && d.InlineShapes.Count > 0) last = d.InlineShapes[d.InlineShapes.Count];
                if (last != null) r["inserted"] = Describe(last);
            }
            catch (Exception ex)
            {
                r["inserted"] = new Dictionary<string, object> { ["error"] = ex.Message };
            }
            Log.Info("spike: insert by " + route + " → " + (after - before) + " object(s), " + (d.InlineShapes.Count - pictures) + " inline shape(s)" + (r.ContainsKey("error") ? " — " + r["error"] : ""));
            return r;
        }

        /// <summary>A .docx (zip) from a Flat OPC package: every part with its content type.</summary>
        internal static byte[] DocxFromFlatOpc(string flatOpc)
        {
            XNamespace pkg = "http://schemas.microsoft.com/office/2006/xmlPackage";
            var doc = XDocument.Parse(flatOpc);
            var parts = doc.Root.Elements(pkg + "part").ToList();
            using (var ms = new MemoryStream())
            {
                using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, true))
                {
                    var types = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/>");
                    foreach (var part in parts)
                    {
                        var name = (string)part.Attribute(pkg + "name");
                        var type = (string)part.Attribute(pkg + "contentType");
                        if (!name.EndsWith(".rels", StringComparison.Ordinal)) types.Append("<Override PartName=\"" + name + "\" ContentType=\"" + type + "\"/>");
                        var entry = zip.CreateEntry(name.TrimStart('/'));
                        using (var w = entry.Open())
                        {
                            var xml = part.Element(pkg + "xmlData");
                            byte[] bytes = xml != null
                                ? Encoding.UTF8.GetBytes("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" + xml.Elements().First().ToString(SaveOptions.DisableFormatting))
                                : Convert.FromBase64String(Regex.Replace((string)part.Element(pkg + "binaryData") ?? "", "\\s+", ""));
                            w.Write(bytes, 0, bytes.Length);
                        }
                    }
                    types.Append("</Types>");
                    var ct = zip.CreateEntry("[Content_Types].xml");
                    using (var w = ct.Open())
                    {
                        var b = Encoding.UTF8.GetBytes(types.ToString());
                        w.Write(b, 0, b.Length);
                    }
                }
                return ms.ToArray();
            }
        }
    }
}
