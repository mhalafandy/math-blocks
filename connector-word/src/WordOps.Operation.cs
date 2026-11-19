using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// Document-wide operations (restyle, change notation, normalize bold, convert): a backup copy
    /// first, then the app sends batches of replacements inside one undo record while a progress
    /// window owned by Word's window blocks the document. Cancel is reported to the app, which
    /// restores the equations it already replaced from their stored XML.
    /// </summary>
    internal sealed partial class WordOps
    {
        private ProgressForm _progress;
        private IntPtr _disabledWindow = IntPtr.Zero;
        private bool _operationUndo;
        private readonly Stopwatch _operationClock = new Stopwatch();

        [DllImport("user32.dll")]
        private static extern bool EnableWindow(IntPtr hWnd, bool enable);

        /// <summary>Saves the whole document (Flat OPC .xml, opens in Word) to %LOCALAPPDATA%\MathBlocks\backups.</summary>
        public Dictionary<string, object> BackupDocument(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MathBlocks", "backups");
            Directory.CreateDirectory(dir);
            var name = Path.GetFileNameWithoutExtension(doc.Name);
            foreach (var c in Path.GetInvalidFileNameChars()) name = name.Replace(c, '_');
            var path = Path.Combine(dir, name + " " + DateTime.Now.ToString("yyyy-MM-dd HH-mm-ss") + ".xml");
            File.WriteAllText(path, doc.WordOpenXML, System.Text.Encoding.UTF8);
            Log.Info("backup of " + doc.Name + " → " + path);
            PruneBackups(dir, name);
            return new Dictionary<string, object> { ["path"] = path };
        }

        /// <summary>Keeps a document's newest 20 backups and every backup younger than 30 days (whichever keeps more).</summary>
        private static void PruneBackups(string dir, string name)
        {
            try
            {
                var files = new List<FileInfo>(new DirectoryInfo(dir).GetFiles(name + " ????-??-?? ??-??-??.xml"));
                files.Sort((a, b) => b.LastWriteTimeUtc.CompareTo(a.LastWriteTimeUtc));
                var cutoff = DateTime.UtcNow.AddDays(-30);
                for (int i = 20; i < files.Count; i++)
                {
                    if (files[i].LastWriteTimeUtc >= cutoff) continue;
                    files[i].Delete();
                    Log.Info("backup removed (older than 30 days, beyond the newest 20): " + files[i].Name);
                }
            }
            catch (Exception ex)
            {
                Log.Error("pruning backups", ex);
            }
        }

        /// <summary>Opens one undo record for the whole operation and shows the progress window.</summary>
        public Dictionary<string, object> BeginOperation(Dictionary<string, object> p)
        {
            var doc = ResolveDocument(p);
            var title = p.TryGetValue("title", out var t) && t is string ts ? ts : "MathBlocks";
            var undoLabel = p.TryGetValue("undoLabel", out var u) && u is string us ? us : title;
            var total = p.TryGetValue("total", out var n) ? Convert.ToInt32(n) : 0;
            EndOperationCore();
            _undoBrokenAt = null;
            // Text guard: the document's text outside equations, fields and the ranges this operation is meant
            // to change; compared at the end, and the operation undone if anything else changed.
            _guardLabel = title;
            if (!Rpc.GetBool(p, "noGuard")) GuardStart(doc, ExcludeOf(p));
            var undo = _app.UndoRecord;
            if (!undo.IsRecordingCustomRecord)
            {
                undo.StartCustomRecord(undoLabel);
                _operationUndo = true;
            }
            try
            {
                // Closing the progress window lets Windows activate the next window in line, which
                // can be another open document: this one comes back to the front at the end.
                _operationWindow = _app.ActiveWindow;
            }
            catch (COMException)
            {
                _operationWindow = null;
            }
            IntPtr owner = IntPtr.Zero;
            try
            {
                owner = new IntPtr(doc.ActiveWindow.Hwnd);
            }
            catch (COMException)
            {
                // Word 2010 has no Window.Hwnd: the window is then not owned (still on top of Word).
            }
            // No redrawing while equations are replaced: faster, and the document does not flicker.
            try
            {
                if (_operationScreen == null)
                {
                    _operationScreen = _app.ScreenUpdating;
                    _app.ScreenUpdating = false;
                }
            }
            catch (COMException)
            {
            }
            // One busy pointer for the whole operation (Word otherwise switches it on and off with every
            // change, which looks like flickering).
            try
            {
                _app.System.Cursor = Word.WdCursorType.wdCursorWait;
            }
            catch (COMException)
            {
            }
            _progress = new ProgressForm(title, total);
            if (owner != IntPtr.Zero)
            {
                _progress.Show(new Owner(owner));
                // Modal: no clicks into the document while equations are being replaced.
                EnableWindow(owner, false);
                _disabledWindow = owner;
            }
            else _progress.Show();
            _operationClock.Restart();
            Log.Info("operation \"" + title + "\" on " + doc.Name + ": " + total + " equation(s)");
            return new Dictionary<string, object> { ["ok"] = true };
        }

        /// <summary>Updates the progress window; tells the app whether Cancel was pressed.</summary>
        public Dictionary<string, object> OperationProgress(Dictionary<string, object> p)
        {
            var done = p.TryGetValue("done", out var d) ? Convert.ToInt32(d) : 0;
            var text = p.TryGetValue("text", out var t) && t is string ts ? ts : null;
            CheckOperationUndo("progress update");
            if (_progress != null && !_progress.IsDisposed)
            {
                _progress.SetDone(done, text);
                Application.DoEvents();
            }
            CheckOperationUndo("progress window events");
            return new Dictionary<string, object> { ["cancelled"] = _progress != null && _progress.Cancelled };
        }

        /// <summary>Closes the undo record and the progress window; logs the time per equation.</summary>
        public Dictionary<string, object> EndOperation(Dictionary<string, object> p)
        {
            var done = p.TryGetValue("done", out var d) ? Convert.ToInt32(d) : 0;
            var ms = _operationClock.ElapsedMilliseconds;
            CheckOperationUndo("end of the operation");
            var broken = _undoBrokenAt ?? "";
            // Cancelled by the user: the whole operation is undone (its single record), the text checked back.
            if (Rpc.GetBool(p, "rollback"))
            {
                EndOperationCore();
                bool back = RollBack();
                _guardDoc = null;
                Log.Info("operation cancelled and undone: " + (back ? "document as before" : "could not confirm the document is as before"));
                return new Dictionary<string, object> { ["ms"] = ms, ["undoBrokenAt"] = broken, ["rolledBack"] = back };
            }
            var guardFailed = GuardCheck();
            EndOperationCore();
            bool restored = false;
            if (guardFailed != null) restored = GuardUndo();
            _guardDoc = null;
            if (done > 0) Log.Info("operation finished: " + done + " equation(s) in " + ms + " ms (" + (ms / Math.Max(1, done)) + " ms each)");
            var result = new Dictionary<string, object> { ["ms"] = ms, ["undoBrokenAt"] = broken };
            if (guardFailed != null)
            {
                result["guardFailed"] = guardFailed;
                result["guardRestored"] = restored;
            }
            return result;
        }

        private void EndOperationCore()
        {
            if (_operationUndo)
            {
                try
                {
                    _app.UndoRecord.EndCustomRecord();
                }
                catch (COMException)
                {
                    // Already closed by Word.
                }
                _operationUndo = false;
            }
            if (_disabledWindow != IntPtr.Zero)
            {
                EnableWindow(_disabledWindow, true);
                _disabledWindow = IntPtr.Zero;
            }
            if (_progress != null)
            {
                try
                {
                    _progress.Close();
                    _progress.Dispose();
                }
                catch (ObjectDisposedException)
                {
                }
                _progress = null;
            }
            try
            {
                _app.System.Cursor = Word.WdCursorType.wdCursorNormal;
            }
            catch (COMException)
            {
            }
            if (_operationScreen != null)
            {
                try
                {
                    _app.ScreenUpdating = _operationScreen.Value;
                    if (_operationScreen.Value) _app.ScreenRefresh();
                }
                catch (COMException)
                {
                }
                _operationScreen = null;
            }
            if (_operationWindow != null)
            {
                try
                {
                    _operationWindow.Activate();
                }
                catch (COMException)
                {
                    // The window was closed meanwhile.
                }
                _operationWindow = null;
            }
            _operationClock.Stop();
        }

        private Word.Window _operationWindow;
        private bool? _operationScreen;

        /// <summary>
        /// Runs a whole-document change as one undo step (one Ctrl+Z) with a steady busy pointer; reports
        /// where Word closed the record early, if it did (undoBrokenAt). Inside an operation it just runs.
        /// </summary>
        internal Dictionary<string, object> InOneUndo(string label, Func<Dictionary<string, object>> work, List<int[]> exclude = null, Word.Document guardDoc = null)
        {
            var undo = _app.UndoRecord;
            bool own = !undo.IsRecordingCustomRecord;
            if (own)
            {
                _guardLabel = label;
                GuardStart(guardDoc ?? _app.ActiveDocument, exclude);
                undo.StartCustomRecord(label);
                _operationUndo = true;
                _undoBrokenAt = null;
                try { _app.System.Cursor = Word.WdCursorType.wdCursorWait; } catch (COMException) { }
            }
            try
            {
                var r = work();
                if (own)
                {
                    CheckOperationUndo("end of " + label);
                    r["undoBrokenAt"] = _undoBrokenAt ?? "";
                    var failed = GuardCheck();
                    if (failed != null)
                    {
                        try { undo.EndCustomRecord(); } catch (COMException) { }
                        _operationUndo = false;
                        r["guardFailed"] = failed;
                        r["guardRestored"] = GuardUndo();
                    }
                }
                return r;
            }
            finally
            {
                if (own)
                {
                    try { if (_operationUndo) undo.EndCustomRecord(); } catch (COMException) { }
                    _operationUndo = false;
                    _guardDoc = null;
                    try { _app.System.Cursor = Word.WdCursorType.wdCursorNormal; } catch (COMException) { }
                }
            }
        }

        // ------------------------------------------------------------------ text guard

        private Word.Document _guardDoc;
        private string _guardBefore, _guardBeforeFull;
        private List<int[]> _guardExclude;
        private string _guardLabel;

        private static List<int[]> ExcludeOf(Dictionary<string, object> p)
        {
            var list = new List<int[]>();
            if (p != null && p.TryGetValue("exclude", out var raw) && raw is IEnumerable items)
                foreach (var o in items)
                    if (o is Dictionary<string, object> d) list.Add(new[] { Rpc.GetInt(d, "start"), Rpc.GetInt(d, "end") });
            return list;
        }

        private void GuardStart(Word.Document doc, List<int[]> exclude)
        {
            try
            {
                _guardDoc = doc;
                _guardExclude = exclude ?? new List<int[]>();
                _guardBeforeDoc = RecordGuardDoc(doc, _guardExclude);
                _guardBefore = GuardText.Canonical(_guardBeforeDoc, _guardExclude);
                _guardBeforeFull = _guardExclude.Count > 0 ? GuardText.Canonical(_guardBeforeDoc, null) : _guardBefore;
            }
            catch (Exception ex)
            {
                Log.Error("text guard: reading the document", ex);
                _guardDoc = null;
            }
        }

        /// <summary>Null when the text outside what the operation may change is unchanged; else where it differs.</summary>
        private string GuardCheck()
        {
            if (_guardDoc == null) return null;
            string after;
            GuardDoc afterDoc;
            try
            {
                afterDoc = RecordGuardDoc(_guardDoc, null);
                after = GuardText.Canonical(afterDoc, null);
            }
            catch (Exception ex)
            {
                Log.Error("text guard: reading the document afterwards", ex);
                return null;
            }
            var what = GuardText.Difference(_guardBefore, after);
            SaveGuardFixture(afterDoc, what);
            if (what == null) return null;
            Log.Error("text guard: " + what);
            return what;
        }

        /// <summary>Cancel: undoes the operation's record; true when the guarded text is as it was before.</summary>
        private bool RollBack()
        {
            var doc = _guardDoc;
            if (doc == null)
            {
                try { return _app.ActiveDocument.Undo(1); } catch (COMException) { return false; }
            }
            try
            {
                for (int n = 0; n < 20; n++)
                {
                    if (!doc.Undo(1)) break;
                    if (CanonicalText(doc, null) == _guardBeforeFull) return true;
                }
            }
            catch (Exception ex)
            {
                Log.Error("cancel: undoing", ex);
            }
            return false;
        }

        /// <summary>Undoes until the document's text is what it was before the operation (at most 20 steps).</summary>
        private bool GuardUndo()
        {
            var doc = _guardDoc;
            if (doc == null) return false;
            try
            {
                for (int n = 0; n < 20; n++)
                {
                    if (!doc.Undo(1)) break;
                    if (CanonicalText(doc, null) == _guardBeforeFull)
                    {
                        Log.Info("text guard: the operation was undone (" + (n + 1) + " step(s))");
                        return true;
                    }
                }
            }
            catch (Exception ex)
            {
                Log.Error("text guard: undoing", ex);
            }
            return false;
        }

        /// <summary>
        /// What the guard needs of a document, read from Word: every field, equation and inline picture and list
        /// of symbols by its range, and Word's text between consecutive boundaries (extra: more ranges to cut at,
        /// such as the ranges the operation replaces). The comparison itself is GuardText (no Word; tested).
        /// </summary>
        internal static GuardDoc RecordGuardDoc(Word.Document doc, List<int[]> extra)
        {
            var d = new GuardDoc { End = doc.Content.End };
            try
            {
                foreach (Word.Field f in doc.Fields)
                {
                    try
                    {
                        var code = f.Code;
                        Word.Range result = null;
                        try { result = f.Result; } catch (COMException) { }
                        int fieldStart = Math.Max(0, code.Start - 1);
                        int fieldEnd = Math.Max(code.End, result?.End ?? code.End) + 1;
                        d.Fields.Add(new GuardField { Start = fieldStart, End = Math.Min(d.End, fieldEnd), Code = code.Text ?? "" });
                    }
                    catch (COMException) { }
                }
            }
            catch (COMException) { }
            try { foreach (Word.OMath m in doc.OMaths) d.Equations.Add(new[] { m.Range.Start, m.Range.End }); } catch (COMException) { }
            try { foreach (Word.InlineShape s in doc.InlineShapes) d.Equations.Add(new[] { s.Range.Start, s.Range.End }); } catch (COMException) { }
            // The list of symbols: its hidden marker and the table after the marker's paragraph.
            foreach (var f in d.Fields)
            {
                if (!System.Text.RegularExpressions.Regex.IsMatch(f.Code ?? "", @"^\s*MACROBUTTON\s+MBSymbolList\b")) continue;
                try
                {
                    int after = doc.Range(f.Start, f.Start).Paragraphs.First.Range.End;
                    var next = doc.Range(after, Math.Min(d.End, after + 1));
                    int listEnd = next.Tables.Count > 0 ? next.Tables[1].Range.End : after;
                    d.Lists.Add(new[] { f.Start, listEnd });
                }
                catch (COMException) { }
            }
            var all = new List<int[]>();
            foreach (var f in d.Fields) all.Add(new[] { f.Start, f.End });
            all.AddRange(d.Equations);
            all.AddRange(d.Lists);
            if (extra != null) all.AddRange(extra);
            var cuts = GuardText.Boundaries(d.End, all);
            for (int i = 0; i + 1 < cuts.Count; i++)
            {
                if (cuts[i + 1] <= cuts[i]) continue;
                d.Chunks.Add(new GuardChunk { Start = cuts[i], End = cuts[i + 1], Text = doc.Range(cuts[i], cuts[i + 1]).Text ?? "" });
            }
            return d;
        }

        /// <summary>The document's text as the guard compares it (GuardText.Canonical over a fresh record).</summary>
        internal static string CanonicalText(Word.Document doc, List<int[]> exclude) => GuardText.Canonical(RecordGuardDoc(doc, exclude), exclude);

        // Fixtures for the guard's tests: when a folder is set (self-test step), each guarded operation saves its
        // before and after records there (generic test documents only).
        internal static string GuardFixtureFolder;
        private static int _guardFixtureCount;
        private GuardDoc _guardBeforeDoc;

        internal static Dictionary<string, object> GuardDocJson(GuardDoc d)
        {
            var fields = new List<object>();
            foreach (var f in d.Fields) fields.Add(new Dictionary<string, object> { ["start"] = f.Start, ["end"] = f.End, ["code"] = f.Code });
            var chunks = new List<object>();
            foreach (var c in d.Chunks) chunks.Add(new Dictionary<string, object> { ["start"] = c.Start, ["end"] = c.End, ["text"] = c.Text });
            return new Dictionary<string, object> { ["end"] = d.End, ["fields"] = fields, ["equations"] = d.Equations, ["lists"] = d.Lists, ["chunks"] = chunks };
        }

        private void SaveGuardFixture(GuardDoc after, string verdict)
        {
            if (string.IsNullOrEmpty(GuardFixtureFolder) || _guardBeforeDoc == null || after == null) return;
            try
            {
                System.IO.Directory.CreateDirectory(GuardFixtureFolder);
                var name = string.Format("guard-{0:000}-{1}.json", ++_guardFixtureCount, System.Text.RegularExpressions.Regex.Replace(_guardLabel ?? "operation", "[^A-Za-z0-9]+", "-").Trim('-').ToLowerInvariant());
                var json = new System.Web.Script.Serialization.JavaScriptSerializer { MaxJsonLength = int.MaxValue }.Serialize(new Dictionary<string, object>
                {
                    ["operation"] = _guardLabel ?? "",
                    ["exclude"] = _guardExclude,
                    ["before"] = GuardDocJson(_guardBeforeDoc),
                    ["after"] = GuardDocJson(after),
                    ["verdict"] = verdict ?? "unchanged",
                });
                System.IO.File.WriteAllText(System.IO.Path.Combine(GuardFixtureFolder, name), json, new System.Text.UTF8Encoding(false));
            }
            catch (Exception ex)
            {
                Log.Error("text guard: saving a fixture", ex);
            }
        }

        /// <summary>Where the operation's single undo record was found closed (diagnosis: one Ctrl+Z must undo it all).</summary>
        private string _undoBrokenAt;

        /// <summary>During an operation: notes the first point at which Word no longer records our undo record.</summary>
        internal void CheckOperationUndo(string where)
        {
            if (!_operationUndo || _undoBrokenAt != null) return;
            try
            {
                if (_app.UndoRecord.IsRecordingCustomRecord) return;
                _undoBrokenAt = where;
                Log.Info("operation undo record found closed at: " + where);
            }
            catch (COMException)
            {
            }
        }

        private sealed class Owner : IWin32Window
        {
            public Owner(IntPtr h) => Handle = h;
            public IntPtr Handle { get; }
        }

        private sealed class ProgressForm : Form
        {
            private readonly ProgressBar _bar = new ProgressBar { Dock = DockStyle.Top, Height = 18 };
            private readonly Label _label = new Label { Dock = DockStyle.Top, Height = 34, TextAlign = ContentAlignment.MiddleLeft };
            private readonly Button _cancel = new Button { Text = "Cancel", Width = 90, Anchor = AnchorStyles.Right | AnchorStyles.Bottom };
            private readonly int _total;
            public bool Cancelled { get; private set; }

            public ProgressForm(string title, int total)
            {
                _total = Math.Max(1, total);
                Text = title;
                FormBorderStyle = FormBorderStyle.FixedDialog;
                ControlBox = false;
                ShowInTaskbar = false;
                StartPosition = FormStartPosition.CenterParent;
                ClientSize = new Size(380, 104);
                Padding = new Padding(14);
                Font = SystemFonts.MessageBoxFont;
                _bar.Maximum = _total;
                _label.Text = "Starting… Please do not click into the document.";
                _cancel.Location = new Point(ClientSize.Width - 14 - _cancel.Width, ClientSize.Height - 12 - _cancel.Height);
                _cancel.Click += (s, e) =>
                {
                    Cancelled = true;
                    _cancel.Enabled = false;
                    _label.Text = "Cancelling: restoring the equations already changed…";
                };
                Controls.Add(_bar);
                Controls.Add(_label);
                Controls.Add(_cancel);
            }

            public void SetDone(int done, string text)
            {
                _bar.Value = Math.Max(0, Math.Min(_total, done));
                if (!Cancelled) _label.Text = text ?? (done + " / " + _total + " equations");
            }
        }
    }
}
