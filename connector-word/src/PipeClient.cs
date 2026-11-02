using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// Connects to the MathBlocks app's named pipe and keeps reconnecting.
    /// Runs on a background thread; events are raised on that thread.
    /// </summary>
    internal sealed class PipeClient : IDisposable
    {
        private readonly string _pipeName;
        private readonly object _writeLock = new object();
        private volatile bool _stopped;
        private Thread _thread;
        private StreamWriter _writer;

        public event Action<string> LineReceived;
        public event Action<bool> ConnectionChanged;

        public bool IsConnected => _writer != null;

        public PipeClient(string pipeName)
        {
            _pipeName = pipeName;
        }

        /// <summary>Same rule as the Rust side (app/src-tauri/src/pipe.rs).</summary>
        public static string DefaultPipeName()
        {
            var sb = new StringBuilder();
            foreach (var c in Environment.UserName ?? "user")
                sb.Append(c < 128 && (char.IsLetterOrDigit(c) || c == '-' || c == '_' || c == '.') ? c : '_');
            return "mathblocks-v1-" + sb;
        }

        public void Start()
        {
            _thread = new Thread(Run) { IsBackground = true, Name = "MathBlocks pipe" };
            _thread.Start();
        }

        public bool Send(string line)
        {
            lock (_writeLock)
            {
                if (_writer == null) return false;
                try
                {
                    _writer.Write(line);
                    _writer.Write('\n');
                    _writer.Flush();
                    return true;
                }
                catch (IOException ex)
                {
                    Log.Error("pipe write failed", ex);
                    return false;
                }
            }
        }

        private void Run()
        {
            var utf8 = new UTF8Encoding(false);
            while (!_stopped)
            {
                try
                {
                    using (var stream = new NamedPipeClientStream(".", _pipeName, PipeDirection.InOut, PipeOptions.Asynchronous))
                    {
                        stream.Connect(2000);
                        using (var reader = new StreamReader(stream, utf8))
                        {
                            lock (_writeLock) _writer = new StreamWriter(stream, utf8) { AutoFlush = false };
                            Log.Info("connected to app pipe " + _pipeName);
                            ConnectionChanged?.Invoke(true);
                            string line;
                            while (!_stopped && (line = reader.ReadLine()) != null)
                            {
                                if (line.Length > 0) LineReceived?.Invoke(line);
                            }
                        }
                    }
                }
                catch (TimeoutException)
                {
                    // App not running: try again later.
                }
                catch (Exception ex) when (ex is IOException || ex is ObjectDisposedException || ex is UnauthorizedAccessException)
                {
                    Log.Error("pipe connection lost", ex);
                }
                finally
                {
                    bool was;
                    lock (_writeLock)
                    {
                        was = _writer != null;
                        _writer = null;
                    }
                    if (was) ConnectionChanged?.Invoke(false);
                }
                if (!_stopped) Thread.Sleep(2000);
            }
        }

        public void Dispose()
        {
            _stopped = true;
        }
    }
}
