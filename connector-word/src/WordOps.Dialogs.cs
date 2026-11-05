using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>Commands started from Word finish in Word: confirmations and messages over Word's window.</summary>
    internal sealed partial class WordOps
    {
        internal IntPtr WordWindow()
        {
            try
            {
                return new IntPtr(_app.ActiveWindow.Hwnd);
            }
            catch (COMException)
            {
                return IntPtr.Zero;
            }
        }

        /// <summary>A confirmation over Word (Enter confirms).</summary>
        public Dictionary<string, object> Confirm(Dictionary<string, object> p)
        {
            var title = p.TryGetValue("title", out var t) && t is string ts ? ts : "MathBlocks";
            var text = Rpc.GetString(p, "text");
            var ok = p.TryGetValue("ok", out var o) && o is string os ? os : "OK";
            var r = WordDialogs.Confirm(WordWindow(), title, text, ok, Rpc.GetBool(p, "offerDontAsk"));
            Log.Info("confirm \"" + title + "\": " + (r.ok ? "yes" : "no") + (r.dontAsk ? ", don't ask again" : ""));
            return new Dictionary<string, object> { ["ok"] = r.ok, ["dontAsk"] = r.dontAsk };
        }

        /// <summary>A result in Word's status bar, or a problem in a message over Word.</summary>
        public Dictionary<string, object> ShowMessage(Dictionary<string, object> p)
        {
            var text = Rpc.GetString(p, "text");
            var kind = p.TryGetValue("kind", out var k) && k is string ks ? ks : "info";
            if (kind == "error")
            {
                var owner = WordWindow();
                if (owner != IntPtr.Zero) MessageBox.Show(new Win(owner), text, "MathBlocks", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                else MessageBox.Show(text, "MathBlocks", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            else
            {
                try
                {
                    _app.StatusBar = "MathBlocks: " + text;
                }
                catch (COMException)
                {
                }
            }
            return new Dictionary<string, object> { ["ok"] = true };
        }

        /// <summary>Ribbon "Insert reference": the picker over Word, then the reference at the cursor.</summary>
        internal void PickAndInsertReference(bool numberOnlyDefault)
        {
            var doc = ActiveDocument();
            var list = ListNumbered(new Dictionary<string, object>());
            var items = new List<WordDialogs.ReferenceItem>();
            if (list["equations"] is IEnumerable<object> eqs)
                foreach (var o in eqs)
                {
                    if (!(o is Dictionary<string, object> e)) continue;
                    string text = e.TryGetValue("context", out var c) ? c as string : "";
                    var tag = e.TryGetValue("tag", out var tg) ? tg as string : null;
                    if (tag != null)
                    {
                        var found = FindByTag(doc, tag);
                        if (found.Count > 0)
                        {
                            foreach (Word.InlineShape s in found[0].Range.InlineShapes)
                            {
                                var src = PictureSource(s.Range.WordOpenXML);
                                if (src != null) { text = EquationIdentity.FirstLatex(src); break; }
                            }
                        }
                    }
                    items.Add(new WordDialogs.ReferenceItem { Bookmark = (string)e["bookmark"], Number = e["number"] as string ?? "", Text = text ?? "", Page = e.TryGetValue("page", out var pg) ? Convert.ToInt32(pg) : 0 });
                }
            if (items.Count == 0)
            {
                MessageBox.Show(new Win(WordWindow()), "There are no numbered equations in this document yet.", "MathBlocks", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            var pick = WordDialogs.PickReference(WordWindow(), items, numberOnlyDefault);
            if (pick == null) return;
            var r = InsertReference(new Dictionary<string, object> { ["bookmark"] = pick.Value.bookmark, ["numberOnly"] = pick.Value.numberOnly });
            Log.Info("reference inserted from Word: " + r["text"]);
        }

        private sealed class Win : IWin32Window
        {
            public Win(IntPtr h) => Handle = h;
            public IntPtr Handle { get; }
        }
    }
}
