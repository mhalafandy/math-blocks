using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// Entry point Word loads (COM add-in). Bridges Word and the MathBlocks app:
    /// ribbon, Word events, and requests arriving over the named pipe.
    /// Every callback is wrapped in try/catch: an exception escaping into Word would get the
    /// add-in disabled.
    /// </summary>
    [ComVisible(true)]
    [Guid("B18397FB-F3F1-4634-AC20-9DEA0673976A")]
    [ProgId("MathBlocks.WordConnector")]
    [ClassInterface(ClassInterfaceType.AutoDispatch)]
    public class Connect : IDTExtensibility2, IRibbonExtensibility
    {
        private Word.Application _app;
        private WordOps _ops;
        private PipeClient _pipe;
        private Control _ui; // marshals work from the pipe thread onto Word's main thread
        private Timer _idle; // selection-change work, run once Word is idle (never inside Word's own operations)

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int key);

        private static bool MouseButtonDown() => (GetAsyncKeyState(0x01) & 0x8000) != 0 || (GetAsyncKeyState(0x02) & 0x8000) != 0;
        private int _nextId = 1;

        // ------------------------------------------------------------ IDTExtensibility2

        public void OnConnection(object application, ext_ConnectMode connectMode, object addInInst, ref Array custom)
        {
            try
            {
                _app = (Word.Application)application;
                _ops = new WordOps(_app);
                _ops.IdleChecks = IdleChecks;
                _ui = new Control();
                _idle = new Timer { Interval = 400 };
                _idle.Tick += (o, e) => OnIdle();
                _ui.CreateControl();
                _ = _ui.Handle; // force handle creation on this (main) thread

                _app.WindowBeforeDoubleClick += OnWindowBeforeDoubleClick;
                _app.WindowBeforeRightClick += OnWindowBeforeRightClick;
                _app.WindowSelectionChange += OnWindowSelectionChange;
                _app.DocumentOpen += OnDocumentOpen;
                _app.DocumentBeforeSave += OnDocumentBeforeSave;

                // Pastes follow Word's "Insert/paste pictures as" option: a floating setting makes pasted equations float.
                try
                {
                    Log.Info("Word option Insert/paste pictures as: " + _app.Options.PictureWrapType);
                }
                catch (Exception)
                {
                }
                // Documents already open: the same checks as when a document opens.
                try
                {
                    foreach (Word.Document d in _app.Documents)
                        if (WordOps.HasEquations(d)) _ops.OnOpen(d);
                }
                catch (Exception ex)
                {
                    Log.Error("checking equations at start", ex);
                }

                _pipe = new PipeClient(PipeClient.DefaultPipeName());
                _pipe.LineReceived += OnLine;
                _pipe.ConnectionChanged += connected => { if (connected) OnUi(SendHello); };
                _pipe.Start();
                Log.Info("connector " + Version + " loaded in Word " + _app.Build + " (" + connectMode + ", " + _app.Documents.Count + " document(s) open)");
                // Loaded mid-session (enabled again in COM Add-ins): attach to every window already open.
                if (connectMode == ext_ConnectMode.ext_cm_AfterStartup) AttachToOpenWindows();
            }
            catch (Exception ex)
            {
                Log.Error("OnConnection failed", ex);
            }
        }

        public void OnDisconnection(ext_DisconnectMode removeMode, ref Array custom)
        {
            try
            {
                _pipe?.Dispose();
                if (_app != null)
                {
                    _app.WindowBeforeDoubleClick -= OnWindowBeforeDoubleClick;
                    _app.WindowBeforeRightClick -= OnWindowBeforeRightClick;
                    _app.WindowSelectionChange -= OnWindowSelectionChange;
                    _app.DocumentOpen -= OnDocumentOpen;
                    _app.DocumentBeforeSave -= OnDocumentBeforeSave;
                }
                _ui?.Dispose();
                Log.Info("connector unloaded");
            }
            catch (Exception ex)
            {
                Log.Error("OnDisconnection failed", ex);
            }
        }

        public void OnAddInsUpdate(ref Array custom) { }

        /// <summary>
        /// After a mid-session load, windows that were already open may not route clicks to the add-in until
        /// they are activated again (closing and reopening Word did it before). Each open window is activated
        /// once, then the window the user was in comes back; the open documents get their checks.
        /// </summary>
        private void AttachToOpenWindows()
        {
            var t = new Timer { Interval = 800 };
            t.Tick += (o, e) =>
            {
                t.Stop();
                t.Dispose();
                try
                {
                    Word.Window current = null;
                    try { current = _app.ActiveWindow; } catch (Exception) { }
                    var windows = new List<Word.Window>();
                    foreach (Word.Window w in _app.Windows) windows.Add(w);
                    bool screen = _app.ScreenUpdating;
                    _app.ScreenUpdating = false;
                    try
                    {
                        foreach (var w in windows)
                        {
                            try { w.Activate(); } catch (Exception) { }
                        }
                        try { current?.Activate(); } catch (Exception) { }
                    }
                    finally
                    {
                        _app.ScreenUpdating = screen;
                    }
                    Log.Info("attached to " + windows.Count + " open window(s) after a mid-session load");
                }
                catch (Exception ex)
                {
                    Log.Error("attaching to open windows", ex);
                }
            };
            t.Start();
        }

        /// <summary>Logs the first event of each kind after loading (diagnosis: does Word deliver them to this window?).</summary>
        private void NoteFirst(string what)
        {
            if (_firstEvents.Add(what)) Log.Info("first " + what + " event received");
        }
        private readonly HashSet<string> _firstEvents = new HashSet<string>();

        public void OnStartupComplete(ref Array custom) { }

        public void OnBeginShutdown(ref Array custom) { }

        /// <summary>Build version (CI stamps 0.1.&lt;build&gt;; the COM AssemblyVersion stays fixed).</summary>
        internal static string Version
        {
            get
            {
                var info = Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
                if (string.IsNullOrEmpty(info)) return Assembly.GetExecutingAssembly().GetName().Version.ToString(3);
                var plus = info.IndexOf('+');
                return plus > 0 ? info.Substring(0, plus) : info;
            }
        }

        /// <summary>Requests this add-in understands (sent in hello, so the app can detect an old add-in).</summary>
        private static readonly string[] Methods =
        {
            "ping", "insertEquation", "replaceEquation", "readEquation", "documentInfo",
            "listInstances", "replaceMany", "verifyMany", "scanInterchange", "convertInterchange", "retag", "selectInstance", "getRegistry", "setRegistry",
            "listMathTypeParagraphs", "replaceParagraphs", "activateObject",
            "numberEquation", "unnumberEquation", "listNumbered", "insertReference", "updateNumbers",
            "showWordMenu", "selectionInfo", "findLatex", "replaceRanges", "equationToText",
            "backupDocument", "beginOperation", "operationProgress", "endOperation", "repairEquations",
            "insertNumberMarker", "markerBefore", "upgradeNumbering", "textWidth", "confirm", "showMessage", "smoke",
        };

        // ------------------------------------------------------------ ribbon

        public string GetCustomUI(string ribbonId) => ReadResource("MathBlocks.WordConnector.Ribbon.xml");

        public void OnOpenApp(IRibbonControl control)
        {
            try
            {
                if (_pipe.IsConnected)
                {
                    SendRequest("showApp", new Dictionary<string, object>());
                    return;
                }
                foreach (var exe in CandidateAppPaths())
                {
                    if (!File.Exists(exe)) continue;
                    Process.Start(exe);
                    return;
                }
                MessageBox.Show("The MathBlocks app was not found. Start it from the Start menu.", "MathBlocks",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                Log.Error("OnOpenApp failed", ex);
            }
        }

        public void OnInsertSample(IRibbonControl control)
        {
            try
            {
                var result = _ops.InsertEquation(new Dictionary<string, object>
                {
                    ["flatOpc"] = ReadResource("MathBlocks.WordConnector.SampleEquation.xml"),
                    ["tag"] = "mb1|-|SampleTest01",
                    ["undoLabel"] = "Insert test equation",
                });
                Log.Info("sample inserted, controls with sample tag: " + result["found"]);
            }
            catch (Exception ex)
            {
                Log.Error("OnInsertSample failed", ex);
                MessageBox.Show(ex.Message, "MathBlocks", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        /// <summary>Ribbon buttons whose work happens in the app (it shows the dialogs).</summary>
        private void RunAppCommand(string command)
        {
            try
            {
                if (_pipe == null || !_pipe.IsConnected)
                {
                    OnOpenApp(null);
                    MessageBox.Show("Start the MathBlocks app, then press the button again.", "MathBlocks", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                var prm = new Dictionary<string, object> { ["command"] = command, ["document"] = _app.ActiveDocument.FullName };
                try
                {
                    // Commands such as Convert LaTeX act on the selection when there is one (as MathType's Alt+\).
                    prm["hasSelection"] = _app.Selection.Start != _app.Selection.End;
                }
                catch (COMException)
                {
                }
                if (command == "numberEquation")
                {
                    // The MathBlocks equation the cursor is in.
                    var doc = _app.ActiveDocument;
                    var cc = _ops.EquationAt(doc, _app.Selection.Range);
                    if (cc != null)
                    {
                        var problem = _ops.PrepareRead(doc, ref cc, "number command", out var fingerprint);
                        prm["tag"] = cc.Tag;
                        prm["fingerprint"] = fingerprint;
                        prm["numbered"] = WordOps.NumberInfo(cc) != null;
                        if (problem != null) prm["problem"] = "This equation cannot be numbered safely: " + problem + ".";
                        else prm["flatOpc"] = WordOps.PictureXmlForApp(cc);
                    }
                }
                SendRequest("runCommand", prm);
            }
            catch (Exception ex)
            {
                Log.Error("command " + command + " failed", ex);
            }
        }

        public void OnConvertMathType(IRibbonControl control) => RunAppCommand("convertMathType");
        public void OnConvertLatex(IRibbonControl control) => RunAppCommand("convertLatex");
        /// <summary>Ribbon "Insert reference": handled in Word (picker over Word), the app is not needed.</summary>
        public void OnInsertReference(IRibbonControl control)
        {
            try
            {
                _ops.PickAndInsertReference(false);
            }
            catch (Exception ex)
            {
                Log.Error("insert reference failed", ex);
                MessageBox.Show(ex.Message, "MathBlocks", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        public void OnRepairEquations(IRibbonControl control) => RunAppCommand("repair");
        public void OnSelfTest(IRibbonControl control) => RunAppCommand("selfTest");
        public void OnSelfTestSpike(IRibbonControl control) => RunAppCommand("selfTestSpike");
        public void OnListOfSymbols(IRibbonControl control) => RunAppCommand("listOfSymbols");
        public void OnNumberEquation(IRibbonControl control) => RunAppCommand("numberEquation");
        public void OnSectionMarker(IRibbonControl control) => RunAppCommand("sectionMarker");

        public void OnUpdateNumbers(IRibbonControl control)
        {
            try
            {
                var r = _ops.UpdateNumbers(new Dictionary<string, object>());
                _app.StatusBar = "MathBlocks: updated " + r["numbers"] + " equation number(s) and " + r["references"] + " reference(s)";
                // References to equations that are gone: listed, so none stays unnoticed.
                if (r.TryGetValue("broken", out var b) && b is List<object> broken && broken.Count > 0)
                {
                    var lines = new List<string>();
                    foreach (var o in broken)
                        if (o is Dictionary<string, object> d) lines.Add("• " + d["snippet"] + "   (" + d["bookmark"] + ")");
                    MessageBox.Show(broken.Count + " reference(s) point to an equation that no longer exists (Word shows \"Error! Reference source not found\" there):\n\n" + string.Join("\n", lines.Count > 20 ? lines.GetRange(0, 20) : lines) + (lines.Count > 20 ? "\n… and " + (lines.Count - 20) + " more" : "") + "\n\nDelete them or insert a new reference.",
                        "MathBlocks — broken references", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
            catch (Exception ex)
            {
                Log.Error("update numbers failed", ex);
                MessageBox.Show(ex.Message, "MathBlocks", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        public void OnStatus(IRibbonControl control)
        {
            var state = _pipe != null && _pipe.IsConnected ? "Connected to the MathBlocks app." : "Not connected. Start the MathBlocks app.";
            MessageBox.Show(
                state + "\n\nConnector " + Version + "\nWord " + _app.Build + "\nPipe: " + PipeClient.DefaultPipeName() + "\nLog: " + Log.FilePath,
                "MathBlocks", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private static IEnumerable<string> CandidateAppPaths()
        {
            var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            yield return Path.Combine(local, "MathBlocks", "MathBlocks.exe");
            yield return Path.Combine(local, "Programs", "MathBlocks", "MathBlocks.exe");
            yield return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "MathBlocks", "MathBlocks.exe");
        }

        // ------------------------------------------------------------ Word events

        /// <summary>
        /// Right-click on a MathBlocks equation.
        /// - Classic equation (a picture): Word ignores Cancel for pictures, so cancelling and opening our
        ///   floating editor showed two menus. Word's own picture menu shows instead, with "Edit equation"
        ///   and "Number equation" at the top (Ribbon.xml contextMenus); double-click opens the editor.
        /// - Native equation (in its wrapper): Cancel works, the floating editor opens instead of the menu.
        /// Nothing in the document changes here.
        /// </summary>
        private void OnWindowBeforeRightClick(Word.Selection sel, ref bool cancel)
        {
            NoteFirst("right-click");
            try
            {
                if (_pipe == null || !_pipe.IsConnected) return;
                if (FloatingMathBlocksSelected(sel)) return; // Word's menu (with our items); it goes in line when idle
                var doc = _app.ActiveDocument;
                var cc = _ops.EquationAt(doc, sel.Range);
                // A Classic equation is an embedded object: Word honours Cancel for objects (round 7),
                // so the floating editor opens instead of Word's menu. An older Classic picture keeps
                // Word's picture menu (Word ignores Cancel there) with our items.
                if (cc == null || (cc.IsPicture && !cc.IsObject)) return;
                cancel = true;
                OpenPanel(doc, cc);
            }
            catch (Exception ex)
            {
                Log.Error("right-click handler failed", ex);
            }
        }

        private void OpenPanel(Word.Document doc, Eq cc)
        {
            var rect = ScreenRect(cc.Range);
            var panel = rect ?? new Dictionary<string, object> { ["left"] = 200, ["top"] = 200, ["width"] = 0, ["height"] = 0 };
            SendActivated(doc, cc, "panel", new Dictionary<string, object> { ["panel"] = panel });
        }

        /// <summary>Word's picture menu → "Edit equation": the floating editor on the selected equation.</summary>
        public void OnMenuEdit(IRibbonControl control)
        {
            try
            {
                if (_pipe == null || !_pipe.IsConnected)
                {
                    OnOpenApp(control);
                    return;
                }
                var doc = _app.ActiveDocument;
                var sel = _app.Selection;
                var cc = FloatingMathBlocksSelected(sel) ? AdoptPastedPicture(sel) : _ops.EquationAt(doc, sel.Range) ?? AdoptPastedPicture(sel);
                if (cc != null) OpenPanel(doc, cc);
            }
            catch (Exception ex)
            {
                Log.Error("menu: edit equation failed", ex);
            }
        }

        public void OnMenuNumber(IRibbonControl control) => RunAppCommand("numberEquation");

        /// <summary>The MathBlocks items show in Word's picture menu only when the picture is a MathBlocks equation.</summary>
        public bool GetMenuVisible(IRibbonControl control) => WordOps.MenuVisible(_app.Selection);

        /// <summary>
        /// Sends the equation in a wrapper to the app, after checking the wrapper holds exactly one
        /// equation (and giving a copied wrapper its own ID). A wrapper holding more is not opened:
        /// the app is told what it holds, and offers Repair equations.
        /// </summary>
        private void SendActivated(Word.Document doc, Eq cc, string what, Dictionary<string, object> extra)
        {
            var prm = _ops.Activation(doc, cc, what);
            if (extra != null) foreach (var kv in extra) prm[kv.Key] = kv.Value;
            SendRequest("equationActivated", prm);
        }

        /// <summary>A floating (not in-line) MathBlocks picture is selected. An in-line picture never counts.</summary>
        private static bool FloatingMathBlocksSelected(Word.Selection sel)
        {
            try
            {
                if (sel.Type != Word.WdSelectionType.wdSelectionShape) return false;
                if (sel.ShapeRange.Count == 0) return false;
                foreach (Word.Shape sh in sel.ShapeRange)
                {
                    if (sh.WrapFormat.Type == Word.WdWrapType.wdWrapInline) continue;
                    if (WordOps.IsMathBlocksShape(sh)) return true;
                }
            }
            catch (Exception)
            {
            }
            return false;
        }

        private bool _guarding;

        /// <summary>
        /// Selection change also fires in the middle of Word's own operations (drag and drop, paste,
        /// typing): changing the document or the selection then can make Word delete the wrong text
        /// (a drag removes its source by position). So nothing happens here but (re)starting a short
        /// idle timer; the work runs when Word is idle and no mouse button is down.
        /// </summary>
        private void OnWindowSelectionChange(Word.Selection sel)
        {
            NoteFirst("selection change");
            try
            {
                if (_guarding || _idle == null) return;
                _idle.Stop();
                _idle.Start();
            }
            catch (Exception ex)
            {
                Log.Error("selection change", ex);
            }
        }

        /// <summary>
        /// Once idle after a selection change: a selected floating MathBlocks picture goes back in line;
        /// after a paste, drop or deletion (picture counts changed) floating pictures go back in line and
        /// duplicated IDs near the selection are resolved; the caret is kept out of a native wrapper's
        /// edges; typing after an equation is not lowered.
        /// </summary>
        /// <summary>What runs once Word is idle after a selection change (also called by the self-test).</summary>
        private void IdleChecks()
        {
            var sel = _app.Selection;
            if (FloatingMathBlocksSelected(sel))
            {
                var eq = AdoptPastedPicture(sel);
                if (eq != null) _app.StatusBar = "MathBlocks: the pasted equation was put back in line with the text.";
            }
            _ops.WatchChanges(sel);
            _ops.GuardCaret(sel);
        }

        private void OnIdle()
        {
            _idle.Stop();
            if (_guarding) return;
            try
            {
                if (MouseButtonDown())
                {
                    _idle.Start(); // a drag or a selection in progress: later
                    return;
                }
                if (_app.Documents.Count == 0) return;
                if (_app.UndoRecord.IsRecordingCustomRecord) return; // our own command is running
                if (_ops.Testing) return; // the self-test runs these checks itself, at known moments
                _guarding = true;
                IdleChecks();
            }
            catch (Exception ex)
            {
                Log.Error("idle checks", ex);
            }
            finally
            {
                _guarding = false;
            }
        }

        /// <summary>The MathBlocks picture under the selection that is floating or has no ID title, identified again; null otherwise.</summary>
        private Eq AdoptPastedPicture(Word.Selection sel)
        {
            try
            {
                var doc = _app.ActiveDocument;
                var shape = _ops.UnwrappedPictureAt(doc, sel.Range, out var how);
                if (shape == null) return null;
                WordOps.MathBlocksData(shape.Range.WordOpenXML, out var json);
                var block = json != null ? System.Text.RegularExpressions.Regex.Match(json, "\"block\"\\s*:\\s*\"([0-9A-Za-z]{16})\"").Groups[1].Value : null;
                var tag = _ops.AdoptPicture(doc, shape, block);
                Log.Info("pasted picture (" + how + ") adopted as " + tag);
                var found = WordOps.FindByTag(doc, tag);
                if (found.Count > 0) return found[0];
            }
            catch (Exception ex)
            {
                Log.Error("adopting a pasted picture failed", ex);
            }
            return null;
        }

        /// <summary>Screen rectangle of a range in pixels (null when Word cannot tell).</summary>
        private Dictionary<string, object> ScreenRect(Word.Range r)
        {
            try
            {
                _app.ActiveWindow.GetPoint(out int left, out int top, out int width, out int height, r);
                return new Dictionary<string, object> { ["left"] = left, ["top"] = top, ["width"] = width, ["height"] = height };
            }
            catch (COMException)
            {
                return null;
            }
        }

        private void OnWindowBeforeDoubleClick(Word.Selection sel, ref bool cancel)
        {
            NoteFirst("double-click");
            try
            {
                if (_pipe == null || !_pipe.IsConnected)
                {
                    // The app is not running: no "server application cannot be found" from Word for our
                    // objects; the app is started instead.
                    if (WordOps.MathBlocksObjectIn(sel) != null)
                    {
                        cancel = true;
                        _app.StatusBar = "MathBlocks: starting the MathBlocks app — double-click the equation again once it is open.";
                        foreach (var exe in CandidateAppPaths())
                        {
                            if (!File.Exists(exe)) continue;
                            Process.Start(exe);
                            break;
                        }
                    }
                    return;
                }
                // A MathBlocks embedded object: intercepted before Word tries to activate it (no server, no prompt).
                var obj = WordOps.MathBlocksObjectIn(sel);
                if (obj != null)
                {
                    cancel = true;
                    var eq = _ops.EquationAt(_app.ActiveDocument, sel.Range);
                    if (eq != null) SendActivated(_app.ActiveDocument, eq, "double-click", null);
                    else Log.Info("double-click on a MathBlocks object that has no ID yet");
                    return;
                }
                var doc = _app.ActiveDocument;
                var cc = _ops.EquationAt(doc, sel.Range);
                if (cc != null)
                {
                    cancel = true;
                    SendActivated(doc, cc, "double-click", null);
                    return;
                }
                // A pasted MathBlocks picture that lost its wrapper: wrap it again (new identity).
                var adopted = AdoptPastedPicture(sel);
                if (adopted != null)
                {
                    cancel = true;
                    SendActivated(doc, adopted, "double-click (re-wrapped)", new Dictionary<string, object> { ["repaired"] = true });
                    return;
                }
                // A MathType equation: offer to convert it and edit it in MathBlocks.
                var mathType = WordOps.MathTypeAt(_app.ActiveDocument, sel);
                if (mathType != null)
                {
                    cancel = true;
                    Log.Info("mathTypeActivated in paragraph " + mathType["start"]);
                    SendRequest("mathTypeActivated", mathType);
                    return;
                }
                // A native Word equation (typed in Word or pasted): wrap it so MathBlocks can update it.
                Word.OMath math = null;
                foreach (Word.OMath m in sel.Range.OMaths)
                {
                    math = m;
                    break;
                }
                if (math == null)
                {
                    Log.Info("double-click: no MathBlocks control and no Word equation in the selection");
                    return;
                }
                cancel = true;
                var newTag = _ops.AdoptEquation(math);
                var wrapped = _app.ActiveDocument.SelectContentControlsByTag(newTag);
                foreach (Word.ContentControl w in wrapped)
                {
                    Log.Info("equationActivated (adopted) " + newTag + " (has math: " + w.Range.WordOpenXML.Contains("oMath") + ")");
                    SendRequest("equationActivated", new Dictionary<string, object> { ["tag"] = newTag, ["flatOpc"] = w.Range.WordOpenXML, ["adopted"] = true });
                    break;
                }
            }
            catch (Exception ex)
            {
                Log.Error("double-click handler failed", ex);
            }
        }

        private bool _highlight;

        /// <summary>Ribbon toggle: frame linked equations in every open document.</summary>
        public void OnToggleHighlight(IRibbonControl control, bool pressed)
        {
            try
            {
                _highlight = pressed;
                var n = _ops.HighlightLinked(pressed);
                Log.Info((pressed ? "highlighted " : "unhighlighted ") + n + " linked equation(s)");
            }
            catch (Exception ex)
            {
                Log.Error("highlight failed", ex);
            }
        }

        public bool GetHighlightPressed(IRibbonControl control) => _highlight;

        private void OnDocumentOpen(Word.Document doc)
        {
            try
            {
                // Floating equations back in line, copied IDs resolved, wrappers unlocked (an older build locked them).
                try
                {
                    if (WordOps.HasEquations(doc)) _ops.OnOpen(doc);
                }
                catch (Exception ex)
                {
                    Log.Error("checking equations on open", ex);
                }
                if (_pipe == null || !_pipe.IsConnected) return;
                if (!WordOps.HasEquations(doc)) return;
                SendRequest("documentOpened", new Dictionary<string, object> { ["name"] = doc.Name, ["fullName"] = doc.FullName });
            }
            catch (Exception ex)
            {
                Log.Error("DocumentOpen handler failed", ex);
            }
        }

        /// <summary>The old .doc format turns equations into pictures and drops MathBlocks wrappers: warn.</summary>
        private void OnDocumentBeforeSave(Word.Document doc, ref bool saveAsUI, ref bool cancel)
        {
            try
            {
                if (saveAsUI) return; // "Save As": the target format is not known yet.
                if (doc.SaveFormat != (int)Word.WdSaveFormat.wdFormatDocument) return;
                if (!WordOps.HasEquations(doc)) return;
                var answer = MessageBox.Show(
                    "This document is in the old Word 97-2003 format (.doc).\n\n" +
                    "Saving in this format turns equations into pictures and removes MathBlocks links. " +
                    "Use File > Save As > Word Document (*.docx) to keep them editable.\n\nSave as .doc anyway?",
                    "MathBlocks", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2);
                if (answer == DialogResult.No) cancel = true;
            }
            catch (Exception ex)
            {
                Log.Error("DocumentBeforeSave handler failed", ex);
            }
        }

        // ------------------------------------------------------------ pipe

        private void OnUi(Action action)
        {
            try
            {
                _ui.BeginInvoke(new MethodInvoker(() =>
                {
                    try { action(); }
                    catch (Exception ex) { Log.Error("UI action failed", ex); }
                }));
            }
            catch (Exception ex)
            {
                Log.Error("could not marshal to Word's thread", ex);
            }
        }

        private void SendHello()
        {
            SendRequest("hello", new Dictionary<string, object>
            {
                ["client"] = "word-connector",
                ["protocolVersion"] = Rpc.ProtocolVersion,
                ["connectorVersion"] = Version,
                ["hostVersion"] = _app.Version,
                ["hostBuild"] = _app.Build,
                ["methods"] = Methods,
            });
        }

        private void SendRequest(string method, Dictionary<string, object> parameters)
        {
            _pipe.Send(Rpc.Request(_nextId++, method, parameters));
        }

        /// <summary>Pipe thread: parse, then handle requests on Word's main thread.</summary>
        private void OnLine(string line)
        {
            Dictionary<string, object> msg;
            try
            {
                msg = Rpc.Parse(line);
            }
            catch (Exception ex)
            {
                Log.Error("invalid JSON from app", ex);
                return;
            }
            if (!msg.TryGetValue("method", out var m) || !(m is string method))
            {
                if (msg.TryGetValue("error", out var err)) Log.Error("app returned an error: " + Rpc.Result(null, err));
                return; // response to one of our requests
            }
            msg.TryGetValue("id", out var id);
            var p = msg.TryGetValue("params", out var raw) ? raw as Dictionary<string, object> : null;
            OnUi(() => Handle(id, method, p ?? new Dictionary<string, object>()));
        }

        private void Handle(object id, string method, Dictionary<string, object> p)
        {
            string reply;
            try
            {
                object result;
                switch (method)
                {
                    case "ping": result = new Dictionary<string, object> { ["pong"] = true }; break;
                    case "insertEquation": result = _ops.InsertEquation(p); break;
                    case "replaceEquation": result = _ops.ReplaceEquation(p); break;
                    case "listInstances": result = _ops.ListInstances(p); break;
                    case "replaceMany": result = _ops.ReplaceMany(p); break;
                    case "verifyMany": p["verifyOnly"] = true; result = _ops.ReplaceMany(p); break;
                    case "scanInterchange": result = _ops.ScanInterchange(p); break;
                    case "convertInterchange": result = _ops.ConvertInterchange(p); break;
                    case "backupDocument": result = _ops.BackupDocument(p); break;
                    case "repairEquations": result = _ops.RepairEquations(p); break;
                    case "insertNumberMarker": result = _ops.InsertNumberMarker(p); break;
                    case "markerBefore": result = _ops.MarkerBefore(p); break;
                    case "upgradeNumbering": result = _ops.UpgradeNumbering(p); break;
                    case "textWidth": result = _ops.TextWidth(p); break;
                    case "confirm": result = _ops.Confirm(p); break;
                    case "showMessage": result = _ops.ShowMessage(p); break;
                    case "beginOperation": result = _ops.BeginOperation(p); break;
                    case "operationProgress": result = _ops.OperationProgress(p); break;
                    case "endOperation": result = _ops.EndOperation(p); break;
                    case "retag": result = _ops.Retag(p); break;
                    case "selectInstance": result = _ops.SelectInstance(p); break;
                    case "getRegistry": result = _ops.GetRegistry(p); break;
                    case "setRegistry": result = _ops.SetRegistry(p); break;
                    case "readEquation": result = _ops.ReadEquation(p); break;
                    case "documentInfo": result = _ops.DocumentInfo(); break;
                    case "listMathTypeParagraphs": result = _ops.ListMathTypeParagraphs(p); break;
                    case "replaceParagraphs": result = _ops.ReplaceParagraphs(p); break;
                    case "activateObject": result = _ops.ActivateObject(p); break;
                    case "numberEquation": result = _ops.NumberEquation(p); break;
                    case "unnumberEquation": result = _ops.UnnumberEquation(p); break;
                    case "listNumbered": result = _ops.ListNumbered(p); break;
                    case "insertReference": result = _ops.InsertReference(p); break;
                    case "updateNumbers": result = _ops.UpdateNumbers(p); break;
                    case "selectionInfo": result = _ops.SelectionInfo(p); break;
                    case "findLatex": result = _ops.FindLatex(p); break;
                    case "replaceRanges": result = _ops.ReplaceRanges(p); break;
                    case "equationToText": result = _ops.EquationToText(p); break;
                    case "smoke": result = _ops.Smoke(p); break;
                    case "showWordMenu":
                        // Word's own context menu at the mouse (late-bound: CommandBars lives in office.dll).
                        ((dynamic)_app).CommandBars["Text"].ShowPopup();
                        result = new Dictionary<string, object> { ["ok"] = true };
                        break;
                    default: throw new RpcException(Rpc.MethodNotFound, "Unknown method " + method);
                }
                reply = Rpc.Result(id, result);
            }
            catch (RpcException ex)
            {
                reply = Rpc.Error(id, ex.Code, ex.Message);
            }
            catch (COMException ex)
            {
                Log.Error(method + " rejected by Word", ex);
                reply = Rpc.Error(id, Rpc.WordRejected, ex.Message);
            }
            catch (Exception ex)
            {
                Log.Error(method + " failed", ex);
                reply = Rpc.Error(id, Rpc.Internal, ex.Message);
            }
            if (id != null) _pipe.Send(reply);
        }

        private static string ReadResource(string name)
        {
            using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
            using (var r = new StreamReader(s ?? throw new InvalidOperationException("Missing resource " + name)))
                return r.ReadToEnd();
        }
    }
}
