using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// The Word self-test (ribbon → Run Word self-test, or the app's command palette). The app drives it
    /// through the add-in's own commands (insertEquation, numberEquation, …) and these test operations,
    /// which do what the user does — type, copy and paste in each mode, cut, move, undo — and report what
    /// Word then holds: run positions, the caret, what a picture kept, what the click handlers would open.
    /// Nothing here is used outside the self-test.
    /// </summary>
    internal sealed partial class WordOps
    {
        /// <summary>Set by Connect: the checks that normally run once Word is idle after a selection change.</summary>
        internal Action IdleChecks;

        /// <summary>While the self-test runs, the idle timer leaves the checks to it.</summary>
        internal bool Testing;

        /// <summary>What a click handler sends to the app for an equation (double-click, menu → Edit, right-click on native).</summary>
        internal Dictionary<string, object> Activation(Word.Document doc, Eq cc, string what)
        {
            var problem = PrepareRead(doc, ref cc, what, out var fingerprint);
            var prm = new Dictionary<string, object> { ["tag"] = cc.Tag, ["number"] = NumberInfo(cc), ["fingerprint"] = fingerprint };
            if (problem != null)
            {
                prm["flatOpc"] = "";
                prm["problem"] = "This equation cannot be opened safely: " + problem + ".";
            }
            else prm["flatOpc"] = PictureXmlForApp(cc);
            return prm;
        }

        /// <summary>Whether the MathBlocks items show in Word's picture menu for this selection.</summary>
        internal static bool MenuVisible(Word.Selection sel)
        {
            try
            {
                if (sel.Type == Word.WdSelectionType.wdSelectionShape)
                    foreach (Word.Shape sh in sel.ShapeRange)
                        if (IsMathBlocksShape(sh)) return true;
                foreach (Word.InlineShape s in sel.Range.InlineShapes)
                    if (LooksLikeEquation(s)) return true;
            }
            catch (Exception)
            {
            }
            return false;
        }

        private static string SmokeFolder;

        private static int CountObjects(Word.Document d)
        {
            int n = 0;
            foreach (Word.InlineShape s in d.InlineShapes)
            {
                try
                {
                    if (s.Type == Word.WdInlineShapeType.wdInlineShapeEmbeddedOLEObject && IsMathBlocksObject(s)) n++;
                }
                catch (Exception)
                {
                }
            }
            return n;
        }
        private bool? _smartCut;
        private HashSet<string> _beforeTest;

        /// <summary>The selection to act on: in the named document (activated, its window's selection) or the active one.</summary>
        private Word.Selection SelIn(Dictionary<string, object> p)
        {
            if (!p.ContainsKey("name") || string.IsNullOrEmpty(Rpc.GetString(p, "name"))) return _app.Selection;
            var d = DocNamed(p);
            d.Activate();
            d.ActiveWindow.Activate();
            return d.ActiveWindow.Selection;
        }

        /// <summary>
        /// Legacy VML picture (the simple, MathType-like frame) or modern DrawingML picture. WordOpenXML
        /// cannot tell (it exports both as DrawingML); Word refuses Title on VML pictures, which can.
        /// </summary>
        internal static string FrameOf(Word.InlineShape s)
        {
            try
            {
                if (s.Type == Word.WdInlineShapeType.wdInlineShapeEmbeddedOLEObject) return "object";
                var _ = s.Title;
                return "modern";
            }
            catch (NotImplementedException)
            {
                return "legacy";
            }
            catch (Exception)
            {
                return "unknown";
            }
        }

        public Dictionary<string, object> Smoke(Dictionary<string, object> p)
        {
            var op = Rpc.GetString(p, "op");
            switch (op)
            {
                case "begin":
                {
                    Testing = true;
                    // Word's "smart cut and paste" adds and removes spaces around what is cut or pasted; off
                    // during the test so "nothing else changed" means what it says. Restored at the end.
                    try
                    {
                        _smartCut = _app.Options.SmartCutPaste;
                        _app.Options.SmartCutPaste = false;
                    }
                    catch (Exception)
                    {
                    }
                    // Documents open before the test are the user's: only the others are closed at the end.
                    _beforeTest = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    foreach (Word.Document od in _app.Documents) _beforeTest.Add(od.FullName);
                    SmokeFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MathBlocks", "self-test", DateTime.Now.ToString("yyyy-MM-dd HH.mm.ss"));
                    Directory.CreateDirectory(SmokeFolder);
                    return new Dictionary<string, object> { ["folder"] = SmokeFolder, ["word"] = _app.Build, ["addin"] = Connect.Version, ["smartCutPaste"] = _smartCut };
                }
                case "end":
                    Testing = false;
                    try
                    {
                        if (_smartCut.HasValue) _app.Options.SmartCutPaste = _smartCut.Value;
                    }
                    catch (Exception)
                    {
                    }
                    return new Dictionary<string, object> { ["ok"] = true };
                case "newDocument":
                {
                    var d = _app.Documents.Add();
                    d.Activate();
                    return new Dictionary<string, object> { ["name"] = d.Name, ["fullName"] = d.FullName };
                }
                case "trackChanges":
                    _app.ActiveDocument.TrackRevisions = Rpc.GetBool(p, "on");
                    return new Dictionary<string, object> { ["on"] = _app.ActiveDocument.TrackRevisions };
                case "revisions":
                    return new Dictionary<string, object> { ["count"] = _app.ActiveDocument.Revisions.Count };
                case "acceptAll":
                    _app.ActiveDocument.Revisions.AcceptAll();
                    return new Dictionary<string, object> { ["count"] = _app.ActiveDocument.Revisions.Count };
                case "rejectAll":
                    _app.ActiveDocument.Revisions.RejectAll();
                    return new Dictionary<string, object> { ["count"] = _app.ActiveDocument.Revisions.Count };
                case "classRegistration":
                {
                    var state = ObjectClass.State();
                    // What Word itself reports for the first MathBlocks object of the document.
                    foreach (Word.InlineShape s in _app.ActiveDocument.InlineShapes)
                    {
                        if (!IsMathBlocksObject(s)) continue;
                        try { state["wordProgId"] = s.OLEFormat.ProgID ?? ""; } catch (Exception ex) { state["wordProgId"] = "error: " + ex.Message; }
                        try { state["wordClassType"] = s.OLEFormat.ClassType ?? ""; } catch (Exception ex) { state["wordClassType"] = "error: " + ex.Message; }
                        break;
                    }
                    return state;
                }
                case "exportPdf":
                {
                    var d = _app.ActiveDocument;
                    var path = Path.Combine(SmokeFolder ?? Path.GetTempPath(), Rpc.GetString(p, "file"));
                    d.ExportAsFixedFormat(path, Word.WdExportFormat.wdExportFormatPDF, false, Word.WdExportOptimizeFor.wdExportOptimizeForPrint,
                        Word.WdExportRange.wdExportAllDocument, 1, 1, Word.WdExportItem.wdExportDocumentContent, true, true,
                        Rpc.GetBool(p, "bookmarks") ? Word.WdExportCreateBookmarks.wdExportCreateWordBookmarks : Word.WdExportCreateBookmarks.wdExportCreateNoBookmarks, true, true, false);
                    var bytes = File.ReadAllBytes(path);
                    var text = System.Text.Encoding.ASCII.GetString(bytes);
                    // Word writes the structure tags (with /Alt) into compressed object streams: inflate them.
                    var alts = PdfAltTexts(bytes);
                    return new Dictionary<string, object>
                    {
                        ["path"] = path,
                        ["size"] = bytes.Length,
                        ["pages"] = System.Text.RegularExpressions.Regex.Matches(text, @"/Type\s*/Page\b").Count,
                        ["alt"] = alts.Count > 0,
                        ["alts"] = alts,
                        ["images"] = System.Text.RegularExpressions.Regex.Matches(text, @"/Subtype\s*/Image").Count,
                    };
                }
                case "pdfPrinters":
                {
                    var list = new List<object>();
                    foreach (string name in System.Drawing.Printing.PrinterSettings.InstalledPrinters) list.Add(name);
                    bool acrobat = false;
                    try { using (var k = Microsoft.Win32.Registry.ClassesRoot.OpenSubKey("AcroExch.Document")) acrobat = k != null; } catch (Exception) { }
                    return new Dictionary<string, object> { ["printers"] = list, ["acrobat"] = acrobat };
                }
                case "rightClick":
                    if (RightClickHook == null) throw new RpcException(Rpc.InvalidParams, "right-click check not available");
                    return RightClickHook(Rpc.GetString(p, "tag"));
                case "objectMenu":
                case "objectMenuRun":
                    // The right-click menu of an equation object (built and run by the add-in's Connect).
                    if (ObjectMenuHook == null) throw new RpcException(Rpc.InvalidParams, "object menu not available");
                    return ObjectMenuHook(Rpc.GetString(p, "tag"), op == "objectMenuRun" ? Rpc.GetString(p, "id") : null);
                case "activations":
                    return new Dictionary<string, object> { ["list"] = TakeActivations() };
                case "activeName":
                    return new Dictionary<string, object> { ["name"] = _app.ActiveDocument.Name };
                case "activate":
                {
                    var d = DocNamed(p);
                    d.Activate();
                    return new Dictionary<string, object> { ["ok"] = true };
                }
                case "typeText":
                {
                    // As the user types: Word gives the text the formatting at the caret.
                    var sel = SelIn(p);
                    sel.TypeText(Rpc.GetString(p, "text"));
                    return new Dictionary<string, object> { ["caret"] = sel.Start };
                }
                case "newParagraph":
                {
                    var sel = SelIn(p);
                    sel.TypeParagraph();
                    return new Dictionary<string, object> { ["caret"] = sel.Start };
                }
                case "caretTo":
                {
                    var sel0 = SelIn(p);
                    var d = sel0.Document;
                    var where = Rpc.GetString(p, "where");
                    int pos;
                    if (where == "start") pos = 0;
                    else if (where == "end") pos = d.Content.End - 1;
                    else
                    {
                        var r = RangeOf(d, Rpc.GetString(p, "tag"));
                        pos = where == "before" ? r.Start : where == "paragraphStart" ? r.Paragraphs[1].Range.Start : r.End;
                    }
                    sel0.SetRange(pos, pos);
                    return new Dictionary<string, object> { ["caret"] = pos };
                }
                case "caret":
                    return new Dictionary<string, object> { ["start"] = _app.Selection.Start, ["end"] = _app.Selection.End };
                case "idle":
                    // What the idle timer would run now.
                    IdleChecks?.Invoke();
                    return new Dictionary<string, object> { ["ok"] = true };
                case "pictureInfo":
                    return PictureInfo(_app.ActiveDocument, One(_app.ActiveDocument, Rpc.GetString(p, "tag")));
                case "open":
                {
                    // Exactly what double-click / the menu's "Edit equation" do: find the equation at the
                    // selection (the picture selected, as a click selects it), then build what is sent.
                    var d = _app.ActiveDocument;
                    var eq = One(d, Rpc.GetString(p, "tag"));
                    eq.Range.Select();
                    var sel = _app.Selection;
                    var found = EquationAt(d, sel.Range);
                    var r = found == null ? new Dictionary<string, object> { ["found"] = false } : Activation(d, found, "self-test " + Rpc.GetString(p, "via"));
                    r["menuVisible"] = MenuVisible(sel);
                    r["isPicture"] = found?.IsPicture ?? false;
                    return r;
                }
                case "snapshot":
                    return Snapshot(_app.ActiveDocument);
                case "refFields":
                {
                    // Every reference to an equation: its code (both forms are listed, to check none of the old is left).
                    var d = _app.ActiveDocument;
                    var list = new List<object>();
                    foreach (Word.Field f in d.Fields)
                    {
                        string code;
                        try { code = (f.Code.Text ?? "").Trim(); } catch (COMException) { continue; }
                        if (OldButtonRef.IsMatch(code) || RefCode.IsMatch(code))
                            list.Add(new Dictionary<string, object> { ["code"] = code, ["start"] = f.Code.Start - 1 });
                    }
                    return new Dictionary<string, object> { ["fields"] = list };
                }
                case "insertOldRef":
                {
                    // A reference as versions before 0.1.139 wrote it (GOTOBUTTON around REF), at the cursor:
                    // the self-test's "older document" for Update numbers' conversion to links.
                    var sel = SelIn(p);
                    var bm = Rpc.GetString(p, "bookmark");
                    const string B = "<w:r><w:fldChar w:fldCharType=\"begin\"/></w:r>", S = "<w:r><w:fldChar w:fldCharType=\"separate\"/></w:r>", E = "<w:r><w:fldChar w:fldCharType=\"end\"/></w:r>";
                    string I(string t) => "<w:r><w:instrText xml:space=\"preserve\">" + System.Security.SecurityElement.Escape(t) + "</w:instrText></w:r>";
                    var runs = B + I(" GOTOBUTTON " + bm + "  \\* MERGEFORMAT ") + B + I(" REF " + bm + " \\* Charformat \\! \\* MERGEFORMAT ") + S + "<w:r><w:t>(1)</w:t></w:r>" + E + E;
                    int at = sel.Start;
                    InsertInline(sel.Document, sel.Document.Range(at, at), NumberFields.Package(runs));
                    return new Dictionary<string, object> { ["ok"] = true };
                }
                case "followRef":
                    return FollowReference(_app.ActiveDocument, Rpc.GetInt(p, "index"));
                case "caretAt":
                {
                    // Plain text positions (the list of symbols' marker tests: typing, pasting, deleting next to a field).
                    var sel = SelIn(p);
                    int pos = Rpc.GetInt(p, "pos");
                    sel.SetRange(pos, pos);
                    return new Dictionary<string, object> { ["caret"] = sel.Start };
                }
                case "rangeOp":
                {
                    var sel = SelIn(p);
                    var d = sel.Document;
                    int a0 = Rpc.GetInt(p, "start"), b0 = Rpc.GetInt(p, "end");
                    // "action", not "op": the request's op is "rangeOp" itself.
                    var what = Rpc.GetString(p, "action");
                    var r = d.Range(a0, b0);
                    if (what == "text") return new Dictionary<string, object> { ["text"] = r.Text ?? "" };
                    r.Select();
                    if (what == "copy") _app.Selection.Copy();
                    else if (what == "cut") _app.Selection.Cut();
                    else if (what == "select") { }
                    else throw new RpcException(Rpc.InvalidParams, "rangeOp action: copy, cut, select or text");
                    return new Dictionary<string, object> { ["ok"] = true };
                }
                case "key":
                {
                    // Backspace or Delete at the caret, as the user presses them.
                    var sel = SelIn(p);
                    if (Rpc.GetString(p, "key") == "backspace") sel.TypeBackspace();
                    else sel.Delete();
                    return new Dictionary<string, object> { ["caret"] = sel.Start };
                }
                case "paragraphOf":
                {
                    var d = SelIn(p).Document;
                    var para = d.Range(Rpc.GetInt(p, "pos"), Rpc.GetInt(p, "pos")).Paragraphs[1].Range;
                    return new Dictionary<string, object> { ["start"] = para.Start, ["end"] = para.End, ["text"] = para.Text ?? "" };
                }
                case "copy":
                    RangeOf(SelIn(p).Document, Rpc.GetString(p, "tag")).Copy();
                    return new Dictionary<string, object> { ["ok"] = true };
                case "cut":
                {
                    // As the user does: select the equation, Ctrl+X.
                    var r0 = RangeOf(_app.ActiveDocument, Rpc.GetString(p, "tag"));
                    r0.Select();
                    _app.Selection.Cut();
                    return new Dictionary<string, object> { ["ok"] = true };
                }
                case "paste":
                    return Paste(Rpc.GetString(p, "mode"), SelIn(p));
                case "moveFormatted":
                {
                    // The nearest COM equivalent of a drag: the equation's formatted content placed at the
                    // target, then the source removed (Word's own move does both in one action).
                    var d = _app.ActiveDocument;
                    var tag = Rpc.GetString(p, "tag");
                    var to = Rpc.GetInt(p, "to");
                    var src = RangeOf(d, tag);
                    var target = d.Range(to, to);
                    target.FormattedText = src.FormattedText;
                    RangeOf(d, tag, preferNotAt: to).Delete();
                    return new Dictionary<string, object> { ["ok"] = true };
                }
                case "undo":
                {
                    var n = Math.Max(1, Rpc.GetInt(p, "times"));
                    var ok = _app.ActiveDocument.Undo(n);
                    return new Dictionary<string, object> { ["ok"] = ok };
                }
                case "save":
                {
                    var d = _app.ActiveDocument;
                    var path = Path.Combine(SmokeFolder ?? Path.GetTempPath(), Rpc.GetString(p, "file"));
                    d.SaveAs2(path, Word.WdSaveFormat.wdFormatXMLDocument);
                    // Save As renames the open document: callers that address it by name use this one.
                    return new Dictionary<string, object> { ["path"] = path, ["name"] = d.Name };
                }
                case "closeTestDocuments":
                {
                    // Every document the test opened: saved into the test folder (unsaved ones under their
                    // window name), then closed. The user's own documents stay open and untouched.
                    int closed = 0;
                    var saved = new List<object>();
                    var docs = new List<Word.Document>();
                    foreach (Word.Document od in _app.Documents) if (_beforeTest == null || !_beforeTest.Contains(od.FullName)) docs.Add(od);
                    foreach (var od in docs)
                    {
                        try
                        {
                            if (string.IsNullOrEmpty(od.Path))
                            {
                                var name = od.Name;
                                foreach (var c in Path.GetInvalidFileNameChars()) name = name.Replace(c, '_');
                                var path = Path.Combine(SmokeFolder ?? Path.GetTempPath(), name + ".docx");
                                for (int i = 2; File.Exists(path); i++) path = Path.Combine(SmokeFolder ?? Path.GetTempPath(), name + " (" + i + ").docx");
                                od.SaveAs2(path, Word.WdSaveFormat.wdFormatXMLDocument);
                                saved.Add(path);
                            }
                            else if (!od.Saved && !od.ReadOnly)
                            {
                                od.Save();
                                saved.Add(od.FullName);
                            }
                            od.Close(Word.WdSaveOptions.wdDoNotSaveChanges);
                            closed++;
                        }
                        catch (Exception ex)
                        {
                            Log.Error("self-test: closing a test document", ex);
                        }
                    }
                    return new Dictionary<string, object> { ["closed"] = closed, ["saved"] = saved };
                }
                case "readFile":
                {
                    // A file the self-test wrote in its folder (a PDF), as base64. Only names inside that folder.
                    var path = SmokePath(Rpc.GetString(p, "file"));
                    return new Dictionary<string, object> { ["base64"] = Convert.ToBase64String(File.ReadAllBytes(path)), ["path"] = path };
                }
                case "writeFile":
                {
                    // A file of the self-test (page images, the contact sheet) in its folder or a subfolder of it.
                    var path = SmokePath(Rpc.GetString(p, "file"));
                    Directory.CreateDirectory(Path.GetDirectoryName(path));
                    var b64 = Rpc.GetOptString(p, "base64");
                    if (!string.IsNullOrEmpty(b64)) File.WriteAllBytes(path, Convert.FromBase64String(b64));
                    else File.WriteAllText(path, Rpc.GetOptString(p, "text") ?? "", System.Text.Encoding.UTF8);
                    return new Dictionary<string, object> { ["path"] = path };
                }
                case "writeReport":
                {
                    var path = Path.Combine(SmokeFolder ?? Path.GetTempPath(), "report.txt");
                    File.WriteAllText(path, Rpc.GetString(p, "text"), System.Text.Encoding.UTF8);
                    if (Rpc.GetBool(p, "show")) System.Diagnostics.Process.Start("explorer.exe", "\"" + SmokeFolder + "\"");
                    return new Dictionary<string, object> { ["path"] = path };
                }
                default:
                    return SpikeOp(op, p);
            }
        }

        /// <summary>A path inside the self-test folder (relative names only: no rooted paths, no "..").</summary>
        private string SmokePath(string name)
        {
            if (string.IsNullOrEmpty(name) || Path.IsPathRooted(name) || name.Contains("..")) throw new RpcException(Rpc.InvalidParams, "a file name inside the self-test folder is needed");
            var root = Path.GetFullPath(SmokeFolder ?? Path.GetTempPath());
            var full = Path.GetFullPath(Path.Combine(root, name));
            if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new RpcException(Rpc.InvalidParams, "outside the self-test folder");
            return full;
        }

        private Word.Document DocNamed(Dictionary<string, object> p)
        {
            var name = Rpc.GetString(p, "name");
            foreach (Word.Document d in _app.Documents)
                if (d.Name == name || d.FullName == name) return d;
            throw new RpcException(Rpc.NotFound, "No open document " + name);
        }

        private static Eq One(Word.Document d, string tag, int preferNotAt = -1)
        {
            var found = FindByTag(d, tag);
            if (found.Count == 0) throw new RpcException(Rpc.NotFound, "No equation " + tag);
            if (preferNotAt >= 0) foreach (var e in found) if (e.Before != preferNotAt) return e;
            return found[0];
        }

        /// <summary>A picture as Word holds it: lowering of its run, what follows it, what it carries.</summary>
        private Dictionary<string, object> PictureInfo(Word.Document d, Eq eq)
        {
            var r = new Dictionary<string, object> { ["tag"] = eq.Tag, ["isPicture"] = eq.IsPicture, ["before"] = eq.Before, ["after"] = eq.After };
            r["positionPt"] = eq.IsPicture ? (LoweringOf(eq.Picture) ?? 9999999) : (double)eq.Range.Font.Position;
            var xml = eq.Xml;
            PictureXml.Data(xml, out var json);
            r["depthPt"] = PictureXml.DepthPt(json);
            r["sourceTag"] = SourceTag(json);
            if (eq.IsPicture)
            {
                r["alt"] = AltOf(eq.Picture) ?? "";
                r["title"] = RawTitleOf(eq.Picture) ?? "";
                r["heightPt"] = (double)eq.Picture.Height;
                r["widthPt"] = (double)eq.Picture.Width;
                r["kind"] = eq.Picture.Type.ToString();
                r["frame"] = FrameOf(eq.Picture);
            }
            // The next character after the equation (text typed after it).
            var next = d.Range(eq.After, Math.Min(eq.After + 1, d.Content.End));
            r["nextText"] = next.Text ?? "";
            r["nextPositionPt"] = (double)next.Font.Position;
            r["vml"] = xml.Contains("<v:imagedata");
            r["drawingml"] = xml.Contains("<pic:pic");
            r["emf"] = xml.Contains("image/x-emf");
            r["png"] = xml.Contains("image/png");
            return r;
        }

        /// <summary>The document's text with each equation as ⟦tag⟧, and its equations in order.</summary>
        private static Dictionary<string, object> Snapshot(Word.Document d)
        {
            var eqs = AllEquations(d);
            var text = d.Content.Text ?? "";
            var sb = new System.Text.StringBuilder();
            int at = 0;
            var spans = eqs.Select(e => new { e.Tag, Start = e.Range.Start, End = e.Range.End }).Where(e => e.Start >= 0).ToList();
            // Embedded MathBlocks objects (spike): marked by the ID in their alt text.
            foreach (Word.InlineShape s in d.InlineShapes)
            {
                var t = EquationIdentity.AltTag(AltOf(s));
                if (t != null && IsMathBlocksObject(s)) spans.Add(new { Tag = "obj:" + t, Start = s.Range.Start, End = s.Range.End });
            }
            spans = spans.OrderBy(e => e.Start).ToList();
            foreach (var e in spans)
            {
                if (e.Start < at) continue;
                sb.Append(text, at, Math.Max(0, Math.Min(e.Start, text.Length) - at));
                sb.Append("⟦" + e.Tag + "⟧");
                at = Math.Min(e.End, text.Length);
            }
            if (at < text.Length) sb.Append(text, at, text.Length - at);
            var pictures = 0;
            foreach (Word.InlineShape s in d.InlineShapes) pictures++;
            return new Dictionary<string, object>
            {
                ["text"] = sb.ToString(),
                ["tags"] = spans.Select(e => (object)e.Tag).ToList(),
                ["pictures"] = pictures,
                ["floating"] = d.Shapes.Count,
                ["characters"] = text.Length,
                // The text with every object/picture character removed: an embedded object is a field
                // whose hidden characters shift positions, so "nothing else changed" compares this.
                ["plain"] = text.Replace("\u0001", "").Replace("/", ""),
            };
        }

        private static void PasteOnce(Word.Selection sel, string mode)
        {
            switch (mode)
            {
                case "ctrlV": sel.Paste(); break;
                case "keepSource": sel.PasteAndFormat(Word.WdRecoveryType.wdFormatOriginalFormatting); break;
                case "merge": sel.PasteAndFormat(Word.WdRecoveryType.wdFormatSurroundingFormattingWithEmphasis); break;
                case "keepTextOnly": sel.PasteAndFormat(Word.WdRecoveryType.wdFormatPlainText); break;
                // In line, as the Paste Special dialog does by default ("Float over text" unticked).
                case "pictureEmf": sel.PasteSpecial(DataType: Word.WdPasteDataType.wdPasteEnhancedMetafile, Placement: Word.WdOLEPlacement.wdInLine); break;
                // Word's "Picture (PNG)" has no constant in the object model; a bitmap paste is the nearest.
                case "picturePng":
                    try
                    {
                        sel.PasteSpecial(DataType: Word.WdPasteDataType.wdPasteDeviceIndependentBitmap, Placement: Word.WdOLEPlacement.wdInLine);
                    }
                    catch (COMException)
                    {
                        sel.PasteSpecial(DataType: Word.WdPasteDataType.wdPasteBitmap, Placement: Word.WdOLEPlacement.wdInLine);
                    }
                    break;
                default: throw new RpcException(Rpc.InvalidParams, "Unknown paste mode " + mode);
            }
        }

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hWnd, out Rect lpRect);
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr lParam);
        [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
        private static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder name, int max);
        private delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
        [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
        private struct Rect { public int Left, Top, Right, Bottom; }

        /// <summary>Word's document pane (window class _WwG) of the active window: where the page is drawn on screen.</summary>
        private Rect? DocumentPane()
        {
            try
            {
                var hwnd = new IntPtr((int)((dynamic)_app.ActiveWindow).Hwnd);
                IntPtr found = IntPtr.Zero;
                EnumChildWindows(hwnd, (h, _) =>
                {
                    var sb = new System.Text.StringBuilder(64);
                    GetClassName(h, sb, sb.Capacity);
                    if (sb.ToString() == "_WwG") { found = h; return false; }
                    return true;
                }, IntPtr.Zero);
                if (found == IntPtr.Zero) found = hwnd;
                return GetWindowRect(found, out var r) ? r : (Rect?)null;
            }
            catch (Exception)
            {
                return null;
            }
        }

        /// <summary>
        /// Follows the n-th reference's link as Ctrl+click does (its hyperlink, else a click on the field), then
        /// reports where the selection is and whether the top of the equation it points to is on screen.
        /// </summary>
        private Dictionary<string, object> FollowReference(Word.Document d, int index)
        {
            var refs = new List<Word.Field>();
            foreach (Word.Field f in d.Fields)
            {
                try { if (RefCode.IsMatch(f.Code.Text ?? "")) refs.Add(f); } catch (COMException) { }
            }
            if (index < 0 || index >= refs.Count) throw new RpcException(Rpc.InvalidParams, "No reference " + index + " (" + refs.Count + " in the document)");
            var field = refs[index];
            var name = RefCode.Match(field.Code.Text ?? "").Groups[1].Value;
            // Start away from the target (top of the document), so the jump is visible.
            d.Range(0, 0).Select();
            _app.ActiveWindow.ScrollIntoView(d.Range(0, 0), true);
            string method;
            try
            {
                var links = field.Result.Hyperlinks;
                if (links.Count > 0) { links[1].Follow(); method = "hyperlink"; }
                else { field.DoClick(); method = "field click"; }
            }
            catch (COMException ex)
            {
                field.DoClick();
                method = "field click (" + ex.Message + ")";
            }
            System.Windows.Forms.Application.DoEvents();
            var sel = _app.Selection;
            var r = new Dictionary<string, object> { ["bookmark"] = name, ["method"] = method, ["selStart"] = sel.Start };
            if (!d.Bookmarks.Exists(name)) { r["inParagraph"] = false; return r; }
            var para = d.Bookmarks[name].Range.Paragraphs[1].Range;
            r["inParagraph"] = sel.Start >= para.Start && sel.Start <= para.End;
            r["page"] = Convert.ToInt32(para.get_Information(Word.WdInformation.wdActiveEndPageNumber));
            // The equation's picture in that paragraph: is its top on screen?
            Word.Range pic = null;
            foreach (Word.InlineShape s0 in para.InlineShapes) { pic = s0.Range; break; }
            var pane = DocumentPane();
            if (pic != null && pane.HasValue)
            {
                try
                {
                    _app.ActiveWindow.GetPoint(out int left, out int top, out int width, out int height, pic);
                    r["pictureTop"] = top;
                    r["pictureHeight"] = height;
                    r["paneTop"] = pane.Value.Top;
                    r["paneBottom"] = pane.Value.Bottom;
                    r["topVisible"] = top >= pane.Value.Top && top < pane.Value.Bottom;
                }
                catch (COMException ex)
                {
                    r["topVisible"] = false;
                    r["visibility"] = "not on screen (" + ex.Message + ")";
                }
            }
            return r;
        }

        /// <summary>Pastes at the selection in one of Word's paste modes; reports what arrived and what the add-in makes of it.</summary>
        private Dictionary<string, object> Paste(string mode, Word.Selection sel)
        {
            var d = sel.Document;
            int at = sel.Start;
            int beforePictures = d.InlineShapes.Count, beforeShapes = d.Shapes.Count;
            int objectsBefore = CountObjects(d);
            // The add-in notices a paste by a change in the picture count since it last looked; the test
            // undoes pastes without it looking, so the count is noted now.
            NoteCounts(d);
            var r = new Dictionary<string, object> { ["mode"] = mode, ["objectsBefore"] = objectsBefore };
            try
            {
                try
                {
                    PasteOnce(sel, mode);
                }
                catch (COMException ex) when (ex.Message.Contains("no text is selected"))
                {
                    // The window switch has not settled yet (between documents): once more.
                    System.Windows.Forms.Application.DoEvents();
                    System.Threading.Thread.Sleep(300);
                    sel.Document.Activate();
                    sel = sel.Document.ActiveWindow.Selection;
                    PasteOnce(sel, mode);
                    r["retried"] = true;
                }
            }
            catch (COMException ex)
            {
                r["error"] = "Word refused this paste: " + ex.Message;
                return r;
            }
            r["newPictures"] = d.InlineShapes.Count - beforePictures;
            r["newFloating"] = d.Shapes.Count - beforeShapes;
            // What the add-in does once Word is idle after a paste.
            IdleChecks?.Invoke();
            r["afterIdleFloating"] = d.Shapes.Count - beforeShapes;
            // The pasted picture: the in-line picture closest after the paste position.
            r["objectsAfter"] = CountObjects(d);
            // The pasted shape: found by scanning the whole document for a shape starting at the paste
            // position (Word's range lookup missed pasted objects in 0.1.88).
            Word.InlineShape pasted = null;
            int end = Math.Max(sel.End, at) + 1;
            foreach (Word.InlineShape s in d.InlineShapes)
            {
                int st;
                try { st = s.Range.Start; } catch (Exception) { continue; }
                if (st >= at - 1 && st <= end)
                {
                    pasted = s;
                    break;
                }
            }
            if (pasted == null)
            {
                r["picture"] = false;
                return r;
            }
            var xml = pasted.Range.WordOpenXML;
            PictureXml.Data(xml, out var json);
            r["picture"] = true;
            r["alt"] = AltOf(pasted) ?? "";
            r["sourceTag"] = SourceTag(json);
            r["hasSource"] = json != null;
            r["vml"] = xml.Contains("<v:imagedata");
            r["drawingml"] = xml.Contains("<pic:pic");
            r["emf"] = xml.Contains("image/x-emf");
            r["png"] = xml.Contains("image/png");
            // Representation, compared with the original by the self-test: object kind, size, lowering.
            r["kind"] = pasted.Type.ToString();
            r["widthPt"] = (double)pasted.Width;
            r["heightPt"] = (double)pasted.Height;
            r["positionPt"] = LoweringOf(pasted) ?? 9999999;
            r["sourceJson"] = json;
            r["frame"] = FrameOf(pasted);
            r["isObject"] = IsMathBlocksObject(pasted);
            if ((bool)r["isObject"])
            {
                var oi = ObjectInfo(d, pasted);
                r["objectTag"] = oi["tag"];
                r["progId"] = oi["progId"];
                r["embedding"] = oi["embedding"];
                r["objectElement"] = oi["objectElement"];
            }
            var eq = EquationAt(d, pasted.Range);
            r["recognisedAs"] = null;
            if (eq != null)
            {
                // Opening resolves a shared ID first (the copy gets its own): report the ID it ends with.
                var act = Activation(d, eq, "self-test paste " + mode);
                r["opensProblem"] = act.TryGetValue("problem", out var pr) ? pr : null;
                r["opensFlatOpc"] = act["flatOpc"];
                r["recognisedAs"] = act["tag"];
            }
            return r;
        }
    
        /// <summary>The /Alt texts of a PDF, also those inside compressed (FlateDecode) streams.</summary>
        internal static List<object> PdfAltTexts(byte[] bytes)
        {
            var found = new List<object>();
            var latin = System.Text.Encoding.GetEncoding(28591);
            void Scan(string t)
            {
                foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(t, @"/Alt\s*\(((?:\\.|[^\\)])*)\)"))
                    found.Add(System.Text.RegularExpressions.Regex.Replace(m.Groups[1].Value, @"\\(.)", "$1"));
            }
            var all = latin.GetString(bytes);
            Scan(all);
            int at = 0;
            while ((at = all.IndexOf("stream", at, StringComparison.Ordinal)) >= 0)
            {
                int start = at + 6;
                if (start < all.Length && all[start] == '\r') start++;
                if (start < all.Length && all[start] == '\n') start++;
                else { at = start; continue; }
                int end = all.IndexOf("endstream", start, StringComparison.Ordinal);
                if (end < 0) break;
                at = end + 9;
                if (end - start < 3) continue;
                try
                {
                    // Skip the 2-byte zlib header; DeflateStream reads raw deflate.
                    using (var src = new MemoryStream(bytes, start + 2, end - start - 2))
                    using (var z = new System.IO.Compression.DeflateStream(src, System.IO.Compression.CompressionMode.Decompress))
                    using (var dst = new MemoryStream())
                    {
                        z.CopyTo(dst);
                        var t = latin.GetString(dst.ToArray());
                        if (t.Contains("/Alt")) Scan(t);
                    }
                }
                catch (Exception)
                {
                    // Not a deflate stream (an image, a font): nothing to read.
                }
            }
            return found;
        }
}
}
