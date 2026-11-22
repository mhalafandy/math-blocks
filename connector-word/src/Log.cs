using System;
using System.IO;

namespace MathBlocks.WordConnector
{
    /// <summary>Append-only log at %LOCALAPPDATA%\MathBlocks\connector.log. Never throws.</summary>
    internal static class Log
    {
        private static readonly object Gate = new object();

        public static readonly string FilePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MathBlocks", "connector.log");

        public static void Info(string message) => Write("INFO", message);

        public static void Error(string message, Exception ex = null) =>
            Write("ERROR", ex == null ? message : message + ": " + ex.GetType().Name + ": " + ex.Message + Where(ex));

        /// <summary>The first frames of the stack (our code), so a log line says where it failed.</summary>
        private static string Where(Exception ex)
        {
            var st = ex.StackTrace;
            if (string.IsNullOrEmpty(st)) return "";
            var lines = st.Split('\n');
            var take = new System.Collections.Generic.List<string>();
            foreach (var l in lines)
            {
                var t = l.Trim();
                if (t.Length == 0) continue;
                take.Add(t.StartsWith("at ") ? t.Substring(3) : t);
                if (take.Count == 4) break;
            }
            return " [" + string.Join(" < ", take) + "]";
        }

        private static void Write(string level, string message)
        {
            try
            {
                lock (Gate)
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(FilePath));
                    var info = new FileInfo(FilePath);
                    // Full: kept as connector.previous.log (one run's log is not lost to the next, e.g. the
                    // thesis-size test's to a soak test after it).
                    if (info.Exists && info.Length > 6_000_000)
                    {
                        var previous = Path.Combine(Path.GetDirectoryName(FilePath), "connector.previous.log");
                        if (File.Exists(previous)) File.Delete(previous);
                        File.Move(FilePath, previous);
                    }
                    File.AppendAllText(FilePath, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " " + level + " " + message + Environment.NewLine);
                }
            }
            catch
            {
                // Logging must never break Word.
            }
        }
    }
}
