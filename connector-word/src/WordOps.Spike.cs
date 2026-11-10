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

        internal static string ProgIdOf(Word.InlineShape s)
        {
            try
            {
                if (s.Type != Word.WdInlineShapeType.wdInlineShapeEmbeddedOLEObject) return null;
                return s.OLEFormat.ProgID;
            }
            catch (Exception)
            {
                // Class not registered on this PC: read the ProgID from the XML.
                try
                {
                    var m = Regex.Match(s.Range.WordOpenXML, "ProgID=\"([^\"]+)\"");
                    return m.Success ? m.Groups[1].Value : null;
                }
                catch (Exception)
                {
                    return null;
                }
            }
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
                if (EquationIdentity.AltTag(AltOf(s)) == tag && IsMathBlocksObject(s)) list.Add(s);
            return list;
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
                ["positionPt"] = (double)s.Range.Font.Position,
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
