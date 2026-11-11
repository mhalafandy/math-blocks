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
    }
}
