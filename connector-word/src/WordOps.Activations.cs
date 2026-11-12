using System;
using System.Collections.Generic;
using System.Diagnostics;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// Which Word window came to the front, when, and during which MathBlocks request (none: something
    /// outside MathBlocks — the user, another program). Logged, and read by the self-test, so a document
    /// that comes forward unasked can be traced to its cause.
    /// </summary>
    internal sealed partial class WordOps
    {
        /// <summary>The object menu (Connect): items for a tag, or the result of running one (self-test).</summary>
        internal Func<string, string, Dictionary<string, object>> ObjectMenuHook;

        /// <summary>The request being handled now (set by the dispatcher), or null between requests.</summary>
        internal string CurrentRequest;
        /// <summary>The last request handled and when it ended (activations arrive asynchronously, e.g. when a window closes).</summary>
        private string _lastRequest;
        private long _lastRequestEnd;

        internal void EndRequest()
        {
            _lastRequest = CurrentRequest;
            _lastRequestEnd = _activationClock.ElapsedMilliseconds;
            CurrentRequest = null;
        }
        private readonly List<Dictionary<string, object>> _activations = new List<Dictionary<string, object>>();
        private readonly Stopwatch _activationClock = Stopwatch.StartNew();

        internal void OnWindowActivate(Word.Document doc, Word.Window wn)
        {
            string name;
            try { name = doc?.Name ?? "?"; } catch (Exception) { name = "?"; }
            var now = _activationClock.ElapsedMilliseconds;
            var during = CurrentRequest ?? (_lastRequest != null && now - _lastRequestEnd < 1500 ? "just after " + _lastRequest + " (" + (now - _lastRequestEnd) + " ms)" : "(no MathBlocks request)");
            Log.Info("window activated: " + name + " during " + during);
            lock (_activations)
            {
                _activations.Add(new Dictionary<string, object> { ["document"] = name, ["during"] = during, ["ms"] = _activationClock.ElapsedMilliseconds });
                if (_activations.Count > 500) _activations.RemoveAt(0);
            }
        }

        /// <summary>The activations recorded since the last call (then cleared).</summary>
        internal List<object> TakeActivations()
        {
            lock (_activations)
            {
                var list = new List<object>(_activations);
                _activations.Clear();
                return list;
            }
        }
    }
}
