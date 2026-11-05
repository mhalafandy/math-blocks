using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// Small dialogs shown over Word, so commands started from Word finish in Word (the app stays
    /// in the background): a confirmation (Enter confirms, optional "don't ask again") and the
    /// equation reference picker.
    /// </summary>
    internal static class WordDialogs
    {
        private sealed class Owner : IWin32Window
        {
            public Owner(IntPtr h) => Handle = h;
            public IntPtr Handle { get; }
        }

        private static IWin32Window OwnerOf(IntPtr hwnd) => hwnd == IntPtr.Zero ? null : new Owner(hwnd);

        /// <summary>A confirmation over Word. Returns (confirmed, don't ask again).</summary>
        internal static (bool ok, bool dontAsk) Confirm(IntPtr owner, string title, string text, string okLabel, bool offerDontAsk)
        {
            using (var f = new Form
            {
                Text = title,
                FormBorderStyle = FormBorderStyle.FixedDialog,
                StartPosition = owner == IntPtr.Zero ? FormStartPosition.CenterScreen : FormStartPosition.CenterParent,
                MaximizeBox = false,
                MinimizeBox = false,
                ShowInTaskbar = false,
                Font = SystemFonts.MessageBoxFont,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Padding = new Padding(14),
            })
            {
                var layout = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, WrapContents = false };
                layout.Controls.Add(new Label { Text = text, AutoSize = true, MaximumSize = new Size(420, 0), Margin = new Padding(0, 0, 0, 12) });
                var dontAsk = new CheckBox { Text = "Don't ask again (one Ctrl+Z undoes it; a backup is made)", AutoSize = true, Visible = offerDontAsk };
                layout.Controls.Add(dontAsk);
                var buttons = new FlowLayoutPanel { FlowDirection = FlowDirection.RightToLeft, AutoSize = true, Anchor = AnchorStyles.Right, Margin = new Padding(0, 12, 0, 0) };
                var ok = new Button { Text = okLabel, DialogResult = DialogResult.OK, AutoSize = true };
                var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, AutoSize = true };
                buttons.Controls.Add(cancel);
                buttons.Controls.Add(ok);
                layout.Controls.Add(buttons);
                f.Controls.Add(layout);
                f.AcceptButton = ok;
                f.CancelButton = cancel;
                f.Shown += (s, e) => { f.Activate(); ok.Focus(); };
                var r = f.ShowDialog(OwnerOf(owner));
                return (r == DialogResult.OK, dontAsk.Checked);
            }
        }

        internal sealed class ReferenceItem
        {
            public string Bookmark;
            public string Number;
            public string Text;
            public int Page;
        }

        /// <summary>The reference picker over Word: type to filter, Enter inserts. Returns (bookmark, number only) or null.</summary>
        internal static (string bookmark, bool numberOnly)? PickReference(IntPtr owner, List<ReferenceItem> items, bool numberOnlyDefault)
        {
            using (var f = new Form
            {
                Text = "Insert reference to an equation",
                FormBorderStyle = FormBorderStyle.SizableToolWindow,
                StartPosition = owner == IntPtr.Zero ? FormStartPosition.CenterScreen : FormStartPosition.CenterParent,
                ShowInTaskbar = false,
                Font = SystemFonts.MessageBoxFont,
                ClientSize = new Size(520, 380),
                Padding = new Padding(10),
            })
            {
                var search = new TextBox { Dock = DockStyle.Top };
                var list = new ListView { Dock = DockStyle.Fill, View = View.Details, FullRowSelect = true, HideSelection = false, MultiSelect = false };
                list.Columns.Add("Number", 90);
                list.Columns.Add("Page", 50);
                list.Columns.Add("Equation", 360);
                var bottom = new FlowLayoutPanel { Dock = DockStyle.Bottom, FlowDirection = FlowDirection.RightToLeft, AutoSize = true, Padding = new Padding(0, 8, 0, 0) };
                var insert = new Button { Text = "Insert", AutoSize = true };
                var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, AutoSize = true };
                var numberOnly = new CheckBox { Text = "Number only (1.2 instead of (1.2))", AutoSize = true, Checked = numberOnlyDefault, Margin = new Padding(0, 6, 20, 0) };
                bottom.Controls.Add(cancel);
                bottom.Controls.Add(insert);
                bottom.Controls.Add(numberOnly);
                f.Controls.Add(list);
                f.Controls.Add(search);
                f.Controls.Add(bottom);
                f.CancelButton = cancel;
                string chosen = null;
                void Fill()
                {
                    var words = search.Text.ToLowerInvariant().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    list.BeginUpdate();
                    list.Items.Clear();
                    foreach (var it in items)
                    {
                        var hay = (it.Number + " " + it.Text).ToLowerInvariant();
                        if (!words.All(w => hay.Contains(w))) continue;
                        var li = new ListViewItem(new[] { it.Number, it.Page > 0 ? it.Page.ToString() : "", it.Text }) { Tag = it.Bookmark };
                        list.Items.Add(li);
                    }
                    if (list.Items.Count > 0) list.Items[0].Selected = true;
                    list.EndUpdate();
                }
                void Choose()
                {
                    if (list.SelectedItems.Count == 0) return;
                    chosen = (string)list.SelectedItems[0].Tag;
                    f.DialogResult = DialogResult.OK;
                    f.Close();
                }
                search.TextChanged += (s, e) => Fill();
                search.KeyDown += (s, e) =>
                {
                    if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; Choose(); }
                    else if (e.KeyCode == Keys.Down && list.Items.Count > 0)
                    {
                        int i = list.SelectedIndices.Count > 0 ? Math.Min(list.Items.Count - 1, list.SelectedIndices[0] + 1) : 0;
                        list.Items[i].Selected = true;
                        list.EnsureVisible(i);
                        e.SuppressKeyPress = true;
                    }
                    else if (e.KeyCode == Keys.Up && list.SelectedIndices.Count > 0)
                    {
                        int i = Math.Max(0, list.SelectedIndices[0] - 1);
                        list.Items[i].Selected = true;
                        list.EnsureVisible(i);
                        e.SuppressKeyPress = true;
                    }
                };
                list.DoubleClick += (s, e) => Choose();
                list.KeyDown += (s, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; Choose(); } };
                insert.Click += (s, e) => Choose();
                f.Shown += (s, e) => { f.Activate(); search.Focus(); };
                Fill();
                return f.ShowDialog(OwnerOf(owner)) == DialogResult.OK && chosen != null ? (chosen, numberOnly.Checked) : ((string, bool)?)null;
            }
        }
    }
}
