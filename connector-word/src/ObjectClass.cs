using System;
using System.Collections.Generic;
using Microsoft.Win32;

namespace MathBlocks.WordConnector
{
    /// <summary>
    /// The MathBlocks equation class, registered for the current user only (HKCU, no administrator
    /// rights): Word then names MathBlocks objects ("MathBlocks Equation") instead of an unknown class.
    /// No server is registered — double-click and the right-click menu are handled by the add-in, and
    /// the object's cached picture is what Word shows, prints and exports.
    /// </summary>
    internal static class ObjectClass
    {
        public const string ProgId = "MathBlocks.Equation.1";
        public const string VersionIndependent = "MathBlocks.Equation";
        public const string Clsid = "{B1E5A2C4-6D3F-4E8A-9C21-7F4D0A6B3E15}";
        public const string Name = "MathBlocks Equation";

        /// <summary>Registers (or repairs) the class for the current user; never throws.</summary>
        public static void EnsureRegistered()
        {
            try
            {
                using (var k = Registry.CurrentUser.CreateSubKey(@"Software\Classes\" + ProgId))
                {
                    k.SetValue("", Name);
                    using (var c = k.CreateSubKey("CLSID")) c.SetValue("", Clsid);
                }
                using (var k = Registry.CurrentUser.CreateSubKey(@"Software\Classes\" + VersionIndependent))
                {
                    k.SetValue("", Name);
                    using (var c = k.CreateSubKey("CLSID")) c.SetValue("", Clsid);
                    using (var c = k.CreateSubKey("CurVer")) c.SetValue("", ProgId);
                }
                using (var k = Registry.CurrentUser.CreateSubKey(@"Software\Classes\CLSID\" + Clsid))
                {
                    k.SetValue("", Name);
                    using (var c = k.CreateSubKey("ProgID")) c.SetValue("", ProgId);
                    using (var c = k.CreateSubKey("VersionIndependentProgID")) c.SetValue("", VersionIndependent);
                }
            }
            catch (Exception ex)
            {
                Log.Error("registering the MathBlocks equation class", ex);
            }
        }

        /// <summary>What is registered (self-test).</summary>
        public static Dictionary<string, object> State()
        {
            string Read(string path)
            {
                try
                {
                    using (var k = Registry.CurrentUser.OpenSubKey(path)) return k?.GetValue("") as string;
                }
                catch (Exception)
                {
                    return null;
                }
            }
            return new Dictionary<string, object>
            {
                ["progId"] = Read(@"Software\Classes\" + ProgId),
                ["progIdClsid"] = Read(@"Software\Classes\" + ProgId + @"\CLSID"),
                ["clsid"] = Read(@"Software\Classes\CLSID\" + Clsid),
                ["clsidProgId"] = Read(@"Software\Classes\CLSID\" + Clsid + @"\ProgID"),
                ["server"] = Read(@"Software\Classes\CLSID\" + Clsid + @"\LocalServer32") ?? Read(@"Software\Classes\CLSID\" + Clsid + @"\InprocServer32"),
            };
        }
    }
}
