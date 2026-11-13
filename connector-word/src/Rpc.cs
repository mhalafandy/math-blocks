using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace MathBlocks.WordConnector
{
    /// <summary>JSON-RPC 2.0 helpers (mirror of packages/connector-protocol).</summary>
    internal static class Rpc
    {
        public const int ProtocolVersion = 1;

        public const int MethodNotFound = -32601;
        public const int InvalidParams = -32602;
        public const int Internal = -32603;
        public const int NoDocument = 1001;
        public const int WordRejected = 1002;
        public const int NotFound = 1003;
        /// <summary>The equation is not the one that was read, or its wrapper is not one clean equation.</summary>
        public const int Conflict = 1004;

        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue, RecursionLimit = 64 };

        public static Dictionary<string, object> Parse(string line) => Json.Deserialize<Dictionary<string, object>>(line);

        public static string Request(int id, string method, object parameters) =>
            Json.Serialize(new Dictionary<string, object> { ["jsonrpc"] = "2.0", ["id"] = id, ["method"] = method, ["params"] = parameters });

        public static string Result(object id, object result) =>
            Json.Serialize(new Dictionary<string, object> { ["jsonrpc"] = "2.0", ["id"] = id, ["result"] = result });

        public static string Error(object id, int code, string message) =>
            Json.Serialize(new Dictionary<string, object>
            {
                ["jsonrpc"] = "2.0",
                ["id"] = id,
                ["error"] = new Dictionary<string, object> { ["code"] = code, ["message"] = message },
            });

        public static string GetString(Dictionary<string, object> p, string key)
        {
            if (p != null && p.TryGetValue(key, out var v) && v is string s) return s;
            throw new RpcException(InvalidParams, "Missing string parameter '" + key + "'");
        }

        /// <summary>A string parameter that may be absent (null then).</summary>
        public static string GetOptString(Dictionary<string, object> p, string key) =>
            p != null && p.TryGetValue(key, out var v) && v is string s ? s : null;

        public static int GetInt(Dictionary<string, object> p, string key, int fallback = 0)
        {
            if (p == null || !p.TryGetValue(key, out var v) || v == null) return fallback;
            try { return Convert.ToInt32(v, System.Globalization.CultureInfo.InvariantCulture); }
            catch (Exception) { return fallback; }
        }

        public static bool GetBool(Dictionary<string, object> p, string key, bool fallback = false) =>
            p != null && p.TryGetValue(key, out var v) && v is bool b ? b : fallback;
    }

    internal sealed class RpcException : Exception
    {
        public int Code { get; }

        public RpcException(int code, string message) : base(message)
        {
            Code = code;
        }
    }
}
