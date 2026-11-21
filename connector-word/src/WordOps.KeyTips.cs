using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Accessibility;

namespace MathBlocks.WordConnector
{
    internal sealed partial class WordOps
    {
        [DllImport("oleacc.dll")]
        private static extern int AccessibleChildren(IAccessible paccContainer, int iChildStart, int cChildren, [Out] object[] rgvarChildren, out int pcObtained);

        /// <summary>
        /// Self-test: the key tips Word's ribbon shows after Alt (tabs, the Search box, the quick access toolbar),
        /// read from the ribbon's accessibility tree, so the MathBlocks tab's key tip can be checked against the
        /// real ones on this PC (Microsoft 365's Search box took Alt, Q).
        /// </summary>
        internal List<object> RibbonKeyTips()
        {
            var found = new List<object>();
            var seen = new HashSet<string>();
            IAccessible root;
            try
            {
                root = (IAccessible)((dynamic)_app).CommandBars["Ribbon"];
            }
            catch (Exception ex)
            {
                found.Add(new Dictionary<string, object> { ["error"] = "no ribbon accessibility: " + ex.Message });
                return found;
            }
            int visited = 0;
            void Walk(IAccessible acc, int depth)
            {
                if (acc == null || depth > 9 || visited > 4000) return;
                int n;
                try { n = acc.accChildCount; } catch (Exception) { return; }
                if (n <= 0) return;
                var kids = new object[n];
                if (AccessibleChildren(acc, 0, n, kids, out var got) != 0) return;
                for (int i = 0; i < got; i++)
                {
                    visited++;
                    var k = kids[i];
                    IAccessible child = k as IAccessible;
                    object id = child != null ? (object)0 : k;
                    var host = child ?? acc;
                    string name = "", keys = "";
                    int role = 0;
                    try { name = host.get_accName(id) ?? ""; } catch (Exception) { }
                    try { keys = host.get_accKeyboardShortcut(id) ?? ""; } catch (Exception) { }
                    try { role = Convert.ToInt32(host.get_accRole(id)); } catch (Exception) { }
                    // Only what Alt shows first: "Alt, H" (one step after Alt), not the buttons inside a tab.
                    if (keys.StartsWith("Alt", StringComparison.OrdinalIgnoreCase))
                    {
                        var tip = keys.Substring(3).TrimStart(',', '+', ' ').Trim();
                        if (tip.Length > 0 && tip.IndexOf(',') < 0 && seen.Add(tip + "|" + name))
                            found.Add(new Dictionary<string, object> { ["keytip"] = tip, ["name"] = name, ["role"] = role });
                    }
                    if (child != null) Walk(child, depth + 1);
                }
            }
            Walk(root, 0);
            return found;
        }
    }
}
