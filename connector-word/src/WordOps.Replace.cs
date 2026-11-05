using System;
using System.Runtime.InteropServices;
using Word = Microsoft.Office.Interop.Word;

namespace MathBlocks.WordConnector
{
    internal sealed partial class WordOps
    {
        /// <summary>
        /// Replaces a MathBlocks content control by new content (a Flat OPC package).
        /// Word sometimes moves the control inside the equation (oMathPara > sdt > oMath); deleting
        /// only the control then leaves an empty equation box behind. So when an equation encloses
        /// the control, the whole equation goes.
        /// </summary>
        /// <summary>
        /// Replaces an equation by new content with the same ID, at the same place: a picture is replaced
        /// by the new picture (its title set to the ID); a wrapper is removed and the new content inserted
        /// (an older wrapped Classic equation thereby becomes a titled picture).
        /// </summary>
        internal void ReplaceEquationContent(Word.Document doc, Eq eq, string flatOpc, string tag)
        {
            if (eq.IsPicture)
            {
                int at = eq.Range.Start;
                eq.Picture.Delete();
                doc.Range(at, at).InsertXML(flatOpc);
                FinishInserted(doc, flatOpc, at, tag);
                return;
            }
            int start = Math.Max(0, eq.Control.Range.Start - 1);
            ReplaceControl(doc, eq.Control, flatOpc);
            FinishInserted(doc, flatOpc, start, tag);
        }

        internal void ReplaceControl(Word.Document doc, Word.ContentControl cc, string flatOpc)
        {
            cc.LockContents = false;
            cc.LockContentControl = false;
            int ccStart = cc.Range.Start, ccEnd = cc.Range.End;
            int mathStart = -1, mathEnd = -1;
            try
            {
                var maths = cc.Range.OMaths;
                if (maths.Count > 0)
                {
                    var mr = maths[1].Range;
                    // Enclosing equation: it starts before or ends after the control's content.
                    if (mr.Start < ccStart || mr.End > ccEnd)
                    {
                        mathStart = mr.Start;
                        mathEnd = mr.End;
                    }
                }
            }
            catch (COMException)
            {
                // No math information: plain replacement below.
            }

            int at = Math.Max(0, ccStart - 1);
            if (mathStart >= 0)
            {
                Log.Info("replace: control inside an equation (" + mathStart + ".." + mathEnd + " around " + ccStart + ".." + ccEnd + ")");
                cc.Delete(true);
                // The equation shrank by the deleted content; remove what is left of it.
                RemoveEmptyMath(doc, mathStart);
                at = Math.Max(0, Math.Min(mathStart, at));
            }
            else
            {
                cc.Delete(true);
                RemoveEmptyMath(doc, at);
            }
            doc.Range(at, at).InsertXML(flatOpc);
        }

        /// <summary>Deletes an equation at the position if it no longer has any content.</summary>
        private static void RemoveEmptyMath(Word.Document doc, int pos)
        {
            try
            {
                var probe = doc.Range(pos, Math.Min(pos + 1, doc.Content.End));
                var maths = probe.OMaths;
                if (maths.Count == 0) return;
                var m = maths[1];
                var text = (m.Range.Text ?? "").Trim();
                if (text.Length == 0)
                {
                    m.Range.Delete();
                    // A display equation may leave its placeholder; try once more.
                    var again = doc.Range(pos, Math.Min(pos + 1, doc.Content.End)).OMaths;
                    if (again.Count > 0 && (again[1].Range.Text ?? "").Trim().Length == 0) again[1].Remove();
                    Log.Info("replace: removed the empty equation left at " + pos);
                }
            }
            catch (COMException ex)
            {
                Log.Info("replace: could not check for an empty equation: " + ex.Message);
            }
        }

        /// <summary>Logs how the math sits in the XML Word gives us (wrappers around oMath), for diagnosis.</summary>
        internal static void LogMathStructure(string what, string xml)
        {
            if (xml == null) return;
            int i = xml.IndexOf("<m:oMath", StringComparison.Ordinal);
            if (i < 0)
            {
                Log.Info(what + ": no <m:oMath> in " + xml.Length + " chars; VML picture: " + xml.Contains("<v:imagedata")
                    + ", DrawingML picture: " + xml.Contains("<pic:pic") + ", EMF part: " + xml.Contains("image/x-emf")
                    + ", MathBlocks alt text: " + xml.Contains("MathBlocks "));
                return;
            }
            int body = xml.LastIndexOf("<w:body>", i, StringComparison.Ordinal);
            int from = Math.Max(body >= 0 ? body : 0, i - 400);
            int to = Math.Min(xml.Length, i + 600);
            Log.Info(what + ": " + xml.Substring(from, to - from));
        }
    }
}
