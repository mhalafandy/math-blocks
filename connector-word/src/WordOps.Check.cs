using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// Check document (read-only part): every field the check looks at in one pass — references to equations with
    /// the number they show and the number of their target, MathBlocks' hidden markers (section, definition, list of
    /// symbols) and whether they are hidden, and what is left of MathType (objects, numbering fields, bookmarks).
    /// The equations themselves come from listInstances / listNumbered; the judging is done by the app
    /// (lib/checkDocument.ts), so it can be tested without Word.
    /// </summary>
    internal sealed partial class WordOps
    {
        private static readonly Regex MarkerCode = new Regex(@"^\s*MACROBUTTON\s+(MBEquationSection|MBDefine|MBSymbolList)\b\s*(.*)$", RegexOptions.Compiled | RegexOptions.Singleline);
        private static readonly Regex MathTypeField = new Regex(@"^\s*(MACROBUTTON\s+MTPlaceRef|MACROBUTTON\s+MTEditEquationSection|GOTOBUTTON\s+ZEqnNum|REF\s+ZEqnNum|SEQ\s+MT(Eqn|Sec|Chap))\b", RegexOptions.Compiled);

        public Dictionary<string, object> CheckFields(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var refs = new List<object>();
            var markers = new List<object>();
            var mtFields = new List<object>();
            // An older reference is GOTOBUTTON with a REF nested in its code: one reference, showing the REF's text.
            Dictionary<string, object> button = null;
            int buttonEnd = -1;
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
                var trimmed = code.Trim();
                var rm = RefCode.Match(trimmed);
                var om = OldButtonRef.Match(trimmed);
                if (rm.Success || om.Success)
                {
                    var bm = rm.Success ? rm.Groups[1].Value : om.Groups[1].Value;
                    string shown = "", target = "";
                    bool exists = false;
                    try { shown = DisplayText(f.Result?.Text ?? "").Trim(); } catch (COMException) { }
                    try
                    {
                        exists = doc.Bookmarks.Exists(bm);
                        if (exists) target = DisplayText(doc.Bookmarks[bm].Range.Text ?? "").Replace("\t", "").Trim();
                    }
                    catch (COMException) { }
                    if (rm.Success && button != null && start < buttonEnd)
                    {
                        if (string.IsNullOrEmpty((string)button["shown"])) button["shown"] = shown;
                        continue;
                    }
                    var entry = new Dictionary<string, object> { ["start"] = start, ["code"] = trimmed, ["bookmark"] = bm, ["shown"] = shown, ["target"] = target, ["exists"] = exists, ["linked"] = rm.Success && Regex.IsMatch(trimmed, @"\\h\b") };
                    refs.Add(entry);
                    if (om.Success)
                    {
                        button = entry;
                        try { buttonEnd = f.Code.End; } catch (COMException) { buttonEnd = -1; }
                    }
                    continue;
                }
                var mm = MarkerCode.Match(code);
                if (mm.Success)
                {
                    bool hidden = false;
                    try
                    {
                        // The code and the result (if any) are hidden: nothing of the marker prints.
                        hidden = f.Code.Font.Hidden == -1 && (f.Result == null || string.IsNullOrEmpty(f.Result.Text) || f.Result.Font.Hidden == -1);
                    }
                    catch (Exception) { }
                    markers.Add(new Dictionary<string, object> { ["start"] = start, ["kind"] = mm.Groups[1].Value, ["code"] = mm.Groups[2].Value.Trim(), ["hidden"] = hidden });
                    continue;
                }
                if (MathTypeField.IsMatch(code)) mtFields.Add(new Dictionary<string, object> { ["start"] = start, ["code"] = trimmed });
            }
            var mtObjects = new List<object>();
            foreach (Word.InlineShape s in doc.InlineShapes)
            {
                try { if (IsMathType(s)) mtObjects.Add(new Dictionary<string, object> { ["start"] = s.Range.Start }); } catch (COMException) { }
            }
            int mtBookmarks = 0;
            try
            {
                foreach (Word.Bookmark b in doc.Bookmarks)
                    if (b.Name.StartsWith("ZEqnNum", StringComparison.Ordinal)) mtBookmarks++;
            }
            catch (COMException) { }
            return new Dictionary<string, object> { ["references"] = refs, ["markers"] = markers, ["mathTypeFields"] = mtFields, ["mathTypeObjects"] = mtObjects, ["mathTypeBookmarks"] = mtBookmarks };
        }

        /// <summary>Repair: hides the marker fields at these positions (code and result), in one undo step.</summary>
        public Dictionary<string, object> HideFields(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var starts = new HashSet<int>();
            if (p.TryGetValue("starts", out var raw) && raw is IEnumerable list)
                foreach (var o in list) starts.Add(Convert.ToInt32(o));
            return InOneUndo("Hide markers", () =>
            {
                int hidden = 0;
                foreach (Word.Field f in doc.Fields)
                {
                    try
                    {
                        if (!starts.Contains(f.Code.Start - 1)) continue;
                        f.Code.Font.Hidden = -1;
                        if (f.Result != null) f.Result.Font.Hidden = -1;
                        hidden++;
                    }
                    catch (COMException) { }
                }
                return new Dictionary<string, object> { ["hidden"] = hidden };
            });
        }
    }
}
