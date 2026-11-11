using System;
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
            EndOperationCore();
            if (done > 0) Log.Info("operation finished: " + done + " equation(s) in " + ms + " ms (" + (ms / Math.Max(1, done)) + " ms each)");
            return new Dictionary<string, object> { ["ms"] = ms, ["undoBrokenAt"] = broken };
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
