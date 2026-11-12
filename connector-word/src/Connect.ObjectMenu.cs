using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// Right-click on a MathBlocks equation object: a MathBlocks menu at the pointer instead of Word's
    /// (Word honours Cancel for objects, and its own menu would offer the object's OLE verbs, which need a
    /// server MathBlocks objects do not have). It keeps what Word's menu is used for — Cut, Copy, Paste,
    /// Delete — and adds editing, numbering and LaTeX. The items and their actions are separate from the
    /// menu itself, so the self-test can list and run them.
    /// </summary>
    public partial class Connect
    {
        internal sealed class MenuItemInfo
        {
            public string Id;
            public string Label;
            public bool Enabled = true;
            public bool SeparatorBefore;
        }

        /// <summary>The menu for an equation (labels follow its state: numbered or not, connected or not).</summary>
        internal List<MenuItemInfo> ObjectMenuItems(Word.Document doc, Eq eq)
        {
            bool app = _pipe != null && _pipe.IsConnected;
            bool numbered = WordOps.NumberInfo(eq) != null;
            bool canPaste = false;
            try { canPaste = Clipboard.ContainsData(DataFormats.EnhancedMetafile) || Clipboard.ContainsText() || Clipboard.ContainsData("Embed Source") || Clipboard.ContainsData("Rich Text Format"); } catch (Exception) { }
            return new List<MenuItemInfo>
            {
                new MenuItemInfo { Id = "edit", Label = "Edit equation here", Enabled = app },
                new MenuItemInfo { Id = "editWindow", Label = "Edit in the MathBlocks window", Enabled = app },
                new MenuItemInfo { Id = "number", Label = numbered ? "Unnumber equation" : "Number equation", Enabled = app },
                new MenuItemInfo { Id = "copyLatex", Label = "Copy LaTeX", SeparatorBefore = true },
                new MenuItemInfo { Id = "toLatex", Label = "Convert to LaTeX text", Enabled = app },
                new MenuItemInfo { Id = "cut", Label = "Cut", SeparatorBefore = true },
                new MenuItemInfo { Id = "copy", Label = "Copy" },
                new MenuItemInfo { Id = "paste", Label = "Paste", Enabled = canPaste },
                new MenuItemInfo { Id = "delete", Label = "Delete" },
            };
        }

        /// <summary>The LaTeX an equation carries (its object data, else its picture's source or alt text).</summary>
        internal static string LatexOf(Eq eq)
        {
            try
            {
                var json = PictureXml.Source(eq.Xml);
                if (json == null) return null;
                return Rpc.Parse(json).TryGetValue("latex", out var l) ? l as string : null;
            }
            catch (Exception)
            {
                return null;
            }
        }

        /// <summary>Runs a menu item on an equation; returns what happened (for the log and the self-test).</summary>
        internal string RunObjectMenu(string id, Word.Document doc, Eq eq)
        {
            // The equation is selected first: Cut, Copy, Delete and the app commands act on the selection.
            eq.Range.Select();
            switch (id)
            {
                case "edit":
                    OpenPanel(doc, eq);
                    return "floating editor";
                case "editWindow":
                    SendActivated(doc, eq, "double-click", null);
                    return "MathBlocks window";
                case "number":
                    RunAppCommand("numberEquation");
                    return "number";
                case "copyLatex":
                {
                    var latex = LatexOf(eq);
                    if (string.IsNullOrEmpty(latex)) return "no LaTeX";
                    Clipboard.SetText(latex);
                    return "copied " + latex.Length + " characters";
                }
                case "toLatex":
                    RunAppCommand("toggleLatex");
                    return "to LaTeX";
                case "cut":
                    _app.Selection.Cut();
                    return "cut";
                case "copy":
                    _app.Selection.Copy();
                    return "copied";
                case "paste":
                    _app.Selection.Paste();
                    return "pasted";
                case "delete":
                    _app.Selection.Delete();
                    return "deleted";
                default:
                    return "unknown item " + id;
            }
        }

        /// <summary>Self-test: the menu items of the equation with this ID, or the result of running one.</summary>
        private Dictionary<string, object> ObjectMenuForTest(string tag, string id)
        {
            var doc = _app.ActiveDocument;
            var found = WordOps.FindByTag(doc, tag);
            if (found.Count == 0) throw new RpcException(Rpc.NotFound, "no equation " + tag);
            if (id == null)
            {
                var items = new List<object>();
                foreach (var i in ObjectMenuItems(doc, found[0])) items.Add(new Dictionary<string, object> { ["id"] = i.Id, ["label"] = i.Label, ["enabled"] = i.Enabled });
                return new Dictionary<string, object> { ["items"] = items, ["isObject"] = found[0].IsObject };
            }
            var result = RunObjectMenu(id, doc, found[0]);
            string clip = null;
            try { if (Clipboard.ContainsText()) clip = Clipboard.GetText(); } catch (Exception) { }
            return new Dictionary<string, object> { ["result"] = result, ["clipboardText"] = clip };
        }

        private ContextMenuStrip _objectMenu;

        /// <summary>Shows the menu at the pointer for this equation.</summary>
        private void ShowObjectMenu(Word.Document doc, Eq eq)
        {
            _objectMenu?.Dispose();
            var menu = new ContextMenuStrip { ShowImageMargin = false };
            var tag = eq.Tag;
            foreach (var item in ObjectMenuItems(doc, eq))
            {
                if (item.SeparatorBefore) menu.Items.Add(new ToolStripSeparator());
                var mi = new ToolStripMenuItem(item.Label) { Enabled = item.Enabled };
                var id = item.Id;
                if (id == "edit") mi.Font = new System.Drawing.Font(mi.Font, System.Drawing.FontStyle.Bold);
                mi.Click += (s, e) =>
                {
                    try
                    {
                        // Found again by its ID: the document may have changed while the menu was open.
                        var found = WordOps.FindByTag(doc, tag);
                        if (found.Count == 0) return;
                        Log.Info("object menu: " + id + " → " + RunObjectMenu(id, doc, found[0]));
                    }
                    catch (Exception ex)
                    {
                        Log.Error("object menu " + id, ex);
                    }
                };
                menu.Items.Add(mi);
            }
            _objectMenu = menu;
            menu.Show(Cursor.Position);
        }
    }
}
