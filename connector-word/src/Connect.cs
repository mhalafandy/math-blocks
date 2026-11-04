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
        private int _nextId = 1;

        // ------------------------------------------------------------ IDTExtensibility2

        public void OnConnection(object application, ext_ConnectMode connectMode, object addInInst, ref Array custom)
        {
            try
            {
                _app = (Word.Application)application;
                _ops = new WordOps(_app);
                _ui = new Control();
                _ui.CreateControl();
                _ = _ui.Handle; // force handle creation on this (main) thread

                _app.WindowBeforeDoubleClick += OnWindowBeforeDoubleClick;
                _app.WindowBeforeRightClick += OnWindowBeforeRightClick;
                _app.DocumentOpen += OnDocumentOpen;
                _app.DocumentBeforeSave += OnDocumentBeforeSave;

                _pipe = new PipeClient(PipeClient.DefaultPipeName());
                _pipe.LineReceived += OnLine;
                _pipe.ConnectionChanged += connected => { if (connected) OnUi(SendHello); };
                _pipe.Start();
                Log.Info("connector " + Version + " loaded in Word " + _app.Build);
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

        public void OnStartupComplete(ref Array custom) { }

        public void OnBeginShutdown(ref Array custom) { }

        /// <summary>Build version (CI stamps 0.1.&lt;build&gt;; the COM AssemblyVersion stays fixed).</summary>
        private static string Version
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
            "listInstances", "replaceMany", "retag", "selectInstance", "getRegistry", "setRegistry",
            "listMathTypeParagraphs", "replaceParagraphs", "activateObject",
            "numberEquation", "unnumberEquation", "listNumbered", "insertReference", "updateNumbers",
            "showWordMenu", "selectionInfo", "findLatex", "replaceRanges", "equationToText",
            "backupDocument", "beginOperation", "operationProgress", "endOperation", "repairEquations",
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
                if (command == "numberEquation")
                {
                    // The MathBlocks equation the cursor is in.
                    var cc = _app.Selection.Range.ParentContentControl;
                    if (cc == null)
                        foreach (Word.ContentControl c in _app.Selection.Range.ContentControls) { cc = c; break; }
                    if (cc?.Tag != null && cc.Tag.StartsWith(WordOps.TagPrefix, StringComparison.Ordinal))
                    {
                        prm["tag"] = cc.Tag;
                        prm["flatOpc"] = cc.Range.WordOpenXML;
                        prm["numbered"] = WordOps.NumberInfo(cc) != null;
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
        public void OnInsertReference(IRibbonControl control) => RunAppCommand("insertReference");
        public void OnListOfSymbols(IRibbonControl control) => RunAppCommand("listOfSymbols");
        public void OnNumberEquation(IRibbonControl control) => RunAppCommand("numberEquation");

        public void OnUpdateNumbers(IRibbonControl control)
        {
            try
            {
                var r = _ops.UpdateNumbers(new Dictionary<string, object>());
                _app.StatusBar = "MathBlocks: updated " + r["numbers"] + " equation number(s) and " + r["references"] + " reference(s)";
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
        /// Right-click on a MathBlocks equation: instead of Word's menu, the app shows its floating
        /// editor next to the equation (the panel has a "Word menu" button for cut/copy/paste).
        /// </summary>
        private void OnWindowBeforeRightClick(Word.Selection sel, ref bool cancel)
        {
            try
            {
                if (_pipe == null || !_pipe.IsConnected) return;
                var cc = sel.Range.ParentContentControl;
                if (cc == null)
                    foreach (Word.ContentControl c in sel.Range.ContentControls) { cc = c; break; }
                var tag = cc?.Tag;
                if (tag == null || !tag.StartsWith(WordOps.TagPrefix, StringComparison.Ordinal))
                {
                    // A pasted MathBlocks picture that lost its wrapper: wrap it again (new identity).
                    cc = AdoptPastedPicture(sel);
                    tag = cc?.Tag;
                    if (tag == null) return;
                }
                cancel = true;
                var xml = cc.Range.WordOpenXML;
                WordOps.LogMathStructure("panel", xml);
                var rect = ScreenRect(cc.Range);
                Log.Info("panel for " + tag + " at " + (rect == null ? "?" : rect["left"] + "," + rect["top"]));
                SendRequest("equationActivated", new Dictionary<string, object>
                {
                    ["tag"] = tag,
                    ["flatOpc"] = xml,
                    ["number"] = WordOps.NumberInfo(cc),
                    ["panel"] = rect ?? new Dictionary<string, object> { ["left"] = 200, ["top"] = 200, ["width"] = 0, ["height"] = 0 },
                });
            }
            catch (Exception ex)
            {
                Log.Error("right-click handler failed", ex);
            }
        }

        /// <summary>Wraps the MathBlocks picture under the selection if it lost its content control; null otherwise.</summary>
        private Word.ContentControl AdoptPastedPicture(Word.Selection sel)
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
                foreach (Word.ContentControl c in doc.SelectContentControlsByTag(tag)) return c;
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
            try
            {
                if (_pipe == null || !_pipe.IsConnected) return;
                var cc = sel.Range.ParentContentControl;
                var tag = cc?.Tag;
                if (tag != null && tag.StartsWith(WordOps.TagPrefix, StringComparison.Ordinal))
                {
                    cancel = true;
                    var xml = cc.Range.WordOpenXML;
                    Log.Info("equationActivated " + tag + " (" + xml.Length + " chars, has math: " + xml.Contains("oMath") + ")");
                    WordOps.LogMathStructure("equationActivated", xml);
                    SendRequest("equationActivated", new Dictionary<string, object> { ["tag"] = tag, ["flatOpc"] = xml, ["number"] = WordOps.NumberInfo(cc) });
                    return;
                }
                // A pasted MathBlocks picture that lost its wrapper: wrap it again (new identity).
                var adopted = AdoptPastedPicture(sel);
                if (adopted != null)
                {
                    cancel = true;
                    SendRequest("equationActivated", new Dictionary<string, object> { ["tag"] = adopted.Tag, ["flatOpc"] = adopted.Range.WordOpenXML, ["number"] = WordOps.NumberInfo(adopted), ["repaired"] = true });
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
                    case "backupDocument": result = _ops.BackupDocument(p); break;
                    case "repairEquations": result = _ops.RepairEquations(p); break;
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
