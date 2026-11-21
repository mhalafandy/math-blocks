using System;
using System.Collections.Generic;
using System.Diagnostics;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// Requests that only read (list, verify, Repair's dry run, Check document's fields, definitions, numbers):
    /// one read of the document's XML for the whole request, split per picture (DocXml), and one index of the
    /// pictures by ID, instead of one Range.WordOpenXML per equation and a walk over every picture per lookup
    /// (a 1500-equation thesis: 4 to 10 minutes per read, 0.1.165–0.1.167 thesis-size tests). Outside such a
    /// request, and for anything the split cannot tell apart (an ID on two pictures, other stories), Word is
    /// read as before. Any change to an ID during the request drops both.
    /// </summary>
    internal sealed partial class WordOps
    {
        private static readonly HashSet<string> ReadOnlyRequests = new HashSet<string>(StringComparer.Ordinal)
        {
            "listInstances", "verifyMany", "checkFields", "listDefinitions", "listNumbered",
        };

        /// <summary>Per document (full name): its XML split per picture; null entry = could not be read.</summary>
        internal static Dictionary<string, DocXml> XmlScope;

        /// <summary>Per document: its main-text pictures by ID (not inside a MathBlocks wrapper).</summary>
        internal static Dictionary<string, Dictionary<string, List<Word.InlineShape>>> TagScope;

        internal static void BeginReadScope(string method, Dictionary<string, object> p)
        {
            bool readOnly = ReadOnlyRequests.Contains(method) || (method == "repairEquations" && Rpc.GetBool(p, "dryRun"));
            XmlScope = readOnly ? new Dictionary<string, DocXml>(StringComparer.OrdinalIgnoreCase) : null;
            TagScope = readOnly ? new Dictionary<string, Dictionary<string, List<Word.InlineShape>>>(StringComparer.OrdinalIgnoreCase) : null;
        }

        internal static void EndReadScope()
        {
            XmlScope = null;
            TagScope = null;
            FactsScope = null;
            WriteFactsDoc = null;
        }

        /// <summary>
        /// Per document, for a request that only reads: whether it has tracked changes and its content controls by
        /// ID. Each lookup asked Word for both (the revision count, a search of every control), about half a second
        /// per equation on the thesis-size document (0.1.169 log: verify 0.52 s per equation with the XML read once).
        /// </summary>
        internal sealed class DocFacts
        {
            public bool NoRevisions;
            public int Controls;
            public Dictionary<string, List<Word.ContentControl>> ControlsByTag = new Dictionary<string, List<Word.ContentControl>>(StringComparer.Ordinal);
        }

        internal static Dictionary<string, DocFacts> FactsScope;

        /// <summary>The request's facts about the document; null outside a request that only reads.</summary>
        internal static DocFacts FactsOf(Word.Document doc)
        {
            if (XmlScope == null && (WriteFactsDoc == null || !string.Equals(WriteFactsDoc, doc.FullName, StringComparison.OrdinalIgnoreCase))) return null;
            if (FactsScope == null) FactsScope = new Dictionary<string, DocFacts>(StringComparer.OrdinalIgnoreCase);
            var key = doc.FullName;
            if (FactsScope.TryGetValue(key, out var f)) return f;
            f = new DocFacts();
            try { f.NoRevisions = doc.Revisions.Count == 0; } catch (Exception) { f.NoRevisions = false; }
            try
            {
                foreach (Word.ContentControl cc in doc.ContentControls)
                {
                    f.Controls++;
                    var t = cc.Tag ?? "";
                    if (!f.ControlsByTag.TryGetValue(t, out var list)) f.ControlsByTag[t] = list = new List<Word.ContentControl>();
                    list.Add(cc);
                }
            }
            catch (Exception)
            {
                return null;
            }
            FactsScope[key] = f;
            return f;
        }

        /// <summary>
        /// A picture's ID was written: the XML read no longer holds, and the index forgets both IDs (looked up
        /// again by walking the document, then indexed afresh only by a new request).
        /// </summary>
        internal static void InvalidateReadScope(string oldTag = null, string newTag = null)
        {
            XmlScope?.Clear();
            // An ID written in a write that may use the facts changes neither revisions nor content controls.
            if (WriteFactsDoc == null) FactsScope = null;
            if (TagScope == null) return;
            if (oldTag == null && newTag == null)
            {
                TagScope.Clear();
                return;
            }
            ForgetTag(oldTag);
            ForgetTag(newTag);
        }

        /// <summary>The index forgets this ID (its picture was replaced or retagged).</summary>
        internal static void ForgetTag(string tag)
        {
            if (tag == null || TagScope == null) return;
            foreach (var index in TagScope.Values) index.Remove(tag);
        }

        /// <summary>
        /// A write that looks up every equation once (Apply style's replacements): the picture index without the
        /// XML read; each replaced ID is forgotten as it is written.
        /// </summary>
        internal static void BeginWriteIndex(Word.Document doc)
        {
            if (TagScope == null) TagScope = new Dictionary<string, Dictionary<string, List<Word.InlineShape>>>(StringComparer.OrdinalIgnoreCase);
            // Writing pictures with Track Changes off adds no revisions, and a document without content controls gets
            // none: the facts hold for the whole write (Apply style: 0.7 s per equation on the thesis, 0.1.169 log).
            try { WriteFactsDoc = !doc.TrackRevisions && doc.ContentControls.Count == 0 ? doc.FullName : null; } catch (Exception) { WriteFactsDoc = null; }
        }

        /// <summary>The document a write may use the facts for (see BeginWriteIndex).</summary>
        internal static string WriteFactsDoc;

        /// <summary>A picture's XML: from the request's one read of the document where it can be told apart, else Word's.</summary>
        internal static string ShapeXml(Word.InlineShape s)
        {
            if (XmlScope != null)
            {
                try
                {
                    var tag = EquationIdentity.ResolvePictureTag(RawTitleOf(s), AltOf(s), null, out _);
                    if (tag != null && s.Range.StoryType == Word.WdStoryType.wdMainTextStory)
                    {
                        var doc = s.Range.Document;
                        var key = doc.FullName;
                        if (!XmlScope.TryGetValue(key, out var dx))
                        {
                            dx = ReadDocumentXml(doc);
                            XmlScope[key] = dx;
                        }
                        var pkg = dx?.PackageFor(tag);
                        if (pkg != null) return pkg;
                    }
                }
                catch (Exception ex)
                {
                    Log.Error("document XML: falling back to the picture's own XML", ex);
                }
            }
            return s.Range.WordOpenXML;
        }

        private static DocXml ReadDocumentXml(Word.Document doc)
        {
            var clock = Stopwatch.StartNew();
            try
            {
                var xml = doc.Content.WordOpenXML;
                var read = clock.ElapsedMilliseconds;
                var dx = DocXml.Parse(xml);
                Log.Info("document XML of " + doc.Name + ": read once in " + read + " ms (" + xml.Length + " chars), split in " + (clock.ElapsedMilliseconds - read) + " ms: " + dx.Pictures + " picture(s), " + dx.Served + " ID(s) served");
                return dx;
            }
            catch (Exception ex)
            {
                Log.Error("document XML could not be read or split; each picture is read on its own", ex);
                return null;
            }
        }

        /// <summary>The main-text pictures with this ID from the request's index; null outside a read request.</summary>
        internal static List<Word.InlineShape> ScopedPicturesWithTag(Word.Document doc, string tag)
        {
            if (TagScope == null) return null;
            var key = doc.FullName;
            if (!TagScope.TryGetValue(key, out var index))
            {
                index = new Dictionary<string, List<Word.InlineShape>>(StringComparer.Ordinal);
                foreach (Word.InlineShape s in doc.InlineShapes)
                {
                    var t = TagOf(s);
                    if (t == null || InsideMathBlocksControl(s.Range)) continue;
                    if (!index.TryGetValue(t, out var list)) index[t] = list = new List<Word.InlineShape>();
                    list.Add(s);
                }
                TagScope[key] = index;
            }
            // Not indexed (or forgotten after a write): the caller walks the document.
            if (!index.TryGetValue(tag, out var found)) return null;
            // A write earlier in the request can make Word recreate the pictures it held (Apply style left an
            // equation twice, soak 0.1.168 #673): each must still be there and still carry this ID, else the
            // document is walked.
            foreach (var s in found)
            {
                try
                {
                    if (TagOf(s) != tag || s.Range.Start < 0) return Forget(index, tag);
                }
                catch (Exception)
                {
                    return Forget(index, tag);
                }
            }
            return found;
        }

        private static List<Word.InlineShape> Forget(Dictionary<string, List<Word.InlineShape>> index, string tag)
        {
            index.Remove(tag);
            return null;
        }
    }
}
